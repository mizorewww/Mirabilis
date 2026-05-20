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
  loadBuiltInPlugins(plugins: readonly AppPlugin[]): Promise<unknown>;
  activateAll(): Promise<unknown>;
  activate(pluginId: string): Promise<unknown>;
  deactivate(pluginId: string): Promise<unknown>;
  uninstall(pluginId: string): Promise<unknown>;
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
  ): Promise<unknown> {
    const orderedPlugins = sortPluginsByDependencies(
      plugins,
      new Set(this.records.keys()),
    );
    const installedRecords: StoredPluginRecord[] = [];

    for (const plugin of orderedPlugins) {
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
      installedRecords.push(record);
    }

    for (const record of installedRecords) {
      await this.runLifecycleHook(record, "install", record.plugin.install);
    }

    for (const record of installedRecords) {
      await this.registerInstalledPlugin(record);
    }

    return installedRecords.map((record) => this.toPublicRecord(record));
  }

  async activateAll(): Promise<unknown> {
    const records = [...this.records.values()].sort(compareStoredRecordOrder);

    for (const record of records) {
      await this.activate(record.manifest.id);
    }

    return records.map((record) => this.toPublicRecord(record));
  }

  async activate(pluginId: string): Promise<unknown> {
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

  async deactivate(pluginId: string): Promise<unknown> {
    const record = this.requireRecord(pluginId);

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

  async uninstall(pluginId: string): Promise<unknown> {
    const record = this.requireRecord(pluginId);

    if (record.status !== "installed") {
      await this.deactivate(pluginId);
    }

    await this.runLifecycleHook(record, "uninstall", record.plugin.uninstall);
    const output = this.toPublicRecord(record);

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

  private async runLifecycleHook(
    record: StoredPluginRecord,
    phase: string,
    hook: ((ctx: PluginContext) => void | Promise<void>) | undefined,
  ): Promise<void> {
    if (hook === undefined) {
      return;
    }

    try {
      await hook(this.createPluginContext(record.manifest.id, []));
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
    }
  }

  private async registerInstalledPlugin(
    record: StoredPluginRecord,
  ): Promise<void> {
    const registeredDuringAttempt: RegisteredContribution[] = [];

    try {
      await record.plugin.register(
        this.createPluginContext(record.manifest.id, registeredDuringAttempt),
      );
    } catch (cause) {
      this.unregisterTrackedContributions(registeredDuringAttempt);
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
    }

    record.contributions = [
      ...record.contributions,
      ...registeredDuringAttempt,
    ];
    record.status = "registered";
  }

  private createPluginContext(
    pluginId: string,
    registrationTracker: RegisteredContribution[],
  ): PluginContext {
    return {
      pluginId,
      app: cloneAppRuntimeInfo(this.app),
      pages: createPluginPageStore(this.services.pages),
      metadata: createPluginMetadataStore(pluginId, this.services.metadata),
      events: createPluginEventStore(pluginId, this.services.events),
      filters: createPluginFilterStore(pluginId, this.services.filters),
      commands: this.createPluginCommandRegistry(pluginId, registrationTracker),
      views: this.createPluginViewRegistry(pluginId, registrationTracker),
      slots: this.createPluginSlotRegistry(pluginId, registrationTracker),
      transaction: this.createPluginTransactionManager(pluginId),
    };
  }

  private createPluginTransactionManager(
    pluginId: string,
  ): PluginTransactionManager {
    return {
      run: <Result>(
        handler: PluginTransactionHandler<Result>,
      ): Promise<Awaited<Result>> =>
        this.services.transaction.run((transaction) =>
          handler(createPluginTransaction(pluginId, transaction)),
        ),
    };
  }

  private createPluginCommandRegistry(
    pluginId: string,
    registrationTracker: RegisteredContribution[],
  ): PluginCommandRegistry {
    return {
      register: <Input = unknown, Output = unknown>(
        definition: PluginCommandDefinition<Input, Output>,
      ): PluginCommandDescriptor => {
        assertNoOwnershipKeys(definition, pluginId, [pluginOwnershipPrefix]);

        const descriptor = this.registries.commands.register({
          ...definition,
          pluginId,
        });

        registrationTracker.push({ kind: "command", id: descriptor.id });

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
    pluginId: string,
    registrationTracker: RegisteredContribution[],
  ): PluginViewRegistry {
    return {
      register: <Props = unknown>(
        definition: PluginViewDefinition<Props>,
      ): PluginViewDescriptor => {
        assertNoOwnershipKeys(definition, pluginId, [pluginOwnershipPrefix]);

        const descriptor = this.registries.views.register({
          ...definition,
          pluginId,
        });

        registrationTracker.push({ kind: "view", id: descriptor.id });

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
    pluginId: string,
    registrationTracker: RegisteredContribution[],
  ): PluginSlotRegistry {
    return {
      register: <Props = unknown>(
        contribution: PluginSlotDefinition<Props>,
      ): PluginSlotDescriptor => {
        assertNoOwnershipKeys(contribution, pluginId, [pluginOwnershipPrefix]);

        const descriptor = this.registries.slots.register({
          ...contribution,
          pluginId,
        });

        registrationTracker.push({ kind: "slot", id: descriptor.id });

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

function createPluginPageStore(pages: PageStore): PluginPageStore {
  return {
    create: (input) => pages.create(input),
    get: (pageId) => pages.get(pageId),
    update: (pageId, input) => pages.update(pageId, input),
    archive: (pageId) => pages.archive(pageId),
    list: (options) => pages.list(options),
  };
}

function createPluginMetadataStore(
  pluginId: string,
  metadata: MetadataStore,
): PluginMetadataStore {
  return {
    set(input: PluginSetMetadataInput) {
      assertNoOwnershipKeys(input, pluginId, [sourcePluginOwnershipPrefix]);

      return metadata.set({
        ...input,
        sourcePluginId: pluginId,
      });
    },

    get: (pageId, namespace, key) => metadata.get(pageId, namespace, key),

    list(options: PluginListMetadataOptions = {}) {
      assertNoOwnershipKeys(options, pluginId, [sourcePluginOwnershipPrefix]);

      return metadata.list(options);
    },

    delete: (pageId, namespace, key) => metadata.delete(pageId, namespace, key),
  };
}

function createPluginEventStore(
  pluginId: string,
  events: EventStore,
): PluginEventStore {
  return {
    append(input: PluginAppendEventInput) {
      assertNoOwnershipKeys(input, pluginId, [sourcePluginOwnershipPrefix]);

      return events.append({
        ...input,
        sourcePluginId: pluginId,
      });
    },

    list(options: PluginListEventsOptions = {}) {
      assertNoOwnershipKeys(options, pluginId, [sourcePluginOwnershipPrefix]);

      return events.list(options);
    },
  };
}

function createPluginFilterStore(
  pluginId: string,
  filters: FilterStore,
): PluginFilterStore {
  return {
    save(input: PluginSaveFilterInput) {
      assertNoOwnershipKeys(input, pluginId, [sourcePluginOwnershipPrefix]);

      return filters.save({
        ...input,
        sourcePluginId: pluginId,
      });
    },

    get: (filterId) => filters.get(filterId),

    update(filterId: string, input: PluginUpdateFilterInput) {
      assertNoOwnershipKeys(input, pluginId, [sourcePluginOwnershipPrefix]);

      return filters.update(filterId, {
        ...input,
        sourcePluginId: pluginId,
      });
    },

    list(options: PluginListFiltersOptions = {}) {
      assertNoOwnershipKeys(options, pluginId, [sourcePluginOwnershipPrefix]);

      return filters.list(options);
    },

    delete: (filterId) => filters.delete(filterId),
  };
}

function createPluginTransaction(
  pluginId: string,
  transaction: {
    pages: PageStore;
    metadata: MetadataStore;
    events: EventStore;
    filters: FilterStore;
  },
): PluginTransaction {
  return {
    pluginId,
    pages: createPluginPageStore(transaction.pages),
    metadata: createPluginMetadataStore(pluginId, transaction.metadata),
    events: createPluginEventStore(pluginId, transaction.events),
    filters: createPluginFilterStore(pluginId, transaction.filters),
  };
}

function sortPluginsByDependencies(
  plugins: readonly AppPlugin[],
  existingPluginIds: ReadonlySet<string>,
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
        !existingPluginIds.has(dependency.id)
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

    dependencies.set(dependency.id, dependency);
  }

  for (const reference of manifest.optionalDependencies ?? []) {
    const dependency = normalizeDependency(reference, true);

    dependencies.set(dependency.id, dependency);
  }

  return [...dependencies.values()];
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
