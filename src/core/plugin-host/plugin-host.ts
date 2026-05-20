import type {
  AppPlugin,
  AppRuntimeInfo,
  PluginAppendEventInput,
  PluginCommandDefinition,
  PluginCommandDescriptor,
  PluginCommandListOptions,
  PluginCommandRegistry,
  PluginContext,
  PluginEventStore,
  PluginFilterStore,
  PluginListEventsOptions,
  PluginListFiltersOptions,
  PluginListMetadataOptions,
  PluginMetadataStore,
  PluginPageStore,
  PluginSaveFilterInput,
  PluginSetMetadataInput,
  PluginSlotDefinition,
  PluginSlotDescriptor,
  PluginSlotListOptions,
  PluginSlotRegistry,
  PluginTransaction,
  PluginTransactionHandler,
  PluginTransactionManager,
  PluginUpdateFilterInput,
  PluginViewDefinition,
  PluginViewDescriptor,
  PluginViewListOptions,
  PluginViewRegistry,
  PluginDependencyReference,
  PluginManifest,
} from "../plugin-api";
import type { CoreRegistries, CoreServices } from "../services";
import type {
  EventStore,
  FilterStore,
  MetadataStore,
  PageStore,
} from "../stores";
import type {
  CommandDescriptor,
  FilterDefinition,
  MetadataRecord,
  SlotContribution,
  ViewDefinition,
} from "../types";

export type PluginHostErrorCode =
  | "PLUGIN_DUPLICATE_ID"
  | "PLUGIN_DEPENDENCY_MISSING"
  | "PLUGIN_DEPENDENCY_CYCLE"
  | "PLUGIN_SELF_DEPENDENCY"
  | "PLUGIN_NOT_FOUND"
  | "PLUGIN_NOT_REGISTERED"
  | "PLUGIN_LIFECYCLE_FAILED"
  | "PLUGIN_FACADE_OWNERSHIP_FORBIDDEN"
  | "PLUGIN_CONTRIBUTION_NOT_FOUND";

export type PluginHostStatus = "installed" | "registered" | "active";

export interface PluginHostRecordManifest {
  id: PluginManifest["id"];
  name: PluginManifest["name"];
  version: PluginManifest["version"];
  description?: PluginManifest["description"];
  author?: PluginManifest["author"];
  minAppVersion: PluginManifest["minAppVersion"];
  main?: PluginManifest["main"];
  dependencies?: PluginManifest["dependencies"];
  optionalDependencies?: PluginManifest["optionalDependencies"];
  permissions?: PluginManifest["permissions"];
  contributes?: PluginManifest["contributes"];
}

export type PluginHostRecord = {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
  status: PluginHostStatus;
  manifest: PluginHostRecordManifest;
};

export type PluginHostOptions = {
  services: CoreServices;
  registries: CoreRegistries;
  app: AppRuntimeInfo;
};

export type PluginHostInstance = {
  loadBuiltInPlugins(
    plugins: readonly AppPlugin[],
  ): Promise<readonly PluginHostRecord[]>;
  install(plugin: AppPlugin): Promise<PluginHostRecord>;
  register(plugin: AppPlugin): Promise<PluginHostRecord>;
  activateAll(): Promise<readonly PluginHostRecord[]>;
  activate(pluginId: string): Promise<PluginHostRecord>;
  deactivate(pluginId: string): Promise<PluginHostRecord>;
  uninstall(pluginId: string): Promise<PluginHostRecord>;
  getPlugin(pluginId: string): PluginHostRecord;
};

class PluginHostErrorImpl extends Error {
  readonly code: PluginHostErrorCode;
  readonly pluginId?: string;
  readonly dependencyId?: string;
  readonly phase?: string;
  declare readonly cause?: unknown;

  constructor(
    code: PluginHostErrorCode,
    detail: string,
    options: {
      pluginId?: string;
      dependencyId?: string;
      phase?: string;
      cause?: unknown;
    } = {},
  ) {
    super(`${code}: ${detail}`);
    this.name = "PluginHostError";
    this.code = code;
    this.pluginId = options.pluginId;
    this.dependencyId = options.dependencyId;
    this.phase = options.phase;

    if ("cause" in options) {
      Object.defineProperty(this, "cause", {
        configurable: true,
        enumerable: false,
        value: options.cause,
        writable: true,
      });
    }
  }
}

export const PluginHostError = PluginHostErrorImpl;

export type PluginHostError = {
  name: string;
  code: PluginHostErrorCode;
  pluginId?: string;
  dependencyId?: string;
  phase?: string;
  cause?: unknown;
};

type RegisteredContributionKind = "command" | "view" | "slot";

type RegisteredContribution = {
  kind: RegisteredContributionKind;
  id: string;
};

type StoredPluginRecord = {
  plugin: AppPlugin;
  manifest: PluginManifest;
  status: PluginHostStatus;
  order: number;
  contributions: RegisteredContribution[];
};

type NormalizedDependency = {
  id: string;
  optional: boolean;
};

type PluginLifecyclePhase =
  | "install"
  | "register"
  | "activate"
  | "deactivate"
  | "uninstall";

type PluginContextScope = {
  pluginId: string;
  phase: PluginLifecyclePhase;
  active: boolean;
  allowsRuntimeContributionRegistration: boolean;
  registrationTracker: RegisteredContribution[];
};

type SortablePlugin = {
  plugin: AppPlugin;
  index: number;
  dependencies: NormalizedDependency[];
};

const pluginOwnershipPrefix = "pluginId";
const sourcePluginOwnershipPrefix = "sourcePluginId";

class PluginHostImpl implements PluginHostInstance {
  private readonly services: CoreServices;
  private readonly registries: CoreRegistries;
  private readonly app: AppRuntimeInfo;
  private readonly records = new Map<string, StoredPluginRecord>();
  private nextOrder = 0;

  constructor(options: PluginHostOptions) {
    this.services = options.services;
    this.registries = options.registries;
    this.app = cloneAppRuntimeInfo(options.app);
  }

  async loadBuiltInPlugins(
    plugins: readonly AppPlugin[],
  ): Promise<readonly PluginHostRecord[]> {
    const orderedPlugins = sortPluginsByDependencies(
      plugins,
      new Set(this.records.keys()),
      this.getDependencySatisfyingPluginIds(),
    );
    const batchStartOrder = this.nextOrder;
    const installedRecords: StoredPluginRecord[] = [];

    for (const plugin of orderedPlugins) {
      const record = this.addInstalledRecord(plugin);

      try {
        await this.runLifecycleHook(record, "install", record.plugin.install);
      } catch (error) {
        this.rollbackInstalledBatchRecords(
          [...installedRecords, record],
          batchStartOrder,
        );
        throw error;
      }

      installedRecords.push(record);
    }

    for (const record of installedRecords) {
      await this.registerInstalledPlugin(record);
    }

    return installedRecords.map((record) => this.toPublicRecord(record));
  }

  async install(plugin: AppPlugin): Promise<PluginHostRecord> {
    const existingRecord = this.records.get(plugin.manifest.id);

    if (existingRecord !== undefined) {
      return this.toPublicRecord(existingRecord);
    }

    sortPluginsByDependencies(
      [plugin],
      new Set(this.records.keys()),
      this.getDependencySatisfyingPluginIds(),
    );

    const record = this.addInstalledRecord(plugin);

    try {
      await this.runLifecycleHook(record, "install", record.plugin.install);
    } catch (error) {
      this.records.delete(record.manifest.id);
      throw error;
    }

    return this.toPublicRecord(record);
  }

  async register(plugin: AppPlugin): Promise<PluginHostRecord> {
    if (!this.records.has(plugin.manifest.id)) {
      await this.install(plugin);
    }

    const record = this.requireRecord(plugin.manifest.id);

    if (record.status !== "installed") {
      return this.toPublicRecord(record);
    }

    this.assertRequiredDependenciesSatisfied(record);
    await this.registerInstalledPlugin(record);

    return this.toPublicRecord(record);
  }

  async activateAll(): Promise<readonly PluginHostRecord[]> {
    const records = [...this.records.values()].sort(compareStoredRecordOrder);

    for (const record of records) {
      await this.activate(record.manifest.id);
    }

    return records.map((record) => this.toPublicRecord(record));
  }

  async activate(pluginId: string): Promise<PluginHostRecord> {
    const record = this.requireRecord(pluginId);

    if (record.status === "installed") {
      throw new PluginHostError(
        "PLUGIN_NOT_REGISTERED",
        `Plugin ${pluginId} is not registered`,
        { pluginId },
      );
    }

    if (record.status === "active") {
      return this.toPublicRecord(record);
    }

    await this.runLifecycleHook(record, "activate", record.plugin.activate);
    record.status = "active";

    return this.toPublicRecord(record);
  }

  async deactivate(pluginId: string): Promise<PluginHostRecord> {
    const record = this.requireRecord(pluginId);

    this.assertNoRegisteredDependents(pluginId);

    if (record.status !== "installed") {
      await this.runLifecycleHook(
        record,
        "deactivate",
        record.plugin.deactivate,
      );
    }

    this.unregisterTrackedContributions(record.contributions);
    record.contributions = [];
    record.status = "installed";

    return this.toPublicRecord(record);
  }

  async uninstall(pluginId: string): Promise<PluginHostRecord> {
    const record = this.requireRecord(pluginId);

    this.assertNoRegisteredDependents(pluginId);

    if (record.status === "active") {
      await this.runLifecycleHook(
        record,
        "deactivate",
        record.plugin.deactivate,
      );
    }

    await this.runLifecycleHook(record, "uninstall", record.plugin.uninstall);
    const output = this.toPublicRecord(record);

    this.unregisterTrackedContributions(record.contributions);
    record.contributions = [];
    this.records.delete(pluginId);

    return output;
  }

  getPlugin(pluginId: string): PluginHostRecord {
    return this.toPublicRecord(this.requireRecord(pluginId));
  }

  private requireRecord(pluginId: string): StoredPluginRecord {
    const record = this.records.get(pluginId);

    if (record === undefined) {
      throw new PluginHostError(
        "PLUGIN_NOT_FOUND",
        `Plugin ${pluginId} was not found`,
        { pluginId },
      );
    }

    return record;
  }

  private addInstalledRecord(plugin: AppPlugin): StoredPluginRecord {
    const manifest = cloneManifest(plugin.manifest);
    const record: StoredPluginRecord = {
      plugin,
      manifest,
      status: "installed",
      order: this.nextOrder,
      contributions: [],
    };

    this.nextOrder += 1;
    this.records.set(manifest.id, record);

    return record;
  }

  private getDependencySatisfyingPluginIds(): Set<string> {
    const pluginIds = new Set<string>();

    for (const record of this.records.values()) {
      if (record.status !== "installed") {
        pluginIds.add(record.manifest.id);
      }
    }

    return pluginIds;
  }

  private assertRequiredDependenciesSatisfied(
    record: StoredPluginRecord,
  ): void {
    const satisfyingPluginIds = this.getDependencySatisfyingPluginIds();

    for (const dependency of normalizeDependencies(record.manifest)) {
      if (!dependency.optional && !satisfyingPluginIds.has(dependency.id)) {
        throw new PluginHostError(
          "PLUGIN_DEPENDENCY_MISSING",
          `Plugin ${record.manifest.id} is missing ${dependency.id}`,
          {
            pluginId: record.manifest.id,
            dependencyId: dependency.id,
          },
        );
      }
    }
  }

  private assertNoRegisteredDependents(pluginId: string): void {
    for (const record of this.records.values()) {
      if (record.manifest.id === pluginId || record.status === "installed") {
        continue;
      }

      const requiredDependency = normalizeDependencies(record.manifest).find(
        (dependency) => !dependency.optional && dependency.id === pluginId,
      );

      if (requiredDependency !== undefined) {
        throw new PluginHostError(
          "PLUGIN_DEPENDENCY_MISSING",
          `Plugin ${record.manifest.id} requires ${pluginId}`,
          {
            pluginId: record.manifest.id,
            dependencyId: pluginId,
          },
        );
      }
    }
  }

  private async runLifecycleHook(
    record: StoredPluginRecord,
    phase: PluginLifecyclePhase,
    hook: ((ctx: PluginContext) => void | Promise<void>) | undefined,
  ): Promise<void> {
    if (hook === undefined) {
      return;
    }

    const scope = createPluginContextScope(
      record.manifest.id,
      phase,
      false,
    );

    try {
      await hook(this.createPluginContext(scope));
    } catch (cause) {
      throw new PluginHostError(
        "PLUGIN_LIFECYCLE_FAILED",
        `Plugin ${record.manifest.id} ${phase} failed`,
        {
          pluginId: record.manifest.id,
          phase,
          cause,
        },
      );
    } finally {
      scope.active = false;
    }
  }

  private async registerInstalledPlugin(
    record: StoredPluginRecord,
  ): Promise<void> {
    const scope = createPluginContextScope(
      record.manifest.id,
      "register",
      true,
    );

    try {
      await record.plugin.register(this.createPluginContext(scope));
    } catch (cause) {
      this.unregisterTrackedContributions(scope.registrationTracker);
      record.contributions = [];
      record.status = "installed";

      throw new PluginHostError(
        "PLUGIN_LIFECYCLE_FAILED",
        `Plugin ${record.manifest.id} register failed`,
        {
          pluginId: record.manifest.id,
          phase: "register",
          cause,
        },
      );
    } finally {
      scope.active = false;
    }

    record.contributions = [
      ...record.contributions,
      ...scope.registrationTracker,
    ];
    record.status = "registered";
  }

  private createPluginContext(scope: PluginContextScope): PluginContext {
    return {
      pluginId: scope.pluginId,
      app: cloneAppRuntimeInfo(this.app),
      pages: createPluginPageStore(scope, this.services.pages),
      metadata: createPluginMetadataStore(
        scope,
        this.services.metadata,
      ),
      events: createPluginEventStore(scope, this.services.events),
      filters: createPluginFilterStore(scope, this.services.filters),
      commands: this.createPluginCommandRegistry(scope),
      views: this.createPluginViewRegistry(scope),
      slots: this.createPluginSlotRegistry(scope),
      transaction: this.createPluginTransactionManager(scope),
    };
  }

  private createPluginTransactionManager(
    scope: PluginContextScope,
  ): PluginTransactionManager {
    return {
      run: <Result>(
        handler: PluginTransactionHandler<Result>,
      ): Promise<Awaited<Result>> => {
        assertCanMutatePluginData(scope);

        return this.services.transaction.run(async (transaction) => {
          const result = await handler(
            createPluginTransaction(scope, transaction),
          );

          assertCanMutatePluginData(scope);

          return result;
        });
      },
    };
  }

  private createPluginCommandRegistry(
    scope: PluginContextScope,
  ): PluginCommandRegistry {
    const pluginId = scope.pluginId;

    return {
      register: <Input = unknown, Output = unknown>(
        definition: PluginCommandDefinition<Input, Output>,
      ): PluginCommandDescriptor => {
        assertCanRegisterRuntimeContribution(scope);
        assertNoOwnershipKeys(definition, pluginId, [pluginOwnershipPrefix]);

        const descriptor = this.registries.commands.register({
          ...definition,
          pluginId,
        });

        scope.registrationTracker.push({
          kind: "command",
          id: descriptor.id,
        });

        return toPluginCommandDescriptor(descriptor);
      },

      get: (commandId) => {
        const descriptor = this.getOwnedCommandDescriptor(pluginId, commandId);

        return toPluginCommandDescriptor(descriptor);
      },

      list: (options: PluginCommandListOptions = {}) => {
        assertNoOwnershipKeys(options, pluginId, [pluginOwnershipPrefix]);

        return this.registries.commands
          .list({ pluginId })
          .map((descriptor) => toPluginCommandDescriptor(descriptor));
      },
    };
  }

  private createPluginViewRegistry(
    scope: PluginContextScope,
  ): PluginViewRegistry {
    const pluginId = scope.pluginId;

    return {
      register: <Props = unknown>(
        definition: PluginViewDefinition<Props>,
      ): PluginViewDescriptor => {
        assertCanRegisterRuntimeContribution(scope);
        assertNoOwnershipKeys(definition, pluginId, [pluginOwnershipPrefix]);

        const descriptor = this.registries.views.register({
          ...definition,
          pluginId,
        });

        scope.registrationTracker.push({ kind: "view", id: descriptor.id });

        return toPluginViewDescriptor(descriptor);
      },

      get: (viewId) => {
        const descriptor = this.getOwnedViewDefinition(pluginId, viewId);

        return toPluginViewDescriptor(descriptor);
      },

      list: (options: PluginViewListOptions = {}) => {
        assertNoOwnershipKeys(options, pluginId, [pluginOwnershipPrefix]);

        return this.registries.views
          .list({
            ...options,
            pluginId,
          })
          .map((descriptor) => toPluginViewDescriptor(descriptor));
      },
    };
  }

  private createPluginSlotRegistry(
    scope: PluginContextScope,
  ): PluginSlotRegistry {
    const pluginId = scope.pluginId;

    return {
      register: <Props = unknown>(
        contribution: PluginSlotDefinition<Props>,
      ): PluginSlotDescriptor => {
        assertCanRegisterRuntimeContribution(scope);
        assertNoOwnershipKeys(contribution, pluginId, [pluginOwnershipPrefix]);

        const descriptor = this.registries.slots.register({
          ...contribution,
          pluginId,
        });

        scope.registrationTracker.push({ kind: "slot", id: descriptor.id });

        return toPluginSlotDescriptor(descriptor);
      },

      get: (contributionId) => {
        const descriptor = this.getOwnedSlotContribution(
          pluginId,
          contributionId,
        );

        return toPluginSlotDescriptor(descriptor);
      },

      list: (options: PluginSlotListOptions = {}) => {
        assertNoOwnershipKeys(options, pluginId, [pluginOwnershipPrefix]);

        return this.registries.slots
          .list({
            ...options,
            pluginId,
          })
          .map((descriptor) => toPluginSlotDescriptor(descriptor));
      },
    };
  }

  private getOwnedCommandDescriptor(
    pluginId: string,
    commandId: string,
  ): CommandDescriptor {
    try {
      const descriptor = this.registries.commands.get(commandId);

      if (descriptor.pluginId !== pluginId) {
        throw new PluginHostError(
          "PLUGIN_CONTRIBUTION_NOT_FOUND",
          `Command ${commandId} is not owned by ${pluginId}`,
          { pluginId },
        );
      }

      return descriptor;
    } catch (error) {
      if (error instanceof PluginHostError) {
        throw error;
      }

      throw new PluginHostError(
        "PLUGIN_CONTRIBUTION_NOT_FOUND",
        `Command ${commandId} was not found for ${pluginId}`,
        { pluginId },
      );
    }
  }

  private getOwnedViewDefinition(
    pluginId: string,
    viewId: string,
  ): ViewDefinition {
    try {
      const descriptor = this.registries.views.get(viewId);

      if (descriptor.pluginId !== pluginId) {
        throw new PluginHostError(
          "PLUGIN_CONTRIBUTION_NOT_FOUND",
          `View ${viewId} is not owned by ${pluginId}`,
          { pluginId },
        );
      }

      return descriptor;
    } catch (error) {
      if (error instanceof PluginHostError) {
        throw error;
      }

      throw new PluginHostError(
        "PLUGIN_CONTRIBUTION_NOT_FOUND",
        `View ${viewId} was not found for ${pluginId}`,
        { pluginId },
      );
    }
  }

  private getOwnedSlotContribution(
    pluginId: string,
    contributionId: string,
  ): SlotContribution {
    try {
      const descriptor = this.registries.slots.get(contributionId);

      if (descriptor.pluginId !== pluginId) {
        throw new PluginHostError(
          "PLUGIN_CONTRIBUTION_NOT_FOUND",
          `Slot ${contributionId} is not owned by ${pluginId}`,
          { pluginId },
        );
      }

      return descriptor;
    } catch (error) {
      if (error instanceof PluginHostError) {
        throw error;
      }

      throw new PluginHostError(
        "PLUGIN_CONTRIBUTION_NOT_FOUND",
        `Slot ${contributionId} was not found for ${pluginId}`,
        { pluginId },
      );
    }
  }

  private unregisterTrackedContributions(
    contributions: readonly RegisteredContribution[],
  ): void {
    for (const contribution of [...contributions].reverse()) {
      try {
        switch (contribution.kind) {
          case "command":
            this.registries.commands.unregister(contribution.id);
            break;
          case "view":
            this.registries.views.unregister(contribution.id);
            break;
          case "slot":
            this.registries.slots.unregister(contribution.id);
            break;
        }
      } catch {
        // Missing tracked contributions should not block lifecycle cleanup.
      }
    }
  }

  private rollbackInstalledBatchRecords(
    records: readonly StoredPluginRecord[],
    restoredNextOrder: number,
  ): void {
    for (const record of [...records].reverse()) {
      this.unregisterTrackedContributions(record.contributions);
      this.records.delete(record.manifest.id);
    }

    this.nextOrder = restoredNextOrder;
  }

  private toPublicRecord(record: StoredPluginRecord): PluginHostRecord {
    return {
      id: record.manifest.id,
      name: record.manifest.name,
      version: record.manifest.version,
      enabled: record.status === "active",
      status: record.status,
      manifest: cloneManifest(record.manifest),
    };
  }
}

export const PluginHost: {
  new (options: PluginHostOptions): PluginHostInstance;
} = PluginHostImpl;

function createPluginContextScope(
  pluginId: string,
  phase: PluginLifecyclePhase,
  allowsRuntimeContributionRegistration: boolean,
): PluginContextScope {
  return {
    pluginId,
    phase,
    active: true,
    allowsRuntimeContributionRegistration,
    registrationTracker: [],
  };
}

function assertCanRegisterRuntimeContribution(
  scope: PluginContextScope,
): void {
  if (scope.active && scope.allowsRuntimeContributionRegistration) {
    return;
  }

  throw new PluginHostError(
    "PLUGIN_LIFECYCLE_FAILED",
    `Plugin ${scope.pluginId} cannot register runtime contributions now`,
    {
      pluginId: scope.pluginId,
      phase: scope.phase,
    },
  );
}

function assertCanMutatePluginData(scope: PluginContextScope): void {
  if (scope.active) {
    return;
  }

  throw new PluginHostError(
    "PLUGIN_LIFECYCLE_FAILED",
    `Plugin ${scope.pluginId} cannot mutate plugin data now`,
    {
      pluginId: scope.pluginId,
      phase: scope.phase,
    },
  );
}

function createPluginPageStore(
  scope: PluginContextScope,
  pages: PageStore,
): PluginPageStore {
  return {
    create(input) {
      assertCanMutatePluginData(scope);

      return pages.create(input);
    },

    get: (pageId) => pages.get(pageId),

    update(pageId, input) {
      assertCanMutatePluginData(scope);

      return pages.update(pageId, input);
    },

    archive(pageId) {
      assertCanMutatePluginData(scope);

      return pages.archive(pageId);
    },

    list: (options) => pages.list(options),
  };
}

function createPluginMetadataStore(
  scope: PluginContextScope,
  metadata: MetadataStore,
): PluginMetadataStore {
  const pluginId = scope.pluginId;

  return {
    set(input: PluginSetMetadataInput) {
      assertCanMutatePluginData(scope);
      assertNoOwnershipKeys(input, pluginId, [sourcePluginOwnershipPrefix]);
      assertMetadataWriteAllowed(pluginId, metadata, input);

      return metadata.set({
        ...input,
        sourcePluginId: pluginId,
      });
    },

    get: (pageId, namespace, key) =>
      requireOwnedMetadataRecord(
        pluginId,
        metadata,
        pageId,
        namespace,
        key,
      ),

    list(options: PluginListMetadataOptions = {}) {
      assertNoOwnershipKeys(options, pluginId, [sourcePluginOwnershipPrefix]);

      return metadata
        .list(options)
        .filter((record) => record.sourcePluginId === pluginId);
    },

    delete(pageId, namespace, key) {
      assertCanMutatePluginData(scope);
      requireOwnedMetadataRecord(pluginId, metadata, pageId, namespace, key);

      return metadata.delete(pageId, namespace, key);
    },
  };
}

function assertMetadataWriteAllowed(
  pluginId: string,
  metadata: MetadataStore,
  input: PluginSetMetadataInput,
): void {
  const existingRecord = findMetadataRecord(
    metadata,
    input.pageId,
    input.namespace,
    input.key,
  );

  if (
    existingRecord !== undefined &&
    existingRecord.sourcePluginId !== pluginId
  ) {
    throw new PluginHostError(
      "PLUGIN_CONTRIBUTION_NOT_FOUND",
      `Metadata ${input.namespace}.${input.key} is not owned by ${pluginId}`,
      { pluginId },
    );
  }
}

function requireOwnedMetadataRecord(
  pluginId: string,
  metadata: MetadataStore,
  pageId: string,
  namespace: string,
  key: string,
): MetadataRecord {
  const record = findMetadataRecord(metadata, pageId, namespace, key);

  if (record !== undefined && record.sourcePluginId === pluginId) {
    return record;
  }

  throw new PluginHostError(
    "PLUGIN_CONTRIBUTION_NOT_FOUND",
    `Metadata ${namespace}.${key} was not found for ${pluginId}`,
    { pluginId },
  );
}

function findMetadataRecord(
  metadata: MetadataStore,
  pageId: string,
  namespace: string,
  key: string,
): MetadataRecord | undefined {
  return metadata.list({ pageId, namespace, key })[0];
}

function createPluginEventStore(
  scope: PluginContextScope,
  events: EventStore,
): PluginEventStore {
  const pluginId = scope.pluginId;

  return {
    append(input: PluginAppendEventInput) {
      assertCanMutatePluginData(scope);
      assertNoOwnershipKeys(input, pluginId, [sourcePluginOwnershipPrefix]);

      return events.append({
        ...input,
        sourcePluginId: pluginId,
      });
    },

    list(options: PluginListEventsOptions = {}) {
      assertNoOwnershipKeys(options, pluginId, [sourcePluginOwnershipPrefix]);

      return events
        .list(options)
        .filter((event) => event.sourcePluginId === pluginId);
    },
  };
}

function createPluginFilterStore(
  scope: PluginContextScope,
  filters: FilterStore,
): PluginFilterStore {
  const pluginId = scope.pluginId;

  return {
    save(input: PluginSaveFilterInput) {
      assertCanMutatePluginData(scope);
      assertNoOwnershipKeys(input, pluginId, [sourcePluginOwnershipPrefix]);

      return filters.save({
        ...input,
        sourcePluginId: pluginId,
      });
    },

    get: (filterId) => requireOwnedFilter(pluginId, filters, filterId),

    update(filterId: string, input: PluginUpdateFilterInput) {
      assertCanMutatePluginData(scope);
      assertNoOwnershipKeys(input, pluginId, [sourcePluginOwnershipPrefix]);
      requireOwnedFilter(pluginId, filters, filterId);

      return filters.update(filterId, {
        ...input,
        sourcePluginId: pluginId,
      });
    },

    list(options: PluginListFiltersOptions = {}) {
      assertNoOwnershipKeys(options, pluginId, [sourcePluginOwnershipPrefix]);

      return filters
        .list(options)
        .filter((filter) => filter.sourcePluginId === pluginId);
    },

    delete(filterId) {
      assertCanMutatePluginData(scope);
      requireOwnedFilter(pluginId, filters, filterId);

      return filters.delete(filterId);
    },
  };
}

function requireOwnedFilter(
  pluginId: string,
  filters: FilterStore,
  filterId: string,
): FilterDefinition {
  try {
    const filter = filters.get(filterId);

    if (filter.sourcePluginId === pluginId) {
      return filter;
    }

    throw new PluginHostError(
      "PLUGIN_CONTRIBUTION_NOT_FOUND",
      `Filter ${filterId} is not owned by ${pluginId}`,
      { pluginId },
    );
  } catch (error) {
    if (error instanceof PluginHostError) {
      throw error;
    }

    throw new PluginHostError(
      "PLUGIN_CONTRIBUTION_NOT_FOUND",
      `Filter ${filterId} was not found for ${pluginId}`,
      { pluginId },
    );
  }
}

function createPluginTransaction(
  scope: PluginContextScope,
  transaction: {
    pages: PageStore;
    metadata: MetadataStore;
    events: EventStore;
    filters: FilterStore;
  },
): PluginTransaction {
  const pluginId = scope.pluginId;

  return {
    pluginId,
    pages: createPluginPageStore(scope, transaction.pages),
    metadata: createPluginMetadataStore(scope, transaction.metadata),
    events: createPluginEventStore(scope, transaction.events),
    filters: createPluginFilterStore(scope, transaction.filters),
  };
}

function sortPluginsByDependencies(
  plugins: readonly AppPlugin[],
  existingPluginIds: ReadonlySet<string>,
  dependencySatisfyingPluginIds: ReadonlySet<string>,
): AppPlugin[] {
  const pluginsById = new Map<string, SortablePlugin>();

  plugins.forEach((plugin, index) => {
    const id = plugin.manifest.id;

    if (pluginsById.has(id) || existingPluginIds.has(id)) {
      throw new PluginHostError(
        "PLUGIN_DUPLICATE_ID",
        `Plugin ${id} is duplicated`,
        { pluginId: id },
      );
    }

    pluginsById.set(id, {
      plugin,
      index,
      dependencies: normalizeDependencies(plugin.manifest),
    });
  });

  for (const plugin of pluginsById.values()) {
    for (const dependency of plugin.dependencies) {
      if (dependency.id === plugin.plugin.manifest.id) {
        throw new PluginHostError(
          "PLUGIN_SELF_DEPENDENCY",
          `Plugin ${plugin.plugin.manifest.id} depends on itself`,
          {
            pluginId: plugin.plugin.manifest.id,
            dependencyId: dependency.id,
          },
        );
      }

      if (
        !dependency.optional &&
        !pluginsById.has(dependency.id) &&
        !dependencySatisfyingPluginIds.has(dependency.id)
      ) {
        throw new PluginHostError(
          "PLUGIN_DEPENDENCY_MISSING",
          `Plugin ${plugin.plugin.manifest.id} is missing ${dependency.id}`,
          {
            pluginId: plugin.plugin.manifest.id,
            dependencyId: dependency.id,
          },
        );
      }
    }
  }

  const sorted: AppPlugin[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const byInputOrder = [...pluginsById.values()].sort(
    (left, right) => left.index - right.index,
  );

  function visit(plugin: SortablePlugin): void {
    const id = plugin.plugin.manifest.id;

    if (visited.has(id)) {
      return;
    }

    if (visiting.has(id)) {
      throw new PluginHostError(
        "PLUGIN_DEPENDENCY_CYCLE",
        `Plugin dependency cycle includes ${id}`,
        { pluginId: id },
      );
    }

    visiting.add(id);

    for (const dependency of plugin.dependencies) {
      const dependencyPlugin = pluginsById.get(dependency.id);

      if (dependencyPlugin !== undefined) {
        visit(dependencyPlugin);
      }
    }

    visiting.delete(id);
    visited.add(id);
    sorted.push(plugin.plugin);
  }

  for (const plugin of byInputOrder) {
    visit(plugin);
  }

  return sorted;
}

function normalizeDependencies(
  manifest: PluginManifest,
): NormalizedDependency[] {
  const dependencies = new Map<string, NormalizedDependency>();

  for (const reference of manifest.dependencies ?? []) {
    const dependency = normalizeDependency(reference, false);

    addNormalizedDependency(dependencies, dependency);
  }

  for (const reference of manifest.optionalDependencies ?? []) {
    const dependency = normalizeDependency(reference, true);

    addNormalizedDependency(dependencies, dependency);
  }

  return [...dependencies.values()];
}

function addNormalizedDependency(
  dependencies: Map<string, NormalizedDependency>,
  dependency: NormalizedDependency,
): void {
  const existingDependency = dependencies.get(dependency.id);

  if (existingDependency === undefined) {
    dependencies.set(dependency.id, dependency);
    return;
  }

  dependencies.set(dependency.id, {
    id: dependency.id,
    optional: existingDependency.optional && dependency.optional,
  });
}

function normalizeDependency(
  reference: PluginDependencyReference,
  forceOptional: boolean,
): NormalizedDependency {
  if (typeof reference === "string") {
    return {
      id: reference,
      optional: forceOptional,
    };
  }

  return {
    id: reference.id,
    optional: forceOptional || reference.optional === true,
  };
}

function compareStoredRecordOrder(
  left: StoredPluginRecord,
  right: StoredPluginRecord,
): number {
  return left.order - right.order;
}

function toPluginCommandDescriptor(
  descriptor: CommandDescriptor,
): PluginCommandDescriptor {
  const output: PluginCommandDescriptor = {
    id: descriptor.id,
    title: descriptor.title,
  };

  if (descriptor.description !== undefined) {
    output.description = descriptor.description;
  }

  if (descriptor.defaultShortcut !== undefined) {
    output.defaultShortcut = descriptor.defaultShortcut;
  }

  if (descriptor.context !== undefined) {
    output.context = descriptor.context as PluginCommandDescriptor["context"];
  }

  return output;
}

function toPluginViewDescriptor(
  descriptor: ViewDefinition,
): PluginViewDescriptor {
  return {
    id: descriptor.id,
    type: descriptor.type,
    title: descriptor.title,
    accepts: descriptor.accepts,
  };
}

function toPluginSlotDescriptor(
  descriptor: SlotContribution,
): PluginSlotDescriptor {
  const output: PluginSlotDescriptor = {
    id: descriptor.id,
    slot: descriptor.slot,
  };

  if (descriptor.order !== undefined) {
    output.order = descriptor.order;
  }

  return output;
}

function assertNoOwnershipKeys(
  value: unknown,
  pluginId: string,
  forbiddenPrefixes: readonly string[],
): void {
  if (typeof value !== "object" || value === null) {
    return;
  }

  let propertyNames: string[];

  try {
    propertyNames = Object.getOwnPropertyNames(value);
  } catch (cause) {
    throw new PluginHostError(
      "PLUGIN_FACADE_OWNERSHIP_FORBIDDEN",
      `Plugin ${pluginId} ownership keys must be inspectable`,
      { pluginId, cause },
    );
  }

  if (
    propertyNames.some((propertyName) =>
      forbiddenPrefixes.some((prefix) => propertyName.startsWith(prefix)),
    )
  ) {
    throw new PluginHostError(
      "PLUGIN_FACADE_OWNERSHIP_FORBIDDEN",
      `Plugin ${pluginId} cannot provide ownership keys`,
      { pluginId },
    );
  }
}

function cloneAppRuntimeInfo(app: AppRuntimeInfo): AppRuntimeInfo {
  const output: AppRuntimeInfo = {
    version: app.version,
  };

  if (app.pluginApiVersion !== undefined) {
    output.pluginApiVersion = app.pluginApiVersion;
  }

  return output;
}

function cloneManifest(manifest: PluginManifest): PluginManifest {
  const clone: PluginManifest = {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    minAppVersion: manifest.minAppVersion,
  };

  if (manifest.description !== undefined) {
    clone.description = manifest.description;
  }

  if (manifest.author !== undefined) {
    clone.author = manifest.author;
  }

  if (manifest.main !== undefined) {
    clone.main = manifest.main;
  }

  if (manifest.dependencies !== undefined) {
    clone.dependencies = manifest.dependencies.map(cloneDependencyReference);
  }

  if (manifest.optionalDependencies !== undefined) {
    clone.optionalDependencies = manifest.optionalDependencies.map(
      cloneDependencyReference,
    );
  }

  if (manifest.permissions !== undefined) {
    clone.permissions = manifest.permissions.map((permission) => ({
      ...permission,
    }));
  }

  if (manifest.contributes !== undefined) {
    clone.contributes = structuredClone(manifest.contributes);
  }

  return clone;
}

function cloneDependencyReference(
  dependency: PluginDependencyReference,
): PluginDependencyReference {
  if (typeof dependency === "string") {
    return dependency;
  }

  return {
    ...dependency,
  };
}
