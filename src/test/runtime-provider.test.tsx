import { render, screen, waitFor } from "@testing-library/react";
import { StrictMode, type ComponentType, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import App from "../App";

type RuntimeLike = {
  app: {
    version: string;
    pluginApiVersion?: string;
  };
  pluginHost?: {
    loadBuiltInPlugins?: () => Promise<unknown>;
    activateAll?: () => Promise<unknown>;
  };
};

type RuntimeProviderProps = {
  runtime?: RuntimeLike;
  initializeRuntime?: () => Promise<RuntimeLike>;
  children: ReactNode;
};

type RuntimeProviderModule = {
  RuntimeProvider: ComponentType<RuntimeProviderProps>;
  useRuntime: () => unknown;
};

describe("runtime provider", () => {
  it("exposes the initialized runtime to trusted UI consumers", async () => {
    const { RuntimeProvider, useRuntime } = await loadRuntimeProviderModule();
    const runtime = createRuntime("provider-ready");

    function TrustedConsumer() {
      const providedRuntime = useRuntime() as RuntimeLike;

      return (
        <p role="status" aria-label="Runtime version">
          {providedRuntime.app.version}
        </p>
      );
    }

    render(
      <RuntimeProvider runtime={runtime}>
        <TrustedConsumer />
      </RuntimeProvider>,
    );

    expect(screen.getByRole("status", { name: "Runtime version" })).toHaveTextContent(
      "provider-ready",
    );
  });

  it("throws a clear error when useRuntime is called outside RuntimeProvider", async () => {
    const { useRuntime } = await loadRuntimeProviderModule();

    function OutsideProviderConsumer() {
      useRuntime();

      return <p>unreachable</p>;
    }

    expect(() => render(<OutsideProviderConsumer />)).toThrow(
      /useRuntime.*RuntimeProvider/i,
    );
  });

  it("keeps startup single-flight under React StrictMode", async () => {
    const { RuntimeProvider, useRuntime } = await loadRuntimeProviderModule();
    const pluginHostFactory = vi.fn(() => ({
      loadBuiltInPlugins: vi.fn(async () => []),
      activateAll: vi.fn(async () => []),
    }));
    const initializeRuntime = vi.fn(async () => {
      const pluginHost = pluginHostFactory();

      await pluginHost.loadBuiltInPlugins();
      await pluginHost.activateAll();

      return createRuntime("strict-mode-ready", pluginHost);
    });

    function TrustedConsumer() {
      const runtime = useRuntime() as RuntimeLike;

      return (
        <p role="status" aria-label="Runtime ready">
          ready:{runtime.app.version}
        </p>
      );
    }

    render(
      <StrictMode>
        <RuntimeProvider initializeRuntime={initializeRuntime}>
          <TrustedConsumer />
        </RuntimeProvider>
      </StrictMode>,
    );

    expect(await screen.findByRole("status", { name: "Runtime ready" })).toHaveTextContent(
      "ready:strict-mode-ready",
    );
    await waitFor(() => expect(initializeRuntime).toHaveBeenCalledTimes(1));
    expect(pluginHostFactory).toHaveBeenCalledTimes(1);
    expect(pluginHostFactory.mock.results[0]?.value.loadBuiltInPlugins).toHaveBeenCalledTimes(
      1,
    );
    expect(pluginHostFactory.mock.results[0]?.value.activateAll).toHaveBeenCalledTimes(
      1,
    );
  });
});

describe("startup failure UI", () => {
  it("renders a generic visible alert without leaking raw bootstrap details", async () => {
    const initializeRuntime = vi
      .fn<() => Promise<RuntimeLike>>()
      .mockRejectedValue(createSensitiveBootstrapError());
    const AppWithRuntimeInjection = App as ComponentType<{
      initializeRuntime: () => Promise<RuntimeLike>;
    }>;

    render(<AppWithRuntimeInjection initializeRuntime={initializeRuntime} />);

    const alert = await screen.findByRole("alert");
    const alertText = alert.textContent ?? "";

    expect(alert).toBeVisible();
    expect(alertText).toMatch(/mirabilis|app|start/i);
    expect(alertText).not.toMatch(
      /PLUGIN_LIFECYCLE_FAILED|task\.private|SELECT\s+\*|core_pages|sqlite|\/home\/|C:\\|token|secret|Bearer|at\s+\S+:\d+:\d+/i,
    );
    expect(initializeRuntime).toHaveBeenCalledTimes(1);
  });
});

async function loadRuntimeProviderModule(): Promise<RuntimeProviderModule> {
  const runtimeProviderModulePath = "../providers";

  return (await import(runtimeProviderModulePath)) as RuntimeProviderModule;
}

function createRuntime(
  version: string,
  pluginHost: RuntimeLike["pluginHost"] = {},
): RuntimeLike {
  return {
    app: {
      version,
      pluginApiVersion: "test",
    },
    pluginHost,
  };
}

function createSensitiveBootstrapError(): Error {
  const error = new Error(
    "PLUGIN_LIFECYCLE_FAILED task.private SELECT * FROM core_pages WHERE token='secret' /home/aac6fef/Mirabilis/mirabilis.sqlite3",
  );

  error.stack = [
    "Error: PLUGIN_LIFECYCLE_FAILED",
    "    at activate (/home/aac6fef/Mirabilis/plugins/task/private.ts:12:4)",
  ].join("\n");

  Object.defineProperty(error, "cause", {
    configurable: true,
    enumerable: false,
    value: new Error("Bearer token leaked from task.private"),
    writable: true,
  });

  return error;
}
