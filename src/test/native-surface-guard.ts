import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const execFileAsync = promisify(execFile);

const reviewedTask033ReleaseFiles = new Set([
  "package.json",
  "src-tauri/Cargo.toml",
]);

const reviewedTask035DependencyFiles = new Set(["package.json", "bun.lock"]);

const reviewedTask035MuiDependencies = [
  "@emotion/react",
  "@emotion/styled",
  "@mui/icons-material",
  "@mui/material",
] as const;

const reviewedTask033Diffs = new Map<
  string,
  {
    added: readonly string[];
    removed: readonly string[];
  }
>([
  [
    "package.json",
    {
      removed: [
        '-    "check:full": "bun run check:quick && bun run tauri build"',
      ],
      added: [
        '+    "check:full": "bun run check:quick && bun run tauri build --ci --bundles deb,rpm"',
      ],
    },
  ],
  [
    "src-tauri/Cargo.toml",
    {
      removed: ['-description = "A Tauri App"', '-authors = ["you"]'],
      added: ['+description = "Markdown-first local time-management desktop app"'],
    },
  ],
]);

export async function disallowedNativeSurfaceChanges(
  changedNativeSurfaceFiles: readonly string[],
): Promise<string[]> {
  const disallowedChanges: string[] = [];

  for (const filePath of changedNativeSurfaceFiles) {
    if (
      !reviewedTask033ReleaseFiles.has(filePath) &&
      !reviewedTask035DependencyFiles.has(filePath)
    ) {
      disallowedChanges.push(filePath);
      continue;
    }

    const unreviewedDiff = await findUnreviewedSurfaceDiff(filePath);

    if (unreviewedDiff !== undefined) {
      disallowedChanges.push(`${filePath}: ${unreviewedDiff}`);
    }
  }

  return disallowedChanges;
}

async function findUnreviewedSurfaceDiff(
  filePath: string,
): Promise<string | undefined> {
  if (filePath === "package.json") {
    return findUnreviewedPackageJsonDiff(filePath);
  }

  if (filePath === "bun.lock") {
    return findUnreviewedBunLockDiff(filePath);
  }

  return findUnreviewedTask033Diff(filePath);
}

async function findUnreviewedTask033Diff(
  filePath: string,
): Promise<string | undefined> {
  const diff = await runGitOutput([
    "diff",
    "--unified=0",
    "master",
    "--",
    filePath,
  ]);

  if (diff.trim().length === 0) {
    return undefined;
  }

  const reviewedDiff = reviewedTask033Diffs.get(filePath);

  if (reviewedDiff === undefined) {
    return "unreviewed release surface file";
  }

  const actualChangedLines = collectChangedDiffLines(diff);

  if (
    sameStringSet(actualChangedLines.added, reviewedDiff.added) &&
    sameStringSet(actualChangedLines.removed, reviewedDiff.removed)
  ) {
    return undefined;
  }

  return "unreviewed release surface diff";
}

async function findUnreviewedPackageJsonDiff(
  filePath: string,
): Promise<string | undefined> {
  const diff = await runGitOutput([
    "diff",
    "--unified=0",
    "master",
    "--",
    filePath,
  ]);

  if (diff.trim().length === 0) {
    return undefined;
  }

  if (isReviewedTask033StaticDiff(filePath, diff)) {
    return undefined;
  }

  if (await isReviewedTask035PackageJsonDependencyDiff()) {
    return undefined;
  }

  return "unreviewed package.json diff";
}

async function findUnreviewedBunLockDiff(
  filePath: string,
): Promise<string | undefined> {
  const diff = await runGitOutput([
    "diff",
    "--unified=0",
    "master",
    "--",
    filePath,
  ]);

  if (diff.trim().length === 0) {
    return undefined;
  }

  if (await isReviewedTask035BunLockDependencyDiff()) {
    return undefined;
  }

  return "unreviewed bun.lock diff";
}

function isReviewedTask033StaticDiff(filePath: string, diff: string): boolean {
  const reviewedDiff = reviewedTask033Diffs.get(filePath);

  if (reviewedDiff === undefined) {
    return false;
  }

  const actualChangedLines = collectChangedDiffLines(diff);

  return (
    sameStringSet(actualChangedLines.added, reviewedDiff.added) &&
    sameStringSet(actualChangedLines.removed, reviewedDiff.removed)
  );
}

async function isReviewedTask035PackageJsonDependencyDiff(): Promise<boolean> {
  const currentPackage = await readPackageJsonFromWorktree("package.json");
  const basePackage = parseJsonRecord(
    await runGitOutput(["show", "master:package.json"]),
  );

  if (
    stableStringify({
      ...currentPackage,
      dependencies: basePackage.dependencies,
    }) !== stableStringify(basePackage)
  ) {
    return false;
  }

  const dependencyDiff = diffStringRecordProperties(
    asStringRecord(basePackage.dependencies),
    asStringRecord(currentPackage.dependencies),
  );

  return isExactlyReviewedTask035DependencyDiff(dependencyDiff);
}

async function isReviewedTask035BunLockDependencyDiff(): Promise<boolean> {
  const currentLock = await readFile(path.join(repoRoot, "bun.lock"), "utf8");
  const baseLock = await runGitOutput(["show", "master:bun.lock"]);
  const currentDependencies = parseBunLockWorkspaceDependencyBlock(
    currentLock,
    "dependencies",
  );
  const baseDependencies = parseBunLockWorkspaceDependencyBlock(
    baseLock,
    "dependencies",
  );
  const currentDevDependencies = parseBunLockWorkspaceDependencyBlock(
    currentLock,
    "devDependencies",
  );
  const baseDevDependencies = parseBunLockWorkspaceDependencyBlock(
    baseLock,
    "devDependencies",
  );

  if (
    currentDependencies === undefined ||
    baseDependencies === undefined ||
    currentDevDependencies === undefined ||
    baseDevDependencies === undefined
  ) {
    return false;
  }

  if (!sameStringRecord(currentDevDependencies, baseDevDependencies)) {
    return false;
  }

  return isExactlyReviewedTask035DependencyDiff(
    diffStringRecordProperties(baseDependencies, currentDependencies),
  );
}

function isExactlyReviewedTask035DependencyDiff(diff: {
  added: string[];
  changed: string[];
  removed: string[];
  values: Record<string, string>;
}): boolean {
  return (
    sameStringSet(diff.added, reviewedTask035MuiDependencies) &&
    diff.changed.length === 0 &&
    diff.removed.length === 0 &&
    reviewedTask035MuiDependencies.every((dependencyName) =>
      isRegistryVersionSpecifier(diff.values[dependencyName]),
    )
  );
}

async function readPackageJsonFromWorktree(filePath: string): Promise<JsonRecord> {
  return parseJsonRecord(await readFile(path.join(repoRoot, filePath), "utf8"));
}

function parseJsonRecord(contents: string): JsonRecord {
  const value = JSON.parse(contents) as unknown;

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Expected JSON object");
  }

  return value as JsonRecord;
}

function parseBunLockWorkspaceDependencyBlock(
  contents: string,
  propertyName: "dependencies" | "devDependencies",
): Record<string, string> | undefined {
  const workspacesIndex = contents.indexOf('"workspaces"');
  const propertyIndex = contents.indexOf(`"${propertyName}": {`, workspacesIndex);

  if (workspacesIndex < 0 || propertyIndex < 0) {
    return undefined;
  }

  const openBraceIndex = contents.indexOf("{", propertyIndex);
  const closeBraceIndex = findMatchingBrace(contents, openBraceIndex);

  if (openBraceIndex < 0 || closeBraceIndex === undefined) {
    return undefined;
  }

  const block = contents.slice(openBraceIndex + 1, closeBraceIndex);
  const entries = [...block.matchAll(/^\s*"([^"]+)":\s*"([^"]+)",?\s*$/gm)];

  return Object.fromEntries(
    entries.map((entry) => [entry[1] ?? "", entry[2] ?? ""]),
  );
}

function findMatchingBrace(
  contents: string,
  openBraceIndex: number,
): number | undefined {
  if (openBraceIndex < 0) {
    return undefined;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = openBraceIndex; index < contents.length; index += 1) {
    const character = contents[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (character === "\\") {
      escaped = inString;
      continue;
    }

    if (character === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;

      if (depth === 0) {
        return index;
      }
    }
  }

  return undefined;
}

function diffStringRecordProperties(
  baseRecord: Record<string, string>,
  currentRecord: Record<string, string>,
): {
  added: string[];
  changed: string[];
  removed: string[];
  values: Record<string, string>;
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
    values: currentRecord,
  };
}

function asStringRecord(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function sameStringRecord(
  actual: Record<string, string>,
  expected: Record<string, string>,
): boolean {
  return stableStringify(actual) === stableStringify(expected);
}

function isRegistryVersionSpecifier(value: string | undefined): boolean {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    !/^(?:https?:|git(?:\+|:)|file:|link:|portal:|workspace:)/iu.test(value)
  );
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  if (typeof value !== "object" || value === null) {
    return JSON.stringify(value) ?? "undefined";
  }

  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, child]) => `${JSON.stringify(key)}:${stableStringify(child)}`)
    .join(",")}}`;
}

function collectChangedDiffLines(diff: string): {
  added: string[];
  removed: string[];
} {
  const added: string[] = [];
  const removed: string[] = [];

  for (const line of diff.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---")) {
      continue;
    }

    if (line.startsWith("+")) {
      added.push(line);
    } else if (line.startsWith("-")) {
      removed.push(line);
    }
  }

  return { added, removed };
}

type JsonRecord = Record<string, unknown>;

function sameStringSet(
  actual: readonly string[],
  expected: readonly string[],
): boolean {
  return (
    actual.length === expected.length &&
    [...actual].sort().every((value, index) => value === [...expected].sort()[index])
  );
}

async function runGitOutput(args: readonly string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd: repoRoot });

  return stdout;
}
