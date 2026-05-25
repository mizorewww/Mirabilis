import { execFile } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import App from "../App";
import { createAppRuntime, type AppRuntime } from "../bootstrap";
import {
  createCoreStores,
  type CoreStores,
  type DbQuery,
  type NativeBridge,
} from "../core";
import { RuntimeProvider, useRuntime } from "../providers";
import { disallowedNativeSurfaceChanges } from "./native-surface-guard";

type RuntimeLike = {
  app: {
    version: string;
    pluginApiVersion?: string;
  };
  [key: string]: unknown;
};

type PackageJson = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  [key: string]: unknown;
};

type SourceFile = {
  filePath: string;
  source: string;
};

type NativeBridgeTransactionResult<Response> =
  Response extends readonly unknown[]
    ? number extends Response["length"]
      ? Array<Response>
      : Response
    : Array<Response>;

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const execFileAsync = promisify(execFile);

const productionSourceEntrypoints = ["src"] as const;
const task035NativeSurfaceEntrypoints = [
  "package.json",
  "bun.lock",
  "src-tauri/Cargo.lock",
  "src-tauri/Cargo.toml",
  "src-tauri/build.rs",
  "src-tauri/capabilities",
  "src-tauri/gen/schemas",
  "src-tauri/permissions",
  "src-tauri/src/commands",
  "src-tauri/src/db",
  "src-tauri/src/lib.rs",
  "src-tauri/src/main.rs",
  "src-tauri/tauri.conf.json",
] as const;

const requiredTask035MuiDependencies = [
  "@emotion/react",
  "@emotion/styled",
  "@mui/icons-material",
  "@mui/material",
] as const;

const requiredTask035MuiPathImports = [
  "@mui/material/AppBar",
  "@mui/material/CssBaseline",
  "@mui/material/Drawer",
  "@mui/material/styles",
] as const;

const sourceExtensions = new Set([".ts", ".tsx"]);

describe("TASK-035 MUI shell frame", () => {
  it("renders a dense ready workbench frame with named landmarks and top-bar actions", async () => {
    renderReadyApp("0.1.0-shell");

    expect(await screen.findByText(/^Mirabilis$/i)).toBeVisible();

    const banner = screen.getByRole("banner", { name: /mirabilis/i });
    const navigation = screen.getByRole("navigation", {
      name: /workspace|primary/i,
    });
    const main = screen.getByRole("main", { name: /workspace|home/i });

    expect(banner).toBeVisible();
    expect(navigation).toBeVisible();
    expect(main).toBeVisible();
    expect(screen.getByText(/0\.1\.0-shell/i)).toBeVisible();
    expect(
      within(main).getByRole("heading", { name: /^Home Workspace$/i }),
    ).toBeVisible();
    expect(
      await within(main).findByRole("textbox", { name: /markdown/i }),
    ).toBeEnabled();
    expect(
      within(main).queryByRole("region", {
        name: /^Home route placeholders$/i,
      }),
    ).not.toBeInTheDocument();
    expect(
      within(main).queryByText(/^Markdown editor view placeholder$/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/^Runtime 0\.1\.0-shell$/i)).not.toBeInTheDocument();

    const topBar = within(banner);

    expect(topBar.getByRole("button", { name: /command/i })).toBeVisible();
    expect(topBar.getByRole("button", { name: /search/i })).toBeVisible();
    expect(
      topBar.getByRole("button", { name: /quick capture|capture/i }),
    ).toBeVisible();
    expect(topBar.getByRole("button", { name: /settings/i })).toBeVisible();
  });

  it("hides and restores the workspace navigation through the drawer toggle", async () => {
    const user = userEvent.setup();

    renderReadyApp("0.1.0-drawer");

    expect(await screen.findByText(/^Mirabilis$/i)).toBeVisible();

    const toggle = screen.getByRole("button", {
      name: /^Workspace navigation$/i,
    });

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("navigation", { name: /^Workspace$/i }),
    ).toBeVisible();

    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("navigation", { name: /^Workspace$/i }),
    ).not.toBeInTheDocument();

    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("navigation", { name: /^Workspace$/i }),
    ).toBeVisible();
  });

  it("updates top-bar action pressed state and status through real user clicks", async () => {
    const user = userEvent.setup();

    renderReadyApp("0.1.0-actions");

    expect(await screen.findByText(/^Mirabilis$/i)).toBeVisible();

    const topBar = within(screen.getByRole("banner", { name: /mirabilis/i }));
    const status = getShellToolStatus();
    const actionChecks = [
      {
        name: /^Command$/i,
        status: /^Command surface placeholder$/i,
      },
      {
        name: /^Search$/i,
        status: /^Search surface placeholder$/i,
      },
      {
        name: /^Quick Capture$/i,
        status: /^Quick Capture surface placeholder$/i,
      },
      {
        name: /^Settings$/i,
        status: /^Settings surface placeholder$/i,
      },
    ] as const;

    for (const action of actionChecks) {
      const activeButton = topBar.getByRole("button", { name: action.name });

      await user.click(activeButton);

      expect(activeButton).toHaveAttribute("aria-pressed", "true");
      expect(status).toHaveTextContent(action.status);

      for (const otherAction of actionChecks.filter(
        (candidate) => candidate !== action,
      )) {
        expect(
          topBar.getByRole("button", { name: otherAction.name }),
        ).toHaveAttribute("aria-pressed", "false");
      }
    }

    const commandButton = topBar.getByRole("button", { name: /^Command$/i });
    const previouslyActiveButton = topBar.getByRole("button", {
      name: /^Settings$/i,
    });

    expect(previouslyActiveButton).toHaveAttribute("aria-pressed", "true");

    await user.click(commandButton);

    expect(commandButton).toHaveAttribute("aria-pressed", "true");
    expect(status).toHaveTextContent(/^Command surface placeholder$/i);
    expect(previouslyActiveButton).toHaveAttribute("aria-pressed", "false");
  });

  it("changes the visible shell route through real user navigation", async () => {
    const user = userEvent.setup();

    renderReadyApp("0.1.0-nav");

    expect(await screen.findByText(/^Mirabilis$/i)).toBeVisible();

    const navigation = screen.getByRole("navigation", {
      name: /workspace|primary/i,
    });
    const todayRoute = within(navigation).getByRole("button", { name: /today/i });

    await user.click(todayRoute);

    expect(todayRoute).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("main", { name: /today/i })).toHaveTextContent(
      /today/i,
    );

    const inboxRoute = within(navigation).getByRole("button", { name: /inbox/i });

    await user.click(inboxRoute);

    expect(inboxRoute).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("main", { name: /inbox/i })).toHaveTextContent(
      /inbox/i,
    );
  });

  it("keeps startup loading visible without rendering a fake ready workspace", () => {
    const initializeRuntime = vi.fn(() => new Promise<RuntimeLike>(() => {}));

    render(<App initializeRuntime={initializeRuntime} />);

    expect(screen.getByText(/starting mirabilis/i)).toBeVisible();
    expect(
      screen.queryByRole("banner", { name: /mirabilis/i }),
    ).not.toBeInTheDocument();
  });

  it("keeps startup failures visible and redacted from raw runtime details", async () => {
    const initializeRuntime = vi
      .fn<() => Promise<RuntimeLike>>()
      .mockRejectedValue(createSensitiveTask035StartupError());

    render(<App initializeRuntime={initializeRuntime} />);

    const alert = await screen.findByRole("alert");
    const alertText = alert.textContent ?? "";

    expect(alert).toBeVisible();
    expect(alertText).toMatch(/mirabilis|app|start/i);
    expect(alertText).not.toMatch(
      /PLUGIN_LIFECYCLE_FAILED|ai\.provider|openai|SELECT\s+\*|core_pages|sqlite|\/home\/|C:\\|token|secret|Bearer|provider=|pluginHost|NativeBridge|at\s+\S+:\d+:\d+/i,
    );
    expect(initializeRuntime).toHaveBeenCalledTimes(1);
  });
});

describe("TASK-035 runtime facade boundary", () => {
  it("keeps useRuntime public output frozen, copied, and limited to app info", () => {
    const fullRuntime = createUnsafeFullRuntime("copy-safe-runtime");
    let publicRuntime: ReturnType<typeof useRuntime> | undefined;

    function RuntimeProbe() {
      publicRuntime = useRuntime();

      return (
        <p role="status" aria-label="Runtime facade version">
          {publicRuntime.app.version}
        </p>
      );
    }

    render(
      <RuntimeProvider runtime={fullRuntime}>
        <RuntimeProbe />
      </RuntimeProvider>,
    );

    expect(
      screen.getByRole("status", { name: "Runtime facade version" }),
    ).toHaveTextContent("copy-safe-runtime");
    expect(publicRuntime).toStrictEqual({
      app: {
        version: "copy-safe-runtime",
        pluginApiVersion: "test-api",
      },
    });

    if (publicRuntime === undefined) {
      throw new Error("RuntimeProbe did not capture the public runtime");
    }

    expect(Object.isFrozen(publicRuntime)).toBe(true);
    expect(Object.isFrozen(publicRuntime.app)).toBe(true);

    fullRuntime.app.version = "mutated-after-render";

    expect(publicRuntime.app.version).toBe("copy-safe-runtime");
    expect(Reflect.set(publicRuntime, "stores", {})).toBe(false);
    expect(Reflect.set(publicRuntime.app, "version", "mutated-public")).toBe(
      false,
    );
    expect(publicRuntime).toStrictEqual({
      app: {
        version: "copy-safe-runtime",
        pluginApiVersion: "test-api",
      },
    });
  });
});

describe("TASK-035 MUI static and package guards", () => {
  it("declares exactly the reviewed MUI runtime dependencies with no script or dev-dependency drift", async () => {
    const packageJson = await readPackageJson("package.json");
    const basePackageJson = await readPackageJsonFromMaster("package.json");
    const dependencies = packageJson.dependencies ?? {};
    const dependencyDiff = diffStringRecordProperties(
      basePackageJson.dependencies ?? {},
      dependencies,
    );

    expect(findTask035MuiDependencyViolations(packageJson)).toStrictEqual([]);
    expect(findTask035DependencyDiffViolations(dependencyDiff)).toStrictEqual([]);
    expect(packageJson.devDependencies).toStrictEqual(
      basePackageJson.devDependencies,
    );
    // eslint-disable-next-line testing-library/no-node-access -- JSON package fields are not DOM nodes.
    expect(packageJson.scripts).toStrictEqual(basePackageJson.scripts);
    expect(findForbiddenPackageDrift(packageJson)).toStrictEqual([]);
  });

  it("uses MUI substrate through supported path imports and avoids stale MUI APIs", async () => {
    const sources = await readProductionSources(productionSourceEntrypoints);
    const imports = sources.flatMap(({ filePath, source }) =>
      collectStaticModuleSpecifiers(source).map((moduleSpecifier) => ({
        filePath,
        moduleSpecifier,
      })),
    );
    const importSpecifiers = imports.map(({ moduleSpecifier }) => moduleSpecifier);
    const missingRequiredImports = requiredTask035MuiPathImports.filter(
      (moduleSpecifier) => !importSpecifiers.includes(moduleSpecifier),
    );
    const iconPathImports = importSpecifiers.filter((moduleSpecifier) =>
      /^@mui\/icons-material\/[^/]+$/u.test(moduleSpecifier),
    );
    const importViolations = imports.flatMap(({ filePath, moduleSpecifier }) => {
      const violation = findForbiddenMuiImport(moduleSpecifier);

      return violation === undefined
        ? []
        : [`${filePath} -> ${moduleSpecifier}: ${violation}`];
    });
    const deprecatedApiViolations = sources.flatMap((sourceFile) =>
      findDeprecatedMuiApiPatterns(sourceFile),
    );

    expect(
      ["@mui/material/AppBar", "@mui/material/styles"].map(findForbiddenMuiImport),
    ).toStrictEqual([undefined, undefined]);
    expect(missingRequiredImports).toStrictEqual([]);
    expect(iconPathImports.length).toBeGreaterThan(0);
    expect(importViolations).toStrictEqual([]);
    expect(deprecatedApiViolations).toStrictEqual([]);
    expect(findMuiSubstrateViolations(sources)).toStrictEqual([]);
  });

  it("keeps TASK-035 package, lockfile, and native-surface changes within the reviewed MUI-only boundary", async () => {
    expect(
      await disallowedNativeSurfaceChanges(
        await listTask035SurfaceChangesFromMaster(),
      ),
    ).toStrictEqual([]);
  });
});

function renderReadyApp(version: string): void {
  render(
    <App initializeRuntime={vi.fn(() => createShellTestRuntime(version))} />,
  );
}

async function createShellTestRuntime(version: string): Promise<AppRuntime> {
  return createAppRuntime({
    app: {
      version,
      pluginApiVersion: "test-api",
    },
    createNativeBridge: () => createNoopNativeBridge(),
    createStores: (): CoreStores =>
      createCoreStores({
        pages: {
          createId: createSingleUseIdFactory(`home-${version}`),
        },
      }),
  });
}

function createNoopNativeBridge(): NativeBridge {
  return {
    db: {
      async execute<Response>(_query: DbQuery): Promise<Response> {
        void _query;

        return undefined as Response;
      },
      async transaction<Response>(
        _queries: DbQuery[],
      ): Promise<NativeBridgeTransactionResult<Response>> {
        void _queries;

        return [] as NativeBridgeTransactionResult<Response>;
      },
    },
    shortcuts: {
      async register() {
        return undefined;
      },
      async unregister() {
        return undefined;
      },
    },
    notifications: {
      async notify() {
        return undefined;
      },
    },
    files: {
      async importMarkdown() {
        return "";
      },
      async exportMarkdown() {
        return undefined;
      },
    },
  };
}

function createSingleUseIdFactory(firstId: string): () => string {
  let nextId = firstId;
  let generatedCount = 0;

  return () => {
    const id = nextId;

    generatedCount += 1;
    nextId = `${firstId}-extra-${generatedCount}`;

    return id;
  };
}

function getShellToolStatus(): HTMLElement {
  const status = screen
    .getAllByRole("status")
    .find((candidate) =>
      /surface placeholder/i.test(candidate.textContent ?? ""),
    );

  if (status === undefined) {
    throw new Error("Expected shell tool status to be visible");
  }

  return status;
}

function createUnsafeFullRuntime(version: string): RuntimeLike {
  return {
    app: {
      version,
      pluginApiVersion: "test-api",
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
        execute: vi.fn(),
      },
    },
    pluginHost: {
      loadBuiltInPlugins: vi.fn(),
      activateAll: vi.fn(),
    },
    nativeBridge: {
      invoke: vi.fn(),
      db: {
        execute: vi.fn(),
      },
      path: {
        appDataDir: vi.fn(),
      },
    },
    storage: {
      sqlite: {
        execute: vi.fn(),
      },
    },
  };
}

function createSensitiveTask035StartupError(): Error {
  const error = new Error(
    [
      "PLUGIN_LIFECYCLE_FAILED",
      "plugin=ai.provider",
      "provider=openai",
      "SELECT * FROM core_pages WHERE token='secret'",
      "/home/aac6fef/Mirabilis/mirabilis.sqlite3",
    ].join(" "),
  );

  error.stack = [
    "Error: PLUGIN_LIFECYCLE_FAILED provider=openai",
    "    at activate (/home/aac6fef/Mirabilis/plugins/ai/provider.ts:12:4)",
  ].join("\n");

  Object.defineProperty(error, "cause", {
    configurable: true,
    enumerable: false,
    value: new Error("Bearer token leaked from NativeBridge provider"),
    writable: true,
  });

  return error;
}

async function readPackageJson(relativePath: string): Promise<PackageJson> {
  return parsePackageJson(await readFile(path.join(repoRoot, relativePath), "utf8"));
}

async function readPackageJsonFromMaster(
  relativePath: string,
): Promise<PackageJson> {
  return parsePackageJson(await runGitOutput(["show", `master:${relativePath}`]));
}

function parsePackageJson(contents: string): PackageJson {
  const value = JSON.parse(contents) as unknown;

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Expected package.json object");
  }

  return value as PackageJson;
}

async function readProductionSources(
  relativePaths: readonly string[],
): Promise<SourceFile[]> {
  const sourceFileGroups = await Promise.all(
    relativePaths.map((relativePath) =>
      readSourceFilesIfExists(path.join(repoRoot, relativePath)),
    ),
  );

  return sourceFileGroups
    .flat()
    .filter(({ filePath }) => !path.relative(repoRoot, filePath).startsWith("src/test"))
    .sort((left, right) => left.filePath.localeCompare(right.filePath));
}

async function readSourceFilesIfExists(absolutePath: string): Promise<SourceFile[]> {
  const entry = await statIfExists(absolutePath);

  if (entry === undefined) {
    return [];
  }

  if (entry.isFile()) {
    return sourceExtensions.has(path.extname(absolutePath))
      ? [
          {
            filePath: path.relative(repoRoot, absolutePath),
            source: await readFile(absolutePath, "utf8"),
          },
        ]
      : [];
  }

  if (!entry.isDirectory()) {
    return [];
  }

  const childEntries = await readdir(absolutePath, { withFileTypes: true });
  const childFiles = await Promise.all(
    childEntries.map((childEntry) =>
      readSourceFilesIfExists(path.join(absolutePath, childEntry.name)),
    ),
  );

  return childFiles.flat();
}

async function statIfExists(absolutePath: string) {
  try {
    return await stat(absolutePath);
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return undefined;
    }

    throw error;
  }
}

function collectStaticModuleSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const importExportPattern =
    /\b(?:import|export)\s+(?:type\s+)?(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g;
  const sideEffectImportPattern = /\bimport\s*["']([^"']+)["']/g;

  for (const match of source.matchAll(importExportPattern)) {
    const moduleSpecifier = match[1];

    if (moduleSpecifier !== undefined) {
      specifiers.push(moduleSpecifier);
    }
  }

  for (const match of source.matchAll(sideEffectImportPattern)) {
    const moduleSpecifier = match[1];

    if (moduleSpecifier !== undefined) {
      specifiers.push(moduleSpecifier);
    }
  }

  return [...new Set(specifiers)].sort();
}

function findForbiddenMuiImport(moduleSpecifier: string): string | undefined {
  if (/^@material-ui(?:\/|$)/u.test(moduleSpecifier)) {
    return "legacy @material-ui package";
  }

  if (/^@mui\/[^/]+$/u.test(moduleSpecifier)) {
    return "MUI barrel import";
  }

  if (/^@mui\/x-/u.test(moduleSpecifier)) {
    return "MUI X package";
  }

  if (/^@mui\/material\/(?:modern|esm)(?:\/|$)/u.test(moduleSpecifier)) {
    return "undocumented MUI bundle import";
  }

  return undefined;
}

function findDeprecatedMuiApiPatterns({
  filePath,
  source,
}: SourceFile): string[] {
  const fileHasMuiImport = collectStaticModuleSpecifiers(source).some(
    (moduleSpecifier) =>
      moduleSpecifier.startsWith("@mui/") ||
      moduleSpecifier.startsWith("@material-ui/"),
  );
  const patterns = new Map<RegExp, string>([
    [/\bcreateMuiTheme\b/u, "createMuiTheme"],
    [/\bMuiThemeProvider\b/u, "MuiThemeProvider"],
    [/\bmakeStyles\b/u, "makeStyles"],
    [/\bHidden\b/u, "Hidden"],
    [/\bGridLegacy\b/u, "GridLegacy"],
    [/<ListItem\b[^>]*\bbutton(?:\s|=|>|\{)/u, "ListItem button prop"],
    [/<[A-Z][\w.:-]*\b[^>]*\bInputProps\s*=/u, "InputProps prop"],
    [/<[A-Z][\w.:-]*\b[^>]*\bPaperProps\s*=/u, "PaperProps prop"],
    [
      /<[A-Z][\w.:-]*\b[^>]*\bTransitionComponent\s*=/u,
      "TransitionComponent prop",
    ],
  ]);
  const violations = [...patterns.entries()]
    .filter(([pattern]) => pattern.test(source))
    .map(([, label]) => `${filePath}: ${label}`);

  if (fileHasMuiImport) {
    const deprecatedSlotPropPatterns = new Map<RegExp, string>([
      [/<[A-Z][\w.:-]*\b[^>]*\bcomponentsProps\s*=/u, "componentsProps prop"],
      [/<[A-Z][\w.:-]*\b[^>]*\bcomponents\s*=/u, "components prop"],
    ]);

    violations.push(
      ...[...deprecatedSlotPropPatterns.entries()]
        .filter(([pattern]) => pattern.test(source))
        .map(([, label]) => `${filePath}: ${label}`),
    );
  }

  return violations;
}

function findMuiSubstrateViolations(sources: readonly SourceFile[]): string[] {
  const combinedSource = sources.map(({ source }) => source).join("\n");
  const appSource =
    sources.find(({ filePath }) => filePath === "src/App.tsx")?.source ?? "";
  const requiredSubstratePatterns = new Map<RegExp, string>([
    [/\bcreateTheme\s*\(/u, "createTheme"],
    [/<ThemeProvider\b/u, "ThemeProvider"],
    [/<CssBaseline\s*\/?>/u, "CssBaseline"],
  ]);
  const violations = [...requiredSubstratePatterns.entries()]
    .filter(([pattern]) => !pattern.test(appSource))
    .map(([, label]) => `src/App.tsx: missing ${label}`);

  if (
    !/\bfontFamily\s*:/u.test(appSource) ||
    !/\b(?:ui-sans-serif|system-ui|-apple-system|Segoe UI)\b/u.test(appSource)
  ) {
    violations.push("src/App.tsx: missing local/system font tokens");
  }

  if (/(?:fonts\.googleapis|fonts\.gstatic|@import\s+["']https?:)/iu.test(combinedSource)) {
    violations.push("production source: external font dependency");
  }

  return violations;
}

function findForbiddenPackageDrift(packageJson: PackageJson): string[] {
  const dependencyNames = Object.keys({
    ...(packageJson.dependencies ?? {}),
    ...(packageJson.devDependencies ?? {}),
  });
  const forbiddenPackagePatterns = new Map<RegExp, string>([
    [/^@mui\/x-/u, "MUI X dependency"],
    [/^@fontsource\//u, "font package"],
    [/\b(?:font|google-font|cdn)\b/iu, "font or CDN dependency"],
    [/\b(?:sqlite|sql\.js|better-sqlite|tauri-plugin-sql)\b/iu, "SQLite dependency"],
    [/\b(?:openai|anthropic|axios|got|node-fetch|cross-fetch|undici|ws)\b/iu, "network or provider dependency"],
  ]);

  return dependencyNames.flatMap((dependencyName) =>
    [...forbiddenPackagePatterns.entries()]
      .filter(([pattern]) => pattern.test(dependencyName))
      .map(([, label]) => `${dependencyName}: ${label}`),
  );
}

function findTask035MuiDependencyViolations(packageJson: PackageJson): string[] {
  const runtimeDependencies = packageJson.dependencies ?? {};
  const allDeclaredDependencies = {
    ...runtimeDependencies,
    ...(packageJson.devDependencies ?? {}),
  };
  const requiredDependencies = new Set<string>(requiredTask035MuiDependencies);
  const violations = requiredTask035MuiDependencies.flatMap((dependencyName) => {
    const version = runtimeDependencies[dependencyName];

    if (version === undefined) {
      return [`missing reviewed runtime dependency: ${dependencyName}`];
    }

    return isRegistryVersionSpecifier(version)
      ? []
      : [`non-registry reviewed dependency specifier: ${dependencyName}`];
  });
  const unreviewedMuiDependencies = Object.keys(allDeclaredDependencies)
    .filter(
      (dependencyName) =>
        /^(?:@emotion|@mui)\//u.test(dependencyName) &&
        !requiredDependencies.has(dependencyName),
    )
    .sort();

  return [
    ...violations,
    ...unreviewedMuiDependencies.map(
      (dependencyName) => `unreviewed MUI/Emotion dependency: ${dependencyName}`,
    ),
  ];
}

function findTask035DependencyDiffViolations(diff: {
  added: string[];
  changed: string[];
  removed: string[];
}): string[] {
  const violations: string[] = [];

  if (
    diff.added.length > 0 &&
    !sameStringSet(diff.added, requiredTask035MuiDependencies)
  ) {
    violations.push(
      `dependency additions must be empty after merge or exactly reviewed TASK-035 MUI dependencies before merge: ${diff.added.join(", ")}`,
    );
  }

  if (diff.changed.length > 0) {
    violations.push(`unreviewed changed dependencies: ${diff.changed.join(", ")}`);
  }

  if (diff.removed.length > 0) {
    violations.push(`unreviewed removed dependencies: ${diff.removed.join(", ")}`);
  }

  return violations;
}

function diffStringRecordProperties(
  baseRecord: Record<string, string>,
  currentRecord: Record<string, string>,
): {
  added: string[];
  changed: string[];
  removed: string[];
} {
  return {
    added: Object.keys(currentRecord)
      .filter((key) => !(key in baseRecord))
      .sort(),
    changed: Object.keys(currentRecord)
      .filter((key) => key in baseRecord && currentRecord[key] !== baseRecord[key])
      .sort(),
    removed: Object.keys(baseRecord)
      .filter((key) => !(key in currentRecord))
      .sort(),
  };
}

function isRegistryVersionSpecifier(value: string): boolean {
  return (
    value.trim().length > 0 &&
    !/^(?:https?:|git(?:\+|:)|file:|link:|portal:|workspace:)/iu.test(value)
  );
}

function sameStringSet(
  actual: readonly string[],
  expected: readonly string[],
): boolean {
  return (
    actual.length === expected.length &&
    [...actual].sort().every((value, index) => value === [...expected].sort()[index])
  );
}

async function listTask035SurfaceChangesFromMaster(): Promise<string[]> {
  const changedTrackedFiles = await runGitLines([
    "diff",
    "--name-only",
    "master",
    "--",
    ...task035NativeSurfaceEntrypoints,
  ]);
  const untrackedFiles = await runGitLines([
    "ls-files",
    "--others",
    "--exclude-standard",
    "--",
    ...task035NativeSurfaceEntrypoints,
  ]);

  return [...new Set([...changedTrackedFiles, ...untrackedFiles])].sort();
}

async function runGitLines(args: readonly string[]): Promise<string[]> {
  const stdout = await runGitOutput(args);

  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

async function runGitOutput(args: readonly string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd: repoRoot });

  return stdout;
}
