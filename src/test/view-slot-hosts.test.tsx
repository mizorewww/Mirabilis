import { execFile } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  createElement,
  useCallback,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { describe, expect, it, vi } from "vitest";

import {
  createInMemorySlotRegistry,
  createInMemoryViewRegistry,
  type AppRuntimeInfo,
  type SlotRegistry,
  type ViewRegistry,
} from "../core";
import { RuntimeProvider, useRuntime } from "../providers";
import { disallowedNativeSurfaceChanges } from "./native-surface-guard";

type HostActionDescriptor = {
  kind: "host.action";
  actionId: string;
};

type ControlledCallbacks = Record<string, unknown>;
type HostActions = Record<string, (...args: unknown[]) => unknown>;

type ViewHostProps = {
  registry: ViewRegistry;
  viewId?: string;
  viewType?: string;
  acceptedData?: unknown;
  props?: Record<string, unknown>;
  state?: "ready" | "loading" | "empty" | "error";
  error?: unknown;
  callbacks?: ControlledCallbacks;
  actions?: HostActions;
  app?: AppRuntimeInfo;
  isPluginAvailable?: (pluginId: string) => boolean;
};

type SlotHostProps<SlotProps extends Record<string, unknown> = Record<string, unknown>> = {
  registry: SlotRegistry;
  slot: string;
  props?: SlotProps;
  actions?: HostActions;
  app?: AppRuntimeInfo;
  isPluginAvailable?: (pluginId: string) => boolean;
};

type PluginRenderBoundaryProps = {
  children: ReactNode;
  fallbackLabel?: string;
  resetKey?: string;
};

type HostModule = {
  ViewHost: ComponentType<ViewHostProps>;
  SlotHost: ComponentType<SlotHostProps>;
  PluginRenderBoundary: ComponentType<PluginRenderBoundaryProps>;
};

type SafeViewData = {
  kind: "safe.item";
  id: string;
  title: string;
};

type CounterSlotProps = {
  count: number;
  onIncrement: () => void;
};

type SameIdRecoverySlotProps = {
  mode: "broken" | "ready";
  label: string;
};

type ModelSlotProps = {
  model: {
    label: string;
  };
};

type CapturedProps = Record<string, unknown>;

type SourceFile = {
  filePath: string;
  source: string;
};

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const execFileAsync = promisify(execFile);
const hostModulePath = "../shell/hosts";
const safeViewKind = "safe.item";
const safeViewType = "safe.workspace";
const safeSlotName = "safe.workspace.panel";
const unsafeSentinelText = "RAW_RUNTIME_SECRET_TOKEN";
const unsafePrototypeKeys = ["__proto__", "constructor", "prototype"] as const;
const unsafeAliasKeys = [
  "openaiApiKey",
  "authToken",
  "accessToken",
  "api_key",
  "secret_token",
  "native_bridge",
  "provider-settings",
  "commands",
] as const;
const nativeResourceAliasKeys = [
  "shell",
  "notification",
  "notifications",
  "shortcut",
  "shortcuts",
  "file",
  "files",
] as const;
const expectedHostSourceFiles = [
  "src/shell/hosts/PluginRenderBoundary.tsx",
  "src/shell/hosts/SlotHost.tsx",
  "src/shell/hosts/ViewHost.tsx",
  "src/shell/hosts/index.ts",
];
const nativeSurfaceEntrypoints = [
  "package.json",
  "bun.lock",
  "src-tauri/Cargo.lock",
  "src-tauri/Cargo.toml",
  "src-tauri/build.rs",
  "src-tauri/capabilities",
  "src-tauri/permissions",
  "src-tauri/src/commands",
  "src-tauri/src/lib.rs",
  "src-tauri/src/main.rs",
  "src-tauri/tauri.conf.json",
  "CHANGELOG.md",
];
const sourceExtensions = new Set([".ts", ".tsx"]);

describe("ViewHost", () => {
  it("renders a registered view by exact id with matching acceptedData and narrow props only", async () => {
    const { ViewHost, PluginRenderBoundary } = await loadHosts();
    const registry = createInMemoryViewRegistry();
    const capturedProps: CapturedProps[] = [];
    const acceptedData = createSafeViewData("item-1", "Trusted item");
    const unsafeRuntime = createUnsafeFullRuntime();

    function SafeView(props: CapturedProps) {
      capturedProps.push(props);
      const data = props.data as SafeViewData;

      return (
        <section role="region" aria-label="Trusted view">
          <h2>{data.title}</h2>
        </section>
      );
    }

    registry.register({
      id: "safe.view.primary",
      pluginId: "safe-plugin",
      type: safeViewType,
      title: "Safe view",
      accepts: { kind: safeViewKind },
      component: SafeView,
    });
    registry.register({
      id: "safe.view.secondary",
      pluginId: "safe-plugin",
      type: safeViewType,
      title: "Second safe view",
      accepts: { kind: safeViewKind },
      component: SafeView,
    });

    expect(PluginRenderBoundary).toBeTypeOf("function");

    render(
      createElement(ViewHost as ComponentType<Record<string, unknown>>, {
        registry,
        viewId: "safe.view.primary",
        acceptedData,
        app: createAppInfo(),
        runtime: unsafeRuntime,
        NativeBridge: unsafeRuntime.nativeBridge,
        secretToken: unsafeSentinelText,
      }),
    );

    const region = screen.getByRole("region", { name: "Trusted view" });

    expect(within(region).getByRole("heading", { name: "Trusted item" })).toBeVisible();
    expect(capturedProps).toHaveLength(1);
    expect(capturedProps[0]?.data).toEqual(acceptedData);
    expect(capturedProps[0]?.data).not.toBe(acceptedData);
    expect(findUnsafeSurfacePaths(capturedProps[0])).toStrictEqual([]);
    expect(screen.queryByText(unsafeSentinelText)).not.toBeInTheDocument();
  });

  it("passes safe controlled view props while redacting unsafe host props", async () => {
    const { ViewHost } = await loadHosts();
    const registry = createInMemoryViewRegistry();
    const capturedProps: CapturedProps[] = [];
    const rawExecute = vi.fn();
    const unsafeRuntime = createUnsafeFullRuntime();

    function ControlledPropsView(props: CapturedProps) {
      capturedProps.push(props);
      const pages = props.pages as
        | {
            current?: {
              title?: string;
            };
          }
        | undefined;

      return (
        <section role="region" aria-label="Controlled prop view">
          <p>Page {String(props.pageId ?? "missing")}</p>
          <p>{pages?.current?.title ?? "missing page title"}</p>
        </section>
      );
    }

    registry.register({
      id: "safe.view.controlled-props",
      pluginId: "safe-plugin",
      type: safeViewType,
      title: "Controlled prop view",
      accepts: { kind: safeViewKind },
      component: ControlledPropsView,
    });

    render(
      createElement(ViewHost as ComponentType<Record<string, unknown>>, {
        registry,
        viewId: "safe.view.controlled-props",
        acceptedData: createSafeViewData("item-1", "Trusted item"),
        app: createAppInfo(),
        props: {
          pageId: "page-123",
          pages: {
            current: {
              id: "page-123",
              title: "Visible page title",
            },
          },
          execute: rawExecute,
          commands: { execute: rawExecute },
          openaiApiKey: unsafeSentinelText,
          native_bridge: unsafeSentinelText,
          "provider-settings": unsafeSentinelText,
        },
        runtime: unsafeRuntime,
        NativeBridge: unsafeRuntime.nativeBridge,
        secretToken: unsafeSentinelText,
      }),
    );

    const region = screen.getByRole("region", { name: "Controlled prop view" });

    expect(region).toHaveTextContent("Page page-123");
    expect(region).toHaveTextContent("Visible page title");
    expect(capturedProps).toHaveLength(1);
    expect(capturedProps[0]).toMatchObject({
      pageId: "page-123",
      pages: {
        current: {
          id: "page-123",
          title: "Visible page title",
        },
      },
    });
    expect(capturedProps[0]).not.toHaveProperty("execute");
    expect(capturedProps[0]).not.toHaveProperty("commands");
    expect(capturedProps[0]).not.toHaveProperty("openaiApiKey");
    expect(capturedProps[0]).not.toHaveProperty("native_bridge");
    expect(capturedProps[0]).not.toHaveProperty("provider-settings");
    expect(findUnsafeSurfacePaths(capturedProps[0])).toStrictEqual([]);
    expect(screen.queryByText(unsafeSentinelText)).not.toBeInTheDocument();
  });

  it("fails closed when controlled ViewHost props contain prototype-pollution keys", async () => {
    const { ViewHost } = await loadHosts();

    for (const unsafeKey of unsafePrototypeKeys) {
      const registry = createInMemoryViewRegistry();
      const component = vi.fn(() => (
        <section role="region" aria-label="Prototype-polluted prop view">
          Prototype props should not render
        </section>
      ));

      registry.register({
        id: `safe.view.prototype-props.${unsafeKey}`,
        pluginId: "safe-plugin",
        type: safeViewType,
        title: "Prototype-polluted prop view",
        accepts: { kind: safeViewKind },
        component,
      });

      const { unmount } = render(
        <ViewHost
          registry={registry}
          viewId={`safe.view.prototype-props.${unsafeKey}`}
          acceptedData={createSafeViewData("item-1", "Trusted item")}
          props={createPropsWithUnsafePrototypeKey(unsafeKey)}
          app={createAppInfo()}
        />,
      );

      expectViewUnavailable();
      expect(component).not.toHaveBeenCalled();
      expect(document.body).not.toHaveTextContent("Prototype props should not render");
      expect(document.body).not.toHaveTextContent(unsafeSentinelText);
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
      unmount();
    }
  });

  it("fails closed when nested controlled ViewHost props contain prototype-pollution keys", async () => {
    const { ViewHost } = await loadHosts();

    for (const unsafeKey of unsafePrototypeKeys) {
      const registry = createInMemoryViewRegistry();
      const component = vi.fn(() => (
        <section role="region" aria-label="Nested prototype-polluted prop view">
          Nested prototype props should not render
        </section>
      ));

      registry.register({
        id: `safe.view.nested-prototype-props.${unsafeKey}`,
        pluginId: "safe-plugin",
        type: safeViewType,
        title: "Nested prototype-polluted prop view",
        accepts: { kind: safeViewKind },
        component,
      });

      const { unmount } = render(
        <ViewHost
          registry={registry}
          viewId={`safe.view.nested-prototype-props.${unsafeKey}`}
          acceptedData={createSafeViewData("item-1", "Trusted item")}
          props={createNestedPropsWithUnsafePrototypeKey(unsafeKey)}
          app={createAppInfo()}
        />,
      );

      expectViewUnavailable();
      expect(component).not.toHaveBeenCalled();
      expect(
        screen.queryByRole("region", {
          name: "Nested prototype-polluted prop view",
        }),
      ).not.toBeInTheDocument();
      expect(document.body).not.toHaveTextContent(
        "Nested prototype props should not render",
      );
      expect(document.body).not.toHaveTextContent(unsafeSentinelText);
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
      unmount();
    }
  });

  it("redacts documented native aliases from controlled ViewHost props", async () => {
    const { ViewHost } = await loadHosts();
    const registry = createInMemoryViewRegistry();
    const capturedProps: CapturedProps[] = [];

    registry.register({
      id: "safe.view.native-alias-props",
      pluginId: "safe-plugin",
      type: safeViewType,
      title: "Native alias prop view",
      accepts: { kind: safeViewKind },
      component: (props: CapturedProps) => {
        capturedProps.push(props);

        return (
          <section role="region" aria-label="Native alias prop view">
            {String(props.label)}
          </section>
        );
      },
    });

    render(
      <ViewHost
        registry={registry}
        viewId="safe.view.native-alias-props"
        acceptedData={createSafeViewData("item-1", "Trusted item")}
        props={{
          label: "Safe native alias label",
          ...createNativeResourceAliasProps(),
        }}
        app={createAppInfo()}
      />,
    );

    expect(
      screen.getByRole("region", { name: "Native alias prop view" }),
    ).toHaveTextContent("Safe native alias label");
    expect(capturedProps).toHaveLength(1);
    expect(capturedProps[0]).toHaveProperty("label", "Safe native alias label");

    for (const nativeAliasKey of nativeResourceAliasKeys) {
      expect(capturedProps[0]).not.toHaveProperty(nativeAliasKey);
    }

    expect(document.body).not.toHaveTextContent(unsafeSentinelText);
    expect(findUnsafeSurfacePaths(capturedProps[0])).toStrictEqual([]);
  });

  it("turns descriptor-backed view callbacks into host-owned action wrappers", async () => {
    const { ViewHost } = await loadHosts();
    const user = userEvent.setup();
    const registry = createInMemoryViewRegistry();
    const rawSelect = vi.fn();
    const rawExecute = vi.fn();
    const rawRegister = vi.fn();
    const rawUnregister = vi.fn();
    let capturedOnSelect: unknown;
    let rawSelectAction: ((...args: unknown[]) => unknown) | undefined;

    function CallbackProbeView(props: CapturedProps) {
      const callbacks = props.callbacks as ControlledCallbacks | undefined;
      const onSelect = callbacks?.onSelect;
      capturedOnSelect = onSelect;

      return (
        <section role="region" aria-label="Callback probe view">
          <button
            type="button"
            onClick={() => {
              if (typeof onSelect === "function") {
                onSelect("item-1");
              }
            }}
          >
            Select via host action
          </button>
        </section>
      );
    }

    registry.register({
      id: "safe.view.callbacks",
      pluginId: "safe-plugin",
      type: safeViewType,
      title: "Callback probe view",
      accepts: { kind: safeViewKind },
      component: CallbackProbeView,
    });

    function ViewActionHostProbe() {
      const [selectedId, setSelectedId] = useState("none");
      const selectAction = useCallback((nextSelectedId: unknown) => {
        rawSelect(nextSelectedId);
        setSelectedId(String(nextSelectedId));
      }, []);
      rawSelectAction = selectAction;

      return (
        <>
          <p role="status" aria-label="Selected item">
            Selected {selectedId}
          </p>
          <ViewHost
            registry={registry}
            viewId="safe.view.callbacks"
            acceptedData={createSafeViewData("item-1", "Callback item")}
            callbacks={{
              onSelect: hostAction("select"),
              execute: rawExecute,
              register: rawRegister,
              unregister: rawUnregister,
            }}
            actions={{ select: selectAction }}
            app={createAppInfo()}
          />
        </>
      );
    }

    render(<ViewActionHostProbe />);

    expect(screen.getByRole("region", { name: "Callback probe view" })).toBeVisible();
    expect(typeof capturedOnSelect).toBe("function");
    expect(capturedOnSelect).not.toBe(rawSelectAction);
    expect(capturedOnSelect).not.toBe(rawSelect);

    await user.click(
      screen.getByRole("button", { name: "Select via host action" }),
    );

    expect(screen.getByRole("status", { name: "Selected item" })).toHaveTextContent(
      "Selected item-1",
    );
    expect(rawSelect).toHaveBeenCalledWith("item-1");
    expect(rawExecute).not.toHaveBeenCalled();
    expect(rawRegister).not.toHaveBeenCalled();
    expect(rawUnregister).not.toHaveBeenCalled();
  });

  it("rejects bare view callback functions even when they use allowed names", async () => {
    const { ViewHost } = await loadHosts();
    const user = userEvent.setup();
    const registry = createInMemoryViewRegistry();
    const rawSelect = vi.fn();
    const rawApply = vi.fn();
    const rawIncrement = vi.fn();
    let capturedCallbacks: ControlledCallbacks | undefined;

    function RawCallbackProbeView(props: CapturedProps) {
      capturedCallbacks = props.callbacks as ControlledCallbacks | undefined;

      return (
        <section role="region" aria-label="Raw callback probe view">
          <button
            type="button"
            onClick={() => {
              const callback = capturedCallbacks?.onSelect;

              if (typeof callback === "function") {
                callback("item-1");
              }
            }}
          >
            Select raw callback
          </button>
          <button
            type="button"
            onClick={() => {
              const callback = capturedCallbacks?.onApply;

              if (typeof callback === "function") {
                callback();
              }
            }}
          >
            Apply raw callback
          </button>
          <button
            type="button"
            onClick={() => {
              const callback = capturedCallbacks?.onIncrement;

              if (typeof callback === "function") {
                callback();
              }
            }}
          >
            Increment raw callback
          </button>
        </section>
      );
    }

    registry.register({
      id: "safe.view.raw-callbacks",
      pluginId: "safe-plugin",
      type: safeViewType,
      title: "Raw callback probe view",
      accepts: { kind: safeViewKind },
      component: RawCallbackProbeView,
    });

    render(
      <ViewHost
        registry={registry}
        viewId="safe.view.raw-callbacks"
        acceptedData={createSafeViewData("item-1", "Raw callback item")}
        callbacks={{
          onSelect: rawSelect,
          onApply: rawApply,
          onIncrement: rawIncrement,
        }}
        app={createAppInfo()}
      />,
    );

    expect(screen.getByRole("region", { name: "Raw callback probe view" })).toBeVisible();
    expect(capturedCallbacks?.onSelect).toBeUndefined();
    expect(capturedCallbacks?.onApply).toBeUndefined();
    expect(capturedCallbacks?.onIncrement).toBeUndefined();

    await user.click(
      screen.getByRole("button", { name: "Select raw callback" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Apply raw callback" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Increment raw callback" }),
    );

    expect(rawSelect).not.toHaveBeenCalled();
    expect(rawApply).not.toHaveBeenCalled();
    expect(rawIncrement).not.toHaveBeenCalled();
  });

  it("renders by viewType only when exactly one view matches and fails closed for ambiguity", async () => {
    const { ViewHost } = await loadHosts();
    const registry = createInMemoryViewRegistry();

    registry.register({
      id: "safe.view.only",
      pluginId: "safe-plugin",
      type: safeViewType,
      title: "Only safe view",
      accepts: { kind: safeViewKind },
      component: ({ data }: { data?: SafeViewData }) => (
        <section role="region" aria-label="Typed view">
          {data?.title}
        </section>
      ),
    });

    const { rerender } = render(
      <ViewHost
        registry={registry}
        viewType={safeViewType}
        acceptedData={createSafeViewData("item-1", "Typed item")}
        app={createAppInfo()}
      />,
    );

    expect(screen.getByRole("region", { name: "Typed view" })).toHaveTextContent(
      "Typed item",
    );

    registry.register({
      id: "safe.view.ambiguous",
      pluginId: "other-safe-plugin",
      type: safeViewType,
      title: "Ambiguous safe view",
      accepts: { kind: safeViewKind },
      component: () => (
        <section role="region" aria-label="Ambiguous view">
          Ambiguous should not render
        </section>
      ),
    });

    rerender(
      <ViewHost
        registry={registry}
        viewType={safeViewType}
        acceptedData={createSafeViewData("item-2", "Ambiguous item")}
        app={createAppInfo()}
      />,
    );

    expectViewUnavailable();
    expect(screen.queryByRole("region", { name: "Typed view" })).not.toBeInTheDocument();
    expect(screen.queryByText("Ambiguous should not render")).not.toBeInTheDocument();
  });

  it("fails closed when viewId and viewType are both supplied but point to different views", async () => {
    const { ViewHost } = await loadHosts();
    const registry = createInMemoryViewRegistry();

    registry.register({
      id: "safe.view.primary",
      pluginId: "safe-plugin",
      type: safeViewType,
      title: "Primary safe view",
      accepts: { kind: safeViewKind },
      component: () => (
        <section role="region" aria-label="Primary view">
          Primary should not render
        </section>
      ),
    });
    registry.register({
      id: "safe.view.other",
      pluginId: "safe-plugin",
      type: "safe.other-workspace",
      title: "Other safe view",
      accepts: { kind: safeViewKind },
      component: () => (
        <section role="region" aria-label="Other view">
          Other should not render
        </section>
      ),
    });

    render(
      <ViewHost
        registry={registry}
        viewId="safe.view.primary"
        viewType="safe.other-workspace"
        acceptedData={createSafeViewData("item-1", "Conflicting item")}
        app={createAppInfo()}
      />,
    );

    expectViewUnavailable();
    expect(screen.queryByRole("region", { name: "Primary view" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Other view" })).not.toBeInTheDocument();
  });

  it("supports accepted data descriptors with accepts.kinds arrays", async () => {
    const { ViewHost } = await loadHosts();
    const registry = createInMemoryViewRegistry();

    registry.register({
      id: "safe.view.multi-kind",
      pluginId: "safe-plugin",
      type: safeViewType,
      title: "Multi-kind safe view",
      accepts: { kinds: ["safe.other-kind", safeViewKind] },
      component: ({ data }: { data?: SafeViewData }) => (
        <section role="region" aria-label="Multi-kind view">
          {data?.title}
        </section>
      ),
    });

    render(
      <ViewHost
        registry={registry}
        viewId="safe.view.multi-kind"
        acceptedData={createSafeViewData("item-1", "Multi-kind item")}
        app={createAppInfo()}
      />,
    );

    expect(screen.getByRole("region", { name: "Multi-kind view" })).toHaveTextContent(
      "Multi-kind item",
    );
  });

  it("fails closed with redacted safe states for invalid view descriptors, data, state, errors, and unavailable plugins", async () => {
    const { ViewHost } = await loadHosts();

    for (const invalidCase of createInvalidViewHostCases()) {
      const registry = createInMemoryViewRegistry();
      const component = vi.fn(() => (
        <section role="region" aria-label="Unsafe view">
          {invalidCase.forbiddenText}
        </section>
      ));

      if (invalidCase.registerView) {
        registry.register({
          id: "safe.view",
          pluginId: "safe-plugin",
          type: safeViewType,
          title: "Safe view",
          accepts: { kind: safeViewKind },
          component,
        });
      }

      const { unmount } = render(
        <ViewHost
          registry={registry}
          viewId="safe.view"
          acceptedData={invalidCase.acceptedData}
          state={invalidCase.state}
          error={invalidCase.error}
          app={createAppInfo()}
          isPluginAvailable={invalidCase.isPluginAvailable}
        />,
      );

      if (invalidCase.expectedState === "loading") {
        const status = screen.getByRole("status", { name: "View loading" });

        expect(status).toHaveTextContent("Loading view");
      } else if (invalidCase.expectedState === "empty") {
        const status = screen.getByRole("status", { name: "View empty" });

        expect(status).toHaveTextContent("Nothing to show");
      } else {
        expectViewUnavailable();
      }

      expect(screen.queryByRole("region", { name: "Unsafe view" })).not.toBeInTheDocument();
      expect(screen.queryByText(invalidCase.forbiddenText)).not.toBeInTheDocument();
      expect(document.body).not.toHaveTextContent("SQL");
      expect(document.body).not.toHaveTextContent("/Users/alice/private.md");
      expect(component).not.toHaveBeenCalled();
      unmount();
    }
  });

  it("fails closed for own and nested prototype-pollution keys in acceptedData", async () => {
    const { ViewHost } = await loadHosts();

    for (const unsafeKey of unsafePrototypeKeys) {
      for (const placement of ["own", "nested"] as const) {
        const registry = createInMemoryViewRegistry();
        const component = vi.fn(() => (
          <section role="region" aria-label="Prototype-polluted view">
            Prototype data should not render
          </section>
        ));

        registry.register({
          id: `safe.view.prototype-data.${unsafeKey}.${placement}`,
          pluginId: "safe-plugin",
          type: safeViewType,
          title: "Prototype-polluted safe view",
          accepts: { kind: safeViewKind },
          component,
        });

        const { unmount } = render(
          <ViewHost
            registry={registry}
            viewId={`safe.view.prototype-data.${unsafeKey}.${placement}`}
            acceptedData={createSafeViewDataWithUnsafePrototypeKey(
              unsafeKey,
              placement,
            )}
            app={createAppInfo()}
          />,
        );

        expectViewUnavailable();
        expect(component).not.toHaveBeenCalled();
        expect(document.body).not.toHaveTextContent("Prototype data should not render");
        expect(document.body).not.toHaveTextContent(unsafeSentinelText);
        expect(({} as Record<string, unknown>).polluted).toBeUndefined();
        unmount();
      }
    }
  });

  it("allows safe null-prototype acceptedData DTOs without unsafe keys", async () => {
    const { ViewHost } = await loadHosts();
    const registry = createInMemoryViewRegistry();
    const capturedProps: CapturedProps[] = [];

    registry.register({
      id: "safe.view.null-prototype-data",
      pluginId: "safe-plugin",
      type: safeViewType,
      title: "Null-prototype safe view",
      accepts: { kind: safeViewKind },
      component: (props: CapturedProps) => {
        capturedProps.push(props);
        const data = props.data as SafeViewData;

        return (
          <section role="region" aria-label="Null-prototype view">
            {data.title}
          </section>
        );
      },
    });

    render(
      <ViewHost
        registry={registry}
        viewId="safe.view.null-prototype-data"
        acceptedData={createNullPrototypeViewData("item-null", "Null prototype item")}
        app={createAppInfo()}
      />,
    );

    expect(screen.getByRole("region", { name: "Null-prototype view" })).toHaveTextContent(
      "Null prototype item",
    );
    expect(capturedProps).toHaveLength(1);
    expect(capturedProps[0]?.data).toStrictEqual({
      kind: safeViewKind,
      id: "item-null",
      title: "Null prototype item",
    });
  });

  it("fails closed without throwing for over-deep acceptedData", async () => {
    const { ViewHost } = await loadHosts();
    const registry = createInMemoryViewRegistry();
    const component = vi.fn(() => (
      <section role="region" aria-label="Over-deep view">
        Deep accepted data should not render
      </section>
    ));

    registry.register({
      id: "safe.view.deep-data",
      pluginId: "safe-plugin",
      type: safeViewType,
      title: "Over-deep safe view",
      accepts: { kind: safeViewKind },
      component,
    });

    expect(() => {
      render(
        <ViewHost
          registry={registry}
          viewId="safe.view.deep-data"
          acceptedData={createOverDeepViewData()}
          app={createAppInfo()}
        />,
      );
    }).not.toThrow();

    expectViewUnavailable();
    expect(component).not.toHaveBeenCalled();
    expect(document.body).not.toHaveTextContent("Deep accepted data should not render");
  });

  it("fails closed instead of throwing for trap-backed acceptedData objects", async () => {
    const { ViewHost } = await loadHosts();
    const registry = createInMemoryViewRegistry();
    const component = vi.fn(() => (
      <section role="region" aria-label="Proxy-backed view">
        Proxy data should not render
      </section>
    ));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const hostileData = createThrowingProxy("view acceptedData");

    registry.register({
      id: "safe.view.proxy-data",
      pluginId: "safe-plugin",
      type: safeViewType,
      title: "Proxy-backed safe view",
      accepts: { kind: safeViewKind },
      component,
    });

    try {
      expect(() => {
        render(
          <ViewHost
            registry={registry}
            viewId="safe.view.proxy-data"
            acceptedData={hostileData}
            app={createAppInfo()}
          />,
        );
      }).not.toThrow();

      expectViewUnavailable();
      expect(component).not.toHaveBeenCalled();
      expect(document.body).not.toHaveTextContent(unsafeSentinelText);
      expect(
        screen.queryByRole("region", { name: "Proxy-backed view" }),
      ).not.toBeInTheDocument();
    } finally {
      consoleError.mockRestore();
    }
  });

  it("blocks secret and native alias keys in accepted view data", async () => {
    const { ViewHost } = await loadHosts();
    const registry = createInMemoryViewRegistry();
    const component = vi.fn(() => (
      <section role="region" aria-label="Alias-backed view">
        Alias data should not render
      </section>
    ));

    registry.register({
      id: "safe.view.alias-data",
      pluginId: "safe-plugin",
      type: safeViewType,
      title: "Alias-backed safe view",
      accepts: { kind: safeViewKind },
      component,
    });

    render(
      <ViewHost
        registry={registry}
        viewId="safe.view.alias-data"
        acceptedData={{
          ...createSafeViewData("item-1", "ALIAS_DATA_SECRET"),
          ...createUnsafeAliasProps(),
        }}
        app={createAppInfo()}
      />,
    );

    expectViewUnavailable();
    expect(component).not.toHaveBeenCalled();
    expect(document.body).not.toHaveTextContent("ALIAS_DATA_SECRET");
    expect(document.body).not.toHaveTextContent(unsafeSentinelText);
    expect(
      screen.queryByRole("region", { name: "Alias-backed view" }),
    ).not.toBeInTheDocument();
  });

  it("fails closed without reading accessor-backed callback bags", async () => {
    const { ViewHost } = await loadHosts();
    const registry = createInMemoryViewRegistry();
    const getterRead = vi.fn();
    const component = vi.fn(() => (
      <section role="region" aria-label="Accessor callback view">
        Accessor callback should not render
      </section>
    ));
    const callbacks = {} as ControlledCallbacks;

    Object.defineProperty(callbacks, "onSelect", {
      enumerable: true,
      get: () => {
        getterRead();

        return () => unsafeSentinelText;
      },
    });

    registry.register({
      id: "safe.view.accessor-callbacks",
      pluginId: "safe-plugin",
      type: safeViewType,
      title: "Accessor callback view",
      accepts: { kind: safeViewKind },
      component,
    });

    render(
      <ViewHost
        registry={registry}
        viewId="safe.view.accessor-callbacks"
        acceptedData={createSafeViewData("item-1", "Accessor item")}
        callbacks={callbacks}
        app={createAppInfo()}
      />,
    );

    expectViewUnavailable();
    expect(getterRead).not.toHaveBeenCalled();
    expect(component).not.toHaveBeenCalled();
    expect(document.body).not.toHaveTextContent(unsafeSentinelText);
  });

  it("catches thrown view renders and recovers after rerendering a different view id", async () => {
    const { ViewHost } = await loadHosts();
    const registry = createInMemoryViewRegistry();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    registry.register({
      id: "safe.view.broken",
      pluginId: "safe-plugin",
      type: "safe.broken",
      title: "Broken safe view",
      accepts: { kind: safeViewKind },
      component: () => {
        throw new Error(`render failed ${unsafeSentinelText}`);
      },
    });
    registry.register({
      id: "safe.view.recovered",
      pluginId: "safe-plugin",
      type: "safe.recovered",
      title: "Recovered safe view",
      accepts: { kind: safeViewKind },
      component: ({ data }: { data?: SafeViewData }) => (
        <section role="region" aria-label="Recovered view">
          {data?.title}
        </section>
      ),
    });

    try {
      const { rerender } = render(
        <ViewHost
          registry={registry}
          viewId="safe.view.broken"
          acceptedData={createSafeViewData("item-1", "Broken item")}
          app={createAppInfo()}
        />,
      );

      expectViewUnavailable();
      expect(document.body).not.toHaveTextContent(unsafeSentinelText);

      rerender(
        <ViewHost
          registry={registry}
          viewId="safe.view.recovered"
          acceptedData={createSafeViewData("item-2", "Recovered item")}
          app={createAppInfo()}
        />,
      );

      expect(screen.getByRole("region", { name: "Recovered view" })).toHaveTextContent(
        "Recovered item",
      );
      expect(screen.queryByRole("alert", { name: "View unavailable" })).not.toBeInTheDocument();
    } finally {
      consoleError.mockRestore();
    }
  });

  it("recovers the same view id after thrown render when valid data replaces the failing data", async () => {
    const { ViewHost } = await loadHosts();
    const registry = createInMemoryViewRegistry();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    registry.register({
      id: "safe.view.same-id-recovery",
      pluginId: "safe-plugin",
      type: safeViewType,
      title: "Same id recovery view",
      accepts: { kind: safeViewKind },
      component: ({ data }: { data?: SafeViewData }) => {
        if (data?.id === "broken") {
          throw new Error(`same id render failed ${unsafeSentinelText}`);
        }

        return (
          <section role="region" aria-label="Same id recovered view">
            {data?.title}
          </section>
        );
      },
    });

    try {
      const { rerender } = render(
        <ViewHost
          registry={registry}
          viewId="safe.view.same-id-recovery"
          acceptedData={createSafeViewData("broken", "Broken same id item")}
          app={createAppInfo()}
        />,
      );

      expectViewUnavailable();
      expect(document.body).not.toHaveTextContent(unsafeSentinelText);

      rerender(
        <ViewHost
          registry={registry}
          viewId="safe.view.same-id-recovery"
          acceptedData={createSafeViewData("recovered", "Recovered same id item")}
          app={createAppInfo()}
        />,
      );

      expect(
        screen.getByRole("region", { name: "Same id recovered view" }),
      ).toHaveTextContent("Recovered same id item");
      expect(screen.queryByRole("alert", { name: "View unavailable" })).not.toBeInTheDocument();
    } finally {
      consoleError.mockRestore();
    }
  });

  it("keeps plugin-rendered ViewHost useRuntime consumers limited to the frozen public app facade", async () => {
    const { ViewHost } = await loadHosts();
    const registry = createInMemoryViewRegistry();
    const fullRuntime = createUnsafeFullRuntime();
    let observedRuntime: unknown;

    function RuntimeProbeView() {
      observedRuntime = useRuntime();
      const runtime = observedRuntime as { app: AppRuntimeInfo };

      return (
        <p role="status" aria-label="View runtime probe">
          {runtime.app.version}
        </p>
      );
    }

    registry.register({
      id: "safe.view.runtime-probe",
      pluginId: "safe-plugin",
      type: safeViewType,
      title: "Runtime probe view",
      accepts: { kind: safeViewKind },
      component: RuntimeProbeView,
    });

    render(
      <RuntimeProvider runtime={fullRuntime}>
        <ViewHost
          registry={registry}
          viewId="safe.view.runtime-probe"
          acceptedData={createSafeViewData("item-1", "Runtime item")}
          app={createAppInfo()}
        />
      </RuntimeProvider>,
    );

    expect(screen.getByRole("status", { name: "View runtime probe" })).toHaveTextContent(
      "9.9.9-test",
    );
    expect(observedRuntime).toStrictEqual({
      app: {
        version: "9.9.9-test",
        pluginApiVersion: "host-test",
      },
    });
    expect(Object.isFrozen(observedRuntime)).toBe(true);
    expect(Object.isFrozen((observedRuntime as { app: object }).app)).toBe(true);
    expect(findUnsafeSurfacePaths(observedRuntime)).toStrictEqual([]);
  });
});

describe("SlotHost", () => {
  it("renders requested slot contributions in SlotRegistry order with default-order tie preservation", async () => {
    const { SlotHost } = await loadHosts();
    const registry = createInMemorySlotRegistry();

    registerSlotItem(registry, "default.first", "Default first");
    registerSlotItem(registry, "negative", "Negative order", { order: -10 });
    registerSlotItem(registry, "zero", "Zero order", { order: 0 });
    registerSlotItem(registry, "default.second", "Default second");
    registerSlotItem(registry, "other.slot", "Other slot", {
      slot: "safe.other.panel",
    });

    render(
      <SlotHost
        registry={registry}
        slot={safeSlotName}
        props={{ label: "Ordered" }}
        app={createAppInfo()}
      />,
    );

    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toStrictEqual([
      "Negative order",
      "Default first",
      "Zero order",
      "Default second",
    ]);
    expect(screen.queryByText("Other slot")).not.toBeInTheDocument();
  });

  it("renders only literal true conditions and skips false, thrown, and non-boolean conditions per contribution", async () => {
    const { SlotHost } = await loadHosts();
    const registry = createInMemorySlotRegistry();
    const conditionPropsSeen: CapturedProps[] = [];

    registry.register<Record<string, unknown>>({
      id: "condition.true",
      pluginId: "safe-plugin",
      slot: safeSlotName,
      component: () => <p>Condition true visible</p>,
      when: (props) => {
        conditionPropsSeen.push(props);
        return props.enabled === true;
      },
    });
    registry.register<Record<string, unknown>>({
      id: "condition.false",
      pluginId: "safe-plugin",
      slot: safeSlotName,
      component: () => <p>Condition false hidden</p>,
      when: () => false,
    });
    registry.register<Record<string, unknown>>({
      id: "condition.thrown",
      pluginId: "safe-plugin",
      slot: safeSlotName,
      component: () => <p>Condition thrown hidden</p>,
      when: () => {
        throw new Error(`condition failed ${unsafeSentinelText}`);
      },
    });
    registry.register<Record<string, unknown>>({
      id: "condition.non-boolean",
      pluginId: "safe-plugin",
      slot: safeSlotName,
      component: () => <p>Condition non boolean hidden</p>,
      when: (() => "true") as unknown as (props: Record<string, unknown>) => boolean,
    });

    render(
      <SlotHost
        registry={registry}
        slot={safeSlotName}
        props={{
          enabled: true,
          label: "Condition props",
          runtime: createUnsafeFullRuntime(),
          secretToken: unsafeSentinelText,
        }}
        app={createAppInfo()}
      />,
    );

    expect(screen.getByText("Condition true visible")).toBeVisible();
    expect(screen.queryByText("Condition false hidden")).not.toBeInTheDocument();
    expect(screen.queryByText("Condition thrown hidden")).not.toBeInTheDocument();
    expect(screen.queryByText("Condition non boolean hidden")).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(unsafeSentinelText);
    expect(conditionPropsSeen).toHaveLength(1);
    expect(conditionPropsSeen[0]).toStrictEqual({
      enabled: true,
      label: "Condition props",
    });
  });

  it("fails closed instead of throwing for trap-backed slot props", async () => {
    const { SlotHost } = await loadHosts();
    const registry = createInMemorySlotRegistry();
    const component = vi.fn(() => (
      <section role="region" aria-label="Proxy-backed slot">
        Proxy props should not render
      </section>
    ));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    registry.register<Record<string, unknown>>({
      id: "slot.proxy-props",
      pluginId: "safe-plugin",
      slot: safeSlotName,
      component,
    });

    try {
      expect(() => {
        render(
          <SlotHost
            registry={registry}
            slot={safeSlotName}
            props={createThrowingProxy("slot props") as Record<string, unknown>}
            app={createAppInfo()}
          />,
        );
      }).not.toThrow();

      expect(component).not.toHaveBeenCalled();
      expect(document.body).not.toHaveTextContent(unsafeSentinelText);
      expect(
        screen.queryByRole("region", { name: "Proxy-backed slot" }),
      ).not.toBeInTheDocument();
    } finally {
      consoleError.mockRestore();
    }
  });

  it("skips contributions without evaluating when for prototype-polluted slot props", async () => {
    const { SlotHost } = await loadHosts();

    for (const unsafeKey of unsafePrototypeKeys) {
      const registry = createInMemorySlotRegistry();
      const when = vi.fn(() => true);
      const component = vi.fn(() => (
        <section role="region" aria-label="Prototype-polluted slot">
          Prototype slot props should not render
        </section>
      ));

      registry.register<Record<string, unknown>>({
        id: `slot.prototype-props.${unsafeKey}`,
        pluginId: "safe-plugin",
        slot: safeSlotName,
        component,
        when,
      });

      const { unmount } = render(
        <SlotHost
          registry={registry}
          slot={safeSlotName}
          props={createPropsWithUnsafePrototypeKey(unsafeKey)}
          app={createAppInfo()}
        />,
      );

      expect(when).not.toHaveBeenCalled();
      expect(component).not.toHaveBeenCalled();
      expect(
        screen.queryByRole("region", { name: "Prototype-polluted slot" }),
      ).not.toBeInTheDocument();
      expect(document.body).not.toHaveTextContent("Prototype slot props should not render");
      expect(document.body).not.toHaveTextContent(unsafeSentinelText);
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
      unmount();
    }
  });

  it("fails closed without throwing for over-deep slot props", async () => {
    const { SlotHost } = await loadHosts();
    const registry = createInMemorySlotRegistry();
    const component = vi.fn(() => (
      <section role="region" aria-label="Over-deep slot">
        Deep slot props should not render
      </section>
    ));

    registry.register<Record<string, unknown>>({
      id: "slot.deep-props",
      pluginId: "safe-plugin",
      slot: safeSlotName,
      component,
    });

    expect(() => {
      render(
        <SlotHost
          registry={registry}
          slot={safeSlotName}
          props={createOverDeepProps()}
          app={createAppInfo()}
        />,
      );
    }).not.toThrow();

    expect(component).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("region", { name: "Over-deep slot" }),
    ).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("Deep slot props should not render");
  });

  it("isolates thrown contribution renders behind a redacted fallback while siblings stay visible", async () => {
    const { SlotHost } = await loadHosts();
    const registry = createInMemorySlotRegistry();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    registerSlotItem(registry, "before", "Sibling before", { order: 0 });
    registry.register<Record<string, unknown>>({
      id: "throws",
      pluginId: "safe-plugin",
      slot: safeSlotName,
      order: 1,
      component: () => {
        throw new Error(`slot failed ${unsafeSentinelText}`);
      },
    });
    registerSlotItem(registry, "after", "Sibling after", { order: 2 });

    try {
      render(
        <SlotHost
          registry={registry}
          slot={safeSlotName}
          props={{ label: "Visible siblings" }}
          app={createAppInfo()}
        />,
      );

      expect(screen.getByText("Sibling before")).toBeVisible();
      expect(screen.getByText("Sibling after")).toBeVisible();
      const fallback = screen.getByRole("alert", {
        name: "Slot contribution unavailable",
      });

      expect(fallback).toHaveTextContent("Contribution unavailable");
      expect(document.body).not.toHaveTextContent(unsafeSentinelText);
    } finally {
      consoleError.mockRestore();
    }
  });

  it("skips unavailable plugin contributions while sibling contributions stay visible", async () => {
    const { SlotHost } = await loadHosts();
    const registry = createInMemorySlotRegistry();
    const inactiveWhen = vi.fn(() => true);
    const inactiveComponent = vi.fn(() => (
      <section role="region" aria-label="Inactive plugin slot">
        {unsafeSentinelText}
      </section>
    ));
    const siblingComponent = vi.fn(({ label }: { label?: string }) => (
      <section role="region" aria-label="Available sibling slot">
        {label}
      </section>
    ));

    registry.register<Record<string, unknown>>({
      id: "slot.inactive-plugin",
      pluginId: "inactive-plugin",
      slot: safeSlotName,
      order: 0,
      component: inactiveComponent,
      when: inactiveWhen,
    });
    registry.register<{ label: string }>({
      id: "slot.available-sibling",
      pluginId: "safe-plugin",
      slot: safeSlotName,
      order: 1,
      component: siblingComponent,
    });

    render(
      <SlotHost
        registry={registry}
        slot={safeSlotName}
        props={{ label: "Visible sibling contribution" }}
        app={createAppInfo()}
        isPluginAvailable={(pluginId) => pluginId !== "inactive-plugin"}
      />,
    );

    expect(
      screen.getByRole("region", { name: "Available sibling slot" }),
    ).toHaveTextContent("Visible sibling contribution");
    expect(inactiveWhen).not.toHaveBeenCalled();
    expect(inactiveComponent).not.toHaveBeenCalled();
    expect(siblingComponent).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole("region", { name: "Inactive plugin slot" }),
    ).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(unsafeSentinelText);
  });

  it("recovers the same slot contribution id after valid props replace throwing props", async () => {
    const { SlotHost } = await loadHosts();
    const registry = createInMemorySlotRegistry();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    registry.register<SameIdRecoverySlotProps>({
      id: "slot.same-id-recovery",
      pluginId: "safe-plugin",
      slot: safeSlotName,
      component: ({ mode, label }: SameIdRecoverySlotProps) => {
        if (mode === "broken") {
          throw new Error(`same contribution failed ${unsafeSentinelText}`);
        }

        return (
          <p role="status" aria-label="Same contribution recovered">
            {String(label)}
          </p>
        );
      },
    });

    try {
      const { rerender } = render(
        <SlotHost
          registry={registry}
          slot={safeSlotName}
          props={{ mode: "broken", label: "Broken slot props" }}
          app={createAppInfo()}
        />,
      );

      expect(
        screen.getByRole("alert", { name: "Slot contribution unavailable" }),
      ).toHaveTextContent("Contribution unavailable");
      expect(document.body).not.toHaveTextContent(unsafeSentinelText);

      rerender(
        <SlotHost
          registry={registry}
          slot={safeSlotName}
          props={{ mode: "ready", label: "Recovered slot props" }}
          app={createAppInfo()}
        />,
      );

      expect(
        screen.getByRole("status", { name: "Same contribution recovered" }),
      ).toHaveTextContent("Recovered slot props");
      expect(
        screen.queryByRole("alert", { name: "Slot contribution unavailable" }),
      ).not.toBeInTheDocument();
    } finally {
      consoleError.mockRestore();
    }
  });

  it("lets user clicks flow only through descriptor-backed host action wrappers", async () => {
    const { SlotHost } = await loadHosts();
    const user = userEvent.setup();
    const registry = createInMemorySlotRegistry();
    const rawIncrement = vi.fn();
    let capturedOnIncrement: unknown;
    let rawIncrementAction: ((...args: unknown[]) => unknown) | undefined;

    registry.register<CounterSlotProps>({
      id: "counter",
      pluginId: "safe-plugin",
      slot: safeSlotName,
      component: ({ count, onIncrement }: CounterSlotProps) => {
        capturedOnIncrement = onIncrement;

        return (
          <section role="region" aria-label="Counter contribution">
            <p role="status" aria-label="Counter value">
              Count {count}
            </p>
            <button type="button" onClick={onIncrement}>
              Increment
            </button>
          </section>
        );
      },
    });

    function CounterHostProbe() {
      const [count, setCount] = useState(0);
      const incrementAction = useCallback(() => {
        rawIncrement();
        setCount((currentCount) => currentCount + 1);
      }, []);
      rawIncrementAction = incrementAction;

      return (
        <SlotHost
          registry={registry}
          slot={safeSlotName}
          props={{
            count,
            onIncrement: hostAction("increment"),
          }}
          actions={{ increment: incrementAction }}
          app={createAppInfo()}
        />
      );
    }

    render(<CounterHostProbe />);

    expect(screen.getByRole("status", { name: "Counter value" })).toHaveTextContent(
      "Count 0",
    );
    expect(typeof capturedOnIncrement).toBe("function");
    expect(capturedOnIncrement).not.toBe(rawIncrementAction);
    expect(capturedOnIncrement).not.toBe(rawIncrement);

    await user.click(screen.getByRole("button", { name: "Increment" }));

    expect(screen.getByRole("status", { name: "Counter value" })).toHaveTextContent(
      "Count 1",
    );
    expect(rawIncrement).toHaveBeenCalledTimes(1);
  });

  it("rejects bare slot callback functions even when they use allowed names", async () => {
    const { SlotHost } = await loadHosts();
    const user = userEvent.setup();
    const registry = createInMemorySlotRegistry();
    const onSelect = vi.fn();
    const onApply = vi.fn();
    const onIncrement = vi.fn();
    const rawExecute = vi.fn();
    const rawRegister = vi.fn();
    const rawUnregister = vi.fn();
    const capturedProps: CapturedProps[] = [];

    registry.register<Record<string, unknown>>({
      id: "slot.callback-surface",
      pluginId: "safe-plugin",
      slot: safeSlotName,
      component: (props: CapturedProps) => {
        capturedProps.push(props);
        const select = props.onSelect as (() => void) | undefined;
        const apply = props.onApply as (() => void) | undefined;
        const increment = props.onIncrement as (() => void) | undefined;

        return (
          <section role="region" aria-label="Slot callback probe">
            <p>{String(props.label)}</p>
            <button type="button" onClick={() => select?.()}>
              Select raw slot callback
            </button>
            <button type="button" onClick={() => apply?.()}>
              Apply raw slot callback
            </button>
            <button type="button" onClick={() => increment?.()}>
              Increment raw slot callback
            </button>
          </section>
        );
      },
    });

    render(
      <SlotHost
        registry={registry}
        slot={safeSlotName}
        props={{
          label: "Safe slot callback",
          onSelect,
          onApply,
          onIncrement,
          execute: rawExecute,
          commands: { execute: rawExecute },
          register: rawRegister,
          unregister: rawUnregister,
        }}
        app={createAppInfo()}
      />,
    );

    expect(screen.getByRole("region", { name: "Slot callback probe" })).toBeVisible();
    expect(capturedProps).toHaveLength(1);
    expect(capturedProps[0]).toHaveProperty("label", "Safe slot callback");
    expect(capturedProps[0]).not.toHaveProperty("onSelect");
    expect(capturedProps[0]).not.toHaveProperty("onApply");
    expect(capturedProps[0]).not.toHaveProperty("onIncrement");
    expect(capturedProps[0]).not.toHaveProperty("execute");
    expect(capturedProps[0]).not.toHaveProperty("commands");
    expect(capturedProps[0]).not.toHaveProperty("register");
    expect(capturedProps[0]).not.toHaveProperty("unregister");

    await user.click(
      screen.getByRole("button", { name: "Select raw slot callback" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Apply raw slot callback" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Increment raw slot callback" }),
    );

    expect(onSelect).not.toHaveBeenCalled();
    expect(onApply).not.toHaveBeenCalled();
    expect(onIncrement).not.toHaveBeenCalled();
    expect(rawExecute).not.toHaveBeenCalled();
    expect(rawRegister).not.toHaveBeenCalled();
    expect(rawUnregister).not.toHaveBeenCalled();
  });

  it("redacts secret and native alias keys from slot props", async () => {
    const { SlotHost } = await loadHosts();
    const registry = createInMemorySlotRegistry();
    const capturedProps: CapturedProps[] = [];

    registry.register<Record<string, unknown>>({
      id: "slot.alias-props",
      pluginId: "safe-plugin",
      slot: safeSlotName,
      component: (props: CapturedProps) => {
        capturedProps.push(props);

        return (
          <section role="region" aria-label="Alias slot">
            {Object.values(props).join(" ")}
          </section>
        );
      },
    });

    render(
      <SlotHost
        registry={registry}
        slot={safeSlotName}
        props={{
          label: "Safe alias label",
          ...createUnsafeAliasProps(),
        }}
        app={createAppInfo()}
      />,
    );

    expect(screen.getByRole("region", { name: "Alias slot" })).toHaveTextContent(
      "Safe alias label",
    );
    expect(capturedProps).toHaveLength(1);
    expect(capturedProps[0]).toHaveProperty("label", "Safe alias label");

    for (const aliasKey of unsafeAliasKeys) {
      expect(capturedProps[0]).not.toHaveProperty(aliasKey);
    }

    expect(screen.queryByText(unsafeSentinelText)).not.toBeInTheDocument();
  });

  it("clones and freezes per-contribution props so mutation cannot affect siblings or caller data", async () => {
    const { SlotHost } = await loadHosts();
    const registry = createInMemorySlotRegistry();
    const callerModel = { label: "Original label" };

    registry.register<ModelSlotProps>({
      id: "mutator",
      pluginId: "safe-plugin",
      slot: safeSlotName,
      order: 0,
      component: (props: ModelSlotProps) => {
        try {
          props.model.label = "Tampered label";
        } catch {
          // Frozen props are acceptable; the sibling assertion is the behavior under test.
        }

        return <p>Mutator rendered</p>;
      },
    });
    registry.register<ModelSlotProps>({
      id: "observer",
      pluginId: "safe-plugin",
      slot: safeSlotName,
      order: 1,
      component: ({ model }: ModelSlotProps) => (
        <p role="status" aria-label="Observed slot data">
          {model.label}
        </p>
      ),
    });

    render(
      <SlotHost
        registry={registry}
        slot={safeSlotName}
        props={{ model: callerModel }}
        app={createAppInfo()}
      />,
    );

    expect(screen.getByText("Mutator rendered")).toBeVisible();
    expect(screen.getByRole("status", { name: "Observed slot data" })).toHaveTextContent(
      "Original label",
    );
    expect(callerModel).toStrictEqual({ label: "Original label" });
  });

  it("keeps slot condition mutations from changing rendered props or caller data", async () => {
    const { SlotHost } = await loadHosts();
    const registry = createInMemorySlotRegistry();
    const callerModel = { label: "Original label" };
    const when = vi.fn((props: ModelSlotProps) => {
      try {
        (props as unknown as Record<string, unknown>).label = unsafeSentinelText;
      } catch {
        // Frozen top-level props are acceptable; visible state must stay unchanged.
      }

      try {
        props.model.label = unsafeSentinelText;
      } catch {
        // Frozen nested props are acceptable; visible state must stay unchanged.
      }

      return true;
    });

    registry.register<ModelSlotProps>({
      id: "slot.when-mutator",
      pluginId: "safe-plugin",
      slot: safeSlotName,
      component: ({ model }: ModelSlotProps) => (
        <p role="status" aria-label="When mutation slot data">
          {model.label}
        </p>
      ),
      when,
    });

    function SlotWhenMutationProbe() {
      return (
        <>
          <p role="status" aria-label="Caller model data">
            {callerModel.label}
          </p>
          <SlotHost
            registry={registry}
            slot={safeSlotName}
            props={{ model: callerModel }}
            app={createAppInfo()}
          />
        </>
      );
    }

    render(<SlotWhenMutationProbe />);

    expect(when).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("status", { name: "When mutation slot data" }),
    ).toHaveTextContent("Original label");
    expect(screen.getByRole("status", { name: "Caller model data" })).toHaveTextContent(
      "Original label",
    );
    expect(callerModel).toStrictEqual({ label: "Original label" });
    expect(document.body).not.toHaveTextContent(unsafeSentinelText);
  });

  it("keeps plugin-rendered useRuntime consumers limited to the frozen copied public app facade", async () => {
    const { SlotHost } = await loadHosts();
    const registry = createInMemorySlotRegistry();
    const fullRuntime = createUnsafeFullRuntime();
    let observedRuntime: unknown;

    function RuntimeProbeContribution() {
      observedRuntime = useRuntime();
      const runtime = observedRuntime as { app: AppRuntimeInfo };

      return (
        <p role="status" aria-label="Public runtime probe">
          {runtime.app.version}
        </p>
      );
    }

    registry.register({
      id: "runtime.probe",
      pluginId: "safe-plugin",
      slot: safeSlotName,
      component: RuntimeProbeContribution,
    });

    render(
      <RuntimeProvider runtime={fullRuntime}>
        <SlotHost
          registry={registry}
          slot={safeSlotName}
          props={{ label: "runtime probe" }}
          app={createAppInfo()}
        />
      </RuntimeProvider>,
    );

    expect(
      screen.getByRole("status", { name: "Public runtime probe" }),
    ).toHaveTextContent("9.9.9-test");
    expect(observedRuntime).toStrictEqual({
      app: {
        version: "9.9.9-test",
        pluginApiVersion: "host-test",
      },
    });
    expect(Object.isFrozen(observedRuntime)).toBe(true);
    expect(Object.isFrozen((observedRuntime as { app: object }).app)).toBe(true);
    expect(findUnsafeSurfacePaths(observedRuntime)).toStrictEqual([]);
  });
});

describe("ViewHost and SlotHost static boundaries", () => {
  it("does not drift package, lockfile, native, Tauri, Rust, capability, permission, schema, or release surfaces", async () => {
    const changedNativeSurfaceFiles = await listChangesFromMaster(nativeSurfaceEntrypoints);

    expect(await disallowedNativeSurfaceChanges(changedNativeSurfaceFiles)).toStrictEqual([]);
  });

  it("keeps host production source in app-shell infrastructure and free of native, runtime, business-plugin, and HTML/code-execution sinks", async () => {
    const sources = await readProductionSources(["src/shell/hosts"]);
    const relativeSourceFiles = sources.map(({ filePath }) => filePath).sort();
    const violations: string[] = [];

    for (const expectedFile of expectedHostSourceFiles) {
      if (!relativeSourceFiles.includes(expectedFile)) {
        violations.push(`${expectedFile}: missing host source file`);
      }
    }

    for (const { filePath, source } of sources) {
      for (const [pattern, description] of forbiddenHostSourcePatterns) {
        if (pattern.test(source)) {
          violations.push(`${filePath}: ${description}`);
        }
      }

      for (const moduleSpecifier of collectStaticModuleSpecifiers(source)) {
        const forbiddenImport = findForbiddenHostImport(moduleSpecifier);

        if (forbiddenImport !== undefined) {
          violations.push(`${filePath} -> ${moduleSpecifier}: ${forbiddenImport}`);
        }
      }
    }

    expect(violations).toStrictEqual([]);
  });
});

async function loadHosts(): Promise<HostModule> {
  return vi.importActual<HostModule>(hostModulePath);
}

function createSafeViewData(id: string, title: string): SafeViewData {
  return {
    kind: safeViewKind,
    id,
    title,
  };
}

function hostAction(actionId: string): HostActionDescriptor {
  return Object.freeze({
    kind: "host.action",
    actionId,
  });
}

function createNullPrototypeViewData(id: string, title: string): SafeViewData {
  const data = Object.create(null) as Record<string, unknown>;

  data.kind = safeViewKind;
  data.id = id;
  data.title = title;

  return data as SafeViewData;
}

function createSafeViewDataWithUnsafePrototypeKey(
  unsafeKey: (typeof unsafePrototypeKeys)[number],
  placement: "own" | "nested",
): SafeViewData {
  const data = createSafeViewData(
    `prototype-${unsafeKey}-${placement}`,
    "Prototype unsafe item",
  ) as SafeViewData & Record<string, unknown>;

  if (placement === "own") {
    defineEnumerableDataProperty(data, unsafeKey, {
      polluted: unsafeSentinelText,
    });

    return data;
  }

  const nested = Object.create(null) as Record<string, unknown>;
  defineEnumerableDataProperty(nested, unsafeKey, {
    polluted: unsafeSentinelText,
  });
  data.nested = nested;

  return data;
}

function createPropsWithUnsafePrototypeKey(
  unsafeKey: (typeof unsafePrototypeKeys)[number],
): Record<string, unknown> {
  const props: Record<string, unknown> = {
    label: "Prototype unsafe props",
  };

  defineEnumerableDataProperty(props, unsafeKey, {
    polluted: unsafeSentinelText,
  });

  return props;
}

function createNestedPropsWithUnsafePrototypeKey(
  unsafeKey: (typeof unsafePrototypeKeys)[number],
): Record<string, unknown> {
  const model = Object.create(null) as Record<string, unknown>;

  model.label = "Nested safe label";
  defineEnumerableDataProperty(model, unsafeKey, {
    polluted: unsafeSentinelText,
  });

  return {
    label: "Outer safe label",
    model,
  };
}

function defineEnumerableDataProperty(
  target: Record<string, unknown>,
  key: string,
  value: unknown,
): void {
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}

function createOverDeepViewData(): SafeViewData & Record<string, unknown> {
  const data = createSafeViewData("deep-item", "Over-deep item") as SafeViewData &
    Record<string, unknown>;

  data.child = createDeepObject(160);

  return data;
}

function createOverDeepProps(): Record<string, unknown> {
  return {
    label: "Over-deep slot props",
    model: createDeepObject(160),
  };
}

function createDeepObject(depth: number): Record<string, unknown> {
  const root: Record<string, unknown> = { level: 0 };
  let cursor = root;

  for (let level = 1; level <= depth; level += 1) {
    const next: Record<string, unknown> = { level };

    cursor.next = next;
    cursor = next;
  }

  return root;
}

function createAppInfo(): AppRuntimeInfo {
  return {
    version: "9.9.9-test",
    pluginApiVersion: "host-test",
  };
}

function expectViewUnavailable(): void {
  const alert = screen.getByRole("alert", { name: "View unavailable" });

  expect(alert).toHaveTextContent("View unavailable");
}

function createInvalidViewHostCases(): Array<{
  label: string;
  registerView: boolean;
  acceptedData?: unknown;
  state?: ViewHostProps["state"];
  error?: unknown;
  isPluginAvailable?: (pluginId: string) => boolean;
  expectedState: "loading" | "empty" | "unavailable";
  forbiddenText: string;
}> {
  const getterBackedData = {} as Record<string, unknown>;

  Object.defineProperty(getterBackedData, "kind", {
    enumerable: true,
    get: () => safeViewKind,
  });
  Object.defineProperty(getterBackedData, "title", {
    enumerable: true,
    get: () => "GETTER_BACKED_SECRET",
  });

  return [
    {
      label: "missing view",
      registerView: false,
      acceptedData: createSafeViewData("item-1", "MISSING_VIEW_SECRET"),
      expectedState: "unavailable",
      forbiddenText: "MISSING_VIEW_SECRET",
    },
    {
      label: "missing kind",
      registerView: true,
      acceptedData: { id: "item-2", title: "MISSING_KIND_SECRET" },
      expectedState: "unavailable",
      forbiddenText: "MISSING_KIND_SECRET",
    },
    {
      label: "wrong kind",
      registerView: true,
      acceptedData: {
        kind: "unsafe.item",
        id: "item-3",
        title: "WRONG_KIND_SECRET",
      },
      expectedState: "unavailable",
      forbiddenText: "WRONG_KIND_SECRET",
    },
    {
      label: "getter-backed data",
      registerView: true,
      acceptedData: getterBackedData,
      expectedState: "unavailable",
      forbiddenText: "GETTER_BACKED_SECRET",
    },
    {
      label: "function-bearing data",
      registerView: true,
      acceptedData: {
        kind: safeViewKind,
        id: "item-4",
        title: "FUNCTION_DATA_SECRET",
        readSecret: () => "secret",
      },
      expectedState: "unavailable",
      forbiddenText: "FUNCTION_DATA_SECRET",
    },
    {
      label: "loading",
      registerView: true,
      acceptedData: createSafeViewData("item-5", "LOADING_SECRET"),
      state: "loading",
      expectedState: "loading",
      forbiddenText: "LOADING_SECRET",
    },
    {
      label: "empty",
      registerView: true,
      acceptedData: createSafeViewData("item-6", "EMPTY_SECRET"),
      state: "empty",
      expectedState: "empty",
      forbiddenText: "EMPTY_SECRET",
    },
    {
      label: "explicit error",
      registerView: true,
      acceptedData: createSafeViewData("item-7", "EXPLICIT_ERROR_SECRET"),
      state: "error",
      error: new Error(
        "SQL select * from secrets at /Users/alice/private.md with EXPLICIT_ERROR_SECRET",
      ),
      expectedState: "unavailable",
      forbiddenText: "EXPLICIT_ERROR_SECRET",
    },
    {
      label: "unavailable plugin",
      registerView: true,
      acceptedData: createSafeViewData("item-8", "UNAVAILABLE_PLUGIN_SECRET"),
      isPluginAvailable: () => false,
      expectedState: "unavailable",
      forbiddenText: "UNAVAILABLE_PLUGIN_SECRET",
    },
  ];
}

function registerSlotItem(
  registry: SlotRegistry,
  id: string,
  label: string,
  options: {
    order?: number;
    slot?: string;
  } = {},
): void {
  registry.register({
    id,
    pluginId: "safe-plugin",
    slot: options.slot ?? safeSlotName,
    ...(options.order === undefined ? {} : { order: options.order }),
    component: () => <p role="listitem">{label}</p>,
  });
}

function createUnsafeAliasProps(): Record<string, string> {
  return Object.fromEntries(
    unsafeAliasKeys.map((aliasKey) => [aliasKey, unsafeSentinelText]),
  );
}

function createNativeResourceAliasProps(): Record<string, string> {
  return Object.fromEntries(
    nativeResourceAliasKeys.map((aliasKey) => [aliasKey, unsafeSentinelText]),
  );
}

function createThrowingProxy(label: string): unknown {
  return new Proxy(Object.create(null) as Record<string, unknown>, {
    get() {
      throw new Error(`${label} get ${unsafeSentinelText}`);
    },
    getOwnPropertyDescriptor() {
      throw new Error(`${label} descriptor ${unsafeSentinelText}`);
    },
    getPrototypeOf() {
      throw new Error(`${label} prototype ${unsafeSentinelText}`);
    },
    ownKeys() {
      throw new Error(`${label} keys ${unsafeSentinelText}`);
    },
  });
}

function createUnsafeFullRuntime(): {
  app: AppRuntimeInfo;
  stores: unknown;
  registries: unknown;
  services: unknown;
  pluginHost: unknown;
  nativeBridge: unknown;
  invoke: unknown;
  db: unknown;
  storage: unknown;
  filesystem: unknown;
  path: unknown;
  providerSettings: unknown;
  secrets: unknown;
} {
  return {
    app: createAppInfo(),
    stores: { pages: unsafeSentinelText },
    registries: { views: unsafeSentinelText, slots: unsafeSentinelText },
    services: { commands: unsafeSentinelText },
    pluginHost: { activateAll: () => unsafeSentinelText },
    nativeBridge: { invoke: () => unsafeSentinelText },
    invoke: () => unsafeSentinelText,
    db: { rawSql: unsafeSentinelText },
    storage: { persistence: unsafeSentinelText },
    filesystem: { readFile: unsafeSentinelText },
    path: { home: "/Users/alice/private.md" },
    providerSettings: { openaiApiKey: unsafeSentinelText },
    secrets: { token: unsafeSentinelText },
  };
}

function findUnsafeSurfacePaths(value: unknown): string[] {
  const violations: string[] = [];
  const seen = new WeakSet<object>();

  visitUnsafeSurface(value, "$", violations, seen);

  return violations.sort();
}

function visitUnsafeSurface(
  value: unknown,
  propertyPath: string,
  violations: string[],
  seen: WeakSet<object>,
): void {
  if (typeof value === "function") {
    if (!propertyPath.startsWith("$.callbacks.")) {
      violations.push(`${propertyPath}: function`);
    }

    return;
  }

  if (value === null || typeof value !== "object") {
    return;
  }

  if (seen.has(value)) {
    return;
  }

  seen.add(value);

  for (const propertyName of Object.getOwnPropertyNames(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, propertyName);
    const nestedPath = `${propertyPath}.${propertyName}`;

    if (isUnsafeSurfaceKey(propertyName, nestedPath)) {
      violations.push(`${nestedPath}: unsafe key`);
    }

    if (descriptor === undefined) {
      continue;
    }

    if ("get" in descriptor || "set" in descriptor) {
      violations.push(`${nestedPath}: accessor`);
      continue;
    }

    visitUnsafeSurface(descriptor.value, nestedPath, violations, seen);
  }
}

function isUnsafeSurfaceKey(propertyName: string, propertyPath: string): boolean {
  if (propertyPath === "$.app.pluginApiVersion") {
    return false;
  }

  const normalized = propertyName.toLowerCase().replace(/[-_]/gu, "");

  return /^(?:runtime|stores|registries|services|pluginhost|nativebridge|bridge|invoke|tauri|db|sqlite|storage|filesystem|fs|path|shell|notifications?|shortcuts?|files?|providersettings|openaiapikey|authtoken|accesstoken|apikey|secrets?|secrettoken|token|password|commands|commandregistry|execute|register|unregister)$/u.test(
    normalized,
  );
}

async function readProductionSources(
  relativePaths: readonly string[],
): Promise<SourceFile[]> {
  const sourceFiles = (
    await Promise.all(
      relativePaths.map((relativePath) =>
        listSourceFilesIfExists(path.join(repoRoot, relativePath)),
      ),
    )
  )
    .flat()
    .sort();

  return Promise.all(
    sourceFiles.map(async (absolutePath) => ({
      filePath: path.relative(repoRoot, absolutePath),
      source: await readFile(absolutePath, "utf8"),
    })),
  );
}

async function listSourceFilesIfExists(absolutePath: string): Promise<string[]> {
  const entry = await statIfExists(absolutePath);

  if (entry === undefined) {
    return [];
  }

  if (entry.isFile()) {
    return sourceExtensions.has(path.extname(absolutePath)) ? [absolutePath] : [];
  }

  if (!entry.isDirectory()) {
    return [];
  }

  const childEntries = await readdir(absolutePath, { withFileTypes: true });
  const childFiles = await Promise.all(
    childEntries.map((childEntry) =>
      listSourceFilesIfExists(path.join(absolutePath, childEntry.name)),
    ),
  );

  return childFiles.flat();
}

async function statIfExists(absolutePath: string) {
  try {
    return await stat(absolutePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }

    throw error;
  }
}

async function listChangesFromMaster(relativePaths: readonly string[]): Promise<string[]> {
  const { stdout } = await execFileAsync(
    "git",
    ["diff", "--name-only", "master", "--", ...relativePaths],
    {
      cwd: repoRoot,
    },
  );

  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .sort();
}

function collectStaticModuleSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const importPattern =
    /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/gu;

  for (const match of source.matchAll(importPattern)) {
    const specifier = match[1];

    if (specifier !== undefined) {
      specifiers.push(specifier);
    }
  }

  return specifiers;
}

function findForbiddenHostImport(moduleSpecifier: string): string | undefined {
  const forbiddenImports = new Map<RegExp, string>([
    [/@tauri-apps/u, "Tauri API import"],
    [/^node:(?:fs|fs\/promises|path|sqlite)$/u, "native Node import"],
    [/(?:^|\/)src-tauri(?:\/|$)/u, "Tauri/Rust source import"],
    [/(?:^|\/)core\/native(?:\/|$)/u, "NativeBridge import"],
    [/(?:^|\/)core\/plugin-host(?:\/|$)/u, "PluginHost import"],
    [/(?:^|\/)core\/stores(?:\/|$)/u, "Core store import"],
    [/(?:^|\/)bootstrap(?:\/|$)/u, "full runtime bootstrap import"],
    [/(?:^|\/)(?:sqlite|storage)(?:\/|$)/iu, "storage or sqlite import"],
    [
      /(?:^|\/)plugins\/(?:ai|calendar|chart|habit|heatmap|markdown-editor|metadata-ui|ml|quick-capture|search|stats|sync|tag|task|timer)(?:\/|$)/u,
      "business plugin private import",
    ],
  ]);

  return [...forbiddenImports.entries()].find(([pattern]) =>
    pattern.test(moduleSpecifier),
  )?.[1];
}

const forbiddenHostSourcePatterns = new Map<RegExp, string>([
  [/@tauri-apps/u, "Tauri API reference"],
  [/\binvoke\s*\(/u, "raw invoke call"],
  [/\bNativeBridge\b/u, "NativeBridge reference"],
  [/\bPluginHost\b/u, "PluginHost reference"],
  [/\b(?:sqlite|rawSql|sql\s*:|params\s*:)\b/iu, "SQLite/raw SQL shape"],
  [/\b(?:providerSettings|apiKey|secret|token|password)\b/iu, "provider secret surface"],
  [/dangerouslySetInnerHTML/u, "dangerouslySetInnerHTML sink"],
  [/\.innerHTML\b/u, "innerHTML sink"],
  [/\bDOMParser\b/u, "DOMParser sink"],
  [/\beval\s*\(/u, "eval sink"],
  [/\bnew\s+Function\b/u, "Function constructor sink"],
]);
