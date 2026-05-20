import { describe, expect, expectTypeOf, it, vi } from "vitest";
import type { ComponentType } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any -- TASK-011 verifies runtime spoof rejection after compile-time ownership reservations are bypassed. */

import {
  PluginHost,
  PluginHostError,
  createInMemoryAppRuntime,
} from "../core";
import {
  PluginHost as PluginHostFromPluginHost,
  PluginHostError as PluginHostErrorFromPluginHost,
} from "../core/plugin-host";
import type {
  AppPlugin,
  AppRuntimeInfo,
  CoreRegistries,
  CoreRuntime,
  CoreServices,
  MetadataJsonValue,
  PluginContext,
  PluginDependencyReference,
  PluginHostErrorCode,
  PluginHostRecord,
  PluginHostStatus,
  PluginManifest,
  StructuredMarkdownDocument,
} from "../core";
import type {
  PluginHostErrorCode as PluginHostErrorCodeFromPluginHost,
  PluginHostRecord as PluginHostRecordFromPluginHost,
  PluginHostStatus as PluginHostStatusFromPluginHost,
} from "../core/plugin-host";

type ExpectedPluginHostErrorCode =
  | "PLUGIN_DUPLICATE_ID"
  | "PLUGIN_DEPENDENCY_MISSING"
  | "PLUGIN_DEPENDENCY_CYCLE"
  | "PLUGIN_SELF_DEPENDENCY"
  | "PLUGIN_NOT_FOUND"
  | "PLUGIN_NOT_REGISTERED"
  | "PLUGIN_LIFECYCLE_FAILED"
  | "PLUGIN_FACADE_OWNERSHIP_FORBIDDEN"
  | "PLUGIN_CONTRIBUTION_NOT_FOUND";

type PluginHostInstance = InstanceType<typeof PluginHost>;

type CapturedContributionDescriptors = ReturnType<
  typeof registerRuntimeContributions
>;

type PluginOptions = {
  id: string;
  name?: string;
  version?: string;
  dependencies?: readonly PluginDependencyReference[];
  optionalDependencies?: readonly PluginDependencyReference[];
  install?: AppPlugin["install"];
  activate?: AppPlugin["activate"];
  register?: AppPlugin["register"];
  deactivate?: AppPlugin["deactivate"];
  uninstall?: AppPlugin["uninstall"];
};

type ExpectedHostErrorOptions = {
  pluginId?: string;
  dependencyId?: string;
  phase?: string;
  cause?: unknown;
};

const testApp = {
  version: "test",
  pluginApiVersion: "test",
} satisfies AppRuntimeInfo;

const RuntimeView: ComponentType<{ surface?: string }> = () => null;
const RuntimeSlot: ComponentType<{ region?: string }> = () => null;

describe("Plugin Host lifecycle", () => {
  it("exports the public Plugin Host API from Core entrypoints", () => {
    expect(PluginHost).toEqual(expect.any(Function));
    expect(PluginHostFromPluginHost).toBe(PluginHost);
    expect(PluginHostError).toEqual(expect.any(Function));
    expect(PluginHostErrorFromPluginHost).toBe(PluginHostError);

    expectTypeOf<PluginHostErrorCodeFromPluginHost>().toEqualTypeOf<
      PluginHostErrorCode
    >();
    expectTypeOf<PluginHostRecordFromPluginHost>().toEqualTypeOf<
      PluginHostRecord
    >();
    expectTypeOf<PluginHostStatusFromPluginHost>().toEqualTypeOf<
      PluginHostStatus
    >();
    expectTypeOf<ExpectedPluginHostErrorCode>().toExtend<
      PluginHostErrorCode
    >();
    expectTypeOf<PluginHostStatus>().toEqualTypeOf<
      "installed" | "registered" | "active"
    >();
    expectTypeOf<PluginHostRecord>().toMatchObjectType<{
      id: string;
      name: string;
      version: string;
      enabled: boolean;
      status: PluginHostStatus;
      manifest: PluginManifest;
    }>();
    expectTypeOf<PluginHostError>().toMatchObjectType<{
      name: string;
      code: PluginHostErrorCode;
      pluginId?: string;
      dependencyId?: string;
      phase?: string;
      cause?: unknown;
    }>();
    expectTypeOf<PluginHostInstance>().toMatchObjectType<{
      loadBuiltInPlugins(plugins: readonly AppPlugin[]): Promise<unknown>;
      activateAll(): Promise<unknown>;
      activate(pluginId: string): Promise<unknown>;
      deactivate(pluginId: string): Promise<unknown>;
      uninstall(pluginId: string): Promise<unknown>;
      getPlugin(pluginId: string): PluginHostRecord;
    }>();

    const runtime = createInMemoryAppRuntime();
    const host = new PluginHost({
      services: runtime.services satisfies CoreServices,
      registries: runtime.registries satisfies CoreRegistries,
      app: testApp satisfies AppRuntimeInfo,
    });

    expect(host).toBeInstanceOf(PluginHost);
  });

  it("loads explicit built-in plugins by dependency order without activating them", async () => {
    const runtime = createInMemoryAppRuntime();
    const host = createHost(runtime);
    const events: string[] = [];
    const leaf = lifecyclePlugin("leaf", events, {
      dependencies: [{ id: "middle", version: ">=1.0.0" }],
    });
    const middle = lifecyclePlugin("middle", events, {
      dependencies: ["root"],
    });
    const root = lifecyclePlugin("root", events);

    await host.loadBuiltInPlugins([leaf, middle, root]);

    expect(events).toStrictEqual([
      "root.install",
      "middle.install",
      "leaf.install",
      "root.register",
      "middle.register",
      "leaf.register",
    ]);
    expect(host.getPlugin("root")).toMatchObject({
      id: "root",
      name: "Root Plugin",
      version: "1.0.0",
      enabled: false,
      status: "registered",
      manifest: expect.objectContaining({
        id: "root",
        name: "Root Plugin",
      }),
    });
    expectSafePluginRecord(host.getPlugin("root"));
    expectSafePluginRecord(host.getPlugin("middle"));
    expectSafePluginRecord(host.getPlugin("leaf"));

    const firstRead = host.getPlugin("root");
    const secondRead = host.getPlugin("root");

    expect(firstRead).not.toBe(secondRead);
    expect(firstRead.manifest).not.toBe(secondRead.manifest);

    try {
      (firstRead.manifest as { name: string }).name = "Mutated Root Plugin";
    } catch {
      // Frozen host descriptors are acceptable; mutations still must not leak.
    }

    expect(host.getPlugin("root").manifest.name).toBe("Root Plugin");
    expect(events).not.toContain("root.activate");

    await host.activateAll();

    expect(events).toStrictEqual([
      "root.install",
      "middle.install",
      "leaf.install",
      "root.register",
      "middle.register",
      "leaf.register",
      "root.activate",
      "middle.activate",
      "leaf.activate",
    ]);
    expect(host.getPlugin("root")).toMatchObject({
      enabled: true,
      status: "active",
    });
  });

  it("preserves input order for independent built-in plugins", async () => {
    const host = createHost();
    const events: string[] = [];

    await host.loadBuiltInPlugins([
      lifecyclePlugin("alpha", events),
      lifecyclePlugin("beta", events),
      lifecyclePlugin("gamma", events),
    ]);

    expect(events).toStrictEqual([
      "alpha.install",
      "beta.install",
      "gamma.install",
      "alpha.register",
      "beta.register",
      "gamma.register",
    ]);
  });

  it("activates one registered plugin without activating unrelated plugins", async () => {
    const host = createHost();
    const events: string[] = [];

    await host.loadBuiltInPlugins([
      lifecyclePlugin("alpha", events),
      lifecyclePlugin("beta", events),
    ]);
    events.length = 0;

    await host.activate("beta");

    expect(events).toStrictEqual(["beta.activate"]);
    expect(host.getPlugin("alpha")).toMatchObject({
      enabled: false,
      status: "registered",
    });
    expect(host.getPlugin("beta")).toMatchObject({
      enabled: true,
      status: "active",
    });
    expectPluginHostError(
      () => host.getPlugin("missing"),
      "PLUGIN_NOT_FOUND",
      {
        pluginId: "missing",
      },
    );
    await expectPluginHostErrorAsync(
      () => host.activate("missing"),
      "PLUGIN_NOT_FOUND",
      {
        pluginId: "missing",
      },
    );
  });

  it("deactivates plugins by calling hooks, unregistering contributions, and preserving Core data", async () => {
    const runtime = createInMemoryAppRuntime();
    const host = createHost(runtime);
    const page = runtime.pages.create({
      title: "Persistent data",
      body: emptyDocument(),
    });
    const events: string[] = [];
    const plugin = createPlugin({
      id: "owner",
      register(ctx) {
        events.push("owner.register");
        registerRuntimeContributions(ctx, "owner");
        ctx.metadata.set({
          pageId: page.id,
          namespace: "owner",
          key: "state",
          value: "kept",
          valueType: "string",
        });
        ctx.events.append({
          pageId: page.id,
          namespace: "owner",
          type: "registered",
          payload: { ok: true },
        });
        ctx.filters.save({
          name: "Owner filter",
          query: { where: [{ field: "owner.state", op: "eq", value: "kept" }] },
          viewType: "owner.view",
        });
      },
      activate() {
        events.push("owner.activate");
      },
      deactivate() {
        events.push("owner.deactivate");
      },
    });

    await host.loadBuiltInPlugins([plugin]);
    await host.activateAll();

    expect(registryIds(runtime)).toStrictEqual({
      commands: ["owner.command"],
      views: ["owner.view"],
      slots: ["owner.slot"],
    });
    expect(runtime.metadata.list()).toHaveLength(1);
    expect(runtime.events.list()).toHaveLength(1);
    expect(runtime.filters.list()).toHaveLength(1);

    await host.deactivate("owner");

    expect(events).toStrictEqual([
      "owner.register",
      "owner.activate",
      "owner.deactivate",
    ]);
    expect(registryIds(runtime)).toStrictEqual({
      commands: [],
      views: [],
      slots: [],
    });
    expect(host.getPlugin("owner")).toMatchObject({
      enabled: false,
      status: "installed",
    });
    expect(runtime.metadata.list()).toMatchObject([
      { namespace: "owner", key: "state", value: "kept" },
    ]);
    expect(runtime.events.list()).toMatchObject([
      { namespace: "owner", type: "registered", sourcePluginId: "owner" },
    ]);
    expect(runtime.filters.list()).toMatchObject([
      { name: "Owner filter", sourcePluginId: "owner" },
    ]);
  });

  it("uninstalls active plugins by deactivating them, preserving data, and removing the host record", async () => {
    const runtime = createInMemoryAppRuntime();
    const host = createHost(runtime);
    const page = runtime.pages.create({
      title: "Data survives uninstall",
      body: emptyDocument(),
    });
    const events: string[] = [];
    const plugin = createPlugin({
      id: "removable",
      register(ctx) {
        events.push("removable.register");
        registerRuntimeContributions(ctx, "removable");
        ctx.metadata.set({
          pageId: page.id,
          namespace: "removable",
          key: "state",
          value: "kept",
          valueType: "string",
        });
      },
      activate() {
        events.push("removable.activate");
      },
      deactivate() {
        events.push("removable.deactivate");
      },
      uninstall() {
        events.push("removable.uninstall");
      },
    });

    await host.loadBuiltInPlugins([plugin]);
    await host.activateAll();
    await host.uninstall("removable");

    expect(events).toStrictEqual([
      "removable.register",
      "removable.activate",
      "removable.deactivate",
      "removable.uninstall",
    ]);
    expect(registryIds(runtime)).toStrictEqual({
      commands: [],
      views: [],
      slots: [],
    });
    expect(runtime.metadata.list()).toMatchObject([
      { namespace: "removable", key: "state", sourcePluginId: "removable" },
    ]);
    expectPluginHostError(
      () => host.getPlugin("removable"),
      "PLUGIN_NOT_FOUND",
      {
        pluginId: "removable",
      },
    );
  });

  it("orders present optional dependencies before dependents and ignores absent optional dependencies", async () => {
    const host = createHost();
    const events: string[] = [];

    await host.loadBuiltInPlugins([
      lifecyclePlugin("string-optional-consumer", events, {
        optionalDependencies: ["string-helper"],
      }),
      lifecyclePlugin("string-helper", events),
      lifecyclePlugin("object-optional-consumer", events, {
        dependencies: [{ id: "object-helper", optional: true }],
      }),
      lifecyclePlugin("object-helper", events),
      lifecyclePlugin("missing-optional-consumer", events, {
        dependencies: [{ id: "missing-object-helper", optional: true }],
        optionalDependencies: ["missing-string-helper"],
      }),
    ]);

    const registerOrder = events
      .filter((event) => event.endsWith(".register"))
      .map((event) => event.replace(".register", ""));

    expect(registerOrder.indexOf("string-helper")).toBeLessThan(
      registerOrder.indexOf("string-optional-consumer"),
    );
    expect(registerOrder.indexOf("object-helper")).toBeLessThan(
      registerOrder.indexOf("object-optional-consumer"),
    );
    expect(registerOrder).toContain("missing-optional-consumer");
  });

  it("rejects invalid plugin lists with typed dependency errors before hooks run", async () => {
    const invalidCases: Array<{
      name: string;
      plugins: () => readonly AppPlugin[];
      code: PluginHostErrorCode;
      pluginId?: string;
      dependencyId?: string;
    }> = [
      {
        name: "duplicate plugin ids",
        plugins: () => [
          createPlugin({
            id: "duplicate",
            install: vi.fn(),
            register: vi.fn(),
          }),
          createPlugin({
            id: "duplicate",
            install: vi.fn(),
            register: vi.fn(),
          }),
        ],
        code: "PLUGIN_DUPLICATE_ID",
        pluginId: "duplicate",
      },
      {
        name: "missing required dependency",
        plugins: () => [
          createPlugin({
            id: "needs-missing",
            dependencies: ["missing-required"],
            install: vi.fn(),
            register: vi.fn(),
          }),
        ],
        code: "PLUGIN_DEPENDENCY_MISSING",
        pluginId: "needs-missing",
        dependencyId: "missing-required",
      },
      {
        name: "self-dependency",
        plugins: () => [
          createPlugin({
            id: "self",
            dependencies: [{ id: "self" }],
            install: vi.fn(),
            register: vi.fn(),
          }),
        ],
        code: "PLUGIN_SELF_DEPENDENCY",
        pluginId: "self",
        dependencyId: "self",
      },
      {
        name: "dependency cycle",
        plugins: () => [
          createPlugin({
            id: "cycle-a",
            dependencies: ["cycle-b"],
            install: vi.fn(),
            register: vi.fn(),
          }),
          createPlugin({
            id: "cycle-b",
            dependencies: ["cycle-c"],
            install: vi.fn(),
            register: vi.fn(),
          }),
          createPlugin({
            id: "cycle-c",
            dependencies: ["cycle-a"],
            install: vi.fn(),
            register: vi.fn(),
          }),
        ],
        code: "PLUGIN_DEPENDENCY_CYCLE",
      },
    ];

    for (const invalidCase of invalidCases) {
      const host = createHost();
      const plugins = invalidCase.plugins();
      const hookSpies = plugins.flatMap((plugin) => [
        plugin.install,
        plugin.register,
      ]);

      await expectPluginHostErrorAsync(
        () => host.loadBuiltInPlugins(plugins),
        invalidCase.code,
        {
          pluginId: invalidCase.pluginId,
          dependencyId: invalidCase.dependencyId,
        },
      );

      for (const hook of hookSpies) {
        if (hook !== undefined && vi.isMockFunction(hook)) {
          expect(hook).not.toHaveBeenCalled();
        }
      }
    }
  });

  it("injects ownership into plugin-facing registries and scopes descriptors to the current plugin", async () => {
    const runtime = createInMemoryAppRuntime();
    const host = createHost(runtime);
    const page = runtime.pages.create({
      title: "Facade page",
      body: emptyDocument(),
    });
    const contexts = new Map<string, PluginContext>();
    const descriptors = new Map<string, CapturedContributionDescriptors>();
    const alpha = createPlugin({
      id: "alpha",
      register(ctx) {
        contexts.set("alpha", ctx);
        descriptors.set("alpha", registerRuntimeContributions(ctx, "alpha"));
        ctx.metadata.set({
          pageId: page.id,
          namespace: "alpha",
          key: "state",
          value: "ready",
          valueType: "string",
        });
        ctx.events.append({
          pageId: page.id,
          namespace: "alpha",
          type: "registered",
          payload: { phase: "register" },
        });
        ctx.filters.save({
          name: "Alpha filter",
          query: { where: [{ field: "alpha.state", op: "eq", value: "ready" }] },
          viewType: "alpha.view",
        });
      },
    });
    const beta = createPlugin({
      id: "beta",
      register(ctx) {
        contexts.set("beta", ctx);
        descriptors.set("beta", registerRuntimeContributions(ctx, "beta"));
      },
    });

    await host.loadBuiltInPlugins([alpha, beta]);

    const alphaContext = requireMapValue(contexts, "alpha");
    const betaContext = requireMapValue(contexts, "beta");
    const alphaDescriptors = requireMapValue(descriptors, "alpha");
    const betaDescriptors = requireMapValue(descriptors, "beta");

    expect(alphaDescriptors.command).toStrictEqual({
      id: "alpha.command",
      title: "Alpha command",
    });
    expectNoOwnKeys(alphaDescriptors.command, ["pluginId", "handler"]);
    expect(alphaDescriptors.view).toStrictEqual({
      id: "alpha.view",
      type: "alpha.view",
      title: "Alpha view",
      accepts: { shape: "alpha.shape" },
    });
    expectNoOwnKeys(alphaDescriptors.view, ["pluginId", "component"]);
    expect(alphaDescriptors.slot).toStrictEqual({
      id: "alpha.slot",
      slot: "workspace.header",
      order: 10,
    });
    expectNoOwnKeys(alphaDescriptors.slot, ["pluginId", "component", "when"]);

    expect(runtime.registries.commands.get("alpha.command")).toMatchObject({
      id: "alpha.command",
      pluginId: "alpha",
      title: "Alpha command",
    });
    expect(runtime.registries.views.get("alpha.view")).toMatchObject({
      id: "alpha.view",
      pluginId: "alpha",
      type: "alpha.view",
      title: "Alpha view",
      component: RuntimeView,
      accepts: { shape: "alpha.shape" },
    });
    expect(runtime.registries.slots.get("alpha.slot")).toMatchObject({
      id: "alpha.slot",
      pluginId: "alpha",
      slot: "workspace.header",
      component: RuntimeSlot,
    });
    expect(runtime.metadata.list()).toMatchObject([
      { namespace: "alpha", key: "state", sourcePluginId: "alpha" },
    ]);
    expect(runtime.events.list()).toMatchObject([
      { namespace: "alpha", type: "registered", sourcePluginId: "alpha" },
    ]);
    expect(runtime.filters.list()).toMatchObject([
      { name: "Alpha filter", sourcePluginId: "alpha" },
    ]);

    expect(alphaContext.commands.get("alpha.command")).toStrictEqual(
      alphaDescriptors.command,
    );
    expect(alphaContext.views.get("alpha.view")).toStrictEqual(
      alphaDescriptors.view,
    );
    expect(alphaContext.slots.get("alpha.slot")).toStrictEqual(
      alphaDescriptors.slot,
    );
    expect(alphaContext.commands.list()).toStrictEqual([
      alphaDescriptors.command,
    ]);
    expect(betaContext.commands.list()).toStrictEqual([
      betaDescriptors.command,
    ]);
    expect(alphaContext.views.list()).toStrictEqual([alphaDescriptors.view]);
    expect(betaContext.views.list()).toStrictEqual([betaDescriptors.view]);
    expect(alphaContext.slots.list()).toStrictEqual([alphaDescriptors.slot]);
    expect(betaContext.slots.list()).toStrictEqual([betaDescriptors.slot]);
    expectPluginHostError(
      () => alphaContext.commands.get("beta.command"),
      "PLUGIN_CONTRIBUTION_NOT_FOUND",
      {
        pluginId: "alpha",
      },
    );
    expectPluginHostError(
      () => alphaContext.views.get("beta.view"),
      "PLUGIN_CONTRIBUTION_NOT_FOUND",
      {
        pluginId: "alpha",
      },
    );
    expectPluginHostError(
      () => alphaContext.slots.get("beta.slot"),
      "PLUGIN_CONTRIBUTION_NOT_FOUND",
      {
        pluginId: "alpha",
      },
    );
  });

  it("rejects runtime ownership spoofing through plugin facades without mutating registries or stores", async () => {
    const runtime = createInMemoryAppRuntime();
    const host = createHost(runtime);
    const page = runtime.pages.create({
      title: "Spoof target",
      body: emptyDocument(),
    });
    const pagesBefore = runtime.pages.list();
    const capturedErrors: unknown[] = [];
    const plugin = createPlugin({
      id: "spoof",
      register(ctx) {
        const attempts: Array<() => unknown> = [
          () =>
            ctx.commands.register({
              id: "spoof.command",
              pluginId: "other",
              title: "Spoof command",
              handler: () => "spoofed",
            } as any),
          () => ctx.commands.list({ pluginId: "other" } as any),
          () =>
            ctx.views.register({
              id: "spoof.view",
              pluginId: "other",
              type: "spoof.view",
              title: "Spoof view",
              component: RuntimeView,
              accepts: {},
            } as any),
          () => ctx.views.list({ pluginId: "other" } as any),
          () =>
            ctx.slots.register({
              id: "spoof.slot",
              pluginId: "other",
              slot: "workspace.header",
              component: RuntimeSlot,
            } as any),
          () => ctx.slots.list({ pluginId: "other" } as any),
          () =>
            ctx.metadata.set({
              pageId: page.id,
              namespace: "spoof",
              key: "state",
              value: "bad",
              valueType: "string",
              sourcePluginId: "other",
            } as any),
          () =>
            ctx.events.append({
              pageId: page.id,
              namespace: "spoof",
              type: "bad",
              payload: {},
              sourcePluginId: "other",
            } as any),
          () =>
            ctx.filters.save({
              name: "Spoof filter",
              query: { where: [] },
              viewType: "spoof.view",
              sourcePluginId: "other",
            } as any),
        ];

        for (const attempt of attempts) {
          try {
            attempt();
          } catch (error) {
            capturedErrors.push(error);
          }
        }
      },
    });

    await host.loadBuiltInPlugins([plugin]);

    expect(capturedErrors).toHaveLength(9);
    for (const error of capturedErrors) {
      expectPluginHostError(error, "PLUGIN_FACADE_OWNERSHIP_FORBIDDEN", {
        pluginId: "spoof",
      });
    }
    expect(registryIds(runtime)).toStrictEqual({
      commands: [],
      views: [],
      slots: [],
    });
    expect(runtime.pages.list()).toStrictEqual(pagesBefore);
    expect(runtime.metadata.list()).toStrictEqual([]);
    expect(runtime.events.list()).toStrictEqual([]);
    expect(runtime.filters.list()).toStrictEqual([]);
  });

  it("does not expose raw handles or privileged registry methods to plugin contexts", async () => {
    const host = createHost();
    let capturedContext: PluginContext | undefined;
    const plugin = createPlugin({
      id: "sandboxed",
      register(ctx) {
        capturedContext = ctx;
      },
    });

    await host.loadBuiltInPlugins([plugin]);

    const ctx = expectDefined(capturedContext);
    for (const forbiddenKey of [
      "stores",
      "registries",
      "services",
      "invoke",
      "tauri",
      "native",
      "sqlite",
      "filesystem",
      "fs",
    ]) {
      expect(ctx).not.toHaveProperty(forbiddenKey);
    }
    expect(ctx.commands).not.toHaveProperty("execute");
    expect(ctx.commands).not.toHaveProperty("unregister");
    expect(ctx.views).not.toHaveProperty("unregister");
    expect(ctx.slots).not.toHaveProperty("unregister");
  });

  it("rolls back command, view, and slot registrations after sync register failure without corrupting existing entries", async () => {
    const cause = new Error("sync register failed");

    await expectRegistrationRollback({
      pluginId: "sync-failing",
      register(ctx) {
        registerRuntimeContributions(ctx, "sync-failing");
        throw cause;
      },
      cause,
    });
  });

  it("rolls back command, view, and slot registrations after async register rejection without corrupting existing entries", async () => {
    const cause = new Error("async register failed");

    await expectRegistrationRollback({
      pluginId: "async-failing",
      async register(ctx) {
        registerRuntimeContributions(ctx, "async-failing");
        await Promise.resolve();
        throw cause;
      },
      cause,
    });
  });
});

function createHost(runtime: CoreRuntime = createInMemoryAppRuntime()) {
  return new PluginHost({
    services: runtime.services,
    registries: runtime.registries,
    app: testApp,
  });
}

function lifecyclePlugin(
  id: string,
  events: string[],
  options: Pick<
    PluginOptions,
    "dependencies" | "optionalDependencies"
  > = {},
): AppPlugin {
  return createPlugin({
    id,
    dependencies: options.dependencies,
    optionalDependencies: options.optionalDependencies,
    install() {
      events.push(`${id}.install`);
    },
    register() {
      events.push(`${id}.register`);
    },
    activate() {
      events.push(`${id}.activate`);
    },
    deactivate() {
      events.push(`${id}.deactivate`);
    },
    uninstall() {
      events.push(`${id}.uninstall`);
    },
  });
}

function createPlugin(options: PluginOptions): AppPlugin {
  return {
    manifest: createManifest(options),
    ...(options.install === undefined ? {} : { install: options.install }),
    ...(options.activate === undefined ? {} : { activate: options.activate }),
    register: options.register ?? (() => undefined),
    ...(options.deactivate === undefined
      ? {}
      : { deactivate: options.deactivate }),
    ...(options.uninstall === undefined
      ? {}
      : { uninstall: options.uninstall }),
  };
}

function createManifest(options: PluginOptions): PluginManifest {
  return {
    id: options.id,
    name: options.name ?? `${titleCase(options.id)} Plugin`,
    version: options.version ?? "1.0.0",
    minAppVersion: "0.1.0",
    ...(options.dependencies === undefined
      ? {}
      : { dependencies: options.dependencies }),
    ...(options.optionalDependencies === undefined
      ? {}
      : { optionalDependencies: options.optionalDependencies }),
  };
}

function registerRuntimeContributions(ctx: PluginContext, prefix: string) {
  const titlePrefix = titleCase(prefix);
  const accepts = {
    shape: `${prefix}.shape`,
  } satisfies MetadataJsonValue;

  return {
    command: ctx.commands.register({
      id: `${prefix}.command`,
      title: `${titlePrefix} command`,
      handler: () => `${prefix}:ok`,
    }),
    view: ctx.views.register({
      id: `${prefix}.view`,
      type: `${prefix}.view`,
      title: `${titlePrefix} view`,
      component: RuntimeView,
      accepts,
    }),
    slot: ctx.slots.register({
      id: `${prefix}.slot`,
      slot: "workspace.header",
      order: 10,
      component: RuntimeSlot,
      when: () => true,
    }),
  };
}

async function expectRegistrationRollback({
  pluginId,
  register,
  cause,
}: {
  pluginId: string;
  register: AppPlugin["register"];
  cause: Error;
}) {
  const runtime = createInMemoryAppRuntime();
  const host = createHost(runtime);
  const existingCommand = runtime.registries.commands.register({
    id: "existing.command",
    pluginId: "existing",
    title: "Existing command",
    handler: () => "existing",
  });
  const existingView = runtime.registries.views.register({
    id: "existing.view",
    pluginId: "existing",
    type: "existing.view",
    title: "Existing view",
    component: RuntimeView,
    accepts: {},
  });
  const existingSlot = runtime.registries.slots.register({
    id: "existing.slot",
    pluginId: "existing",
    slot: "workspace.header",
    component: RuntimeSlot,
  });

  await expectPluginHostErrorAsync(
    () =>
      host.loadBuiltInPlugins([
        createPlugin({
          id: pluginId,
          register,
        }),
      ]),
    "PLUGIN_LIFECYCLE_FAILED",
    {
      pluginId,
      phase: "register",
      cause,
    },
  );

  expect(runtime.registries.commands.list()).toStrictEqual([existingCommand]);
  expect(runtime.registries.views.list()).toStrictEqual([existingView]);
  expect(runtime.registries.slots.list()).toStrictEqual([existingSlot]);
  expect(host.getPlugin(pluginId)).toMatchObject({
    id: pluginId,
    enabled: false,
    status: "installed",
  });
  await expectPluginHostErrorAsync(
    () => host.activate(pluginId),
    "PLUGIN_NOT_REGISTERED",
    {
      pluginId,
    },
  );
}

function registryIds(runtime: CoreRuntime) {
  return {
    commands: runtime.registries.commands.list().map((command) => command.id),
    views: runtime.registries.views.list().map((view) => view.id),
    slots: runtime.registries.slots.list().map((slot) => slot.id),
  };
}

function emptyDocument(): StructuredMarkdownDocument {
  return {
    type: "doc",
    content: [],
  };
}

function titleCase(id: string) {
  return id
    .split(/[-.]/)
    .filter((part) => part.length > 0)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join(" ");
}

function expectSafePluginRecord(record: PluginHostRecord) {
  expectNoOwnKeys(record, [
    "plugin",
    "install",
    "register",
    "activate",
    "deactivate",
    "uninstall",
  ]);
}

function expectNoOwnKeys(value: object, keys: readonly string[]) {
  for (const key of keys) {
    expect(value).not.toHaveProperty(key);
  }
}

function expectDefined<Value>(value: Value | undefined): Value {
  expect(value).not.toBeUndefined();

  return value as Value;
}

function requireMapValue<Key, Value>(map: Map<Key, Value>, key: Key): Value {
  const value = map.get(key);

  expect(value).not.toBeUndefined();

  return value as Value;
}

function expectPluginHostError(
  actionOrError: (() => unknown) | unknown,
  code: PluginHostErrorCode,
  options: ExpectedHostErrorOptions = {},
) {
  const error =
    typeof actionOrError === "function"
      ? captureSyncError(actionOrError as () => unknown)
      : actionOrError;

  expect(error).toBeInstanceOf(PluginHostError);

  const hostError = error as PluginHostError;

  expect(hostError.name).toBe("PluginHostError");
  expect(hostError.code).toBe(code);

  if (options.pluginId !== undefined) {
    expect(hostError.pluginId).toBe(options.pluginId);
  }

  if (options.dependencyId !== undefined) {
    expect(hostError.dependencyId).toBe(options.dependencyId);
  }

  if (options.phase !== undefined) {
    expect(hostError.phase).toBe(options.phase);
  }

  if ("cause" in options) {
    expect(hostError.cause).toBe(options.cause);
    expect(Object.keys(hostError)).not.toContain("cause");
    expect(Object.getOwnPropertyDescriptor(hostError, "cause")).toMatchObject({
      enumerable: false,
    });
  }

  return hostError;
}

async function expectPluginHostErrorAsync(
  action: () => unknown | Promise<unknown>,
  code: PluginHostErrorCode,
  options: ExpectedHostErrorOptions = {},
) {
  let capturedError: unknown;

  try {
    await action();
  } catch (error) {
    capturedError = error;
  }

  expect(capturedError).not.toBeUndefined();

  return expectPluginHostError(capturedError, code, options);
}

function captureSyncError(action: () => unknown) {
  try {
    action();
  } catch (error) {
    return error;
  }

  throw new Error("Expected PluginHostError to be thrown");
}
