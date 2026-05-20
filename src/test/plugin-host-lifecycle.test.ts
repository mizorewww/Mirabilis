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

type StaleContextFilterIds = {
  direct: string;
  transaction: string;
};

type StaleWriteAttempt = {
  name: string;
  run: () => unknown | Promise<unknown>;
};

type StaleWriteError = {
  name: string;
  error: unknown;
};

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

  it("does not allow captured register contexts to add surviving contributions after deactivate or uninstall", async () => {
    const runtime = createInMemoryAppRuntime();
    const host = createHost(runtime);
    let capturedContext: PluginContext | undefined;
    const plugin = createPlugin({
      id: "late",
      register(ctx) {
        capturedContext = ctx;
        registerRuntimeContributions(ctx, "late");
      },
    });

    await host.loadBuiltInPlugins([plugin]);
    await host.deactivate("late");

    const contextAfterDeactivate = expectDefined(capturedContext);
    expectLateRuntimeRegistrationErrors(
      tryLateRuntimeRegistrations(
        contextAfterDeactivate,
        "late-after-deactivate",
      ),
      "late",
    );

    expect(registryIds(runtime)).toStrictEqual({
      commands: [],
      views: [],
      slots: [],
    });

    await host.uninstall("late");

    expectLateRuntimeRegistrationErrors(
      tryLateRuntimeRegistrations(contextAfterDeactivate, "late-after-uninstall"),
      "late",
    );

    expect(registryIds(runtime)).toStrictEqual({
      commands: [],
      views: [],
      slots: [],
    });
  });

  it("revokes captured register contexts from mutating plugin data after deactivate", async () => {
    const { context, filterIds, host, pageId, pluginId, runtime } =
      await createCapturedWritableContext("stale-deactivate");

    const dataBeforeDeactivate = runtimeDataSnapshot(runtime);

    await host.deactivate(pluginId);

    const errors = await collectStaleWriteErrors(
      staleContextWriteAttempts(context, "after-deactivate", pageId, filterIds),
    );

    expectStaleWriteErrors(errors, pluginId, "register");
    expect(runtimeDataSnapshot(runtime)).toStrictEqual(dataBeforeDeactivate);
  });

  it("revokes captured register contexts from mutating plugin data after uninstall", async () => {
    const { context, filterIds, host, pageId, pluginId, runtime } =
      await createCapturedWritableContext("stale-uninstall");

    const dataBeforeUninstall = runtimeDataSnapshot(runtime);

    await host.uninstall(pluginId);

    const errors = await collectStaleWriteErrors(
      staleContextWriteAttempts(context, "after-uninstall", pageId, filterIds),
    );

    expectStaleWriteErrors(errors, pluginId, "register");
    expect(runtimeDataSnapshot(runtime)).toStrictEqual(dataBeforeUninstall);
    expectPluginHostError(() => host.getPlugin(pluginId), "PLUGIN_NOT_FOUND", {
      pluginId,
    });
  });

  it("rejects pending unawaited register transactions after uninstall without committing staged plugin data", async () => {
    const runtime = createInMemoryAppRuntime();
    const host = createHost(runtime);
    const transactionStaged = createDeferred<void>();
    const releaseTransaction = createDeferred<void>();
    let pendingTransaction: Promise<unknown> | undefined;
    const pluginId = "pending-transaction";
    const plugin = createPlugin({
      id: pluginId,
      register(ctx) {
        pendingTransaction = ctx.transaction.run(async (tx) => {
          const page = tx.pages.create({
            title: "Pending transaction page",
            body: emptyDocument(),
          });

          tx.metadata.set({
            pageId: page.id,
            namespace: pluginId,
            key: "state",
            value: "staged",
            valueType: "string",
          });
          tx.events.append({
            pageId: page.id,
            namespace: pluginId,
            type: "staged",
            payload: { pageId: page.id },
          });
          tx.filters.save({
            name: "Pending transaction filter",
            query: {
              where: [{ field: `${pluginId}.state`, op: "eq", value: "staged" }],
            },
            viewType: `${pluginId}.view`,
          });
          transactionStaged.resolve();

          await releaseTransaction.promise;

          return "should not commit";
        });
      },
    });
    const dataBeforeRegister = runtimeDataSnapshot(runtime);

    await host.loadBuiltInPlugins([plugin]);
    await transactionStaged.promise;
    expect(runtimeDataSnapshot(runtime)).toStrictEqual(dataBeforeRegister);

    const transactionOutcome = expectDefined(pendingTransaction).then(
      (value) => ({ status: "resolved" as const, value }),
      (error) => ({ status: "rejected" as const, error }),
    );

    await host.uninstall(pluginId);
    expectPluginHostError(() => host.getPlugin(pluginId), "PLUGIN_NOT_FOUND", {
      pluginId,
    });

    releaseTransaction.resolve();

    const outcome = await transactionOutcome;

    expect(runtimeDataSnapshot(runtime)).toStrictEqual(dataBeforeRegister);
    expect(outcome.status).toBe("rejected");

    if (outcome.status === "rejected") {
      expectPluginHostError(outcome.error, "PLUGIN_LIFECYCLE_FAILED", {
        pluginId,
        phase: "register",
      });
    }
  });

  it("rejects concurrent uninstall while register is pending with an unawaited transaction", async () => {
    const runtime = createInMemoryAppRuntime();
    const host = createHost(runtime);
    const transactionStaged = createDeferred<void>();
    const releaseTransaction = createDeferred<void>();
    const releaseRegister = createDeferred<void>();
    let pendingTransaction: Promise<unknown> | undefined;
    const pluginId = "concurrent-register-uninstall";
    const plugin = createPlugin({
      id: pluginId,
      async register(ctx) {
        pendingTransaction = ctx.transaction.run(async (tx) => {
          const page = tx.pages.create({
            title: "Concurrent pending transaction page",
            body: emptyDocument(),
          });

          tx.metadata.set({
            pageId: page.id,
            namespace: pluginId,
            key: "state",
            value: "staged",
            valueType: "string",
          });
          tx.events.append({
            pageId: page.id,
            namespace: pluginId,
            type: "staged",
            payload: { pageId: page.id },
          });
          tx.filters.save({
            name: "Concurrent pending transaction filter",
            query: {
              where: [{ field: `${pluginId}.state`, op: "eq", value: "staged" }],
            },
            viewType: `${pluginId}.view`,
          });
          transactionStaged.resolve();

          await releaseTransaction.promise;

          return "should not commit";
        });

        await transactionStaged.promise;
        await releaseRegister.promise;
      },
    });
    const dataBeforeRegister = runtimeDataSnapshot(runtime);
    const loadOutcome = host.loadBuiltInPlugins([plugin]).then(
      (records) => ({ status: "resolved" as const, records }),
      (error) => ({ status: "rejected" as const, error }),
    );

    await transactionStaged.promise;
    expect(runtimeDataSnapshot(runtime)).toStrictEqual(dataBeforeRegister);

    const transactionOutcome = expectDefined(pendingTransaction).then(
      (value) => ({ status: "resolved" as const, value }),
      (error) => ({ status: "rejected" as const, error }),
    );

    await host.uninstall(pluginId);
    expectPluginHostError(() => host.getPlugin(pluginId), "PLUGIN_NOT_FOUND", {
      pluginId,
    });

    releaseTransaction.resolve();
    releaseRegister.resolve();

    const [loadResult, transactionResult] = await Promise.all([
      loadOutcome,
      transactionOutcome,
    ]);

    expect(runtimeDataSnapshot(runtime)).toStrictEqual(dataBeforeRegister);
    expect(transactionResult.status).toBe("rejected");

    if (transactionResult.status === "rejected") {
      expectPluginHostError(transactionResult.error, "PLUGIN_LIFECYCLE_FAILED", {
        pluginId,
        phase: "register",
      });
    }

    expect(loadResult.status).toBe("rejected");

    if (loadResult.status === "rejected") {
      expectPluginHostError(loadResult.error, "PLUGIN_LIFECYCLE_FAILED", {
        pluginId,
        phase: "register",
      });
    }

    expectPluginHostError(() => host.getPlugin(pluginId), "PLUGIN_NOT_FOUND", {
      pluginId,
    });
  });

  it("scopes plugin-facing metadata, event, and filter facades to the owning plugin", async () => {
    const runtime = createInMemoryAppRuntime();
    const host = createHost(runtime);
    const page = runtime.pages.create({
      title: "Scoped store page",
      body: emptyDocument(),
    });
    const contexts = new Map<string, PluginContext>();
    const alphaFilterIds = {
      read: "",
      update: "",
      delete: "",
    };
    const alpha = createPlugin({
      id: "alpha",
      register(ctx) {
        contexts.set("alpha", ctx);
        ctx.metadata.set({
          pageId: page.id,
          namespace: "alpha",
          key: "state",
          value: "owned",
          valueType: "string",
        });
        ctx.events.append({
          pageId: page.id,
          namespace: "alpha",
          type: "registered",
          payload: { owner: "alpha" },
        });
        alphaFilterIds.read = ctx.filters.save({
          name: "Alpha read filter",
          query: { where: [{ field: "alpha.state", op: "eq", value: "owned" }] },
          viewType: "alpha.view",
        }).id;
        alphaFilterIds.update = ctx.filters.save({
          name: "Alpha update filter",
          query: { where: [{ field: "alpha.state", op: "exists" }] },
          viewType: "alpha.view",
        }).id;
        alphaFilterIds.delete = ctx.filters.save({
          name: "Alpha delete filter",
          query: { where: [] },
          viewType: "alpha.view",
        }).id;
      },
    });
    const beta = createPlugin({
      id: "beta",
      register(ctx) {
        contexts.set("beta", ctx);
      },
    });

    await host.loadBuiltInPlugins([alpha, beta]);

    const betaContext = requireMapValue(contexts, "beta");
    const metadataGetError = captureOptionalSyncError(() =>
      betaContext.metadata.get(page.id, "alpha", "state"),
    );
    const metadataDeleteError = captureOptionalSyncError(() =>
      betaContext.metadata.delete(page.id, "alpha", "state"),
    );
    const filterGetError = captureOptionalSyncError(() =>
      betaContext.filters.get(alphaFilterIds.read),
    );
    const filterUpdateError = captureOptionalSyncError(() =>
      betaContext.filters.update(alphaFilterIds.update, {
        name: "Hijacked by beta",
      }),
    );
    const filterAfterUpdateAttempt = captureOptionalSyncResult(() =>
      runtime.filters.get(alphaFilterIds.update),
    );
    const filterDeleteError = captureOptionalSyncError(() =>
      betaContext.filters.delete(alphaFilterIds.delete),
    );
    const filterAfterDeleteAttempt = captureOptionalSyncResult(() =>
      runtime.filters.get(alphaFilterIds.delete),
    );

    expect({
      betaMetadataList: betaContext.metadata.list(),
      betaMetadataGetRejected: metadataGetError !== undefined,
      betaMetadataDeleteRejected: metadataDeleteError !== undefined,
      betaEventList: betaContext.events.list(),
      betaFilterList: betaContext.filters.list(),
      betaFilterGetRejected: filterGetError !== undefined,
      betaFilterUpdateRejected: filterUpdateError !== undefined,
      betaFilterDeleteRejected: filterDeleteError !== undefined,
      alphaMetadata: runtime.metadata.list(),
      alphaEvents: runtime.events.list(),
      alphaFilterAfterUpdate: filterAfterUpdateAttempt,
      alphaFilterAfterDelete: filterAfterDeleteAttempt,
    }).toMatchObject({
      betaMetadataList: [],
      betaMetadataGetRejected: true,
      betaMetadataDeleteRejected: true,
      betaEventList: [],
      betaFilterList: [],
      betaFilterGetRejected: true,
      betaFilterUpdateRejected: true,
      betaFilterDeleteRejected: true,
      alphaMetadata: [
        {
          pageId: page.id,
          namespace: "alpha",
          key: "state",
          value: "owned",
          sourcePluginId: "alpha",
        },
      ],
      alphaEvents: [
        {
          pageId: page.id,
          namespace: "alpha",
          type: "registered",
          sourcePluginId: "alpha",
        },
      ],
      alphaFilterAfterUpdate: {
        id: alphaFilterIds.update,
        name: "Alpha update filter",
        sourcePluginId: "alpha",
      },
      alphaFilterAfterDelete: {
        id: alphaFilterIds.delete,
        name: "Alpha delete filter",
        sourcePluginId: "alpha",
      },
    });
  });

  it("keeps transaction-scoped plugin facades owner-scoped without exposing raw runtime handles", async () => {
    const runtime = createInMemoryAppRuntime();
    const host = createHost(runtime);
    const page = runtime.pages.create({
      title: "Transaction facade page",
      body: emptyDocument(),
    });
    const alphaFilterIds = {
      update: "",
      delete: "",
    };
    let betaObservation:
      | {
          forbiddenKeys: string[];
          metadataList: readonly unknown[];
          metadataGetRejected: boolean;
          metadataDeleteRejected: boolean;
          eventList: readonly unknown[];
          filterList: readonly unknown[];
          filterUpdateRejected: boolean;
          filterDeleteRejected: boolean;
          spoofError: unknown;
        }
      | undefined;
    const alpha = createPlugin({
      id: "alpha",
      async register(ctx) {
        await ctx.transaction.run((tx) => {
          tx.metadata.set({
            pageId: page.id,
            namespace: "alpha",
            key: "state",
            value: "owned in tx",
            valueType: "string",
          });
          tx.events.append({
            pageId: page.id,
            namespace: "alpha",
            type: "registered",
            payload: { owner: "alpha" },
          });
          alphaFilterIds.update = tx.filters.save({
            name: "Alpha tx update filter",
            query: {
              where: [{ field: "alpha.state", op: "eq", value: "owned in tx" }],
            },
            viewType: "alpha.view",
          }).id;
          alphaFilterIds.delete = tx.filters.save({
            name: "Alpha tx delete filter",
            query: { where: [] },
            viewType: "alpha.view",
          }).id;
        });
      },
    });
    const beta = createPlugin({
      id: "beta",
      async register(ctx) {
        betaObservation = await ctx.transaction.run((tx) => {
          const metadataGetError = captureOptionalSyncError(() =>
            tx.metadata.get(page.id, "alpha", "state"),
          );
          const metadataDeleteError = captureOptionalSyncError(() =>
            tx.metadata.delete(page.id, "alpha", "state"),
          );
          const filterUpdateError = captureOptionalSyncError(() =>
            tx.filters.update(alphaFilterIds.update, {
              name: "Hijacked by beta transaction",
            }),
          );
          const filterDeleteError = captureOptionalSyncError(() =>
            tx.filters.delete(alphaFilterIds.delete),
          );
          const spoofError = captureOptionalSyncError(() =>
            tx.metadata.set({
              pageId: page.id,
              namespace: "beta",
              key: "spoof",
              value: "bad",
              valueType: "string",
              sourcePluginId: "alpha",
            } as any),
          );

          return {
            forbiddenKeys: forbiddenRuntimeKeys(tx),
            metadataList: tx.metadata.list(),
            metadataGetRejected: metadataGetError !== undefined,
            metadataDeleteRejected: metadataDeleteError !== undefined,
            eventList: tx.events.list(),
            filterList: tx.filters.list(),
            filterUpdateRejected: filterUpdateError !== undefined,
            filterDeleteRejected: filterDeleteError !== undefined,
            spoofError,
          };
        });
      },
    });

    await host.loadBuiltInPlugins([alpha, beta]);

    const observation = expectDefined(betaObservation);

    expectPluginHostError(
      observation.spoofError,
      "PLUGIN_FACADE_OWNERSHIP_FORBIDDEN",
      {
        pluginId: "beta",
      },
    );
    expect({
      forbiddenKeys: observation.forbiddenKeys,
      metadataList: observation.metadataList,
      metadataGetRejected: observation.metadataGetRejected,
      metadataDeleteRejected: observation.metadataDeleteRejected,
      eventList: observation.eventList,
      filterList: observation.filterList,
      filterUpdateRejected: observation.filterUpdateRejected,
      filterDeleteRejected: observation.filterDeleteRejected,
      alphaMetadata: runtime.metadata.list(),
      alphaEvents: runtime.events.list(),
      alphaFilterAfterUpdate: captureOptionalSyncResult(() =>
        runtime.filters.get(alphaFilterIds.update),
      ),
      alphaFilterAfterDelete: captureOptionalSyncResult(() =>
        runtime.filters.get(alphaFilterIds.delete),
      ),
    }).toMatchObject({
      forbiddenKeys: [],
      metadataList: [],
      metadataGetRejected: true,
      metadataDeleteRejected: true,
      eventList: [],
      filterList: [],
      filterUpdateRejected: true,
      filterDeleteRejected: true,
      alphaMetadata: [
        {
          pageId: page.id,
          namespace: "alpha",
          key: "state",
          value: "owned in tx",
          sourcePluginId: "alpha",
        },
      ],
      alphaEvents: [
        {
          pageId: page.id,
          namespace: "alpha",
          type: "registered",
          sourcePluginId: "alpha",
        },
      ],
      alphaFilterAfterUpdate: {
        id: alphaFilterIds.update,
        name: "Alpha tx update filter",
        sourcePluginId: "alpha",
      },
      alphaFilterAfterDelete: {
        id: alphaFilterIds.delete,
        name: "Alpha tx delete filter",
        sourcePluginId: "alpha",
      },
    });
  });

  it("rejects deactivation with a typed dependency error before a dependency loses capabilities required by active dependents", async () => {
    const runtime = createInMemoryAppRuntime();
    const host = createHost(runtime);
    const events: string[] = [];

    await host.loadBuiltInPlugins([
      createPlugin({
        id: "dependency",
        register(ctx) {
          events.push("dependency.register");
          registerRuntimeContributions(ctx, "dependency");
        },
        activate() {
          events.push("dependency.activate");
        },
        deactivate() {
          events.push("dependency.deactivate");
        },
      }),
      createPlugin({
        id: "dependent",
        dependencies: ["dependency"],
        register(ctx) {
          events.push("dependent.register");
          registerRuntimeContributions(ctx, "dependent");
        },
        activate() {
          events.push("dependent.activate");
        },
        deactivate() {
          events.push("dependent.deactivate");
        },
      }),
    ]);
    await host.activateAll();

    const registryBeforeDeactivate = registryIds(runtime);

    await expectPluginHostErrorAsync(
      () => host.deactivate("dependency"),
      "PLUGIN_DEPENDENCY_MISSING",
      {
        pluginId: "dependent",
        dependencyId: "dependency",
      },
    );
    expect(host.getPlugin("dependency")).toMatchObject({
      enabled: true,
      status: "active",
    });
    expect(host.getPlugin("dependent")).toMatchObject({
      enabled: true,
      status: "active",
    });
    expect(registryIds(runtime)).toStrictEqual(registryBeforeDeactivate);
    expect(events).toStrictEqual([
      "dependency.register",
      "dependent.register",
      "dependency.activate",
      "dependent.activate",
    ]);
  });

  it("rejects uninstall with a typed dependency error before a dependency record disappears from registered dependents", async () => {
    const runtime = createInMemoryAppRuntime();
    const host = createHost(runtime);
    const events: string[] = [];

    await host.loadBuiltInPlugins([
      createPlugin({
        id: "dependency",
        register(ctx) {
          events.push("dependency.register");
          registerRuntimeContributions(ctx, "dependency");
        },
        uninstall() {
          events.push("dependency.uninstall");
        },
      }),
      createPlugin({
        id: "dependent",
        dependencies: ["dependency"],
        register(ctx) {
          events.push("dependent.register");
          registerRuntimeContributions(ctx, "dependent");
        },
        deactivate() {
          events.push("dependent.deactivate");
        },
        uninstall() {
          events.push("dependent.uninstall");
        },
      }),
    ]);

    const registryBeforeUninstall = registryIds(runtime);

    await expectPluginHostErrorAsync(
      () => host.uninstall("dependency"),
      "PLUGIN_DEPENDENCY_MISSING",
      {
        pluginId: "dependent",
        dependencyId: "dependency",
      },
    );
    expect(host.getPlugin("dependency")).toMatchObject({
      enabled: false,
      status: "registered",
    });
    expect(host.getPlugin("dependent")).toMatchObject({
      enabled: false,
      status: "registered",
    });
    expect(registryIds(runtime)).toStrictEqual(registryBeforeUninstall);
    expect(events).toStrictEqual(["dependency.register", "dependent.register"]);
  });

  it("does not treat installed-only dependency records as satisfying later required dependencies", async () => {
    const host = createHost();
    const dependentRegister = vi.fn();

    await host.loadBuiltInPlugins([
      createPlugin({
        id: "foundation",
      }),
    ]);
    await host.deactivate("foundation");

    await expectPluginHostErrorAsync(
      () =>
        host.loadBuiltInPlugins([
          createPlugin({
            id: "dependent",
            dependencies: ["foundation"],
            register: dependentRegister,
          }),
        ]),
      "PLUGIN_DEPENDENCY_MISSING",
      {
        pluginId: "dependent",
        dependencyId: "foundation",
      },
    );
    expect(dependentRegister).not.toHaveBeenCalled();
  });

  it("does not treat failed-registration dependency records as satisfying later required dependencies", async () => {
    const host = createHost();
    const registerCause = new Error("foundation register failed");
    const dependentRegister = vi.fn();

    await expectPluginHostErrorAsync(
      () =>
        host.loadBuiltInPlugins([
          createPlugin({
            id: "foundation",
            register() {
              throw registerCause;
            },
          }),
        ]),
      "PLUGIN_LIFECYCLE_FAILED",
      {
        pluginId: "foundation",
        phase: "register",
        cause: registerCause,
      },
    );

    await expectPluginHostErrorAsync(
      () =>
        host.loadBuiltInPlugins([
          createPlugin({
            id: "dependent",
            dependencies: ["foundation"],
            register: dependentRegister,
          }),
        ]),
      "PLUGIN_DEPENDENCY_MISSING",
      {
        pluginId: "dependent",
        dependencyId: "foundation",
      },
    );
    expect(dependentRegister).not.toHaveBeenCalled();
  });

  it("does not treat failed-install dependency records as satisfying later required dependencies", async () => {
    const host = createHost();
    const installCause = new Error("foundation install failed");
    const dependentInstall = vi.fn();

    await expectPluginHostErrorAsync(
      () =>
        host.loadBuiltInPlugins([
          createPlugin({
            id: "foundation",
            install() {
              throw installCause;
            },
          }),
        ]),
      "PLUGIN_LIFECYCLE_FAILED",
      {
        pluginId: "foundation",
        phase: "install",
        cause: installCause,
      },
    );

    await expectPluginHostErrorAsync(
      () =>
        host.loadBuiltInPlugins([
          createPlugin({
            id: "dependent",
            dependencies: ["foundation"],
            install: dependentInstall,
          }),
        ]),
      "PLUGIN_DEPENDENCY_MISSING",
      {
        pluginId: "dependent",
        dependencyId: "foundation",
      },
    );
    expect(dependentInstall).not.toHaveBeenCalled();
  });

  it("removes failed explicit install records so staged register retries install before registration", async () => {
    const host = createHost();
    const installCause = new Error("install failed once");
    const events: string[] = [];
    let installAttempts = 0;
    const plugin = createPlugin({
      id: "retry-install",
      install() {
        installAttempts += 1;
        events.push(`install.${installAttempts}`);

        if (installAttempts === 1) {
          throw installCause;
        }
      },
      register() {
        events.push("register");
      },
    });

    await expectPluginHostErrorAsync(
      () => host.install(plugin),
      "PLUGIN_LIFECYCLE_FAILED",
      {
        pluginId: "retry-install",
        phase: "install",
        cause: installCause,
      },
    );
    expectPluginHostError(
      () => host.getPlugin("retry-install"),
      "PLUGIN_NOT_FOUND",
      {
        pluginId: "retry-install",
      },
    );

    await host.register(plugin);

    expect(events).toStrictEqual(["install.1", "install.2", "register"]);
    expect(host.getPlugin("retry-install")).toMatchObject({
      enabled: false,
      status: "registered",
    });
  });

  it("does not leave installed records for built-in plugins whose install hooks did not complete or run", async () => {
    const host = createHost();
    const installCause = new Error("first install failed");
    const skippedInstall = vi.fn();
    const skippedRegister = vi.fn();

    await expectPluginHostErrorAsync(
      () =>
        host.loadBuiltInPlugins([
          createPlugin({
            id: "first",
            install() {
              throw installCause;
            },
          }),
          createPlugin({
            id: "skipped",
            install: skippedInstall,
            register: skippedRegister,
          }),
        ]),
      "PLUGIN_LIFECYCLE_FAILED",
      {
        pluginId: "first",
        phase: "install",
        cause: installCause,
      },
    );

    expect(skippedInstall).not.toHaveBeenCalled();
    expect(skippedRegister).not.toHaveBeenCalled();
    expectPluginHostError(() => host.getPlugin("first"), "PLUGIN_NOT_FOUND", {
      pluginId: "first",
    });
    expectPluginHostError(() => host.getPlugin("skipped"), "PLUGIN_NOT_FOUND", {
      pluginId: "skipped",
    });
  });

  it("rolls back records installed by a failed built-in install batch so the same list can retry", async () => {
    const host = createHost();
    const installCause = new Error("second install failed once");
    const events: string[] = [];
    let secondInstallAttempts = 0;
    const plugins = [
      createPlugin({
        id: "first",
        install() {
          events.push("first.install");
        },
        register() {
          events.push("first.register");
        },
      }),
      createPlugin({
        id: "second",
        install() {
          secondInstallAttempts += 1;
          events.push(`second.install.${secondInstallAttempts}`);

          if (secondInstallAttempts === 1) {
            throw installCause;
          }
        },
        register() {
          events.push("second.register");
        },
      }),
      createPlugin({
        id: "third",
        install() {
          events.push("third.install");
        },
        register() {
          events.push("third.register");
        },
      }),
    ];

    await expectPluginHostErrorAsync(
      () => host.loadBuiltInPlugins(plugins),
      "PLUGIN_LIFECYCLE_FAILED",
      {
        pluginId: "second",
        phase: "install",
        cause: installCause,
      },
    );
    expect(events).toStrictEqual(["first.install", "second.install.1"]);
    expectPluginHostError(() => host.getPlugin("first"), "PLUGIN_NOT_FOUND", {
      pluginId: "first",
    });
    expectPluginHostError(() => host.getPlugin("second"), "PLUGIN_NOT_FOUND", {
      pluginId: "second",
    });
    expectPluginHostError(() => host.getPlugin("third"), "PLUGIN_NOT_FOUND", {
      pluginId: "third",
    });

    await host.loadBuiltInPlugins(plugins);

    expect(events).toStrictEqual([
      "first.install",
      "second.install.1",
      "first.install",
      "second.install.2",
      "third.install",
      "first.register",
      "second.register",
      "third.register",
    ]);
    expect(host.getPlugin("first")).toMatchObject({
      enabled: false,
      status: "registered",
    });
    expect(host.getPlugin("second")).toMatchObject({
      enabled: false,
      status: "registered",
    });
    expect(host.getPlugin("third")).toMatchObject({
      enabled: false,
      status: "registered",
    });
  });

  it("keeps a dependency required when it is also listed as optional", async () => {
    const host = createHost();
    const register = vi.fn();

    await expectPluginHostErrorAsync(
      () =>
        host.loadBuiltInPlugins([
          createPlugin({
            id: "consumer",
            dependencies: ["shared"],
            optionalDependencies: ["shared"],
            register,
          }),
        ]),
      "PLUGIN_DEPENDENCY_MISSING",
      {
        pluginId: "consumer",
        dependencyId: "shared",
      },
    );
    expect(register).not.toHaveBeenCalled();
  });

  it("supports explicit staged install and register methods with deterministic statuses and hook ordering", async () => {
    const host = createHost();
    const events: string[] = [];
    const plugin = lifecyclePlugin("staged", events);

    const installed = await host.install(plugin);

    expect(installed).toMatchObject({
      id: "staged",
      enabled: false,
      status: "installed",
    });
    expect(events).toStrictEqual(["staged.install"]);
    await expectPluginHostErrorAsync(
      () => host.activate("staged"),
      "PLUGIN_NOT_REGISTERED",
      {
        pluginId: "staged",
      },
    );

    const registered = await host.register(plugin);

    expect(registered).toMatchObject({
      id: "staged",
      enabled: false,
      status: "registered",
    });
    expect(events).toStrictEqual(["staged.install", "staged.register"]);

    const activated = await host.activate("staged");

    expect(activated).toMatchObject({
      id: "staged",
      enabled: true,
      status: "active",
    });
    expect(events).toStrictEqual([
      "staged.install",
      "staged.register",
      "staged.activate",
    ]);
  });

  it("keeps registered state and contributions when activate hooks fail", async () => {
    const runtime = createInMemoryAppRuntime();
    const host = createHost(runtime);
    const cause = new Error("activate failed");

    await host.loadBuiltInPlugins([
      createPlugin({
        id: "unstable",
        register(ctx) {
          registerRuntimeContributions(ctx, "unstable");
        },
        activate() {
          throw cause;
        },
      }),
    ]);

    const registryBeforeActivate = registryIds(runtime);

    await expectPluginHostErrorAsync(
      () => host.activate("unstable"),
      "PLUGIN_LIFECYCLE_FAILED",
      {
        pluginId: "unstable",
        phase: "activate",
        cause,
      },
    );
    expect(host.getPlugin("unstable")).toMatchObject({
      enabled: false,
      status: "registered",
    });
    expect(registryIds(runtime)).toStrictEqual(registryBeforeActivate);
  });

  it("keeps active state and contributions when deactivate hooks fail", async () => {
    const runtime = createInMemoryAppRuntime();
    const host = createHost(runtime);
    const cause = new Error("deactivate failed");

    await host.loadBuiltInPlugins([
      createPlugin({
        id: "unstable",
        register(ctx) {
          registerRuntimeContributions(ctx, "unstable");
        },
        deactivate() {
          throw cause;
        },
      }),
    ]);
    await host.activate("unstable");

    const registryBeforeDeactivate = registryIds(runtime);

    await expectPluginHostErrorAsync(
      () => host.deactivate("unstable"),
      "PLUGIN_LIFECYCLE_FAILED",
      {
        pluginId: "unstable",
        phase: "deactivate",
        cause,
      },
    );
    expect(host.getPlugin("unstable")).toMatchObject({
      enabled: true,
      status: "active",
    });
    expect(registryIds(runtime)).toStrictEqual(registryBeforeDeactivate);
  });

  it("keeps registered state and contributions when uninstall hooks fail", async () => {
    const runtime = createInMemoryAppRuntime();
    const host = createHost(runtime);
    const cause = new Error("uninstall failed");

    await host.loadBuiltInPlugins([
      createPlugin({
        id: "unstable",
        register(ctx) {
          registerRuntimeContributions(ctx, "unstable");
        },
        uninstall() {
          throw cause;
        },
      }),
    ]);

    const registryBeforeUninstall = registryIds(runtime);

    await expectPluginHostErrorAsync(
      () => host.uninstall("unstable"),
      "PLUGIN_LIFECYCLE_FAILED",
      {
        pluginId: "unstable",
        phase: "uninstall",
        cause,
      },
    );
    expect(host.getPlugin("unstable")).toMatchObject({
      enabled: false,
      status: "registered",
    });
    expect(registryIds(runtime)).toStrictEqual(registryBeforeUninstall);
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

function tryLateRuntimeRegistrations(ctx: PluginContext, prefix: string) {
  const errors: unknown[] = [];
  const attempts: Array<() => unknown> = [
    () =>
      ctx.commands.register({
        id: `${prefix}.command`,
        title: `${titleCase(prefix)} command`,
        handler: () => `${prefix}:ok`,
      }),
    () =>
      ctx.views.register({
        id: `${prefix}.view`,
        type: `${prefix}.view`,
        title: `${titleCase(prefix)} view`,
        component: RuntimeView,
        accepts: { shape: `${prefix}.shape` },
      }),
    () =>
      ctx.slots.register({
        id: `${prefix}.slot`,
        slot: "workspace.header",
        component: RuntimeSlot,
      }),
  ];

  for (const attempt of attempts) {
    try {
      attempt();
    } catch (error) {
      errors.push(error);
    }
  }

  return errors;
}

function expectLateRuntimeRegistrationErrors(
  errors: readonly unknown[],
  pluginId: string,
) {
  expect(errors).toHaveLength(3);

  for (const error of errors) {
    expectPluginHostError(error, "PLUGIN_LIFECYCLE_FAILED", {
      pluginId,
      phase: "register",
    });
  }
}

async function createCapturedWritableContext(pluginId: string) {
  const runtime = createInMemoryAppRuntime();
  const host = createHost(runtime);
  let capturedContext: PluginContext | undefined;
  let pageId = "";
  const filterIds: StaleContextFilterIds = {
    direct: "",
    transaction: "",
  };

  await host.loadBuiltInPlugins([
    createPlugin({
      id: pluginId,
      register(ctx) {
        capturedContext = ctx;
        const page = ctx.pages.create({
          title: `${pluginId} owned page`,
          body: emptyDocument(),
        });

        pageId = page.id;
        ctx.metadata.set({
          pageId,
          namespace: pluginId,
          key: "state",
          value: "registered",
          valueType: "string",
        });
        ctx.events.append({
          pageId,
          namespace: pluginId,
          type: "registered",
          payload: { pluginId },
        });
        filterIds.direct = ctx.filters.save({
          name: `${pluginId} direct filter`,
          query: { where: [{ field: `${pluginId}.state`, op: "exists" }] },
          viewType: `${pluginId}.view`,
        }).id;
        filterIds.transaction = ctx.filters.save({
          name: `${pluginId} transaction filter`,
          query: { where: [] },
          viewType: `${pluginId}.view`,
        }).id;
      },
    }),
  ]);

  expect(pageId).not.toBe("");
  expect(filterIds.direct).not.toBe("");
  expect(filterIds.transaction).not.toBe("");

  return {
    context: expectDefined(capturedContext),
    filterIds,
    host,
    pageId,
    pluginId,
    runtime,
  };
}

function staleContextWriteAttempts(
  ctx: PluginContext,
  suffix: string,
  pageId: string,
  filterIds: StaleContextFilterIds,
): StaleWriteAttempt[] {
  return [
    {
      name: "pages.create",
      run: () =>
        ctx.pages.create({
          title: `${suffix} created page`,
          body: emptyDocument(),
        }),
    },
    {
      name: "pages.update",
      run: () => ctx.pages.update(pageId, { title: `${suffix} updated page` }),
    },
    {
      name: "pages.archive",
      run: () => ctx.pages.archive(pageId),
    },
    {
      name: "metadata.set",
      run: () =>
        ctx.metadata.set({
          pageId,
          namespace: ctx.pluginId,
          key: "state",
          value: suffix,
          valueType: "string",
        }),
    },
    {
      name: "metadata.delete",
      run: () => ctx.metadata.delete(pageId, ctx.pluginId, "state"),
    },
    {
      name: "events.append",
      run: () =>
        ctx.events.append({
          pageId,
          namespace: ctx.pluginId,
          type: suffix,
          payload: { suffix },
        }),
    },
    {
      name: "filters.save",
      run: () =>
        ctx.filters.save({
          name: `${suffix} saved filter`,
          query: { where: [] },
          viewType: `${ctx.pluginId}.view`,
        }),
    },
    {
      name: "filters.update",
      run: () =>
        ctx.filters.update(filterIds.direct, {
          name: `${suffix} updated filter`,
        }),
    },
    {
      name: "filters.delete",
      run: () => ctx.filters.delete(filterIds.direct),
    },
    {
      name: "transaction.run",
      run: () =>
        ctx.transaction.run((tx) => {
          tx.pages.create({
            title: `${suffix} tx page`,
            body: emptyDocument(),
          });
          tx.pages.update(pageId, { title: `${suffix} tx update` });
          tx.metadata.set({
            pageId,
            namespace: ctx.pluginId,
            key: "tx-state",
            value: suffix,
            valueType: "string",
          });
          tx.events.append({
            pageId,
            namespace: ctx.pluginId,
            type: `${suffix}.tx`,
            payload: { suffix },
          });
          tx.filters.save({
            name: `${suffix} tx saved filter`,
            query: { where: [] },
            viewType: `${ctx.pluginId}.view`,
          });
          tx.filters.update(filterIds.transaction, {
            name: `${suffix} tx updated filter`,
          });

          return "committed";
        }),
    },
  ];
}

async function collectStaleWriteErrors(
  attempts: readonly StaleWriteAttempt[],
): Promise<StaleWriteError[]> {
  const errors: StaleWriteError[] = [];

  for (const attempt of attempts) {
    const error = await captureOptionalAsyncError(async () => {
      await attempt.run();
    });

    errors.push({
      name: attempt.name,
      error,
    });
  }

  return errors;
}

function expectStaleWriteErrors(
  errors: readonly StaleWriteError[],
  pluginId: string,
  phase: string,
) {
  expect(
    errors.map(({ error, name }) => ({
      name,
      typed: error instanceof PluginHostError,
    })),
  ).toStrictEqual(
    errors.map(({ name }) => ({
      name,
      typed: true,
    })),
  );

  for (const { error } of errors) {
    expectPluginHostError(error, "PLUGIN_LIFECYCLE_FAILED", {
      pluginId,
      phase,
    });
  }
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

function runtimeDataSnapshot(runtime: CoreRuntime) {
  return {
    pages: runtime.pages.list({ includeArchived: true }),
    metadata: runtime.metadata.list(),
    events: runtime.events.list(),
    filters: runtime.filters.list(),
  };
}

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
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

function captureOptionalSyncError(action: () => unknown) {
  try {
    action();
  } catch (error) {
    return error;
  }

  return undefined;
}

function captureOptionalSyncResult<Value>(action: () => Value) {
  try {
    return action();
  } catch {
    return undefined;
  }
}

async function captureOptionalAsyncError(action: () => Promise<unknown>) {
  try {
    await action();
  } catch (error) {
    return error;
  }

  return undefined;
}

function forbiddenRuntimeKeys(value: object) {
  return [
    "stores",
    "registries",
    "services",
    "runtime",
    "invoke",
    "tauri",
    "native",
    "sqlite",
    "filesystem",
    "fs",
  ].filter((key) => key in value);
}
