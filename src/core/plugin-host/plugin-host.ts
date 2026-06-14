import type {
  AppPlugin,
  AppRuntimeInfo,
  PluginAppendEventInput,
  PluginCommandDefinition,
  PluginCommandDescriptor,
  PluginCommandHandler,
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
import {
  getCoreDirectTransactionRunner,
  type CoreRegistries,
  type CoreServices,
  type CoreTransaction,
} from "../services";
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
import { preserveCommandHandlerFailureCause } from "../commands/command-registry";

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
  listPlugins(): readonly PluginHostRecord[];
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
  lifecycleScopes: Set<PluginContextScope>;
  installPromise?: Promise<void>;
  registerPromise?: Promise<void>;
  removalPhase?: PluginRemovalPhase;
};

type NormalizedDependency = {
  id: string;
  optional: boolean;
};

type PluginLifecyclePhase =
  | "install"
  | "register"
  | "command"
  | "activate"
  | "deactivate"
  | "uninstall";

type PluginRemovalPhase = "deactivate" | "uninstall";

type PluginScopedCommandExecutor = {
  execute(commandId: string, input?: unknown): Promise<unknown>;
};

const pluginScopedCommandExecutorKey = Symbol.for(
  "mirabilis.internal.pluginScopedCommandExecutor",
);

type PluginContextScope = {
  pluginId: string;
  phase: PluginLifecyclePhase;
  active: boolean;
  allowsRuntimeContributionRegistration: boolean;
  metadataOwnerReservations: readonly MetadataOwnerReservation[];
  registrationTracker: RegisteredContribution[];
  registrationTrackerRolledBack: boolean;
};

type SortablePlugin = {
  plugin: AppPlugin;
  index: number;
  dependencies: NormalizedDependency[];
};

type PluginInputProperty =
  | {
      present: false;
    }
  | {
      present: true;
      value: unknown;
    };

type MetadataOwnerReservation = {
  namespace: string;
  sourcePluginId: string;
};

type MetadataOwnerReservationProvider = () => readonly MetadataOwnerReservation[];

const pluginOwnershipPrefix = "pluginId";
const sourcePluginOwnershipPrefix = "sourcePluginId";
const filterIdNamespaceMarker = ".filter.";
const metadataNamespacePattern = /^[A-Za-z][A-Za-z0-9_-]*$/u;
const metadataValueTypes = new Set([
  "string",
  "number",
  "boolean",
  "json",
  "date",
  "null",
]);

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
    const batchMetadataOwnerReservations =
      collectMetadataOwnerReservationsFromPlugins(orderedPlugins);
    const batchStartOrder = this.nextOrder;
    const installedRecords: StoredPluginRecord[] = [];

    for (const plugin of orderedPlugins) {
      const currentRecord = this.records.get(plugin.manifest.id);

      if (currentRecord !== undefined) {
        this.rollbackInstalledBatchRecords(installedRecords, batchStartOrder);
        throw new PluginHostError(
          "PLUGIN_DUPLICATE_ID",
          `Plugin ${plugin.manifest.id} is duplicated`,
          { pluginId: plugin.manifest.id },
        );
      }

      const record = this.addInstalledRecord(plugin);

      try {
        await this.installRecord(record, batchMetadataOwnerReservations);
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
      await this.registerInstalledPlugin(record, batchMetadataOwnerReservations);
    }

    return installedRecords.map((record) => this.toPublicRecord(record));
  }

  async install(plugin: AppPlugin): Promise<PluginHostRecord> {
    const existingRecord = this.records.get(plugin.manifest.id);

    if (existingRecord !== undefined) {
      await this.awaitPendingInstall(existingRecord);

      return this.toPublicRecord(existingRecord);
    }

    sortPluginsByDependencies(
      [plugin],
      new Set(this.records.keys()),
      this.getDependencySatisfyingPluginIds(),
    );

    const record = this.addInstalledRecord(plugin);

    await this.installRecord(record);

    return this.toPublicRecord(record);
  }

  async register(plugin: AppPlugin): Promise<PluginHostRecord> {
    const existingRecord = this.records.get(plugin.manifest.id);

    if (existingRecord === undefined) {
      await this.install(plugin);
    } else {
      await this.awaitPendingInstall(existingRecord);
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
    record.removalPhase = "deactivate";
    this.revokeLifecycleScopes(record);

    try {
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
    } finally {
      if (this.records.get(pluginId) === record) {
        delete record.removalPhase;
      }
    }
  }

  async uninstall(pluginId: string): Promise<PluginHostRecord> {
    const record = this.requireRecord(pluginId);

    this.assertNoRegisteredDependents(pluginId);
    record.removalPhase = "uninstall";
    this.revokeLifecycleScopes(record);

    try {
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
    } finally {
      if (this.records.get(pluginId) === record) {
        delete record.removalPhase;
      }
    }
  }

  getPlugin(pluginId: string): PluginHostRecord {
    return this.toPublicRecord(this.requireRecord(pluginId));
  }

  listPlugins(): readonly PluginHostRecord[] {
    return [...this.records.values()]
      .sort(compareStoredRecordOrder)
      .map((record) => this.toPublicRecord(record));
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
      lifecycleScopes: new Set(),
    };

    this.nextOrder += 1;
    this.records.set(manifest.id, record);

    return record;
  }

  private getDependencySatisfyingPluginIds(): Set<string> {
    const pluginIds = new Set<string>();

    for (const record of this.records.values()) {
      if (record.status !== "installed" && record.removalPhase === undefined) {
        pluginIds.add(record.manifest.id);
      }
    }

    return pluginIds;
  }

  private installRecord(
    record: StoredPluginRecord,
    metadataOwnerReservations: readonly MetadataOwnerReservation[] = [],
  ): Promise<void> {
    if (record.installPromise !== undefined) {
      return record.installPromise;
    }

    const installPromise = Promise.resolve()
      .then(() =>
        this.runLifecycleHook(
          record,
          "install",
          record.plugin.install,
          metadataOwnerReservations,
        ),
      )
      .catch((error: unknown) => {
        this.cleanupFailedInstallRecord(record);
        throw error;
      })
      .finally(() => {
        if (record.installPromise === installPromise) {
          delete record.installPromise;
        }
      });

    record.installPromise = installPromise;

    return installPromise;
  }

  private async awaitPendingInstall(record: StoredPluginRecord): Promise<void> {
    if (record.installPromise !== undefined) {
      await record.installPromise;
    }
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
      if (
        record.manifest.id === pluginId ||
        (record.status === "installed" && !hasActiveRegisterScope(record))
      ) {
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
    metadataOwnerReservations: readonly MetadataOwnerReservation[] = [],
  ): Promise<void> {
    if (hook === undefined) {
      return;
    }

    const scope = createPluginContextScope(
      record.manifest.id,
      phase,
      false,
      metadataOwnerReservations,
    );
    record.lifecycleScopes.add(scope);

    try {
      await this.runWithPluginDirectStores(scope, (context) => hook(context));
      this.assertLifecycleScopeStillCurrent(record, scope);
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
      record.lifecycleScopes.delete(scope);
    }
  }

  private async registerInstalledPlugin(
    record: StoredPluginRecord,
    metadataOwnerReservations: readonly MetadataOwnerReservation[] = [],
  ): Promise<void> {
    if (record.registerPromise !== undefined) {
      return record.registerPromise;
    }

    const registerPromise = this.runRegisterLifecycle(
      record,
      metadataOwnerReservations,
    ).finally(() => {
      if (record.registerPromise === registerPromise) {
        delete record.registerPromise;
      }
    });

    record.registerPromise = registerPromise;

    return registerPromise;
  }

  private async runRegisterLifecycle(
    record: StoredPluginRecord,
    metadataOwnerReservations: readonly MetadataOwnerReservation[],
  ): Promise<void> {
    const scope = createPluginContextScope(
      record.manifest.id,
      "register",
      true,
      metadataOwnerReservations,
    );
    record.lifecycleScopes.add(scope);

    try {
      await this.runWithPluginDirectStores(scope, (context) =>
        record.plugin.register(context),
      );
      this.assertLifecycleScopeStillCurrent(record, scope);
    } catch (cause) {
      this.rollbackScopeRegistrationTracker(scope);

      if (
        this.records.get(record.manifest.id) === record &&
        record.status === "installed"
      ) {
        record.contributions = [];
        record.status = "installed";
      }

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
      record.lifecycleScopes.delete(scope);
    }

    record.contributions = [
      ...record.contributions,
      ...scope.registrationTracker,
    ];
    record.status = "registered";
  }

  private createPluginContext(
    scope: PluginContextScope,
    transactionStores?: CoreTransaction,
  ): PluginContext {
    const stores = transactionStores ?? this.services;
    const context: PluginContext = {
      pluginId: scope.pluginId,
      app: cloneAppRuntimeInfo(this.app),
      pages: createPluginPageStore(scope, stores.pages),
      metadata: createPluginMetadataStore(
        scope,
        stores.metadata,
        () => this.getMetadataOwnerReservations(scope.metadataOwnerReservations),
      ),
      events: createPluginEventStore(scope, stores.events),
      filters: createPluginFilterStore(scope, stores.filters),
      commands: this.createPluginCommandRegistry(scope),
      views: this.createPluginViewRegistry(scope),
      slots: this.createPluginSlotRegistry(scope),
      transaction: this.createPluginTransactionManager(scope, transactionStores),
    };

    Object.defineProperty(context, pluginScopedCommandExecutorKey, {
      enumerable: false,
      value: this.createPluginScopedCommandExecutor(scope.pluginId),
    });

    return context;
  }

  private runWithPluginDirectStores<Result>(
    scope: PluginContextScope,
    handler: (context: PluginContext) => Result | Promise<Result>,
  ): Promise<Awaited<Result>> {
    const directTransactionRunner = getCoreDirectTransactionRunner(
      this.services,
    );

    if (directTransactionRunner === undefined) {
      return Promise.resolve(handler(this.createPluginContext(scope)));
    }

    return directTransactionRunner.run((transaction) =>
      handler(this.createPluginContext(scope, transaction)),
    );
  }

  private createPluginScopedCommandExecutor(
    pluginId: string,
  ): PluginScopedCommandExecutor {
    return {
      execute: async (commandId, input) => {
        if (typeof commandId !== "string") {
          throw new Error(
            `Plugin ${pluginId} cannot execute command ${commandId}`,
          );
        }

        const descriptor = this.getOwnedCommandDescriptor(pluginId, commandId);

        return this.registries.commands.execute(descriptor.id, input);
      },
    };
  }

  private createPluginTransactionManager(
    scope: PluginContextScope,
    currentTransaction?: CoreTransaction,
  ): PluginTransactionManager {
    if (currentTransaction !== undefined) {
      return {
        run: async <Result>(
          handler: PluginTransactionHandler<Result>,
        ): Promise<Awaited<Result>> => {
          assertCanMutatePluginData(scope);

          const result = await handler(
            createPluginTransaction(
              scope,
              currentTransaction,
              () =>
                this.getMetadataOwnerReservations(
                  scope.metadataOwnerReservations,
                ),
            ),
          );

          assertCanMutatePluginData(scope);

          return result;
        },
      };
    }

    return {
      run: <Result>(
        handler: PluginTransactionHandler<Result>,
      ): Promise<Awaited<Result>> => {
        assertCanMutatePluginData(scope);

        return this.services.transaction.run(async (transaction) => {
          const result = await handler(
            createPluginTransaction(
              scope,
              transaction,
              () =>
                this.getMetadataOwnerReservations(
                  scope.metadataOwnerReservations,
                ),
            ),
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

        const handler = definition.handler;
        const descriptor = this.registries.commands.register({
          ...definition,
          pluginId,
          handler: (input: Input) =>
            this.runPluginCommandHandler(pluginId, handler, input),
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

  private async runPluginCommandHandler<Input, Output>(
    pluginId: string,
    handler: PluginCommandHandler<Input, Output>,
    input: Input,
  ): Promise<Awaited<Output>> {
    const record = this.requireRecord(pluginId);
    const scope = createPluginContextScope(pluginId, "command", false);

    record.lifecycleScopes.add(scope);

    try {
      const result = await this.runWithPluginDirectStores(scope, (context) =>
        handler(input, context),
      );

      this.assertLifecycleScopeStillCurrent(record, scope);

      return result;
    } catch (cause) {
      throw preserveCommandHandlerFailureCause(
        new PluginHostError(
          "PLUGIN_LIFECYCLE_FAILED",
          `Plugin ${pluginId} command failed`,
          {
            pluginId,
            phase: "command",
            cause,
          },
        ),
      );
    } finally {
      scope.active = false;
      record.lifecycleScopes.delete(scope);
    }
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
    preservedContributions: ReadonlySet<string> = new Set(),
  ): void {
    for (const contribution of [...contributions].reverse()) {
      if (preservedContributions.has(toRegisteredContributionKey(contribution))) {
        continue;
      }

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

  private revokeLifecycleScopes(
    record: StoredPluginRecord,
    preservedContributions?: ReadonlySet<string>,
  ): void {
    for (const scope of record.lifecycleScopes) {
      scope.active = false;
      this.rollbackScopeRegistrationTracker(scope, preservedContributions);
    }

    record.lifecycleScopes.clear();
    delete record.registerPromise;
  }

  private rollbackScopeRegistrationTracker(
    scope: PluginContextScope,
    preservedContributions: ReadonlySet<string> = new Set(),
  ): void {
    if (scope.registrationTrackerRolledBack) {
      return;
    }

    this.unregisterTrackedContributions(
      scope.registrationTracker,
      preservedContributions,
    );
    scope.registrationTrackerRolledBack = true;
  }

  private assertLifecycleScopeStillCurrent(
    record: StoredPluginRecord,
    scope: PluginContextScope,
  ): void {
    assertCanMutatePluginData(scope);

    if (this.records.get(record.manifest.id) === record) {
      return;
    }

    throw new PluginHostError(
      "PLUGIN_LIFECYCLE_FAILED",
      `Plugin ${record.manifest.id} ${scope.phase} no longer has a live record`,
      {
        pluginId: record.manifest.id,
        phase: scope.phase,
      },
    );
  }

  private rollbackInstalledBatchRecords(
    records: readonly StoredPluginRecord[],
    restoredNextOrder: number,
  ): void {
    for (const record of [...records].reverse()) {
      const preservedContributions =
        this.getCurrentTrackedContributionKeys(record);

      this.revokeLifecycleScopes(record, preservedContributions);
      this.unregisterTrackedContributions(
        record.contributions,
        preservedContributions,
      );
      record.contributions = [];

      if (this.records.get(record.manifest.id) === record) {
        this.records.delete(record.manifest.id);
      }
    }

    this.nextOrder = this.getRestoredNextOrder(restoredNextOrder);
  }

  private cleanupFailedInstallRecord(record: StoredPluginRecord): void {
    this.revokeLifecycleScopes(record);

    if (this.records.get(record.manifest.id) !== record) {
      return;
    }

    this.unregisterTrackedContributions(record.contributions);
    record.contributions = [];
    this.records.delete(record.manifest.id);
  }

  private getCurrentTrackedContributionKeys(
    record: StoredPluginRecord,
  ): ReadonlySet<string> {
    const currentRecord = this.records.get(record.manifest.id);

    if (currentRecord === undefined || currentRecord === record) {
      return new Set();
    }

    return getTrackedContributionKeys(currentRecord);
  }

  private getRestoredNextOrder(restoredNextOrder: number): number {
    let nextOrder = restoredNextOrder;

    for (const record of this.records.values()) {
      nextOrder = Math.max(nextOrder, record.order + 1);
    }

    return nextOrder;
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

  private getMetadataOwnerReservations(
    scopedReservations: readonly MetadataOwnerReservation[] = [],
  ): readonly MetadataOwnerReservation[] {
    const reservations = new Map<string, string>();

    for (const record of this.records.values()) {
      addMetadataOwnerReservations(
        reservations,
        record.manifest,
        record.manifest.id,
      );
    }

    for (const reservation of scopedReservations) {
      reservations.set(reservation.namespace, reservation.sourcePluginId);
    }

    return [...reservations].map(([namespace, sourcePluginId]) => ({
      namespace,
      sourcePluginId,
    }));
  }
}

function collectMetadataOwnerReservationsFromPlugins(
  plugins: readonly AppPlugin[],
): MetadataOwnerReservation[] {
  const reservations = new Map<string, string>();

  for (const plugin of plugins) {
    addMetadataOwnerReservations(
      reservations,
      plugin.manifest,
      plugin.manifest.id,
    );
  }

  return [...reservations].map(([namespace, sourcePluginId]) => ({
    namespace,
    sourcePluginId,
  }));
}

function addMetadataOwnerReservations(
  reservations: Map<string, string>,
  manifest: PluginManifest,
  pluginId: string,
): void {
  const fields = manifest.contributes?.metadataFields;

  if (!Array.isArray(fields)) {
    return;
  }

  for (const field of fields) {
    if (metadataFieldCreatesOwnerReservation(field, pluginId)) {
      reservations.set(field.namespace, pluginId);
    }
  }
}

function metadataFieldCreatesOwnerReservation(
  field: unknown,
  pluginId: string,
): field is { namespace: string } {
  if (typeof field !== "object" || field === null) {
    return false;
  }

  const descriptor = field as {
    namespace?: unknown;
    key?: unknown;
    valueType?: unknown;
  };

  return (
    descriptor.namespace === pluginId &&
    typeof descriptor.namespace === "string" &&
    metadataNamespacePattern.test(descriptor.namespace) &&
    typeof descriptor.key === "string" &&
    metadataNamespacePattern.test(descriptor.key) &&
    typeof descriptor.valueType === "string" &&
    metadataValueTypes.has(descriptor.valueType)
  );
}

export const PluginHost: {
  new (options: PluginHostOptions): PluginHostInstance;
} = PluginHostImpl;

function createPluginContextScope(
  pluginId: string,
  phase: PluginLifecyclePhase,
  allowsRuntimeContributionRegistration: boolean,
  metadataOwnerReservations: readonly MetadataOwnerReservation[] = [],
): PluginContextScope {
  return {
    pluginId,
    phase,
    active: true,
    allowsRuntimeContributionRegistration,
    metadataOwnerReservations,
    registrationTracker: [],
    registrationTrackerRolledBack: false,
  };
}

function hasActiveRegisterScope(record: StoredPluginRecord): boolean {
  for (const scope of record.lifecycleScopes) {
    if (scope.phase === "register" && scope.active) {
      return true;
    }
  }

  return false;
}

function getTrackedContributionKeys(
  record: StoredPluginRecord,
): ReadonlySet<string> {
  const contributionKeys = new Set<string>();

  for (const contribution of record.contributions) {
    contributionKeys.add(toRegisteredContributionKey(contribution));
  }

  for (const scope of record.lifecycleScopes) {
    for (const contribution of scope.registrationTracker) {
      contributionKeys.add(toRegisteredContributionKey(contribution));
    }
  }

  return contributionKeys;
}

function toRegisteredContributionKey(
  contribution: RegisteredContribution,
): string {
  return `${contribution.kind}:${contribution.id}`;
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
  metadataOwnerReservations: MetadataOwnerReservationProvider,
): PluginMetadataStore {
  const pluginId = scope.pluginId;

  return {
    set(input: PluginSetMetadataInput) {
      assertCanMutatePluginData(scope);
      assertNoOwnershipKeys(input, pluginId, [sourcePluginOwnershipPrefix]);
      const metadataInput = preparePluginMetadataSetInput(input, pluginId);

      assertMetadataWriteAllowed(
        pluginId,
        metadata,
        metadataInput,
        metadataOwnerReservations(),
      );

      return metadata.set(metadataInput);
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
  input: Parameters<MetadataStore["set"]>[0],
  metadataOwnerReservations: readonly MetadataOwnerReservation[],
): void {
  const requiredOwner = findReservedMetadataOwner(
    input.namespace,
    metadataOwnerReservations,
  );

  if (requiredOwner !== undefined && requiredOwner !== pluginId) {
    throw new PluginHostError(
      "PLUGIN_FACADE_OWNERSHIP_FORBIDDEN",
      `Plugin ${pluginId} cannot write ${input.namespace} metadata`,
      { pluginId },
    );
  }

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

function findReservedMetadataOwner(
  namespace: string,
  metadataOwnerReservations: readonly MetadataOwnerReservation[],
): string | undefined {
  return metadataOwnerReservations.find(
    (reservation) => reservation.namespace === namespace,
  )?.sourcePluginId;
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
      const filterInput = preparePluginFilterSaveInput(input, pluginId);

      assertFilterIdNamespaceAllowed(filterInput.id, pluginId);

      return filters.save(filterInput);
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

function assertFilterIdNamespaceAllowed(
  filterId: unknown,
  pluginId: string,
): void {
  if (typeof filterId !== "string") {
    return;
  }

  const namespaceEnd = filterId.indexOf(filterIdNamespaceMarker);

  if (namespaceEnd <= 0) {
    return;
  }

  const claimedPluginId = filterId.slice(0, namespaceEnd);

  if (claimedPluginId === pluginId) {
    return;
  }

  throw new PluginHostError(
    "PLUGIN_FACADE_OWNERSHIP_FORBIDDEN",
    `Plugin ${pluginId} cannot save filter id ${filterId}`,
    { pluginId },
  );
}

function preparePluginMetadataSetInput(
  input: PluginSetMetadataInput,
  pluginId: string,
): Parameters<MetadataStore["set"]>[0] {
  const metadataInput = {
    pageId: readPluginDataPropertyValue(input, "pageId", pluginId),
    namespace: readPluginDataPropertyValue(input, "namespace", pluginId),
    key: readPluginDataPropertyValue(input, "key", pluginId),
    value: readPluginDataPropertyValue(input, "value", pluginId),
    valueType: readPluginDataPropertyValue(input, "valueType", pluginId),
    sourcePluginId: pluginId,
  };

  return metadataInput as Parameters<MetadataStore["set"]>[0];
}

function preparePluginFilterSaveInput(
  input: PluginSaveFilterInput,
  pluginId: string,
): Parameters<FilterStore["save"]>[0] {
  const filterInput: Record<string, unknown> = {
    name: readPluginDataPropertyValue(input, "name", pluginId),
    query: readPluginDataPropertyValue(input, "query", pluginId),
    viewType: readPluginDataPropertyValue(input, "viewType", pluginId),
    sourcePluginId: pluginId,
  };
  const optionalFields = ["id", "sort", "group"] as const;

  for (const field of optionalFields) {
    const property = readPluginDataProperty(input, field, pluginId);

    if (property.present) {
      filterInput[field] = property.value;
    }
  }

  return filterInput as Parameters<FilterStore["save"]>[0];
}

function readPluginDataPropertyValue(
  input: object,
  propertyName: string,
  pluginId: string,
): unknown {
  const property = readPluginDataProperty(input, propertyName, pluginId);

  if (!property.present) {
    return undefined;
  }

  return property.value;
}

function readPluginDataProperty(
  input: object,
  propertyName: string,
  pluginId: string,
): PluginInputProperty {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(input, propertyName);

    if (descriptor === undefined) {
      return { present: false };
    }

    if (!("value" in descriptor)) {
      throw new PluginHostError(
        "PLUGIN_FACADE_OWNERSHIP_FORBIDDEN",
        `Plugin ${pluginId} input ${propertyName} must be plain data`,
        { pluginId },
      );
    }

    return {
      present: true,
      value: descriptor.value,
    };
  } catch (error) {
    if (error instanceof PluginHostError) {
      throw error;
    }

    throw new PluginHostError(
      "PLUGIN_FACADE_OWNERSHIP_FORBIDDEN",
      `Plugin ${pluginId} input ${propertyName} must be inspectable`,
      { pluginId, cause: error },
    );
  }
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
  metadataOwnerReservations: MetadataOwnerReservationProvider,
): PluginTransaction {
  const pluginId = scope.pluginId;

  return {
    pluginId,
    pages: createPluginPageStore(scope, transaction.pages),
    metadata: createPluginMetadataStore(
      scope,
      transaction.metadata,
      metadataOwnerReservations,
    ),
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
