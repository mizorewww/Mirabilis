import { execFile } from "node:child_process";
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
      added: [
        '+description = "Markdown-first local time-management desktop app"',
        '+authors = ["Mirabilis contributors"]',
      ],
    },
  ],
]);

export async function disallowedNativeSurfaceChanges(
  changedNativeSurfaceFiles: readonly string[],
): Promise<string[]> {
  const disallowedChanges: string[] = [];

  for (const filePath of changedNativeSurfaceFiles) {
    if (!reviewedTask033ReleaseFiles.has(filePath)) {
      disallowedChanges.push(filePath);
      continue;
    }

    const unreviewedDiff = await findUnreviewedTask033Diff(filePath);

    if (unreviewedDiff !== undefined) {
      disallowedChanges.push(`${filePath}: ${unreviewedDiff}`);
    }
  }

  return disallowedChanges;
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
