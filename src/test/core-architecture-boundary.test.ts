import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const forbiddenCoreTerms = new Set([
  "task",
  "habit",
  "timer",
  "calendar",
  "heatmap",
  "stats",
  "chart",
  "ml",
  "ai",
]);

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const coreDirectory = path.join(repoRoot, "src", "core");
const sourceExtensions = new Set([".ts", ".tsx"]);
const testFilePattern = /\.(test|spec)\.[cm]?[tj]sx?$/;

describe("Core architecture boundary", () => {
  it("keeps production Core files free of business-plugin terms", async () => {
    const productionFiles = await listProductionSourceFiles(coreDirectory);
    const violations = new Map<string, Set<string>>();

    expect(productionFiles).not.toHaveLength(0);

    for (const filePath of productionFiles) {
      const contents = await readFile(filePath, "utf8");
      const foundTerms = findForbiddenTerms(contents);

      if (foundTerms.size > 0) {
        violations.set(path.relative(repoRoot, filePath), foundTerms);
      }
    }

    expect(formatViolations(violations)).toEqual([]);
  });
});

async function listProductionSourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });

  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        return listProductionSourceFiles(entryPath);
      }

      if (
        entry.isFile() &&
        sourceExtensions.has(path.extname(entry.name)) &&
        !testFilePattern.test(entry.name)
      ) {
        return [entryPath];
      }

      return [];
    }),
  );

  return files.flat();
}

function findForbiddenTerms(contents: string): Set<string> {
  const foundTerms = new Set<string>();
  const identifierTokens = contents.match(/[A-Za-z][A-Za-z0-9]*/g) ?? [];

  for (const token of identifierTokens) {
    for (const part of splitIdentifier(token)) {
      if (forbiddenCoreTerms.has(part)) {
        foundTerms.add(part);
      }
    }
  }

  return foundTerms;
}

function splitIdentifier(identifier: string): string[] {
  return identifier
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .map((part) => part.toLowerCase())
    .filter(Boolean);
}

function formatViolations(violations: Map<string, Set<string>>): string[] {
  return [...violations.entries()].map(
    ([filePath, terms]) => `${filePath}: ${[...terms].sort().join(", ")}`,
  );
}
