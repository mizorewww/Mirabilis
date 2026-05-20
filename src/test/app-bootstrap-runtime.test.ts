import { describe, expect, it, vi } from "vitest";

import type { AppPlugin, AppRuntimeInfo, PluginContext } from "../core";

type UnknownRecord = Record<string, unknown>;

type PluginHostLike = {
  loadBuiltInPlugins: (
    plugins: readonly AppPlugin[],
  ) => Promise<readonly unknown[]>;
  activateAll: () => Promise<readonly unknown[]>;
};

type RuntimeLike = UnknownRecord & {
  app?: AppRuntimeInfo;
  pluginHost?: PluginHostLike;
};

type AppBootstrapOptions = {
  app?: AppRuntimeInfo;
  builtInPlugins?: readonly AppPlugin[];
  createNativeBridge?: () => unknown | Promise<unknown>;
  createStorageFacade?: (
    dependencies: { nativeBridge: unknown },
  ) => unknown | Promise<unknown>;
  createStores?: (
    dependencies: { nativeBridge: unknown; storage: unknown },
  ) => unknown | Promise<unknown>;
  createRegistries?: () => unknown | Promise<unknown>;
  createServices?: (
    dependencies: {
      stores: unknown;
      registries: unknown;
      storage: unknown;
    },
  ) => unknown | Promise<unknown>;
  createPluginHost?: (
    dependencies: {
      services: unknown;
      registries: unknown;
      app: AppRuntimeInfo;
    },
  ) => PluginHostLike;
  createRuntime?: (
    dependencies: {
      stores: unknown;
      registries: unknown;
      services: unknown;
      pluginHost: PluginHostLike;
      app: AppRuntimeInfo;
    },
  ) => RuntimeLike;
};

type AppBootstrapModule = {
  BUILT_IN_PLUGINS: readonly AppPlugin[];
  createAppRuntime: (options?: AppBootstrapOptions) => Promise<RuntimeLike>;
};

const testApp = {
  version: "0.1.0-test",
  pluginApiVersion: "0.1.0-test",
} satisfies AppRuntimeInfo;

describe("app bootstrap runtime", () => {
  it("exports an explicit built-in plugin list that bootstrap can load", async () => {
    const bootstrap = await loadBootstrapModule();

    expect(Array.isArray(bootstrap.BUILT_IN_PLUGINS)).toBe(true);
  });

  it("initializes the app runtime in documented order with injectable dependencies", async () => {
    const bootstrap = await loadBootstrapModule();
    const events: string[] = [];
    const nativeBridge = mark("nativeBridge");
    const storage = mark("storageFacade");
    const stores = mark("stores");
    const registries = mark("registries");
    const services = mark("services");
    const builtInPlugins = [
      createPlugin("builtin.first"),
      createPlugin("builtin.second"),
    ] as const;
    const pluginHost = {
      loadBuiltInPlugins: vi.fn(async (plugins: readonly AppPlugin[]) => {
        events.push(
          `PluginHost.loadBuiltInPlugins:${plugins
            .map((plugin) => plugin.manifest.id)
            .join(",")}`,
        );

        return [];
      }),
      activateAll: vi.fn(async () => {
        events.push("PluginHost.activateAll");

        return [];
      }),
    } satisfies PluginHostLike;
    const runtime = {
      app: testApp,
      stores,
      registries,
      services,
      pluginHost,
    } satisfies RuntimeLike;

    const result = await bootstrap.createAppRuntime({
      app: testApp,
      builtInPlugins,
      createNativeBridge: () => {
        events.push("NativeBridge");

        return nativeBridge;
      },
      createStorageFacade: ({ nativeBridge: receivedNativeBridge }) => {
        events.push("storage facade");
        expect(receivedNativeBridge).toBe(nativeBridge);

        return storage;
      },
      createStores: ({ nativeBridge: receivedNativeBridge, storage: receivedStorage }) => {
        events.push("stores");
        expect(receivedNativeBridge).toBe(nativeBridge);
        expect(receivedStorage).toBe(storage);

        return stores;
      },
      createRegistries: () => {
        events.push("registries");

        return registries;
      },
      createServices: ({
        stores: receivedStores,
        registries: receivedRegistries,
        storage: receivedStorage,
      }) => {
        events.push("services");
        expect(receivedStores).toBe(stores);
        expect(receivedRegistries).toBe(registries);
        expect(receivedStorage).toBe(storage);

        return services;
      },
      createPluginHost: ({
        services: receivedServices,
        registries: receivedRegistries,
        app,
      }) => {
        events.push("PluginHost");
        expect(receivedServices).toBe(services);
        expect(receivedRegistries).toBe(registries);
        expect(app).toBe(testApp);

        return pluginHost;
      },
      createRuntime: ({
        stores: receivedStores,
        registries: receivedRegistries,
        services: receivedServices,
        pluginHost: receivedPluginHost,
        app,
      }) => {
        events.push("runtime object");
        expect(receivedStores).toBe(stores);
        expect(receivedRegistries).toBe(registries);
        expect(receivedServices).toBe(services);
        expect(receivedPluginHost).toBe(pluginHost);
        expect(app).toBe(testApp);

        return runtime;
      },
    });

    expect(result).toBe(runtime);
    expect(pluginHost.loadBuiltInPlugins).toHaveBeenCalledWith(builtInPlugins);
    expect(pluginHost.activateAll).toHaveBeenCalledTimes(1);
    expect(events).toStrictEqual([
      "NativeBridge",
      "storage facade",
      "stores",
      "registries",
      "services",
      "PluginHost",
      "runtime object",
      "PluginHost.loadBuiltInPlugins:builtin.first,builtin.second",
      "PluginHost.activateAll",
    ]);
    expect(findUnsafeSurfacePaths(result)).toStrictEqual([]);
  });

  it("rejects startup failures before loading plugins or reporting ready", async () => {
    const bootstrap = await loadBootstrapModule();
    const startupFailure = new Error(
      "SQLITE_CONSTRAINT in /home/example/mirabilis.sqlite3 token=secret plugin=task.private",
    );
    const events: string[] = [];
    const pluginHost = {
      loadBuiltInPlugins: vi.fn(async () => []),
      activateAll: vi.fn(async () => []),
    } satisfies PluginHostLike;

    await expect(
      bootstrap.createAppRuntime({
        app: testApp,
        builtInPlugins: [createPlugin("builtin.never-loaded")],
        createNativeBridge: () => {
          events.push("NativeBridge");

          return mark("nativeBridge");
        },
        createStorageFacade: () => {
          events.push("storage facade");
          throw startupFailure;
        },
        createPluginHost: () => pluginHost,
      }),
    ).rejects.toBeDefined();

    expect(events).toStrictEqual(["NativeBridge", "storage facade"]);
    expect(pluginHost.loadBuiltInPlugins).not.toHaveBeenCalled();
    expect(pluginHost.activateAll).not.toHaveBeenCalled();
  });

  it("gives built-in plugins only the safe PluginContext facade during bootstrap", async () => {
    const bootstrap = await loadBootstrapModule();
    let capturedContext: PluginContext | undefined;
    const plugin = createPlugin("safe.public-surface", {
      activate(ctx) {
        capturedContext = ctx;
      },
    });

    const runtime = await bootstrap.createAppRuntime({
      app: testApp,
      builtInPlugins: [plugin],
      createNativeBridge: () => createNoopNativeBridge(),
    });

    expect(capturedContext).toEqual(
      expect.objectContaining({
        pluginId: "safe.public-surface",
        app: testApp,
        pages: expect.any(Object),
        metadata: expect.any(Object),
        events: expect.any(Object),
        filters: expect.any(Object),
        commands: expect.any(Object),
        views: expect.any(Object),
        slots: expect.any(Object),
        transaction: expect.any(Object),
      }),
    );
    expect(findUnsafeSurfacePaths(capturedContext)).toStrictEqual([]);
    expect(findUnsafeSurfacePaths(runtime)).toStrictEqual([]);
  });
});

async function loadBootstrapModule(): Promise<AppBootstrapModule> {
  const bootstrapModulePath = "../bootstrap";

  return (await import(bootstrapModulePath)) as AppBootstrapModule;
}

function createPlugin(
  id: string,
  lifecycle: Partial<Pick<AppPlugin, "activate" | "install" | "register">> = {},
): AppPlugin {
  return {
    manifest: {
      id,
      name: id,
      version: "1.0.0",
      minAppVersion: "0.1.0",
    },
    register: lifecycle.register ?? (() => undefined),
    install: lifecycle.install,
    activate: lifecycle.activate,
  };
}

function mark(kind: string): UnknownRecord {
  return { kind };
}

function createNoopNativeBridge(): UnknownRecord {
  return {
    db: {
      execute: async () => undefined,
      transaction: async () => [],
    },
    shortcuts: {
      register: async () => undefined,
      unregister: async () => undefined,
    },
    notifications: {
      notify: async () => undefined,
    },
    files: {
      importMarkdown: async () => "",
      exportMarkdown: async () => undefined,
    },
  };
}

function findUnsafeSurfacePaths(value: unknown): string[] {
  return collectUnsafeSurfacePaths(value, "$", new Set<object>()).sort();
}

function collectUnsafeSurfacePaths(
  value: unknown,
  currentPath: string,
  seen: Set<object>,
): string[] {
  if (typeof value !== "object" || value === null) {
    return [];
  }

  if (seen.has(value)) {
    return [];
  }

  seen.add(value);

  return Object.entries(value as UnknownRecord).flatMap(([key, child]) => {
    const childPath = `${currentPath}.${key}`;
    const keyViolation = isUnsafeSurfaceKey(key) ? [childPath] : [];

    return [
      ...keyViolation,
      ...collectUnsafeSurfacePaths(child, childPath, seen),
    ];
  });
}

function isUnsafeSurfaceKey(key: string): boolean {
  const normalized = key.replace(/[-_]/g, "").toLowerCase();

  return (
    normalized === "nativebridge" ||
    normalized === "invoke" ||
    normalized === "tauri" ||
    normalized === "db" ||
    normalized === "database" ||
    normalized === "dbquery" ||
    normalized === "sqlite" ||
    normalized === "sql" ||
    normalized === "connection" ||
    normalized === "handle" ||
    normalized === "storage" ||
    normalized === "storagedriver" ||
    normalized === "driver" ||
    normalized === "drivers" ||
    normalized === "filesystem" ||
    normalized === "files" ||
    normalized === "fs" ||
    normalized === "path" ||
    normalized === "paths"
  );
}
