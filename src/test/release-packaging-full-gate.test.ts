import { execFile } from "node:child_process";
import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const tauriRoot = path.join(repoRoot, "src-tauri");
const execFileAsync = promisify(execFile);

const releaseNotesSurfaceCandidates = [
  "CHANGELOG.md",
  "RELEASE_NOTES.md",
  "RELEASE.md",
  "docs/CHANGELOG.md",
  "docs/release-notes.md",
  "docs/release/README.md",
  "docs/release/packaging.md",
  "docs/testing/release-packaging.md",
  "docs/development/release-packaging.md",
] as const;

const releasePolicyDocs = [
  "docs/testing/strategy.md",
  "docs/development/02-implementation-roadmap-and-constraints.md",
] as const;

type PackageJson = {
  scripts?: Record<string, string>;
  version?: string;
};

type TauriConfig = {
  app?: {
    security?: Record<string, unknown>;
    windows?: unknown[];
  };
  build?: {
    beforeBuildCommand?: string;
    devUrl?: string;
    frontendDist?: string;
  };
  bundle?: {
    active?: boolean;
    icon?: string[];
    linux?: Record<
      string,
      {
        desktopTemplate?: string;
        files?: Record<string, string>;
      }
    >;
    targets?: string | string[];
  };
  plugins?: Record<string, unknown>;
  version?: string;
};

type CargoPackageMetadata = {
  deprecatedAuthors: string[];
  description?: string;
  version?: string;
};

describe("release packaging local full gate", () => {
  it("runs quick checks before an unattended explicit deb/rpm Tauri build without release bypasses", async () => {
    const checkFullScript = await readPackageScript("check:full");
    const normalizedScript = normalizeShell(checkFullScript);
    const quickIndex = normalizedScript.indexOf("bun run check:quick");
    const tauriBuildIndex = normalizedScript.search(/\btauri\s+build\b/);
    const tauriBuildSegment = extractTauriBuildSegment(checkFullScript);
    const bundleTargets = collectBundleTargets(tauriBuildSegment);
    const failFastViolations = findFullGateFailFastViolations(checkFullScript);
    const forbiddenBypasses = findForbiddenFullGateBypasses(checkFullScript);

    expect(quickIndex, "check:full must run check:quick").toBeGreaterThanOrEqual(0);
    expect(tauriBuildIndex, "check:full must run tauri build").toBeGreaterThanOrEqual(
      0,
    );
    expect(
      quickIndex,
      "check:full must run check:quick before tauri build",
    ).toBeLessThan(tauriBuildIndex);
    expect(
      failFastViolations,
      "check:full must fail fast from check:quick into tauri build with &&",
    ).toStrictEqual([]);
    expect(
      commandTokens(tauriBuildSegment),
      "Tauri build must run in unattended CI mode",
    ).toContain("--ci");
    expect(
      [...new Set(bundleTargets)].sort(),
      "local full gate must build explicit local Linux bundles",
    ).toStrictEqual(["deb", "rpm"]);
    expect(forbiddenBypasses).toStrictEqual([]);
  });

  it("rejects release gates that can package after quick checks fail", () => {
    const failFastScript =
      "bun run check:quick && bun run tauri build --ci --bundles deb,rpm";
    const nonFailFastScripts = new Map<string, string>([
      [
        "semicolon",
        "bun run check:quick; bun run tauri build --ci --bundles deb,rpm",
      ],
      [
        "fallback",
        "bun run check:quick || bun run tauri build --ci --bundles deb,rpm",
      ],
      [
        "mixed fallback",
        "bun run check:quick && echo quick-passed || bun run tauri build --ci --bundles deb,rpm",
      ],
      [
        "interposed command",
        "bun run check:quick && echo quick-passed && bun run tauri build --ci --bundles deb,rpm",
      ],
    ]);
    const falseNegatives = [...nonFailFastScripts.entries()]
      .filter(([, script]) => findFullGateFailFastViolations(script).length === 0)
      .map(([label]) => label);

    expect(findFullGateFailFastViolations(failFastScript)).toStrictEqual([]);
    expect(falseNegatives).toStrictEqual([]);
  });

  it("keeps the Tauri bundle configuration local, active, and backed by checked-in assets", async () => {
    const tauriConfig = await readJsonFile<TauriConfig>("src-tauri/tauri.conf.json");

    expect(tauriConfig.bundle?.active).toBe(true);
    expect(tauriConfig.build?.beforeBuildCommand).toBe("bun run build");
    expect(tauriConfig.build?.frontendDist).toBe("../dist");
    expect(isLocalFilesystemPath(tauriConfig.build?.frontendDist)).toBe(true);
    expect(isLocalhostDevUrl(tauriConfig.build?.devUrl)).toBe(true);

    const referencedAssets = collectTauriReferencedAssets(tauriConfig);

    expect(referencedAssets).toEqual(
      expect.arrayContaining([
        "icons/32x32.png",
        "icons/128x128.png",
        "icons/128x128@2x.png",
        "icons/icon.png",
        "icons/icon.icns",
        "icons/icon.ico",
        "linux/desktop-template.desktop",
        "../public/Mirabilis.svg",
      ]),
    );

    const missingAssets = await missingTauriAssets(referencedAssets);

    expect(missingAssets).toStrictEqual([]);
  });

  it("makes AppImage status explicit instead of hiding it behind implicit all-target packaging", async () => {
    const checkFullScript = await readPackageScript("check:full");
    const tauriBuildSegment = extractTauriBuildSegment(checkFullScript);
    const bundleTargets = collectBundleTargets(tauriBuildSegment);
    const releaseCheckerInstructions = await readReleaseCheckerInstructions();
    const releasePolicyText = await readExistingFiles(releasePolicyDocs);

    expect(
      [...new Set(bundleTargets)].sort(),
      "check:full must not depend on bundle.targets = all or implicit AppImage",
    ).toStrictEqual(["deb", "rpm"]);
    expect(bundleTargets).not.toContain("appimage");
    expect(releaseCheckerInstructions).toMatch(/appimage/i);
    expect(releaseCheckerInstructions).toMatch(
      /\b(?:deferred|controlled(?:\s|-)?builder|controlled environment|not validated locally|not passed locally)\b/i,
    );
    expect(releasePolicyText).toMatch(/appimage/i);
    expect(releasePolicyText).toMatch(
      /\b(?:deferred|controlled(?:\s|-)?builder|controlled environment|not validated locally|not passed locally)\b/i,
    );
  });

  it("keeps package, Tauri, and Cargo versions synchronized", async () => {
    const packageJson = await readJsonFile<PackageJson>("package.json");
    const tauriConfig = await readJsonFile<TauriConfig>("src-tauri/tauri.conf.json");
    const cargoMetadata = await readCargoPackageMetadata();

    expect(packageJson.version).toMatch(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/);
    expect(tauriConfig.version).toBe(packageJson.version);
    expect(cargoMetadata.version).toBe(packageJson.version);
  });

  it("uses non-placeholder Cargo release metadata", async () => {
    const cargoMetadata = await readCargoPackageMetadata();

    expect(cargoMetadata.description?.trim()).toBeTruthy();
    expect(cargoMetadata.description).not.toBe("A Tauri App");
    expect(cargoMetadata.description).not.toMatch(/^tauri app$/i);
  });

  it("does not depend on deprecated Cargo authors metadata", async () => {
    const cargoMetadata = await readCargoPackageMetadata();

    expect(cargoMetadata.deprecatedAuthors).toStrictEqual([]);
  });

  it("requires a release notes surface that the local release docs and checker can verify", async () => {
    const releaseNotesSurfaces = await existingReleaseNotesSurfaces();
    const releasePolicyText = await readExistingFiles(releasePolicyDocs);
    const releaseCheckerInstructions = await readReleaseCheckerInstructions();

    expect(releaseNotesSurfaces).not.toStrictEqual([]);
    expect(releasePolicyText).toMatch(/\b(?:changelog|release notes?)\b/i);
    expect(releaseCheckerInstructions).toMatch(/\brelease notes?\b/i);
  });

  it("gives release_checker a concrete local-readiness checklist without GitHub CI dependence", async () => {
    const instructions = await readReleaseCheckerInstructions();
    const checklistExpectations = new Map<RegExp, string>([
      [/\bbun run check:full\b/, "full local gate command"],
      [/\bcheck:full\b[\s\S]*\b(?:deb|rpm)\b|\b(?:deb|rpm)\b[\s\S]*\bcheck:full\b/i, "bundle targets"],
      [/\bbundle\b[\s\S]*\bartifacts?\b|\bartifacts?\b[\s\S]*\bbundle\b/i, "bundle artifacts"],
      [/\bversion\b[\s\S]*\bpackage\.json\b[\s\S]*\btauri\.conf\.json\b[\s\S]*\bCargo\.toml\b/i, "version sync files"],
      [/\brelease notes?\b|\bchangelog\b[\s\S]*\brelease notes?\b/i, "changelog or release notes"],
      [/\bappimage\b[\s\S]*\b(?:deferred|controlled(?:\s|-)?builder|controlled environment|not validated locally|not passed locally)\b/i, "AppImage status"],
      [/\bGitHub CI\b[\s\S]*\b(?:not required|without|absence|independent)\b/i, "no GitHub CI dependency"],
    ]);
    const missingExpectations = [...checklistExpectations.entries()]
      .filter(([pattern]) => !pattern.test(instructions))
      .map(([, label]) => label);

    expect(missingExpectations).toStrictEqual([]);
  });

  it("keeps updater, signing, secrets, and generated release artifacts out of tracked release scope", async () => {
    const tauriConfig = await readJsonFile<TauriConfig>("src-tauri/tauri.conf.json");
    const trackedFiles = await runGitLines(["ls-files"]);
    const trackedForbiddenArtifacts = trackedFiles.filter(isForbiddenTrackedReleaseFile);
    const signingMaterialFiles = trackedFiles.filter(isSigningMaterialPath);
    const nativeConfigTexts = await readTrackedConfigTexts([
      "package.json",
      "src-tauri/Cargo.toml",
      "src-tauri/tauri.conf.json",
      "src-tauri/capabilities",
      "src-tauri/permissions",
    ]);
    const updaterOrSigningMarkers = nativeConfigTexts.flatMap(({ filePath, contents }) =>
      findUpdaterOrSigningMarkers(filePath, contents),
    );

    expect(tauriConfig.plugins?.updater).toBeUndefined();
    expect(tauriConfig.bundle).not.toHaveProperty("createUpdaterArtifacts");
    expect(trackedForbiddenArtifacts).toStrictEqual([]);
    expect(signingMaterialFiles).toStrictEqual([]);
    expect(updaterOrSigningMarkers).toStrictEqual([]);
  });

  it("keeps native command exposure and default capabilities narrow for release packaging", async () => {
    const exposedCommands = await exposedTauriCommands();
    const capabilityViolations = await broadCapabilityViolations();

    expect(exposedCommands).toStrictEqual([
      "commands::db::db_execute",
      "commands::db::db_transaction",
    ]);
    expect(capabilityViolations).toStrictEqual([]);
  });
});

async function readPackageScript(scriptName: string): Promise<string> {
  const packageJson = await readJsonFile<PackageJson>("package.json");
  const script = packageJson.scripts?.[scriptName];

  if (script === undefined) {
    throw new Error(`package.json script ${scriptName} is missing`);
  }

  return script;
}

async function readJsonFile<T>(relativePath: string): Promise<T> {
  const contents = await readFile(path.join(repoRoot, relativePath), "utf8");

  return JSON.parse(contents) as T;
}

async function readCargoPackageMetadata(): Promise<CargoPackageMetadata> {
  const contents = await readFile(path.join(repoRoot, "src-tauri/Cargo.toml"), "utf8");
  const packageSection = contents.match(/^\[package\]\s*([\s\S]*?)(?=^\[|\z)/m)?.[1];

  if (packageSection === undefined) {
    throw new Error("src-tauri/Cargo.toml is missing a [package] section");
  }

  return {
    deprecatedAuthors: readTomlStringArray(packageSection, "authors"),
    description: readTomlString(packageSection, "description"),
    version: readTomlString(packageSection, "version"),
  };
}

function readTomlString(section: string, key: string): string | undefined {
  return new RegExp(`^${key}\\s*=\\s*"([^"]*)"\\s*$`, "m").exec(section)?.[1];
}

function readTomlStringArray(section: string, key: string): string[] {
  const arrayContents = new RegExp(`^${key}\\s*=\\s*\\[([^\\]]*)\\]\\s*$`, "m").exec(
    section,
  )?.[1];

  if (arrayContents === undefined) {
    return [];
  }

  return [...arrayContents.matchAll(/"([^"]*)"/g)].map((match) => match[1] ?? "");
}

function normalizeShell(script: string): string {
  return script.trim().replace(/\s+/g, " ");
}

function extractTauriBuildSegment(script: string): string {
  return script
    .split(/&&/g)
    .map((segment) => segment.trim())
    .find((segment) => /\btauri\s+build\b/.test(normalizeShell(segment))) ?? "";
}

function commandTokens(command: string): string[] {
  return (
    command
      .match(/"[^"]*"|'[^']*'|[^\s]+/g)
      ?.map((token) => token.replace(/^["']|["']$/g, "")) ?? []
  );
}

function collectBundleTargets(tauriBuildSegment: string): string[] {
  const tokens = commandTokens(tauriBuildSegment);
  const targets: string[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index] ?? "";

    if (token === "-b" || token === "--bundles" || token === "--bundle") {
      for (
        let targetIndex = index + 1;
        targetIndex < tokens.length && !tokens[targetIndex]?.startsWith("-");
        targetIndex += 1
      ) {
        targets.push(...splitBundleTargetToken(tokens[targetIndex] ?? ""));
      }
    } else if (
      token.startsWith("--bundles=") ||
      token.startsWith("--bundle=") ||
      token.startsWith("-b=")
    ) {
      targets.push(...splitBundleTargetToken(token.slice(token.indexOf("=") + 1)));
    }
  }

  return targets.map((target) => target.toLowerCase()).filter(Boolean);
}

function findFullGateFailFastViolations(script: string): string[] {
  const normalizedScript = normalizeShell(script);
  const quickCommand = "bun run check:quick";
  const quickIndex = normalizedScript.indexOf(quickCommand);
  const tauriBuildMatch = /\bbun\s+run\s+tauri\s+build\b|\btauri\s+build\b/.exec(
    normalizedScript,
  );
  const violations: string[] = [];

  if (quickIndex < 0) {
    violations.push("missing check:quick");
  }

  if (tauriBuildMatch === null) {
    violations.push("missing tauri build");
  }

  if (quickIndex < 0 || tauriBuildMatch === null) {
    return violations;
  }

  if (quickIndex >= tauriBuildMatch.index) {
    return ["tauri build must follow check:quick"];
  }

  const betweenCommands = normalizedScript.slice(
    quickIndex + quickCommand.length,
    tauriBuildMatch.index,
  );
  const normalizedConnector = normalizeShell(betweenCommands);
  const controlOperators: string[] = betweenCommands.match(/&&|\|\||;/g) ?? [];

  if (normalizedConnector !== "&&") {
    violations.push("check:quick must be chained directly to tauri build with &&");
  }

  if (controlOperators.includes(";")) {
    violations.push("semicolon allows tauri build after check:quick failure");
  }

  if (controlOperators.includes("||")) {
    violations.push("fallback allows tauri build after check:quick failure");
  }

  return [...new Set(violations)];
}

function splitBundleTargetToken(token: string): string[] {
  return token
    .split(",")
    .map((target) => target.trim())
    .filter(Boolean);
}

function findForbiddenFullGateBypasses(script: string): string[] {
  const forbiddenPatterns = new Map<RegExp, string>([
    [/;/, "non-fail-fast command separator"],
    [/\|\|/, "fallback command separator"],
    [/--no-bundle\b/, "--no-bundle"],
    [/--ignore-version-mismatches\b/, "--ignore-version-mismatches"],
    [/\|\|\s*true\b/, "|| true"],
    [/\b(?:NO_STRIP|APPIMAGE[A-Z0-9_]*|LINUXDEPLOY[A-Z0-9_]*|GDK_PIXBUF[A-Z0-9_]*|LD_LIBRARY_PATH)\s*=/, "hidden environment workaround"],
    [/\b(?:curl|wget|fetch|scp|rsync)\b/, "network transfer command"],
    [/\bgh\s+release\b/, "GitHub release command"],
    [/\b(?:upload|publish)\b/, "upload or publish command"],
    [/\b(?:aws|s3)\b/, "cloud upload command"],
    [/https?:\/\//, "network URL"],
  ]);

  return [...forbiddenPatterns.entries()]
    .filter(([pattern]) => pattern.test(script))
    .map(([, description]) => description);
}

function isLocalFilesystemPath(candidate: string | undefined): boolean {
  if (candidate === undefined || candidate.trim().length === 0) {
    return false;
  }

  return !/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate) && !path.isAbsolute(candidate);
}

function isLocalhostDevUrl(candidate: string | undefined): boolean {
  if (candidate === undefined) {
    return false;
  }

  try {
    const url = new URL(candidate);

    return (
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    );
  } catch {
    return false;
  }
}

function collectTauriReferencedAssets(config: TauriConfig): string[] {
  const assets = new Set<string>();

  for (const iconPath of config.bundle?.icon ?? []) {
    assets.add(iconPath);
  }

  for (const linuxTarget of Object.values(config.bundle?.linux ?? {})) {
    if (linuxTarget.desktopTemplate !== undefined) {
      assets.add(linuxTarget.desktopTemplate);
    }

    for (const sourcePath of Object.values(linuxTarget.files ?? {})) {
      assets.add(sourcePath);
    }
  }

  return [...assets].sort();
}

async function missingTauriAssets(relativePaths: readonly string[]): Promise<string[]> {
  const missing: string[] = [];

  for (const relativePath of relativePaths) {
    if (!isLocalFilesystemPath(relativePath)) {
      missing.push(`${relativePath}: remote or absolute path`);
      continue;
    }

    const absolutePath = path.resolve(tauriRoot, relativePath);

    try {
      await access(absolutePath);
    } catch {
      missing.push(relativePath);
    }
  }

  return missing;
}

async function readReleaseCheckerInstructions(): Promise<string> {
  const contents = await readFile(
    path.join(repoRoot, ".codex/agents/release-checker.toml"),
    "utf8",
  );

  return contents.match(/developer_instructions\s*=\s*"""([\s\S]*?)"""/)?.[1] ?? contents;
}

async function existingReleaseNotesSurfaces(): Promise<string[]> {
  const existingCandidates: string[] = [];

  for (const candidate of releaseNotesSurfaceCandidates) {
    const absolutePath = path.join(repoRoot, candidate);
    const entry = await statIfExists(absolutePath);

    if (entry?.isFile() === true) {
      existingCandidates.push(candidate);
    }
  }

  const documentedSurfaces = await documentedReleaseNotesSurfaces();

  return [...new Set([...existingCandidates, ...documentedSurfaces])].sort();
}

async function documentedReleaseNotesSurfaces(): Promise<string[]> {
  const documentedSurfaces: string[] = [];

  for (const relativePath of releasePolicyDocs) {
    const contents = await readFile(path.join(repoRoot, relativePath), "utf8");

    if (/^#{2,3}\s+.*\b(?:changelog|release notes?)\b/im.test(contents)) {
      documentedSurfaces.push(`${relativePath}#release-notes`);
    }
  }

  return documentedSurfaces;
}

async function readExistingFiles(relativePaths: readonly string[]): Promise<string> {
  const contents: string[] = [];

  for (const relativePath of relativePaths) {
    const absolutePath = path.join(repoRoot, relativePath);
    const entry = await statIfExists(absolutePath);

    if (entry?.isFile() === true) {
      contents.push(await readFile(absolutePath, "utf8"));
    }
  }

  return contents.join("\n");
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

function isForbiddenTrackedReleaseFile(filePath: string): boolean {
  const normalized = normalizeGitPath(filePath);

  return (
    normalized === "dist" ||
    normalized.startsWith("dist/") ||
    normalized.startsWith("src-tauri/target/") ||
    normalized.includes("/target/") ||
    normalized.includes("/release/bundle/") ||
    /\.(?:appimage|deb|rpm|msi|dmg|pkg|log)$/i.test(filePath) ||
    normalized === ".env" ||
    normalized.startsWith(".env.") ||
    normalized.endsWith("/.env") ||
    normalized.includes("/.env.") ||
    normalized.includes("release-artifact")
  );
}

function isSigningMaterialPath(filePath: string): boolean {
  const normalized = normalizeGitPath(filePath);

  return (
    /\.(?:pem|p12|pfx|key|asc|sig)$/i.test(filePath) ||
    normalized.includes("private-key") ||
    normalized.includes("signing-key") ||
    normalized.includes("/secrets/") ||
    normalized.includes("/secret/")
  );
}

function normalizeGitPath(filePath: string): string {
  return filePath.split("\\").join("/").toLowerCase();
}

async function readTrackedConfigTexts(
  pathspecs: readonly string[],
): Promise<Array<{ contents: string; filePath: string }>> {
  const trackedFiles = await runGitLines(["ls-files", "--", ...pathspecs]);
  const readableFiles = trackedFiles.filter(
    (filePath) =>
      !/\.(?:png|jpg|jpeg|gif|webp|ico|icns)$/i.test(filePath) &&
      !filePath.includes("/gen/schemas/"),
  );

  return Promise.all(
    readableFiles.map(async (filePath) => ({
      contents: await readFile(path.join(repoRoot, filePath), "utf8"),
      filePath,
    })),
  );
}

function findUpdaterOrSigningMarkers(filePath: string, contents: string): string[] {
  const markers = new Map<RegExp, string>([
    [/\bupdater\b/i, "updater config"],
    [/\bsigning\b/i, "signing config"],
    [/\bprivateKey\b/, "private key config"],
    [/\bTAURI_SIGNING_PRIVATE_KEY\b/, "Tauri signing private key"],
    [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, "private key material"],
  ]);

  return [...markers.entries()]
    .filter(([pattern]) => pattern.test(contents))
    .map(([, label]) => `${filePath}: ${label}`);
}

async function exposedTauriCommands(): Promise<string[]> {
  const libRs = await readFile(path.join(repoRoot, "src-tauri/src/lib.rs"), "utf8");
  const handlerStart = libRs.indexOf("tauri::generate_handler![");

  if (handlerStart < 0) {
    return [];
  }

  const handlerTail = libRs.slice(handlerStart + "tauri::generate_handler![".length);
  const handlerEnd = handlerTail.indexOf("]");
  const handlerContents = handlerEnd >= 0 ? handlerTail.slice(0, handlerEnd) : handlerTail;

  return handlerContents
    .split(",")
    .map((command) => command.trim())
    .filter(Boolean)
    .sort();
}

async function broadCapabilityViolations(): Promise<string[]> {
  const capabilityFiles = await runGitLines(["ls-files", "src-tauri/capabilities"]);
  const violations: string[] = [];

  for (const capabilityFile of capabilityFiles) {
    const capability = await readJsonFile<Record<string, unknown>>(capabilityFile);
    const permissionIds = collectPermissionIds(capability.permissions);

    for (const permissionId of permissionIds) {
      if (isBroadOrForbiddenPermission(permissionId)) {
        violations.push(`${capabilityFile}: ${permissionId}`);
      }
    }
  }

  return violations.sort();
}

function collectPermissionIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((permission) => {
    if (typeof permission === "string") {
      return [permission];
    }

    if (
      typeof permission === "object" &&
      permission !== null &&
      "identifier" in permission &&
      typeof permission.identifier === "string"
    ) {
      return [permission.identifier];
    }

    if (
      typeof permission === "object" &&
      permission !== null &&
      "id" in permission &&
      typeof permission.id === "string"
    ) {
      return [permission.id];
    }

    return [];
  });
}

function isBroadOrForbiddenPermission(permissionId: string): boolean {
  const normalized = permissionId.toLowerCase();

  return (
    normalized === "*" ||
    normalized.endsWith(":*") ||
    normalized.endsWith(":all") ||
    /^(?:fs|path|shell|http|sql|updater):/.test(normalized) ||
    /\b(?:fs|path|shell|http|sql|updater):/.test(normalized) ||
    /\btauri-plugin-(?:fs|shell|http|sql|updater)\b/.test(normalized) ||
    /\ballow-(?:fs|path|shell|http|sql|updater)\b/.test(normalized)
  );
}

async function runGitLines(args: readonly string[]): Promise<string[]> {
  const { stdout } = await execFileAsync("git", args, { cwd: repoRoot });

  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}
