import { execFile } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import { disallowedNativeSurfaceChanges } from "./native-surface-guard";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const execFileAsync = promisify(execFile);

const appShellEntrypoints = [
  "src/App.tsx",
  "src/main.tsx",
  "src/shell",
  "src/providers",
];
const providerEntrypoints = ["src/providers"];
const pluginEntrypoints = ["src/plugins"];

const tauriBoundaryFiles = [
  "src-tauri/tauri.conf.json",
  "src-tauri/capabilities/default.json",
  "src-tauri/src/lib.rs",
  "src-tauri/src/commands/mod.rs",
];

const nativeSurfaceEntrypoints = [
  "src-tauri/Cargo.lock",
  "src-tauri/Cargo.toml",
  "src-tauri/build.rs",
  "src-tauri/capabilities",
  "src-tauri/permissions",
  "src-tauri/src/commands",
  "src-tauri/src/lib.rs",
  "src-tauri/src/main.rs",
  "src-tauri/tauri.conf.json",
];
const task017AllowedNativeImplementationFiles = new Set([
  "src-tauri/src/commands/db.rs",
]);
const forbiddenTask017AllowedNativeDiffPatterns = new Map<RegExp, string>([
  [/^\+\s*#\s*\[\s*tauri::command\b/m, "added Tauri command attribute"],
]);

const sourceExtensions = new Set([".ts", ".tsx"]);

describe("App Shell bootstrap boundary", () => {
  it("keeps App Shell production files free of direct Tauri API imports", async () => {
    const appShellFiles = await listExistingSourceFiles(appShellEntrypoints);
    const violations: string[] = [];

    expect(appShellFiles).toContain(path.join(repoRoot, "src", "App.tsx"));
    expect(appShellFiles).toContain(path.join(repoRoot, "src", "main.tsx"));

    for (const filePath of appShellFiles) {
      const contents = await readFile(filePath, "utf8");

      if (containsRawTauriAccess(contents)) {
        violations.push(path.relative(repoRoot, filePath));
      }
    }

    expect(violations).toStrictEqual([]);
  });

  it("keeps App Shell out of task, habit, timer, calendar, and editor business behavior", async () => {
    const appShellFiles = await listExistingSourceFiles(appShellEntrypoints);
    const violations: string[] = [];

    for (const filePath of appShellFiles) {
      const contents = await readFile(filePath, "utf8");
      const forbiddenPatterns = findBusinessBehaviorPatterns(contents);

      for (const pattern of forbiddenPatterns) {
        violations.push(`${path.relative(repoRoot, filePath)}: ${pattern}`);
      }
    }

    expect(violations).toStrictEqual([]);
  });

  it("keeps App Shell imports out of business plugin and Core owner modules", async () => {
    const appShellFiles = await listExistingSourceFiles(appShellEntrypoints);
    const violations: string[] = [];

    for (const filePath of appShellFiles) {
      const contents = await readFile(filePath, "utf8");
      const moduleSpecifiers = collectStaticModuleSpecifiers(contents);

      for (const moduleSpecifier of moduleSpecifiers) {
        const forbiddenBoundary = findForbiddenAppShellImport(moduleSpecifier);

        if (forbiddenBoundary !== undefined) {
          violations.push(
            `${path.relative(repoRoot, filePath)} -> ${moduleSpecifier}: ${forbiddenBoundary}`,
          );
        }
      }
    }

    expect(violations).toStrictEqual([]);
  });

  it("keeps provider modules from exposing an importable raw runtime source context", async () => {
    const providerFiles = await listExistingSourceFiles(providerEntrypoints);
    const violations: string[] = [];

    for (const filePath of providerFiles) {
      const relativePath = toRepoRelativePath(filePath);
      const contents = await readFile(filePath, "utf8");

      violations.push(
        ...findRawRuntimeProviderExposure(relativePath, contents).map(
          (violation) => `${relativePath}: ${violation}`,
        ),
      );
    }

    expect(violations).toStrictEqual([]);
  });

  it("keeps RuntimeProvider from exposing raw runtime through render-prop children", async () => {
    const runtimeProviderPath = path.join(
      repoRoot,
      "src",
      "providers",
      "RuntimeProvider.tsx",
    );
    const contents = await readFile(runtimeProviderPath, "utf8");

    expect(
      findRuntimeProviderRenderPropExposure(contents).map(
        (violation) => `src/providers/RuntimeProvider.tsx: ${violation}`,
      ),
    ).toStrictEqual([]);
  });

  it("keeps App runtime initialization typed to the trusted AppRuntime contract", async () => {
    const appPath = path.join(repoRoot, "src", "App.tsx");
    const contents = await readFile(appPath, "utf8");

    expect(
      findBroadAppRuntimeInitializerContract(contents).map(
        (violation) => `src/App.tsx: ${violation}`,
      ),
    ).toStrictEqual([]);
  });

  it("keeps plugin production modules from importing app-shell host internals", async () => {
    const pluginFiles = await listExistingSourceFiles(pluginEntrypoints);
    const violations: string[] = [];

    for (const filePath of pluginFiles) {
      const contents = await readFile(filePath, "utf8");

      for (const moduleSpecifier of collectStaticModuleSpecifiers(contents)) {
        const forbiddenImport = findForbiddenPluginShellImport(
          filePath,
          moduleSpecifier,
        );

        if (forbiddenImport !== undefined) {
          violations.push(
            `${toRepoRelativePath(filePath)} -> ${moduleSpecifier}: ${forbiddenImport}`,
          );
        }
      }
    }

    expect(violations).toStrictEqual([]);
  });

  it("does not require new Tauri commands, capabilities, or config for runtime bootstrap", async () => {
    const files = await listExistingFiles(tauriBoundaryFiles);
    const violations: string[] = [];

    expect(files).not.toHaveLength(0);

    for (const filePath of files) {
      const contents = await readFile(filePath, "utf8");
      const forbiddenPatterns = findBootstrapNativeExpansionPatterns(contents);

      for (const pattern of forbiddenPatterns) {
        violations.push(`${path.relative(repoRoot, filePath)}: ${pattern}`);
      }
    }

    expect(violations).toStrictEqual([]);
  });

  it("keeps the complete native command and capability surface unchanged from master except reviewed TASK-017 DB body validation", async () => {
    const changedNativeSurfaceFiles = await listNativeSurfaceChangesFromMaster();

    expect(
      await disallowedNativeSurfaceChanges(changedNativeSurfaceFiles),
    ).toStrictEqual([]);
  });
});

async function listExistingSourceFiles(
  relativePaths: readonly string[],
): Promise<string[]> {
  const fileGroups = await Promise.all(
    relativePaths.map((relativePath) =>
      listSourceFilesIfExists(path.join(repoRoot, relativePath)),
    ),
  );

  return fileGroups.flat().sort();
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

async function listExistingFiles(
  relativePaths: readonly string[],
): Promise<string[]> {
  const fileChecks = await Promise.all(
    relativePaths.map(async (relativePath) => {
      const absolutePath = path.join(repoRoot, relativePath);
      const entry = await statIfExists(absolutePath);

      return entry?.isFile() === true ? [absolutePath] : [];
    }),
  );

  return fileChecks.flat().sort();
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

function containsRawTauriAccess(contents: string): boolean {
  return (
    /from\s+["']@tauri-apps\/api(?:\/[^"']*)?["']/.test(contents) ||
    /import\s*\(\s*["']@tauri-apps\/api(?:\/[^"']*)?["']\s*\)/.test(
      contents,
    ) ||
    /\bwindow\.__TAURI__\b/.test(contents)
  );
}

function findBusinessBehaviorPatterns(contents: string): string[] {
  const patterns = new Map<RegExp, string>([
    [
      /\bruntime\.commands\.execute\(\s*["'](?:task|habit|timer|calendar|editor)\./i,
      "direct plugin command execution",
    ],
    [
      /\b(?:toggle|complete|schedule|start|stop|save|create|delete)(?:Task|Habit|Timer|Calendar|Editor)\b/,
      "business action handler",
    ],
    [
      /\b(?:Task|Habit|Timer|Calendar|Editor)(?:Store|Service|Repository|Controller|Manager)\b/,
      "business state/service owner",
    ],
    [
      /\bMarkdownPageEditor\b/,
      "direct Markdown editor component reference",
    ],
  ]);

  return [...patterns.entries()]
    .filter(([pattern]) => pattern.test(contents))
    .map(([, description]) => description);
}

function collectStaticModuleSpecifiers(contents: string): string[] {
  const specifiers: string[] = [];
  const importExportPattern =
    /\b(?:import|export)\s+(?:type\s+)?(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g;
  const sideEffectImportPattern = /\bimport\s*["']([^"']+)["']/g;

  for (const match of contents.matchAll(importExportPattern)) {
    const moduleSpecifier = match[1];

    if (moduleSpecifier !== undefined) {
      specifiers.push(moduleSpecifier);
    }
  }

  for (const match of contents.matchAll(sideEffectImportPattern)) {
    const moduleSpecifier = match[1];

    if (moduleSpecifier !== undefined) {
      specifiers.push(moduleSpecifier);
    }
  }

  return [...new Set(specifiers)].sort();
}

function findForbiddenAppShellImport(moduleSpecifier: string): string | undefined {
  const normalized = moduleSpecifier.toLowerCase();
  const forbiddenPatterns = new Map<RegExp, string>([
    [
      /(?:^|\/)(?:task|tasks|habit|habits|timer|timers|calendar|calendars|editor)(?:$|[-_/])/,
      "business plugin module",
    ],
    [
      /(?:^|\/)plugins\/(?:task|tasks|habit|habits|timer|timers|calendar|calendars|editor)(?:$|[-_/])/,
      "business plugin implementation",
    ],
    [
      /(?:^|\/)plugins\/markdown-editor(?:$|\/)/,
      "Markdown editor plugin implementation",
    ],
    [
      /(?:^|\/)plugins\/(?!index(?:$|\.|\/))[^"']+/,
      "business plugin implementation",
    ],
    [
      /(?:^|\/)core\/(?:stores|services|commands|events|metadata|filters|views|slots)(?:$|\/)/,
      "Core owner module",
    ],
  ]);

  for (const [pattern, description] of forbiddenPatterns) {
    if (pattern.test(normalized)) {
      return description;
    }
  }

  return undefined;
}

function findRawRuntimeProviderExposure(
  relativePath: string,
  contents: string,
): string[] {
  const violations: string[] = [];

  if (/^src\/providers\/runtime-source-context\.tsx?$/u.test(relativePath)) {
    violations.push("raw runtime source context module is importable");
  }

  const forbiddenExports = new Map<RegExp, string>([
    [
      /\bexport\s+const\s+RuntimeSourceContext\b/u,
      "exports raw RuntimeSourceContext",
    ],
    [
      /\bexport\s+function\s+useRuntimeSource\b/u,
      "exports raw useRuntimeSource hook",
    ],
    [
      /\bexport\s*\{[^}]*\b(?:RuntimeSourceContext|useRuntimeSource)\b[^}]*\}/su,
      "re-exports raw runtime source context or hook",
    ],
  ]);

  for (const [pattern, description] of forbiddenExports) {
    if (pattern.test(contents)) {
      violations.push(description);
    }
  }

  return violations;
}

function findRuntimeProviderRenderPropExposure(contents: string): string[] {
  const violations: string[] = [];
  const forbiddenPatterns = new Map<RegExp, string>([
    [
      /\btype\s+RuntimeProviderChild\b[^=]*=\s*(?:[^;]*\|\s*)?\(\s*\(?\s*runtime\s*:\s*Runtime\b/su,
      "RuntimeProviderChild accepts a runtime render-prop function",
    ],
    [
      /\bchildren\s*:\s*RuntimeProviderChild\b/u,
      "RuntimeProvider props expose render-prop children",
    ],
    [
      /\bfunction\s+renderRuntimeChildren\b/u,
      "renderRuntimeChildren helper can invoke children with raw runtime",
    ],
    [
      /\brenderRuntimeChildren\s*\(\s*children\s*,\s*(?:runtime|state\.runtime)\s*\)/u,
      "RuntimeProvider passes raw initialized runtime to children",
    ],
    [
      /\btypeof\s+children\s*===\s*["']function["']\s*\?\s*children\s*\(\s*runtime\s*\)/su,
      "RuntimeProvider invokes function children with raw runtime",
    ],
  ]);

  for (const [pattern, description] of forbiddenPatterns) {
    if (pattern.test(contents)) {
      violations.push(description);
    }
  }

  return violations;
}

function findBroadAppRuntimeInitializerContract(contents: string): string[] {
  const violations: string[] = [];
  const forbiddenPatterns = new Map<RegExp, string>([
    [
      /\binitializeRuntime\s*\?:\s*RuntimeInitializer\s*<\s*RuntimeSource\s*>/u,
      "App initializeRuntime prop accepts the broad RuntimeSource contract",
    ],
    [
      /<RuntimeProvider\s*<\s*RuntimeSource\s*>/u,
      "App narrows RuntimeProvider to RuntimeSource instead of trusted AppRuntime",
    ],
    [
      /\bas\s+AppRuntime\b/u,
      "App casts a broad runtime source back to AppRuntime",
    ],
  ]);

  for (const [pattern, description] of forbiddenPatterns) {
    if (pattern.test(contents)) {
      violations.push(description);
    }
  }

  return violations;
}

function findForbiddenPluginShellImport(
  importerPath: string,
  moduleSpecifier: string,
): string | undefined {
  const resolvedPath = resolveModuleSpecifier(importerPath, moduleSpecifier);

  if (
    resolvedPath === "src/shell" ||
    resolvedPath.startsWith("src/shell/")
  ) {
    return "app-shell host internals";
  }

  return undefined;
}

function resolveModuleSpecifier(
  importerPath: string,
  moduleSpecifier: string,
): string {
  if (!moduleSpecifier.startsWith(".")) {
    return moduleSpecifier.replace(/\\/gu, "/");
  }

  return path
    .relative(repoRoot, path.resolve(path.dirname(importerPath), moduleSpecifier))
    .replace(/\\/gu, "/");
}

function findBootstrapNativeExpansionPatterns(contents: string): string[] {
  const patterns = new Map<RegExp, string>([
    [
      /\b(?:app_bootstrap|bootstrap_runtime|create_app_runtime|load_builtin_plugins|activate_builtin_plugins|runtime_provider)\b/i,
      "runtime bootstrap native command or permission",
    ],
    [
      /\b(?:allow-fs|fs:|path:|shell:|sql:|tauri-plugin-sql)\b/i,
      "broad native capability for app bootstrap",
    ],
  ]);

  return [...patterns.entries()]
    .filter(([pattern]) => pattern.test(contents))
    .map(([, description]) => description);
}

async function listNativeSurfaceChangesFromMaster(): Promise<string[]> {
  const changedTrackedFiles = await runGitLines([
    "diff",
    "--name-only",
    "master",
    "--",
    ...nativeSurfaceEntrypoints,
  ]);
  const untrackedFiles = await runGitLines([
    "ls-files",
    "--others",
    "--exclude-standard",
    "--",
    ...nativeSurfaceEntrypoints,
  ]);

  const changedFiles = [...new Set([...changedTrackedFiles, ...untrackedFiles])].sort();
  const disallowedChanges: string[] = [];

  for (const filePath of changedFiles) {
    if (!task017AllowedNativeImplementationFiles.has(filePath)) {
      disallowedChanges.push(filePath);
      continue;
    }

    const forbiddenAllowedChange =
      await findForbiddenTask017AllowedNativeChange(filePath);

    if (forbiddenAllowedChange !== undefined) {
      disallowedChanges.push(`${filePath}: ${forbiddenAllowedChange}`);
    }
  }

  return disallowedChanges;
}

async function findForbiddenTask017AllowedNativeChange(
  relativePath: string,
): Promise<string | undefined> {
  const diff = await runGitOutput([
    "diff",
    "--unified=0",
    "master",
    "--",
    relativePath,
  ]);

  for (const [pattern, description] of forbiddenTask017AllowedNativeDiffPatterns) {
    if (pattern.test(diff)) {
      return description;
    }
  }

  return undefined;
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
