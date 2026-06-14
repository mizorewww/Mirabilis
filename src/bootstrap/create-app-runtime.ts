import {
  PluginHost,
  createCoreRegistries,
  createCoreServices,
  createCoreStores,
  createMarkdownPageRuntimeFacade,
  createTauriNativeBridge,
  createMarkdownRuntimeFacade,
  type AppPlugin,
  type AppRuntimeInfo,
  type CoreRegistries,
  type CoreServices,
  type CoreStores,
  type MarkdownRuntimeFacade,
  type NativeBridge,
  type PluginHostRecord,
} from "../core";
import {
  createNativeDirectStoreRunner,
  createNativePageWriteThrough,
  createNativeTransactionPersistence,
  hydrateCoreStoresFromNativeBridge,
} from "../core/runtime/sqlite-persistence";

import { BUILT_IN_PLUGINS } from "./built-in-plugins";

export type AppPluginHost = {
  loadBuiltInPlugins(
    plugins: readonly AppPlugin[],
  ): Promise<readonly unknown[]>;
  activateAll(): Promise<readonly unknown[]>;
  listPlugins?(): readonly PluginHostRecord[];
};

export type AppRuntime = CoreServices & {
  app: AppRuntimeInfo;
  storage: StorageFacade;
  markdown: MarkdownRuntimeFacade;
  stores: CoreStores;
  registries: CoreRegistries;
  services: CoreServices;
  pluginHost: AppPluginHost;
};

export type StorageFacade = {
  readonly persistence: "in-memory-core" | "sqlite-core";
};

export type AppBootstrapOptions<Runtime extends object = AppRuntime> = {
  app?: AppRuntimeInfo;
  builtInPlugins?: readonly AppPlugin[];
  createNativeBridge?: () => unknown | Promise<unknown>;
  createStorageFacade?: (dependencies: {
    nativeBridge: unknown;
  }) => unknown | Promise<unknown>;
  createStores?: (dependencies: {
    nativeBridge: unknown;
    storage: unknown;
  }) => unknown | Promise<unknown>;
  createRegistries?: () => unknown | Promise<unknown>;
  createServices?: (dependencies: {
    nativeBridge: unknown;
    stores: unknown;
    registries: unknown;
    storage: unknown;
  }) => unknown | Promise<unknown>;
  createPluginHost?: (dependencies: {
    services: unknown;
    registries: unknown;
    app: AppRuntimeInfo;
  }) => AppPluginHost;
  createRuntime?: (dependencies: {
    nativeBridge: unknown;
    stores: unknown;
    registries: unknown;
    services: unknown;
    pluginHost: AppPluginHost;
    storage: unknown;
    app: AppRuntimeInfo;
  }) => Runtime | Promise<Runtime>;
};

const defaultApp = Object.freeze({
  version: "0.1.0",
  pluginApiVersion: "0.1.0",
} satisfies AppRuntimeInfo);

export async function createAppRuntime<Runtime extends object = AppRuntime>(
  options: AppBootstrapOptions<Runtime> = {},
): Promise<Runtime> {
  const app = options.app ?? defaultApp;
  const createNative = options.createNativeBridge ?? createTauriNativeBridge;
  const createStorage = options.createStorageFacade ?? createStorageFacade;
  const createStores = options.createStores ?? createDefaultStores;
  const createRegistries = options.createRegistries ?? createCoreRegistries;
  const createServices = options.createServices ?? createDefaultServices;
  const createPluginHost = options.createPluginHost ?? createDefaultPluginHost;
  const createRuntime = options.createRuntime ?? createDefaultRuntime;
  const builtInPlugins = options.builtInPlugins ?? BUILT_IN_PLUGINS;

  const nativeBridge = await createNative();
  const storage = await createStorage({ nativeBridge });
  const stores = await createStores({ nativeBridge, storage });
  const registries = await createRegistries();
  const services = await createServices({
    nativeBridge,
    stores,
    registries,
    storage,
  });
  const pluginHost = createPluginHost({ services, registries, app });
  const runtime = await createRuntime({
    nativeBridge,
    stores,
    registries,
    services,
    pluginHost,
    storage,
    app,
  });

  await pluginHost.loadBuiltInPlugins(builtInPlugins);
  await pluginHost.activateAll();

  return runtime as Runtime;
}

function createStorageFacade(): StorageFacade {
  return {
    persistence: "sqlite-core",
  };
}

async function createDefaultStores({
  nativeBridge,
  storage,
}: {
  nativeBridge: unknown;
  storage: unknown;
}): Promise<CoreStores> {
  const stores = createCoreStores();

  if (usesSqlitePersistence(storage)) {
    await hydrateCoreStoresFromNativeBridge(
      stores,
      nativeBridge as NativeBridge,
    );
  }

  return stores;
}

function createDefaultServices({
  nativeBridge,
  stores,
  registries,
  storage,
}: {
  nativeBridge: unknown;
  stores: unknown;
  registries: unknown;
  storage: unknown;
}): CoreServices {
  const sqlitePersistenceActive = usesSqlitePersistence(storage);
  const pageWriteThrough = sqlitePersistenceActive
    ? createNativePageWriteThrough(
        (stores as CoreStores).pages,
        nativeBridge as NativeBridge,
      )
    : undefined;
  const transactionPersistence = sqlitePersistenceActive
    ? createNativeTransactionPersistence(nativeBridge as NativeBridge, {
        beforeCommit: pageWriteThrough?.flush,
      })
    : undefined;
  const rawServices = createCoreServices({
    stores: stores as CoreStores,
    registries: registries as CoreRegistries,
    transactionPersistence,
  });

  if (pageWriteThrough === undefined) {
    return rawServices;
  }

  const directStoreRunner = createNativeDirectStoreRunner(
    stores as CoreStores,
    nativeBridge as NativeBridge,
    {
      beforeCommit: pageWriteThrough.flush,
    },
  );

  return createCoreServices({
    stores: {
      ...(stores as CoreStores),
      pages: pageWriteThrough.pages,
    },
    registries: registries as CoreRegistries,
    transaction: rawServices.transaction,
    directTransactionRunner: directStoreRunner,
  });
}

function createDefaultPluginHost({
  services,
  registries,
  app,
}: {
  services: unknown;
  registries: unknown;
  app: AppRuntimeInfo;
}): AppPluginHost {
  return new PluginHost({
    services: services as CoreServices,
    registries: registries as CoreRegistries,
    app,
  });
}

function createDefaultRuntime({
  nativeBridge,
  stores,
  registries,
  services,
  pluginHost,
  storage,
  app,
}: {
  nativeBridge: unknown;
  stores: unknown;
  registries: unknown;
  services: unknown;
  pluginHost: AppPluginHost;
  storage: unknown;
  app: AppRuntimeInfo;
}): AppRuntime {
  const coreServices = services as CoreServices;
  const runtime = {
    app,
    markdown: createMarkdownRuntimeFacade(pluginHost, {
      pages: createMarkdownPageRuntimeFacade(nativeBridge as NativeBridge),
    }),
    stores: stores as CoreStores,
    registries: registries as CoreRegistries,
    services: coreServices,
    pluginHost,
    ...coreServices,
  };

  Object.defineProperty(runtime, "storage", {
    configurable: false,
    enumerable: false,
    value: storage as StorageFacade,
    writable: false,
  });

  return runtime as AppRuntime;
}

function usesSqlitePersistence(storage: unknown): boolean {
  return (
    typeof storage === "object" &&
    storage !== null &&
    "persistence" in storage &&
    typeof storage.persistence === "string" &&
    /sqlite/iu.test(storage.persistence)
  );
}
