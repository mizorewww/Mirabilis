import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
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

const reviewedTask046RuntimePersistenceFiles = new Set([
  "src-tauri/src/commands/db.rs",
]);

const reviewedTask035MuiDependencies = [
  "@emotion/react",
  "@emotion/styled",
  "@mui/icons-material",
  "@mui/material",
] as const;

const reviewedTask035BunLockChangedPackages = ["react-is"] as const;

const reviewedTask035BunLockPackageFingerprints = new Map<string, string>([
  ["@emotion/babel-plugin", "c74b5375d170eceee92b9c33eb6d8697ccf73492c2c27a1cfbf520a08a41a725"],
  ["@emotion/babel-plugin/convert-source-map", "05ac3fdfc30adb09e2bf0117ff1a44242eec693785177ff22771920734757118"],
  ["@emotion/cache", "f5c5032c957f0d790ad0d667cc92240e55658c308f5e5c4c2c64b1f99f9608b0"],
  ["@emotion/hash", "dc4dd231fbda2f6d4c26f2172d38a70c6dca45b0427c3a827af1d73d66578c5e"],
  ["@emotion/is-prop-valid", "0be67cdcddc9e46a38967c04102f9e487d39f1fe969fbe90eed1d3ec2de541cc"],
  ["@emotion/memoize", "22365382998f0b66fab5b8bea30d977c4c35c52229d649b63dc0ca85746ee62e"],
  ["@emotion/react", "5403b92fa8a759d8231954c6cb52b1ae25d71b8871c8934ac84346ae3407186f"],
  ["@emotion/serialize", "c47b390f16d4e2a0feeb576ccd77803c3dc74c8957c8d589191960f93198bf40"],
  ["@emotion/sheet", "30deafb2fdf1a5c191549147741afd2e45951ecd6e50c34754ef2cd80351de52"],
  ["@emotion/styled", "dbbdb9ff32fb8dee4514a0e2374dfe69148c72df078d38f338f9672d21b260ed"],
  ["@emotion/unitless", "a4f284c3a7ac7f9c7864df8ed6d8a3af5ee440c0c81a07df4a029a6d5fa16830"],
  ["@emotion/use-insertion-effect-with-fallbacks", "2d03de78de7c2c6945cf79a4421edd81715733ecb4d4ad59f0f33d80240b723f"],
  ["@emotion/utils", "e986b33ff7c2727d9958ef61368ace07e98c4ca1991e2576ad2ea17543f88465"],
  ["@emotion/weak-memoize", "d91f23d55c9885a6ced14869fc99a05f011346c0e895355c6b3b6e13b0c37161"],
  ["@mui/core-downloads-tracker", "73a59519cc34cd34c4c6bde7dc3e68c5032fe2cd040a676f722c61180149834b"],
  ["@mui/icons-material", "1ebf32769e0e6168ad8671b8336af1e3bcf64094dc0bb989532d90b111baa6ac"],
  ["@mui/material", "78aeb4040a6d2a80a4e2b39aa3eaf4daa4a097e3a353f902590e0830afc5ef8d"],
  ["@mui/private-theming", "d8a29dbcff306c3d85751964440a1e2fedabc5634c388314c7901bd42fe486e8"],
  ["@mui/styled-engine", "0a5098925ab06da0a5030429f3e924e576a26010c8d9460558916be3461fd255"],
  ["@mui/system", "537cdf1c6a31186033bdd6e8ad92c03e16d93b1def6d2f8b9c881185ae6d86c6"],
  ["@mui/types", "56e4be333d21db8dd8715110ab70bb573d6bf91f106f4d86c3a3f7da815f7865"],
  ["@mui/utils", "080c7042f63add4cbafe8fdcbde369725b5b1ac21df82220137453a7a9f071cf"],
  ["@popperjs/core", "85a741bbeb8774894b6bdd5a41377d715b9620d9f1d95cc2c63ec5a3d84faedb"],
  ["@types/parse-json", "be243e186272a28f8427162fd91c3feabe059b1ca56f9eced3bf57ffb575584a"],
  ["@types/prop-types", "235d07891b325412a1d05fb8eb83084384a373da2f4fd075c201a31e51c2d2f2"],
  ["@types/react-transition-group", "cbab268098a616f3d8a7451005de4e5749da0a89bea6ba87de5b8118c61fa1fd"],
  ["babel-plugin-macros", "459979e99805aceb9354fe46dc9b41a6f1a0e28fffcd707d5149a1292d2819ae"],
  ["clsx", "8962b10e27dc1213842df165e7195bdd949fc35c693748431d0525f6d14debf0"],
  ["cosmiconfig", "93526499441cd5edf61208dc1f432fd9247ba212f19ad79d826f636583b816dc"],
  ["dom-helpers", "2a069f833192f8290bf004c40570a8768ba132139c289553128c788a7ca6129b"],
  ["error-ex", "5f41ccd2d1c8342a8919599e8e31cf97a87c0ba35fef0d498743006739c6ee61"],
  ["es-errors", "330670b157c37309f6a12526afbdfc21d96489b72779948c41105b40030c470d"],
  ["find-root", "49df0865989a77b342cbf40f2e715001e3e0f51be5710f45a9b695d8aa835b93"],
  ["function-bind", "393b26b1d114f4473777a21df157811825c8a1e19dcbcd5c71afce538411fba3"],
  ["hasown", "c1b29e38028e2ccdc12976b50dc85f610dbba676a5349229b3e89f2f5ec17eab"],
  ["hoist-non-react-statics", "6c75d3aab942c4e408c7f0e5c0848a9dc492432884e333e99367f2b593c2d3f9"],
  ["hoist-non-react-statics/react-is", "dc4a46ce57ed61ddd2474ed2962c210dfe70b5ffab2e5742a4b91afe58854b1d"],
  ["is-arrayish", "15173fe96748a17bae0b18484ea756dfe0a0885792b1cd2c6934796bc8466ab8"],
  ["is-core-module", "43949cc474d0adead9a37aca04c89e8ad5ede8a00ea7165b4194c5d6ce83410b"],
  ["json-parse-even-better-errors", "8afd66f0d274957b6d8af0cfc195c87c4ef478181dc2f8539b8c16959a29dc60"],
  ["lines-and-columns", "e759c77c4385676fccbb7f855627208215c5f82cf07cde02fa01448132a9ab2f"],
  ["loose-envify", "fc4147c3239b7c27d5967a3a73e4adc6889596d9a1174dff804e49fa00618266"],
  ["object-assign", "209cd3cf720d54143528521fdb57226e35ab598345a68f834b3a5686c3af1881"],
  ["parse-json", "b2f205b573190d17c939fa2a28c1aa9e597ceabf35034480ccc53a07c05a5dde"],
  ["path-parse", "c4e5e32926c657e99c433ebae2463f09c319e732e20b2b28e9edeb49459e6863"],
  ["path-type", "63ceed3e170070cc604e1e4d9a50d0477eeb2fbea68815f65b2afc75eb9a09cb"],
  ["pretty-format/react-is", "9ce73ac24a1e4b0ded251e60a10643eea466cdbdfc81ca38120b675166331939"],
  ["prop-types", "f472ed1350a049faa9dcea9b24d5feaabf1121419072e40551fddc49439dec5f"],
  ["prop-types/react-is", "dc4a46ce57ed61ddd2474ed2962c210dfe70b5ffab2e5742a4b91afe58854b1d"],
  ["react-is", "b69acee75790158fba5ecf6307d2259a80798a14331731c5d9af25eea040e4e4"],
  ["react-transition-group", "9d8b7f8aa2de5c189ebc7984f88e72c0a07f0edb50fbad0d87065ef155519657"],
  ["resolve", "6e0647f49ca0e9e119158c36fae39b53cea43a5ba9e4b577fd1c7008dca5312e"],
  ["source-map", "4edb2c37bf413d520fc43085ed5044a2e2c9d1c2f386c376e605baff27da6dc5"],
  ["stylis", "39b4e2d2cad0b61eae81f5359efb38cf9e9a2d5d9f158fbcfdbe8896b6e97485"],
  ["supports-preserve-symlinks-flag", "833fbcfc3ce16ef5cdb5c1cd3f83172dd57bce1e84fd15529d528f2bc5d20c33"],
  ["yaml", "963ff300dc32449170413aa7b33dc089f7356b22cedb221c5de5c83542a18523"],
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
      added: ['+description = "Markdown-first local time-management desktop app"'],
    },
  ],
]);

const reviewedTask046RuntimePersistenceDiffs = new Map<
  string,
  {
    added: readonly string[];
    removed: readonly string[];
  }
>([
  [
    "src-tauri/src/commands/db.rs",
    {
      removed: [
        "-    execute_request(&database, request)",
        "-            .map(|request| execute_request(database, request))",
        "-fn execute_request(database: &Database, request: DbOperationRequest) -> Result<Value, IpcError> {",
        "-        DbOperationRequest::FiltersGet(payload) => response_value(",
        "-            persist(FilterRepository::new(database).get(&payload.id))?.map(FilterResponse::from),",
        "-        ),",
      ],
      added: [
        "+    execute_request(&database, request, None)",
        "+        let mut context = TransactionContext::default();",
        "+",
        "+            .map(|request| execute_request(database, request, Some(&mut context)))",
        "+fn execute_request(",
        "+    database: &Database,",
        "+    request: DbOperationRequest,",
        "+    transaction_context: Option<&mut TransactionContext>,",
        "+) -> Result<Value, IpcError> {",
        "+            if transaction_context",
        "+                .as_deref()",
        "+                .is_some_and(|context| context.missing_filter_gets.contains(&payload.id))",
        "+            {",
        "+                return Err(IpcError::persistence_failed());",
        "+            }",
        "+",
        "+        DbOperationRequest::FiltersGet(payload) => {",
        "+            let filter = persist(FilterRepository::new(database).get(&payload.id))?;",
        "+",
        "+            if filter.is_none() {",
        "+                if let Some(context) = transaction_context {",
        "+                    context.missing_filter_gets.insert(payload.id);",
        "+                }",
        "+            }",
        "+",
        "+            response_value(filter.map(FilterResponse::from))",
        "+        }",
        "+#[derive(Default)]",
        "+struct TransactionContext {",
        "+    missing_filter_gets: HashSet<String>,",
        "+}",
        "+",
        "+    #[serde(alias = \"type\")]",
      ],
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
      !reviewedTask035DependencyFiles.has(filePath) &&
      !reviewedTask046RuntimePersistenceFiles.has(filePath)
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

  if (reviewedTask046RuntimePersistenceFiles.has(filePath)) {
    return findUnreviewedTask046RuntimePersistenceDiff(filePath);
  }

  return findUnreviewedTask033Diff(filePath);
}

async function findUnreviewedTask046RuntimePersistenceDiff(
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

  const reviewedDiff = reviewedTask046RuntimePersistenceDiffs.get(filePath);

  if (reviewedDiff === undefined) {
    return "unreviewed TASK-046 runtime persistence file";
  }

  const actualChangedLines = collectChangedDiffLines(diff);

  if (
    sameStringSet(actualChangedLines.added, reviewedDiff.added) &&
    sameStringSet(actualChangedLines.removed, reviewedDiff.removed)
  ) {
    return undefined;
  }

  return "unreviewed TASK-046 runtime persistence diff";
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
  const currentLock = parseBunLockRecord(
    await readFile(path.join(repoRoot, "bun.lock"), "utf8"),
  );
  const baseLock = parseBunLockRecord(
    await runGitOutput(["show", "master:bun.lock"]),
  );
  const currentRootWorkspace =
    currentLock === undefined ? undefined : getRootWorkspace(currentLock);
  const baseRootWorkspace =
    baseLock === undefined ? undefined : getRootWorkspace(baseLock);

  if (
    currentLock === undefined ||
    baseLock === undefined ||
    currentRootWorkspace === undefined ||
    baseRootWorkspace === undefined
  ) {
    return false;
  }

  const currentDependencies = asStringRecord(currentRootWorkspace.dependencies);
  const baseDependencies = asStringRecord(baseRootWorkspace.dependencies);
  const currentDevDependencies = asStringRecord(
    currentRootWorkspace.devDependencies,
  );
  const baseDevDependencies = asStringRecord(baseRootWorkspace.devDependencies);

  if (!sameStringRecord(currentDevDependencies, baseDevDependencies)) {
    return false;
  }

  if (
    !isExactlyReviewedTask035DependencyDiff(
      diffStringRecordProperties(baseDependencies, currentDependencies),
    )
  ) {
    return false;
  }

  if (!sameStaticBunLockSections(currentLock, baseLock)) {
    return false;
  }

  return isExactlyReviewedTask035PackageGraphDiff(currentLock, baseLock);
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

function parseBunLockRecord(contents: string): JsonRecord | undefined {
  try {
    return parseJsonRecord(stripJsonTrailingCommas(contents));
  } catch {
    return undefined;
  }
}

function getRootWorkspace(lock: JsonRecord): JsonRecord | undefined {
  return asJsonRecord(asJsonRecord(lock.workspaces)?.[""]);
}

function getPackageMap(lock: JsonRecord): JsonRecord | undefined {
  return asJsonRecord(lock.packages);
}

function sameStaticBunLockSections(
  currentLock: JsonRecord,
  baseLock: JsonRecord,
): boolean {
  const currentComparable = replaceReviewedTask035BunLockSections(
    currentLock,
    baseLock,
  );
  const baseComparable = replaceReviewedTask035BunLockSections(baseLock, baseLock);

  return (
    currentComparable !== undefined &&
    baseComparable !== undefined &&
    stableStringify(currentComparable) === stableStringify(baseComparable)
  );
}

function replaceReviewedTask035BunLockSections(
  lock: JsonRecord,
  baseLock: JsonRecord,
): JsonRecord | undefined {
  const rootWorkspace = getRootWorkspace(lock);
  const baseRootWorkspace = getRootWorkspace(baseLock);
  const workspaces = asJsonRecord(lock.workspaces);
  const packages = getPackageMap(baseLock);

  if (
    rootWorkspace === undefined ||
    baseRootWorkspace === undefined ||
    workspaces === undefined ||
    packages === undefined
  ) {
    return undefined;
  }

  return {
    ...lock,
    packages,
    workspaces: {
      ...workspaces,
      "": {
        ...rootWorkspace,
        dependencies: baseRootWorkspace.dependencies,
        devDependencies: baseRootWorkspace.devDependencies,
      },
    },
  };
}

function isExactlyReviewedTask035PackageGraphDiff(
  currentLock: JsonRecord,
  baseLock: JsonRecord,
): boolean {
  const currentPackages = getPackageMap(currentLock);
  const basePackages = getPackageMap(baseLock);

  if (currentPackages === undefined || basePackages === undefined) {
    return false;
  }

  const packageDiff = diffJsonRecordProperties(basePackages, currentPackages);
  const expectedChanged = [...reviewedTask035BunLockChangedPackages];
  const expectedChangedSet = new Set<string>(expectedChanged);
  const expectedAdded = [...reviewedTask035BunLockPackageFingerprints.keys()]
    .filter((packageName) => !expectedChangedSet.has(packageName))
    .sort();

  if (
    !sameStringSet(packageDiff.added, expectedAdded) ||
    !sameStringSet(packageDiff.changed, expectedChanged) ||
    packageDiff.removed.length > 0
  ) {
    return false;
  }

  return [...packageDiff.added, ...packageDiff.changed].every((packageName) => {
    const currentPackage = currentPackages[packageName];
    const expectedFingerprint =
      reviewedTask035BunLockPackageFingerprints.get(packageName);

    return (
      expectedFingerprint !== undefined &&
      lockPackageEntryFingerprint(currentPackage) === expectedFingerprint
    );
  });
}

function diffJsonRecordProperties(
  baseRecord: JsonRecord,
  currentRecord: JsonRecord,
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
      .filter(
        (key) =>
          key in baseRecord &&
          stableStringify(currentRecord[key]) !== stableStringify(baseRecord[key]),
      )
      .sort(),
    removed: Object.keys(baseRecord)
      .filter((key) => !(key in currentRecord))
      .sort(),
  };
}

function lockPackageEntryFingerprint(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function stripJsonTrailingCommas(contents: string): string {
  let output = "";

  let inString = false;
  let escaped = false;

  for (let index = 0; index < contents.length; index += 1) {
    const character = contents[index];

    if (escaped) {
      output += character;
      escaped = false;
      continue;
    }

    if (character === "\\") {
      output += character;
      escaped = inString;
      continue;
    }

    if (character === '"') {
      output += character;
      inString = !inString;
      continue;
    }

    if (!inString && character === ",") {
      let nextIndex = index + 1;

      while (/\s/u.test(contents[nextIndex] ?? "")) {
        nextIndex += 1;
      }

      if (contents[nextIndex] === "}" || contents[nextIndex] === "]") {
        continue;
      }
    }

    output += character;
  }

  return output;
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

function asJsonRecord(value: unknown): JsonRecord | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  return value as JsonRecord;
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
