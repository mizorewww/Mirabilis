import { execFile } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import App from "../App";
import { BUILT_IN_PLUGINS, createAppRuntime, type AppRuntime } from "../bootstrap";
import {
  createCoreStores,
  type CoreStores,
  type DbQuery,
  type NativeBridge,
} from "../core";
import { disallowedNativeSurfaceChanges } from "./native-surface-guard";

type NativeBridgeTransactionResult<Response> =
  Response extends readonly unknown[]
    ? number extends Response["length"]
      ? Array<Response>
      : Response
    : Array<Response>;

type SourceFile = {
  filePath: string;
  source: string;
};

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const execFileAsync = promisify(execFile);

const appShellEntrypoints = ["src/App.tsx", "src/shell", "src/providers"] as const;
const sourceExtensions = new Set([".ts", ".tsx"]);
const task044SurfaceEntrypoints = [
  "CHANGELOG.md",
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

describe("TASK-044 Settings and Sync placeholders", () => {
  it("opens a visible Settings workspace from the top bar with app and runtime facts", async () => {
    const user = userEvent.setup();
    const runtime = await createSettingsTestRuntime({
      pluginApiVersion: "test-api-settings",
      version: "44.0.0-settings",
    });

    renderReadyApp(runtime);

    const homeMain = await screen.findByRole("main", { name: /home/i });

    expect(
      within(homeMain).getByRole("textbox", { name: /markdown/i }),
    ).toBeEnabled();
    expect(screen.getByRole("navigation", { name: /workspace/i })).toBeVisible();

    await user.click(
      within(screen.getByRole("banner", { name: /mirabilis/i })).getByRole(
        "button",
        { name: /^Settings$/i },
      ),
    );

    const settingsMain = await screen.findByRole("main", { name: /settings/i });

    expect(
      within(settingsMain).getByRole("heading", {
        name: /^Settings Workspace$/i,
      }),
    ).toBeVisible();
    expect(
      within(settingsMain).queryByText(/^Settings surface placeholder$/i),
    ).not.toBeInTheDocument();

    const runtimeFacts = within(settingsMain).getByRole("region", {
      name: /app runtime|runtime facts|app information/i,
    });

    expect(within(runtimeFacts).getByText(/^Mirabilis$/i)).toBeVisible();
    expect(within(runtimeFacts).getByText(/44\.0\.0-settings/i)).toBeVisible();
    expect(within(runtimeFacts).getByText(/Plugin API/i)).toBeVisible();
    expect(within(runtimeFacts).getByText(/test-api-settings/i)).toBeVisible();
    expect(screen.getByRole("navigation", { name: /workspace/i })).toBeVisible();
    expect(
      screen.queryByRole("heading", {
        name: /welcome|get started|landing|hero/i,
      }),
    ).not.toBeInTheDocument();
  });

  it("lists public plugin settings descriptors while keeping AI provider settings inert", async () => {
    const { settingsMain } = await renderAndOpenSettingsWorkspace();
    const descriptorRegion = within(settingsMain).getByRole("region", {
      name: /plugin settings descriptors/i,
    });
    const aiDescriptor = getBuiltInSettingsDescriptor(
      "ai",
      "ai.provider-settings",
    );

    expect(aiDescriptor).toStrictEqual({
      id: "ai.provider-settings",
      title: "Provider settings",
    });
    expect(within(descriptorRegion).getByText(/^AI Plugin$/i)).toBeVisible();
    expect(
      within(descriptorRegion).getByText(/^ai\.provider-settings$/i),
    ).toBeVisible();
    expect(
      within(descriptorRegion).getByText(/^Provider settings$/i),
    ).toBeVisible();
    expect(
      within(descriptorRegion).getByText(
        /inert|descriptor-only|manifest descriptor|not configured|no executable settings panel/i,
      ),
    ).toBeVisible();
    expectNoSecretLikeSettingsControls(settingsMain);
  });

  it("shows the embedded Sync skeleton panel as inactive and descriptor-only", async () => {
    const { runtime, settingsMain, user } = await renderAndOpenSettingsWorkspace();
    const executeSpy = vi.spyOn(runtime.commands, "execute");
    const syncPanel = within(settingsMain).getByRole("region", {
      name: /sync/i,
    });

    expect(within(syncPanel).getByText(/Plugin id/i)).toHaveTextContent(
      /\bsync\b/i,
    );
    expect(within(syncPanel).getByText(/no runtime commands/i)).toBeVisible();
    expect(within(syncPanel).getByText(/no views/i)).toBeVisible();
    expect(within(syncPanel).getByText(/no settings panels/i)).toBeVisible();
    expect(within(syncPanel).getByText(/no transport/i)).toBeVisible();
    expect(within(syncPanel).getByText(/no remote endpoint/i)).toBeVisible();
    expect(within(syncPanel).getByText(/no background jobs/i)).toBeVisible();
    expect(within(syncPanel).getByText(/no conflict UI/i)).toBeVisible();
    expect(
      within(syncPanel).getByText(/no settings persistence enabled/i),
    ).toBeVisible();
    expect(
      within(syncPanel).queryByRole("button", {
        name: /sync now|start sync|push|pull|connect|login|configure remote/i,
      }),
    ).not.toBeInTheDocument();

    await user.click(
      within(screen.getByRole("banner", { name: /mirabilis/i })).getByRole(
        "button",
        { name: /^Settings$/i },
      ),
    );

    expect(executeSpy).not.toHaveBeenCalled();
    expectNoSecretLikeSettingsControls(syncPanel);
  });
});

describe("TASK-044 Settings and Sync static guards", () => {
  it("does not add package, lockfile, Tauri, Rust, IPC, schema, capability, permission, native, or release drift", async () => {
    const changedSurfaceFiles = await listTask044SurfaceChangesFromMaster();

    expect(
      await disallowedNativeSurfaceChanges(changedSurfaceFiles),
    ).toStrictEqual([]);
  });

  it("keeps app-shell Settings and Sync UI free of executable provider, secret, network, storage, native, and forbidden sync-command surfaces", async () => {
    const sources = await readProductionSources(appShellEntrypoints);
    const violations = sources.flatMap(findTask044SettingsSyncSurfaceViolations);

    expect(violations).toStrictEqual([]);
  });
});

async function renderAndOpenSettingsWorkspace(): Promise<{
  runtime: AppRuntime;
  settingsMain: HTMLElement;
  user: ReturnType<typeof userEvent.setup>;
}> {
  const user = userEvent.setup();
  const runtime = await createSettingsTestRuntime({
    pluginApiVersion: "test-api-settings",
    version: "44.0.0-settings",
  });

  renderReadyApp(runtime);
  expect(await screen.findByRole("main", { name: /home/i })).toBeVisible();

  await user.click(
    within(screen.getByRole("banner", { name: /mirabilis/i })).getByRole(
      "button",
      { name: /^Settings$/i },
    ),
  );

  return {
    runtime,
    settingsMain: await screen.findByRole("main", { name: /settings/i }),
    user,
  };
}

function renderReadyApp(runtime: AppRuntime): void {
  render(<App initializeRuntime={vi.fn(async () => runtime)} />);
}

async function createSettingsTestRuntime({
  pluginApiVersion,
  version,
}: {
  pluginApiVersion: string;
  version: string;
}): Promise<AppRuntime> {
  return createAppRuntime({
    app: {
      pluginApiVersion,
      version,
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

function getBuiltInSettingsDescriptor(pluginId: string, descriptorId: string) {
  const plugin = BUILT_IN_PLUGINS.find(
    (candidate) => candidate.manifest.id === pluginId,
  );
  const descriptor = plugin?.manifest.contributes?.settingsPanels?.find(
    (candidate) => candidate.id === descriptorId,
  );

  if (descriptor === undefined) {
    throw new Error(`${descriptorId} descriptor is not registered`);
  }

  return descriptor;
}

function expectNoSecretLikeSettingsControls(container: HTMLElement): void {
  const scope = within(container);
  const forbiddenFieldName =
    /api\s*key|apikey|token|secret|credential|password|provider|model|endpoint|remote|url|path/i;

  expect(scope.queryByLabelText(forbiddenFieldName)).not.toBeInTheDocument();
  expect(scope.queryByPlaceholderText(forbiddenFieldName)).not.toBeInTheDocument();

  for (const role of ["textbox", "searchbox", "combobox", "spinbutton"] as const) {
    expect(
      scope.queryByRole(role, { name: forbiddenFieldName }),
    ).not.toBeInTheDocument();
  }
}

async function listTask044SurfaceChangesFromMaster(): Promise<string[]> {
  const changedTrackedFiles = await runGitLines([
    "diff",
    "--name-only",
    "master",
    "--",
    ...task044SurfaceEntrypoints,
  ]);
  const untrackedFiles = await runGitLines([
    "ls-files",
    "--others",
    "--exclude-standard",
    "--",
    ...task044SurfaceEntrypoints,
  ]);

  return [...new Set([...changedTrackedFiles, ...untrackedFiles])].sort();
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
    .filter(({ filePath }) => !filePath.startsWith("src/test"))
    .sort((left, right) => left.filePath.localeCompare(right.filePath));
}

async function readSourceFilesIfExists(
  absolutePath: string,
): Promise<SourceFile[]> {
  const entry = await statIfExists(absolutePath);

  if (entry === undefined) {
    return [];
  }

  if (entry.isFile()) {
    if (!sourceExtensions.has(path.extname(absolutePath))) {
      return [];
    }

    return [
      {
        filePath: toRepoRelativePath(absolutePath),
        source: await readFile(absolutePath, "utf8"),
      },
    ];
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

function findTask044SettingsSyncSurfaceViolations({
  filePath,
  source,
}: SourceFile): string[] {
  const violations: string[] = [];
  const forbiddenPatterns = [
    [/\bsync\.(?:start|push|pull|connect|login|apply|import|configure-remote)\b/u, "forbidden Sync command id"],
    [/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/u, "network API"],
    [/\b(?:Worker|SharedWorker|ServiceWorker|BroadcastChannel)\b/u, "worker or broadcast API"],
    [/\b(?:localStorage|sessionStorage|indexedDB|navigator\.storage)\b/u, "browser storage API"],
    [/@tauri-apps\/(?:api|plugin-(?:http|fs|shell|opener|sql))/u, "Tauri/native import"],
    [/from\s+["'](?:node:)?(?:fs|http|https|net|tls|dns|child_process|worker_threads)["']/u, "Node native import"],
    [/\b(?:keychain|createOpenAIProvider|openAIProvider|AiProviderSettings|defaultOpenAiModel)\b|["']gpt-5\.5["']/iu, "provider execution or secret surface"],
    [/<(?:TextField|input|textarea|select)\b[\s\S]{0,400}\b(?:label|name|placeholder|type)=["'][^"']*(?:api\s*key|apikey|token|secret|credential|password|provider|model|endpoint|remote|url|path)/iu, "secret-like settings form field"],
    [/<input\b[\s\S]{0,240}\btype=["']password["']/iu, "password input"],
    [/from\s+["'][^"']*(?:plugins\/(?:ai|sync)|\.\.\/plugins\/(?:ai|sync)|\.\.\/(?:ai|sync))(?:\/[^"']*)?["']/u, "private AI or Sync plugin import"],
  ] as const;

  for (const [pattern, label] of forbiddenPatterns) {
    if (pattern.test(source)) {
      violations.push(`${filePath}: ${label}`);
    }
  }

  if (
    !/^src\/shell\/hosts\//u.test(filePath) &&
    /["']openai["']/iu.test(source)
  ) {
    violations.push(`${filePath}: provider execution or secret surface`);
  }

  return violations;
}

function toRepoRelativePath(filePath: string): string {
  return path.relative(repoRoot, filePath).replace(/\\/gu, "/");
}

async function runGitLines(args: readonly string[]): Promise<string[]> {
  const stdout = await runGitOutput(args);

  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

async function runGitOutput(args: readonly string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd: repoRoot,
  });

  return stdout;
}
