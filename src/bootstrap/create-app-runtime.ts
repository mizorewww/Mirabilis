import {
  PluginHost,
  createCoreRegistries,
  createCoreServices,
  createCoreStores,
  createTauriNativeBridge,
  createMarkdownRuntimeFacade,
  type AppPlugin,
  type AppRuntimeInfo,
  type CoreRegistries,
  type CoreServices,
  type CoreStores,
  type MarkdownRuntimeFacade,
  type PluginHostRecord,
} from "../core";

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
  markdown: MarkdownRuntimeFacade;
  stores: CoreStores;
  registries: CoreRegistries;
  services: CoreServices;
  pluginHost: AppPluginHost;
};

export type StorageFacade = {
  readonly persistence: "in-memory-core";
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
    stores: unknown;
    registries: unknown;
    services: unknown;
    pluginHost: AppPluginHost;
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
  const services = await createServices({ stores, registries, storage });
  const pluginHost = createPluginHost({ services, registries, app });
  const runtime = await createRuntime({
    stores,
    registries,
    services,
    pluginHost,
    app,
  });

  await pluginHost.loadBuiltInPlugins(builtInPlugins);
  await pluginHost.activateAll();

  return runtime as Runtime;
}

function createStorageFacade(): StorageFacade {
  return {
    persistence: "in-memory-core",
  };
}

function createDefaultStores(): CoreStores {
  return createCoreStores();
}

function createDefaultServices({
  stores,
  registries,
}: {
  stores: unknown;
  registries: unknown;
  storage: unknown;
}): CoreServices {
  return createCoreServices({
    stores: stores as CoreStores,
    registries: registries as CoreRegistries,
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
  stores,
  registries,
  services,
  pluginHost,
  app,
}: {
  stores: unknown;
  registries: unknown;
  services: unknown;
  pluginHost: AppPluginHost;
  app: AppRuntimeInfo;
}): AppRuntime {
  const coreServices = services as CoreServices;

  return {
    app,
    markdown: createMarkdownRuntimeFacade(pluginHost),
    stores: stores as CoreStores,
    registries: registries as CoreRegistries,
    services: coreServices,
    pluginHost,
    ...coreServices,
  };
}
