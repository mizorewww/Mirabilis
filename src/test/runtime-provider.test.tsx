import { render, screen, waitFor } from "@testing-library/react";
import { StrictMode, type ComponentType, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import App from "../App";

type RuntimeLike = {
  app: {
    version: string;
    pluginApiVersion?: string;
  };
  stores?: unknown;
  registries?: unknown;
  services?: unknown;
  nativeBridge?: unknown;
  storage?: unknown;
  invoke?: unknown;
  pluginHost?: {
    loadBuiltInPlugins?: () => Promise<unknown>;
    activateAll?: () => Promise<unknown>;
  };
  [key: string]: unknown;
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

  it("exposes only a safe public runtime facade through useRuntime", async () => {
    const { RuntimeProvider, useRuntime } = await loadRuntimeProviderModule();
    const fullRuntime: RuntimeLike = {
      app: {
        version: "safe-public-runtime",
        pluginApiVersion: "test",
      },
      stores: {
        pages: {
          put: vi.fn(),
        },
      },
      registries: {
        commands: {
          register: vi.fn(),
          unregister: vi.fn(),
          execute: vi.fn(),
        },
      },
      services: {
        commands: {
          register: vi.fn(),
          unregister: vi.fn(),
          execute: vi.fn(),
        },
      },
      pluginHost: {
        loadBuiltInPlugins: vi.fn(async () => []),
        activateAll: vi.fn(async () => []),
      },
      nativeBridge: {
        invoke: vi.fn(),
        db: {
          execute: vi.fn(),
        },
        files: {
          importMarkdown: vi.fn(),
        },
        path: {
          appDataDir: vi.fn(),
        },
      },
      storage: {
        sqlite: {},
      },
    };
    let publicRuntime: unknown;

    function PublicConsumer() {
      publicRuntime = useRuntime();
      const runtime = publicRuntime as RuntimeLike;

      return (
        <p role="status" aria-label="Public runtime version">
          {runtime.app.version}
        </p>
      );
    }

    render(
      <RuntimeProvider runtime={fullRuntime}>
        <PublicConsumer />
      </RuntimeProvider>,
    );

    expect(
      screen.getByRole("status", { name: "Public runtime version" }),
    ).toHaveTextContent("safe-public-runtime");
    expect(findUnsafePublicRuntimeSurfacePaths(publicRuntime)).toStrictEqual([]);
    expect(publicRuntime).toStrictEqual({
      app: {
        version: "safe-public-runtime",
        pluginApiVersion: "test",
      },
    });
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

  it("retries initialization after a rejected mount with the same initializer", async () => {
    const { RuntimeProvider, useRuntime } = await loadRuntimeProviderModule();
    const initializeRuntime = vi
      .fn<() => Promise<RuntimeLike>>()
      .mockRejectedValueOnce(new Error("first bootstrap failed"))
      .mockResolvedValueOnce(createRuntime("retry-ready"));

    function TrustedConsumer() {
      const runtime = useRuntime() as RuntimeLike;

      return (
        <p role="status" aria-label="Runtime retry">
          ready:{runtime.app.version}
        </p>
      );
    }

    const { unmount } = render(
      <RuntimeProvider initializeRuntime={initializeRuntime}>
        <TrustedConsumer />
      </RuntimeProvider>,
    );

    expect(await screen.findByRole("alert")).toBeVisible();
    unmount();

    render(
      <RuntimeProvider initializeRuntime={initializeRuntime}>
        <TrustedConsumer />
      </RuntimeProvider>,
    );

    expect(await screen.findByRole("status", { name: "Runtime retry" })).toHaveTextContent(
      "ready:retry-ready",
    );
    await waitFor(() => expect(initializeRuntime).toHaveBeenCalledTimes(2));
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

function findUnsafePublicRuntimeSurfacePaths(value: unknown): string[] {
  return collectUnsafePublicRuntimeSurfacePaths(value, "$", new Set<object>()).sort();
}

function collectUnsafePublicRuntimeSurfacePaths(
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

  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => {
    const childPath = `${currentPath}.${key}`;
    const keyViolation = isUnsafePublicRuntimeKey(key, currentPath)
      ? [childPath]
      : [];

    return [
      ...keyViolation,
      ...collectUnsafePublicRuntimeSurfacePaths(child, childPath, seen),
    ];
  });
}

function isUnsafePublicRuntimeKey(key: string, parentPath: string): boolean {
  const normalized = key.replace(/[-_]/g, "").toLowerCase();
  const normalizedParent = parentPath.replace(/[-_]/g, "").toLowerCase();

  if (
    normalized === "stores" ||
    normalized === "registries" ||
    normalized === "services" ||
    normalized === "pluginhost" ||
    normalized === "nativebridge" ||
    normalized === "invoke" ||
    normalized === "tauri" ||
    normalized === "db" ||
    normalized === "database" ||
    normalized === "sqlite" ||
    normalized === "storage" ||
    normalized === "filesystem" ||
    normalized === "files" ||
    normalized === "fs" ||
    normalized === "path"
  ) {
    return true;
  }

  return (
    normalizedParent.endsWith(".commands") &&
    (normalized === "register" ||
      normalized === "unregister" ||
      normalized === "execute")
  );
}
