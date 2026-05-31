import { execFile } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "../App";
import { createAppRuntime, type AppRuntime } from "../bootstrap";
import {
  createCoreStores,
  type BlockNode,
  type CoreStores,
  type DbQuery,
  type MarkdownPage,
  type NativeBridge,
  type StructuredMarkdownDocument,
} from "../core";
import { disallowedNativeSurfaceChanges } from "./native-surface-guard";

type NativeBridgeTransactionResult<Response> =
  Response extends readonly unknown[]
    ? number extends Response["length"]
      ? Array<Response>
      : Response
    : Array<Response>;

type SourceLine = {
  blockId: string;
  text: string;
};

type CreateRuntimeOptions = {
  pageIds?: readonly string[];
};

type Deferred<Value> = {
  promise: Promise<Value>;
  reject(reason: unknown): void;
  resolve(value: Value): void;
};

type SearchResultsData = {
  kind: "search.results";
  query: string;
  results: SearchResultItem[];
};

type SearchResultItem = {
  matchedFields: Array<"body" | "title">;
  pageId: string;
  snippet: string;
  title: string;
};

type ExecuteSpy = {
  mock: {
    calls: unknown[][];
  };
};

type SourceFile = {
  filePath: string;
  source: string;
};

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const execFileAsync = promisify(execFile);

const searchDialogName = /^Search$/i;
const commandPaletteName = /^Command Palette$/i;
const searchPluginId = "search";
const searchCommandId = "search.query";
const searchResultsKind = "search.results";
const quickCapturePluginId = "quick-capture";
const maxSearchQueryLength = 200;
const appShellEntrypoints = [
  "src/App.tsx",
  "src/main.tsx",
  "src/shell",
  "src/providers",
] as const;
const task041SurfaceEntrypoints = [
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
  "CHANGELOG.md",
] as const;
const sourceExtensions = new Set([".ts", ".tsx"]);

afterEach(() => {
  vi.restoreAllMocks();
});

describe("TASK-041 Search dialog", () => {
  it("opens from the top bar as a named dialog, focuses a labelled query textbox, and restores focus after Escape or Cancel", async () => {
    const runtime = await createRuntime();
    const user = userEvent.setup();

    renderReadyApp(runtime);

    const launcher = await findTopBarButton(/^Search$/i);

    await user.click(launcher);

    const dialog = await screen.findByRole("dialog", {
      name: searchDialogName,
    });
    const query = within(dialog).getByRole("textbox", {
      name: /search query/i,
    });

    expect(query).toHaveFocus();
    expect(screen.queryByText(/^Search surface placeholder$/i)).not.toBeInTheDocument();

    await user.keyboard("{Escape}");

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: searchDialogName }),
      ).not.toBeInTheDocument(),
    );
    expect(launcher).toHaveFocus();

    await user.click(launcher);

    const reopenedDialog = await screen.findByRole("dialog", {
      name: searchDialogName,
    });

    await user.click(
      within(reopenedDialog).getByRole("button", { name: /cancel/i }),
    );

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: searchDialogName }),
      ).not.toBeInTheDocument(),
    );
    expect(launcher).toHaveFocus();
  });

  it("executes only active search-owned search.query with exact capped query payloads from Enter and the Search button", async () => {
    const runtime = await createRuntime();
    const user = userEvent.setup();
    const searchHandler = vi.fn(async (input: unknown) =>
      createSearchResults(input, []),
    );
    const trapHandler = vi.fn(async () => ({ ok: "trap" }));
    const execute = vi.spyOn(runtime.commands, "execute");

    replaceSearchCommand(runtime, searchHandler);
    runtime.commands.register({
      id: "search.private-command-id",
      pluginId: searchPluginId,
      title: "Private Search Command Trap",
      handler: trapHandler,
    });
    renderReadyApp(runtime);

    const longQuery = "q".repeat(maxSearchQueryLength + 25);
    const first = await openSearchDialog(user);

    await user.type(first.query, longQuery);

    expect(first.query).toHaveValue(longQuery.slice(0, maxSearchQueryLength));

    await user.keyboard("{Enter}");

    await waitFor(() =>
      expect(execute.mock.calls).toContainEqual([
        searchCommandId,
        { query: longQuery.slice(0, maxSearchQueryLength) },
      ]),
    );
    expect(searchHandler).toHaveBeenCalledWith({
      query: longQuery.slice(0, maxSearchQueryLength),
    });

    const second = await openSearchDialog(user);

    await user.type(second.query, "search.private-command-id");
    await user.click(within(second.dialog).getByRole("button", { name: /^Search$/i }));

    await waitFor(() =>
      expect(execute.mock.calls).toContainEqual([
        searchCommandId,
        { query: "search.private-command-id" },
      ]),
    );
    expect(trapHandler).not.toHaveBeenCalled();
  });

  it("shows pending search status and prevents duplicate dispatch while search.query is unresolved", async () => {
    const runtime = await createRuntime();
    const user = userEvent.setup();
    const deferredResults = createDeferred<SearchResultsData>();
    const originalExecute = runtime.commands.execute.bind(runtime.commands);
    const execute = vi
      .spyOn(runtime.commands, "execute")
      .mockImplementation((commandId, input) => {
        if (commandId === searchCommandId) {
          return deferredResults.promise;
        }

        return originalExecute(commandId, input);
      });

    renderReadyApp(runtime);

    const { dialog, query } = await openSearchDialog(user);

    await user.type(query, "pending query");
    await user.click(within(dialog).getByRole("button", { name: /^Search$/i }));

    await waitFor(() => expect(commandCallCount(execute, searchCommandId)).toBe(1));
    expect(
      within(dialog).getByRole("status", { name: /search|loading|pending/i }),
    ).toHaveTextContent(/searching|loading/i);
    expect(within(dialog).getByRole("button", { name: /^Search$/i })).toBeDisabled();

    await user.keyboard("{Enter}");

    expect(commandCallCount(execute, searchCommandId)).toBe(1);

    deferredResults.resolve(createSearchResults({ query: "pending query" }, []));

    await waitFor(() =>
      expect(screen.queryByText(/searching|loading/i)).not.toBeInTheDocument(),
    );
  });

  it("renders empty Search results as an accessible route state without raw runtime details", async () => {
    const runtime = await createRuntime();
    const user = userEvent.setup();

    renderReadyApp(runtime);

    await submitSearch(user, "no matching page");

    const main = await screen.findByRole("main", { name: /search/i });

    expect(within(main).getByRole("status")).toHaveTextContent(
      /no results|0 results/i,
    );
    expect(
      within(main).getByRole("list", { name: /search results/i }),
    ).toBeVisible();
    expectNoSensitiveDomLeak();
  });

  it("renders only bounded Search result DTO fields and navigates selected results through the normal page editor route", async () => {
    const runtime = await createRuntime({
      pageIds: ["home-page", "result-page"],
    });
    const user = userEvent.setup();
    const page = createRuntimePage(runtime, "Alpha Plan", [
      {
        blockId: "alpha-private-body",
        text: "PRIVATE_PAGE_BODY_TOKEN raw page body stays hidden in results",
      },
    ]);

    replaceSearchCommand(runtime, (input) =>
      createSearchResults(input, [
        {
          matchedFields: ["title", "body"],
          pageId: page.id,
          snippet: "Visible alpha snippet",
          title: page.title,
        },
      ]),
    );
    renderReadyApp(runtime);

    await submitSearch(user, "alpha");

    const main = await screen.findByRole("main", { name: /search/i });
    const list = within(main).getByRole("list", { name: /search results/i });
    const result = within(list).getByRole("button", { name: /Alpha Plan/i });

    expect(within(main).getByRole("status")).toHaveTextContent(/1 result/i);
    expect(result).toHaveTextContent("Alpha Plan");
    expect(result).toHaveTextContent("Visible alpha snippet");
    expect(result).toHaveTextContent(/title|body/i);
    expect(document.body.textContent ?? "").not.toMatch(
      /PRIVATE_PAGE_BODY_TOKEN|raw page body|metadata|events|PluginHost|NativeBridge|\bstores\b|\bregistries\b/i,
    );

    await user.click(result);

    expect(
      await screen.findByRole("heading", { name: /^Alpha Plan Workspace$/i }),
    ).toBeVisible();
    expect(
      await screen.findByRole("textbox", { name: /markdown/i }),
    ).toHaveValue("PRIVATE_PAGE_BODY_TOKEN raw page body stays hidden in results");
  });

  it("keeps malformed Search command results generic and redacted", async () => {
    const runtime = await createRuntime();
    const user = userEvent.setup();

    replaceSearchCommand(runtime, () => ({
      body: "PRIVATE_PAGE_BODY_TOKEN",
      kind: searchResultsKind,
      query: "malformed",
      results: [
        {
          matchedFields: ["body"],
          metadata: {
            sql: "SELECT * FROM core_pages",
          },
          pageId: "page-1",
          snippet: "Visible snippet",
          title: "Visible title",
        },
      ],
    }));
    renderReadyApp(runtime);

    await submitSearch(user, "malformed");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /search could not run|search unavailable|results could not load|unable to search/i,
    );
    expect(screen.queryByText("Visible title")).not.toBeInTheDocument();
    expectNoSensitiveDomLeak();
  });

  it("fails closed without dispatch when search.query is missing", async () => {
    const runtime = await createRuntime();
    const user = userEvent.setup();
    const execute = vi.spyOn(runtime.commands, "execute");

    runtime.commands.unregister(searchCommandId);
    renderReadyApp(runtime);

    await submitSearch(user, "missing command");

    expect(commandCallCount(execute, searchCommandId)).toBe(0);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /search could not run|search unavailable|unable to search/i,
    );
    expectNoSensitiveDomLeak();
  });

  it("fails closed without dispatch when the Search plugin is inactive", async () => {
    const runtime = await createRuntime();
    const user = userEvent.setup();
    const execute = vi.spyOn(runtime.commands, "execute");

    await deactivatePlugin(runtime, searchPluginId);
    renderReadyApp(runtime);

    await submitSearch(user, "inactive plugin");

    expect(commandCallCount(execute, searchCommandId)).toBe(0);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /search could not run|search unavailable|unable to search/i,
    );
    expectNoSensitiveDomLeak();
  });

  it("fails closed without dispatch when search.query is owned by a different active plugin", async () => {
    const runtime = await createRuntime();
    const user = userEvent.setup();
    const foreignHandler = vi.fn(async (input: unknown) =>
      createSearchResults(input, []),
    );
    const execute = vi.spyOn(runtime.commands, "execute");

    replaceSearchCommand(runtime, foreignHandler, quickCapturePluginId);
    renderReadyApp(runtime);

    await submitSearch(user, "foreign owner");

    expect(commandCallCount(execute, searchCommandId)).toBe(0);
    expect(foreignHandler).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /search could not run|search unavailable|unable to search/i,
    );
    expectNoSensitiveDomLeak();
  });

  it("redacts thrown search.query failures without leaking raw errors, SQL, paths, plugin internals, or native text", async () => {
    const runtime = await createRuntime();
    const user = userEvent.setup();
    const execute = vi.spyOn(runtime.commands, "execute");

    replaceSearchCommand(runtime, () => {
      throw createSensitiveError(searchCommandId);
    });
    renderReadyApp(runtime);

    await submitSearch(user, "throw raw error");

    await waitFor(() =>
      expect(execute.mock.calls).toContainEqual([
        searchCommandId,
        { query: "throw raw error" },
      ]),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /search could not run|search unavailable|unable to search/i,
    );
    expectNoSensitiveDomLeak();
  });

  it("validates stale result page ids before navigation and shows a generic missing-page state", async () => {
    const runtime = await createRuntime();
    const user = userEvent.setup();

    replaceSearchCommand(runtime, (input) =>
      createSearchResults(input, [
        {
          matchedFields: ["body"],
          pageId: "missing-page-id",
          snippet: "Visible stale snippet",
          title: "Missing Result Page",
        },
      ]),
    );
    renderReadyApp(runtime);

    await submitSearch(user, "stale page");

    const main = await screen.findByRole("main", { name: /search/i });
    const result = within(main).getByRole("button", {
      name: /Missing Result Page/i,
    });

    await user.click(result);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /page could not open|route unavailable|result unavailable|workspace could not load/i,
    );
    expect(
      screen.queryByRole("heading", { name: /^Missing Result Page Workspace$/i }),
    ).not.toBeInTheDocument();
    expectNoSensitiveDomLeak();
  });

  it("keeps Command Palette and Search keyboard/focus flows independent", async () => {
    const runtime = await createRuntime();
    const user = userEvent.setup();
    const commandHandler = vi.fn(async () => ({ ok: true }));
    const searchHandler = vi.fn(async (input: unknown) =>
      createSearchResults(input, []),
    );

    runtime.commands.register({
      id: "quick-capture.format-selection",
      pluginId: quickCapturePluginId,
      title: "Format Selection",
      handler: commandHandler,
    });
    replaceSearchCommand(runtime, searchHandler);
    renderReadyApp(runtime);

    const commandLauncher = await findTopBarButton(/^Command$/i);

    await user.click(commandLauncher);

    const commandDialog = await screen.findByRole("dialog", {
      name: commandPaletteName,
    });

    expect(
      within(commandDialog).getByRole("textbox", {
        name: /command search|search commands/i,
      }),
    ).toHaveFocus();

    await user.keyboard("{Escape}");

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: commandPaletteName }),
      ).not.toBeInTheDocument(),
    );
    expect(commandLauncher).toHaveFocus();

    const search = await openSearchDialog(user);

    await user.type(search.query, "Format Selection");
    await user.keyboard("{Enter}");

    await waitFor(() =>
      expect(searchHandler).toHaveBeenCalledWith({ query: "Format Selection" }),
    );
    expect(commandHandler).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("dialog", { name: commandPaletteName }),
    ).not.toBeInTheDocument();
  });
});

describe("TASK-041 Search static boundaries", () => {
  it("keeps package, lockfile, Tauri, Rust, IPC, capability, schema, release, native, worker, indexer, and FTS surfaces unchanged", async () => {
    const changedSurfaceFiles = await listTask041SurfaceChangesFromMaster();
    const productionSources = await readAppShellSourceFiles();
    const productionViolations = productionSources
      .filter(({ filePath }) => !filePath.startsWith("src/test/"))
      .flatMap(findForbiddenSearchSurfacePatterns);

    expect(await disallowedNativeSurfaceChanges(changedSurfaceFiles)).toStrictEqual(
      [],
    );
    expect(productionViolations).toStrictEqual([]);
  });

  it("keeps App Shell out of private Search plugin imports and raw native/runtime modules", async () => {
    const appShellFiles = await listExistingSourceFiles(appShellEntrypoints);
    const violations: string[] = [];

    for (const filePath of appShellFiles) {
      const source = await readFile(filePath, "utf8");
      const relativePath = toRepoRelativePath(filePath);

      for (const moduleSpecifier of collectStaticModuleSpecifiers(source)) {
        const resolvedModule = resolveModuleSpecifier(filePath, moduleSpecifier);
        const violation = findForbiddenTask041AppShellImport(resolvedModule);

        if (violation !== undefined) {
          violations.push(`${relativePath} -> ${moduleSpecifier}: ${violation}`);
        }
      }
    }

    expect(violations).toStrictEqual([]);
  });

  it("uses current MUI and Testing Library APIs for the TASK-041 shell slice", async () => {
    const sourceFiles = await readSourceFilesIfExists(path.join(repoRoot, "src"));
    const violations = sourceFiles.flatMap((sourceFile) => [
      ...findForbiddenMuiImportPatterns(sourceFile),
      ...findRemovedMuiPropPatterns(sourceFile),
      ...findForbiddenTestingApiPatterns(sourceFile),
    ]);

    expect(violations).toStrictEqual([]);
  });
});

function renderReadyApp(runtime: AppRuntime): void {
  render(<App initializeRuntime={vi.fn(async () => runtime)} />);
}

async function createRuntime(
  options: CreateRuntimeOptions = {},
): Promise<AppRuntime> {
  const createPageId =
    options.pageIds === undefined
      ? undefined
      : createSequenceFactory(options.pageIds);

  return createAppRuntime({
    createNativeBridge: () => createNoopNativeBridge(),
    ...(createPageId === undefined
      ? {}
      : {
          createStores: (): CoreStores =>
            createCoreStores({
              pages: {
                createId: createPageId,
              },
            }),
        }),
  });
}

async function openSearchDialog(user: ReturnType<typeof userEvent.setup>) {
  const launcher = await findTopBarButton(/^Search$/i);

  await user.click(launcher);

  const dialog = await screen.findByRole("dialog", {
    name: searchDialogName,
  });
  const query = within(dialog).getByRole("textbox", {
    name: /search query/i,
  });

  await waitFor(() => expect(query).toHaveFocus());

  return { dialog, launcher, query };
}

async function submitSearch(
  user: ReturnType<typeof userEvent.setup>,
  queryText: string,
) {
  const { query } = await openSearchDialog(user);

  await user.type(query, queryText);
  await user.keyboard("{Enter}");
}

async function findTopBarButton(name: RegExp): Promise<HTMLElement> {
  const banner = await screen.findByRole("banner", { name: /mirabilis/i });

  return within(banner).findByRole("button", { name });
}

function replaceSearchCommand(
  runtime: AppRuntime,
  handler: (input: unknown) => unknown | Promise<unknown>,
  pluginId = searchPluginId,
): void {
  try {
    runtime.commands.unregister(searchCommandId);
  } catch {
    // Tests that replace Search command behavior do not require the original command.
  }

  runtime.commands.register({
    id: searchCommandId,
    pluginId,
    title: "Search",
    handler,
  });
}

function createSearchResults(
  input: unknown,
  results: SearchResultItem[],
): SearchResultsData {
  const query =
    typeof input === "object" &&
    input !== null &&
    "query" in input &&
    typeof input.query === "string"
      ? input.query
      : "";

  return {
    kind: searchResultsKind,
    query,
    results,
  };
}

function createRuntimePage(
  runtime: AppRuntime,
  title: string,
  lines: readonly SourceLine[],
): MarkdownPage {
  return runtime.pages.create({
    body: structuredDocument(lines),
    title,
  });
}

function structuredDocument(
  lines: readonly SourceLine[],
): StructuredMarkdownDocument {
  return {
    content: lines.map((line) => ({
      blockId: line.blockId,
      text: line.text,
      type: "markdown.line",
    }) satisfies BlockNode),
    type: "doc",
  };
}

async function deactivatePlugin(
  runtime: AppRuntime,
  pluginId: string,
): Promise<void> {
  const host = runtime.pluginHost as AppRuntime["pluginHost"] & {
    deactivate?(pluginId: string): Promise<unknown>;
  };

  if (host.deactivate === undefined) {
    throw new Error("Expected test runtime PluginHost to support deactivation");
  }

  await host.deactivate(pluginId);
}

function commandCallCount(execute: ExecuteSpy, commandId: string): number {
  return execute.mock.calls.filter((call) => call[0] === commandId).length;
}

function createDeferred<Value>(): Deferred<Value> {
  let reject!: (reason: unknown) => void;
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return {
    promise,
    reject,
    resolve,
  };
}

function createSensitiveError(commandId: string): Error {
  const error = new Error(
    [
      commandId,
      "SELECT * FROM core_pages WHERE token='SECRET'",
      "/home/aac6fef/Mirabilis/private/search.md",
      "src/plugins/search/private-indexer.ts",
      "Bearer FAKE_SECRET_TOKEN",
      "PRIVATE_PAGE_BODY_TOKEN",
      "NativeBridge PluginHost",
    ].join(" "),
  );

  error.stack = [
    `Error: ${commandId} SECRET`,
    "    at search (/home/aac6fef/Mirabilis/src/plugins/search/private-indexer.ts:12:4)",
  ].join("\n");

  return error;
}

function expectNoSensitiveDomLeak(): void {
  expect(document.body.textContent ?? "").not.toMatch(
    /SELECT\s+\*|core_pages|\/home\/aac6fef|src\/plugins\/search|Bearer|FAKE_SECRET|SECRET|PRIVATE_PAGE_BODY_TOKEN|stack|at\s+\S+:\d+:\d+|search\.query|NativeBridge|PluginHost|private-indexer|sqlite|fts/i,
  );
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
    files: {
      async exportMarkdown(_pageId: string, _path: string) {
        void _pageId;
        void _path;

        return undefined;
      },
      async importMarkdown(_path: string) {
        void _path;

        return "";
      },
    },
    notifications: {
      async notify(_input) {
        void _input;

        return undefined;
      },
    },
    shortcuts: {
      async register(_shortcut: string, _commandId: string) {
        void _shortcut;
        void _commandId;

        return undefined;
      },
      async unregister(_shortcut: string) {
        void _shortcut;

        return undefined;
      },
    },
  };
}

function createSequenceFactory(values: readonly string[]): () => string {
  let index = 0;

  return () => {
    const value = values[index];

    if (value === undefined) {
      throw new Error("No test id remains");
    }

    index += 1;

    return value;
  };
}

async function listTask041SurfaceChangesFromMaster(): Promise<string[]> {
  const changedTrackedFiles = await runGitLines([
    "diff",
    "--name-only",
    "master",
    "--",
    ...task041SurfaceEntrypoints,
  ]);
  const untrackedFiles = await runGitLines([
    "ls-files",
    "--others",
    "--exclude-standard",
    "--",
    ...task041SurfaceEntrypoints,
  ]);

  return [...new Set([...changedTrackedFiles, ...untrackedFiles])].sort();
}

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

async function readSourceFilesIfExists(
  absolutePath: string,
): Promise<SourceFile[]> {
  const entry = await statIfExists(absolutePath);

  if (entry === undefined) {
    return [];
  }

  if (entry.isFile()) {
    return sourceExtensions.has(path.extname(absolutePath))
      ? [
          {
            filePath: toRepoRelativePath(absolutePath),
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

function collectStaticModuleSpecifiers(contents: string): string[] {
  const specifiers: string[] = [];
  const importExportPattern =
    /\b(?:import|export)\s+(?:type\s+)?(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g;
  const sideEffectImportPattern = /\bimport\s*["']([^"']+)["']/g;
  const dynamicImportPattern = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;
  const commonJsRequirePattern = /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g;

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

  for (const match of contents.matchAll(dynamicImportPattern)) {
    const moduleSpecifier = match[1];

    if (moduleSpecifier !== undefined) {
      specifiers.push(moduleSpecifier);
    }
  }

  for (const match of contents.matchAll(commonJsRequirePattern)) {
    const moduleSpecifier = match[1];

    if (moduleSpecifier !== undefined) {
      specifiers.push(moduleSpecifier);
    }
  }

  return [...new Set(specifiers)].sort();
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

function findForbiddenTask041AppShellImport(
  resolvedModule: string,
): string | undefined {
  const normalized = resolvedModule.toLowerCase();

  if (/(?:^|\/)plugins\/search(?:$|\/|\.ts|\.tsx)/u.test(normalized)) {
    return "Search private plugin import";
  }

  if (
    /@tauri-apps|(?:^|\/)core\/native(?:$|\/)|(?:^|\/)core\/plugin-host(?:$|\/)|(?:^|\/)core\/stores(?:$|\/)|(?:^|\/)core\/registries(?:$|\/)/u.test(
      normalized,
    )
  ) {
    return "raw native/runtime owner import";
  }

  return undefined;
}

function findForbiddenSearchSurfacePatterns(sourceFile: SourceFile): string[] {
  const patterns = new Map<RegExp, string>([
    [/\bnew\s+Worker\b|\bWorker\s*\(/u, "background worker"],
    [/\bsearch(?:Index|Indexer)\b|\bindexSearch\b|\bbuildSearchIndex\b/iu, "persistent search indexer"],
    [/\bFTS(?:3|4|5)?\b|\bfull[-\s]?text\s+search\b|\bMATCH\s+AGAINST\b/iu, "FTS search surface"],
  ]);

  return [...patterns.entries()]
    .filter(([pattern]) => pattern.test(sourceFile.source))
    .map(([, description]) => `${sourceFile.filePath}: ${description}`);
}

async function readAppShellSourceFiles(): Promise<SourceFile[]> {
  const fileGroups = await Promise.all(
    appShellEntrypoints.map((entrypoint) =>
      readSourceFilesIfExists(path.join(repoRoot, entrypoint)),
    ),
  );

  return fileGroups.flat().sort((left, right) =>
    left.filePath.localeCompare(right.filePath),
  );
}

function findForbiddenMuiImportPatterns(sourceFile: SourceFile): string[] {
  const violations: string[] = [];

  for (const moduleSpecifier of collectStaticModuleSpecifiers(sourceFile.source)) {
    if (
      moduleSpecifier === "@mui/material" ||
      moduleSpecifier === "@mui/icons-material"
    ) {
      violations.push(`${sourceFile.filePath}: MUI barrel import`);
    }
  }

  return violations;
}

function findRemovedMuiPropPatterns(sourceFile: SourceFile): string[] {
  if (/^src\/test\//u.test(sourceFile.filePath)) {
    return [];
  }

  const patterns = new Map<RegExp, string>([
    [/<ListItem\b[^>]*\bbutton(?:\s|=|>|\{)/u, "ListItem button prop"],
    [/<[A-Z][\w.:-]*\b[^>]*\bBackdropProps\s*=/u, "BackdropProps prop"],
    [/<[A-Z][\w.:-]*\b[^>]*\bPaperProps\s*=/u, "PaperProps prop"],
    [/<[A-Z][\w.:-]*\b[^>]*\bTransitionComponent\s*=/u, "TransitionComponent prop"],
    [/<[A-Z][\w.:-]*\b[^>]*\bTransitionProps\s*=/u, "TransitionProps prop"],
    [/<[A-Z][\w.:-]*\b[^>]*\bcomponents\s*=/u, "components prop"],
    [/<[A-Z][\w.:-]*\b[^>]*\bcomponentsProps\s*=/u, "componentsProps prop"],
    [/<[A-Z][\w.:-]*\b[^>]*\bInputProps\s*=/u, "InputProps prop"],
    [/<[A-Z][\w.:-]*\b[^>]*\binputProps\s*=/u, "inputProps prop"],
    [/<[A-Z][\w.:-]*\b[^>]*\bSelectProps\s*=/u, "SelectProps prop"],
    [/<[A-Z][\w.:-]*\b[^>]*\bInputLabelProps\s*=/u, "InputLabelProps prop"],
    [
      /<[A-Z][\w.:-]*\b[^>]*\bFormHelperTextProps\s*=/u,
      "FormHelperTextProps prop",
    ],
  ]);

  return [...patterns.entries()]
    .filter(([pattern]) => pattern.test(sourceFile.source))
    .map(([, description]) => `${sourceFile.filePath}: ${description}`);
}

function findForbiddenTestingApiPatterns(sourceFile: SourceFile): string[] {
  const violations: string[] = [];
  const lowLevelEventName = "fire" + "Event";
  const reactDomTestUtilsSpecifier = ["react-dom", "test-utils"].join("/");

  for (const moduleSpecifier of collectStaticModuleSpecifiers(sourceFile.source)) {
    if (moduleSpecifier === reactDomTestUtilsSpecifier) {
      violations.push(`${sourceFile.filePath}: react-dom test utilities import`);
    }
  }

  const testingPatterns = new Map<RegExp, string>([
    [
      new RegExp(
        `import\\s+\\{[^}]*\\b${lowLevelEventName}\\b[^}]*\\}\\s+from\\s+["']@testing-library/react["']`,
        "u",
      ),
      "Testing Library low-level event import",
    ],
    [
      new RegExp(`\\b${lowLevelEventName}\\.`, "u"),
      "Testing Library low-level event usage",
    ],
    [/\b(?:describe|it|test)\.(?:only|skip)\s*\(/u, "focused or skipped test"],
    [/\bdelay\s*:\s*null\b/u, "user-event delay null"],
  ]);

  for (const [pattern, description] of testingPatterns) {
    if (pattern.test(sourceFile.source)) {
      violations.push(`${sourceFile.filePath}: ${description}`);
    }
  }

  return violations;
}

function toRepoRelativePath(filePath: string): string {
  return path.relative(repoRoot, filePath).replace(/\\/gu, "/");
}

async function runGitLines(args: readonly string[]): Promise<string[]> {
  const { stdout } = await execFileAsync("git", args, { cwd: repoRoot });

  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}
