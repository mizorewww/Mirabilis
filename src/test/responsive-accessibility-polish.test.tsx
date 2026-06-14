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

type SourceFile = {
  filePath: string;
  source: string;
};

type ViewportRestore = () => void;

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const execFileAsync = promisify(execFile);
const viewportRestores: ViewportRestore[] = [];
const desktopWidth = 1280;
const narrowWidth = 640;
const commandPaletteName = /^Command Palette$/i;
const searchDialogName = /^Search$/i;
const quickCaptureName = /^Quick Capture$/i;
const appShellEntrypoints = [
  "src/App.tsx",
  "src/main.tsx",
  "src/providers",
  "src/shell",
] as const;
const task045SurfaceEntrypoints = [
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
const sourceExtensions = new Set([".ts", ".tsx"]);

afterEach(() => {
  while (viewportRestores.length > 0) {
    viewportRestores.pop()?.();
  }

  vi.restoreAllMocks();
});

describe("TASK-045 responsive and accessible shell behavior", () => {
  it("keeps the desktop workbench navigable with named landmarks, active route state, and an editable Markdown workspace", async () => {
    installViewport(desktopWidth);
    const runtime = await createRuntime({ pageIds: ["desktop-home"] });

    createRuntimePage(runtime, "Home", [
      { blockId: "desktop-body", text: "Desktop home body" },
    ]);
    renderReadyApp(runtime);

    const banner = await screen.findByRole("banner", { name: /mirabilis/i });
    const navigation = await screen.findByRole("navigation", {
      name: /^Workspace$/i,
    });
    const main = await screen.findByRole("main", { name: /home/i });

    expect(banner).toBeVisible();
    expect(navigation).toBeVisible();
    expect(main).toBeVisible();
    expect(
      within(main).getByRole("heading", { name: /^Home Workspace$/i }),
    ).toBeVisible();
    expect(
      (
        within(main).getByRole("textbox", {
          name: /markdown/i,
        }) as HTMLTextAreaElement
      ).value,
    ).toContain("Desktop home body");
    expect(
      within(navigation).getByRole("button", { name: /^Home\b/i }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      within(banner).getByRole("button", { name: /^Workspace navigation$/i }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(
      within(banner).getByRole("button", { name: /^Command$/i }),
    ).toBeVisible();
    expect(
      within(banner).getByRole("button", { name: /^Search$/i }),
    ).toBeVisible();
    expect(
      within(banner).getByRole("button", { name: /^Quick Capture$/i }),
    ).toBeVisible();
    expect(
      within(banner).getByRole("button", { name: /^Settings$/i }),
    ).toBeVisible();
    expect(
      within(banner).getByRole("button", { name: /^Context Panel$/i }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("heading", {
        name: /welcome|get started|landing|hero/i,
      }),
    ).not.toBeInTheDocument();
  });

  it("starts narrow layouts with temporary navigation closed while the Markdown editor remains the primary screen", async () => {
    installViewport(narrowWidth);
    const runtime = await createRuntime({ pageIds: ["narrow-home"] });

    createRuntimePage(runtime, "Home", [
      { blockId: "narrow-body", text: "Narrow home body" },
    ]);
    renderReadyApp(runtime);

    const toggle = await screen.findByRole("button", {
      name: /^Workspace navigation$/i,
    });
    const main = await screen.findByRole("main", { name: /home/i });

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("navigation", { name: /^Workspace$/i }),
    ).not.toBeInTheDocument();
    expect(within(main).getByRole("textbox", { name: /markdown/i })).toBeVisible();
  });

  it("uses narrow temporary navigation that closes on route selection, restores focus, and preserves active route state", async () => {
    installViewport(narrowWidth);
    const user = userEvent.setup();
    const runtime = await createRuntime({ pageIds: ["narrow-route-home"] });

    createRuntimePage(runtime, "Home", [
      { blockId: "narrow-route-body", text: "Narrow route body" },
    ]);
    renderReadyApp(runtime);

    const toggle = await screen.findByRole("button", {
      name: /^Workspace navigation$/i,
    });

    if (toggle.getAttribute("aria-expanded") !== "true") {
      await user.click(toggle);
    }

    const navigation = await screen.findByRole("navigation", {
      name: /^Workspace$/i,
    });
    const todayRoute = within(navigation).getByRole("button", {
      name: /^Today\b/i,
    });

    await user.click(todayRoute);

    expect(await screen.findByRole("main", { name: /today/i })).toBeVisible();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await waitFor(() =>
      expect(
        screen.queryByRole("navigation", { name: /^Workspace$/i }),
      ).not.toBeInTheDocument(),
    );
    expect(toggle).toHaveFocus();

    await user.click(toggle);

    const reopenedNavigation = await screen.findByRole("navigation", {
      name: /^Workspace$/i,
    });

    expect(
      within(reopenedNavigation).getByRole("button", { name: /^Today\b/i }),
    ).toHaveAttribute("aria-current", "page");
  });

  it("keeps the desktop page context panel accessible, Escape-closeable, and separate from the mounted editor", async () => {
    installViewport(desktopWidth);
    const user = userEvent.setup();
    const runtime = await createRuntime({ pageIds: ["context-home"] });

    createRuntimePage(runtime, "Home", [
      { blockId: "context-body", text: "Context body" },
    ]);
    renderReadyApp(runtime);

    const main = await screen.findByRole("main", { name: /home/i });
    const editor = within(main).getByRole("textbox", { name: /markdown/i });
    const launcher = await screen.findByRole("button", {
      name: /^Context Panel$/i,
    });

    await user.click(editor);
    await user.type(editor, "\nEditable with context");
    await user.click(launcher);

    const panel = await screen.findByRole("complementary", {
      name: /page context/i,
    });

    expect(panel).toBeVisible();
    expect(launcher).toHaveAttribute("aria-expanded", "true");
    expect(within(panel).getByRole("tab", { name: /^ML$/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      (
        within(main).getByRole("textbox", {
          name: /markdown/i,
        }) as HTMLTextAreaElement
      ).value,
    ).toContain("Editable with context");

    await user.click(
      within(panel).getByRole("button", { name: /close context panel/i }),
    );

    await waitFor(() =>
      expect(
        screen.queryByRole("complementary", { name: /page context/i }),
      ).not.toBeInTheDocument(),
    );
    expect(launcher).toHaveFocus();
    expect(within(main).getByRole("textbox", { name: /markdown/i })).toBeVisible();

    await user.click(launcher);
    expect(
      await screen.findByRole("complementary", { name: /page context/i }),
    ).toBeVisible();

    await user.keyboard("{Escape}");

    await waitFor(() =>
      expect(
        screen.queryByRole("complementary", { name: /page context/i }),
      ).not.toBeInTheDocument(),
    );
    expect(launcher).toHaveFocus();
    expect(
      (
        within(main).getByRole("textbox", {
          name: /markdown/i,
        }) as HTMLTextAreaElement
      ).value,
    ).toContain("Editable with context");
  });

  it("turns the narrow page context panel into a named temporary dialog with focus containment, Escape close, and editor preservation", async () => {
    installViewport(narrowWidth);
    const user = userEvent.setup();
    const runtime = await createRuntime({ pageIds: ["narrow-context-home"] });

    createRuntimePage(runtime, "Home", [
      { blockId: "narrow-context-body", text: "Narrow context body" },
    ]);
    renderReadyApp(runtime);

    const main = await screen.findByRole("main", { name: /home/i });
    const editor = within(main).getByRole("textbox", { name: /markdown/i });
    const launcher = await screen.findByRole("button", {
      name: /^Context Panel$/i,
    });

    await user.type(editor, "\nNarrow panel keeps editor mounted");
    await user.click(launcher);

    const dialog = await screen.findByRole("dialog", { name: /page context/i });

    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName(/page context/i);
    expect(dialog).toContainElement(
      within(dialog).getByRole("button", { name: /close context panel/i }),
    );
    // eslint-disable-next-line testing-library/no-node-access -- Focus-trap assertions need the current active element.
    expect(dialog).toContainElement(document.activeElement as HTMLElement);

    await user.tab();
    // eslint-disable-next-line testing-library/no-node-access -- Focus-trap assertions need the current active element.
    expect(dialog).toContainElement(document.activeElement as HTMLElement);

    await user.keyboard("{Escape}");

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: /page context/i }),
      ).not.toBeInTheDocument(),
    );
    expect(launcher).toHaveFocus();
    expect(
      (
        within(main).getByRole("textbox", {
          name: /markdown/i,
        }) as HTMLTextAreaElement
      ).value,
    ).toContain("Narrow panel keeps editor mounted");
  });

  it("keeps Command Palette, Search, and Quick Capture dialogs named, initially focused, trapped, and focus-returning", async () => {
    installViewport(desktopWidth);
    const user = userEvent.setup();
    const runtime = await createRuntime({ pageIds: ["dialog-home"] });

    createRuntimePage(runtime, "Home", [
      { blockId: "dialog-body", text: "Dialog body" },
    ]);
    runtime.commands.register({
      handler: async () => ({ ok: true }),
      id: "quick-capture.review-dialog-focus",
      pluginId: "quick-capture",
      title: "Review Dialog Focus",
    });
    renderReadyApp(runtime);

    const commandButton = await findTopBarButton(/^Command$/i);

    await user.click(commandButton);

    const commandDialog = await screen.findByRole("dialog", {
      name: commandPaletteName,
    });
    const commandSearch = within(commandDialog).getByRole("textbox", {
      name: /command search|search commands/i,
    });

    await waitFor(() => expect(commandSearch).toHaveFocus());
    await user.tab();
    // eslint-disable-next-line testing-library/no-node-access -- Focus-trap assertions need the current active element.
    expect(commandDialog).toContainElement(document.activeElement as HTMLElement);
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: commandPaletteName }),
      ).not.toBeInTheDocument(),
    );
    expect(commandButton).toHaveFocus();

    const searchButton = await findTopBarButton(/^Search$/i);

    await user.click(searchButton);

    const searchDialog = await screen.findByRole("dialog", {
      name: searchDialogName,
    });
    const searchInput = within(searchDialog).getByRole("textbox", {
      name: /search query/i,
    });

    await waitFor(() => expect(searchInput).toHaveFocus());
    await user.tab();
    // eslint-disable-next-line testing-library/no-node-access -- Focus-trap assertions need the current active element.
    expect(searchDialog).toContainElement(document.activeElement as HTMLElement);
    await user.click(within(searchDialog).getByRole("button", { name: /cancel/i }));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: searchDialogName }),
      ).not.toBeInTheDocument(),
    );
    expect(searchButton).toHaveFocus();

    const quickCaptureButton = await findTopBarButton(/^Quick Capture$/i);

    await user.click(quickCaptureButton);

    const quickCaptureDialog = await screen.findByRole("dialog", {
      name: quickCaptureName,
    });
    const markdown = within(quickCaptureDialog).getByRole("textbox", {
      name: /markdown/i,
    });

    await waitFor(() => expect(markdown).toHaveFocus());
    await user.tab();
    // eslint-disable-next-line testing-library/no-node-access -- Focus-trap assertions need the current active element.
    expect(quickCaptureDialog).toContainElement(document.activeElement as HTMLElement);
    await user.click(
      within(quickCaptureDialog).getByRole("button", { name: /cancel/i }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: quickCaptureName }),
      ).not.toBeInTheDocument(),
    );
    expect(quickCaptureButton).toHaveFocus();
  });

  it("keeps startup failure state text generic and free of raw runtime, SQL, path, token, and provider details", async () => {
    installViewport(desktopWidth);
    const initializeRuntime = vi
      .fn<() => Promise<AppRuntime>>()
      .mockRejectedValue(createSensitiveStartupError());

    render(<App initializeRuntime={initializeRuntime} />);

    const alert = await screen.findByRole("alert");

    expect(alert).toBeVisible();
    expect(alert).toHaveTextContent(/mirabilis could not start/i);
    expect(document.body.textContent ?? "").not.toMatch(
      /SELECT\s+\*|core_pages|\/home\/aac6fef|C:\\|Bearer|OPENAI|sk-test|provider|token|secret|NativeBridge|PluginHost|at\s+\S+:\d+:\d+/i,
    );
    expect(
      screen.queryByRole("banner", { name: /mirabilis/i }),
    ).not.toBeInTheDocument();
  });
});

describe("TASK-045 static responsive and accessibility guards", () => {
  it("does not add package, lockfile, Tauri, Rust, IPC, schema, capability, permission, native, or release drift", async () => {
    expect(
      await disallowedNativeSurfaceChanges(
        await listTask045SurfaceChangesFromMaster(),
      ),
    ).toStrictEqual([]);
  });

  it("keeps app-shell responsive polish within supported MUI and current UI scope", async () => {
    const sourceFiles = await readSourceFiles(appShellEntrypoints);
    const violations = sourceFiles.flatMap(findTask045SourceViolations);

    expect(violations).toStrictEqual([]);
  });

  it("keeps tests free of focused/skipped cases and stale direct interaction APIs", async () => {
    const testFiles = await readSourceFiles(["src/test"]);
    const violations = testFiles.flatMap(findTask045TestViolations);

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
    app: {
      pluginApiVersion: "test-api",
      version: "45.0.0-responsive",
    },
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

async function findTopBarButton(name: RegExp): Promise<HTMLElement> {
  const banner = await screen.findByRole("banner", { name: /mirabilis/i });

  return within(banner).findByRole("button", { name });
}

function installViewport(width: number): void {
  const previousInnerWidth = window.innerWidth;
  const previousMatchMedia =
    "matchMedia" in window ? window.matchMedia : undefined;

  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: width,
  });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => createMatchMediaList(query, width),
    writable: true,
  });

  viewportRestores.push(() => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: previousInnerWidth,
    });

    if (previousMatchMedia === undefined) {
      Reflect.deleteProperty(window, "matchMedia");
    } else {
      Object.defineProperty(window, "matchMedia", {
        configurable: true,
        value: previousMatchMedia,
        writable: true,
      });
    }
  });
}

function createMatchMediaList(query: string, width: number): MediaQueryList {
  const listeners = new Set<EventListenerOrEventListenerObject>();
  const legacyListeners = new Set<
    (this: MediaQueryList, event: MediaQueryListEvent) => unknown
  >();
  const mediaQueryList: MediaQueryList = {
    addEventListener(
      _type: string,
      listener: EventListenerOrEventListenerObject | null,
    ) {
      if (listener !== null) {
        listeners.add(listener);
      }
    },
    addListener(listener) {
      if (listener !== null) {
        legacyListeners.add(listener);
      }
    },
    dispatchEvent(event) {
      for (const listener of listeners) {
        if (typeof listener === "function") {
          listener.call(mediaQueryList, event);
        } else {
          listener.handleEvent(event);
        }
      }

      for (const listener of legacyListeners) {
        listener.call(mediaQueryList, event as MediaQueryListEvent);
      }

      return true;
    },
    matches: mediaQueryMatchesWidth(query, width),
    media: query,
    onchange: null,
    removeEventListener(
      _type: string,
      listener: EventListenerOrEventListenerObject | null,
    ) {
      if (listener !== null) {
        listeners.delete(listener);
      }
    },
    removeListener(listener) {
      if (listener !== null) {
        legacyListeners.delete(listener);
      }
    },
  };

  return mediaQueryList;
}

function mediaQueryMatchesWidth(query: string, width: number): boolean {
  const minWidths = [...query.matchAll(/\(\s*min-width\s*:\s*([\d.]+)px\s*\)/giu)];
  const maxWidths = [...query.matchAll(/\(\s*max-width\s*:\s*([\d.]+)px\s*\)/giu)];
  const minMatches = minWidths.every((match) => width >= Number(match[1]));
  const maxMatches = maxWidths.every((match) => width <= Number(match[1]));

  return minMatches && maxMatches;
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

function createSensitiveStartupError(): Error {
  const error = new Error(
    [
      "PLUGIN_LIFECYCLE_FAILED",
      "provider=openai",
      "OPENAI_API_KEY=sk-test-secret",
      "SELECT * FROM core_pages WHERE token='SECRET'",
      "/home/aac6fef/Mirabilis/private/app.sqlite3",
      "Bearer FAKE_TOKEN",
    ].join(" "),
  );

  error.stack = [
    "Error: PLUGIN_LIFECYCLE_FAILED provider=openai",
    "    at activate (/home/aac6fef/Mirabilis/src/plugins/ai/provider.ts:12:4)",
  ].join("\n");

  return error;
}

async function listTask045SurfaceChangesFromMaster(): Promise<string[]> {
  const changedTrackedFiles = await runGitLines([
    "diff",
    "--name-only",
    "master",
    "--",
    ...task045SurfaceEntrypoints,
  ]);
  const untrackedFiles = await runGitLines([
    "ls-files",
    "--others",
    "--exclude-standard",
    "--",
    ...task045SurfaceEntrypoints,
  ]);

  return [...changedTrackedFiles, ...untrackedFiles].sort();
}

async function readSourceFiles(
  relativePaths: readonly string[],
): Promise<SourceFile[]> {
  const fileGroups = await Promise.all(
    relativePaths.map((relativePath) =>
      listSourceFilesIfExists(path.join(repoRoot, relativePath)),
    ),
  );
  const filePaths = fileGroups.flat().sort();
  const files = await Promise.all(
    filePaths.map(async (filePath) => ({
      filePath: toRepoRelativePath(filePath),
      source: await readFile(filePath, "utf8"),
    })),
  );

  return files;
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

function findTask045SourceViolations(sourceFile: SourceFile): string[] {
  const violations: string[] = [];
  const forbiddenPatterns: Array<[RegExp, string]> = [
    [/\bdisableAutoFocus\b/u, "focus trap disables auto focus"],
    [/\bdisableEnforceFocus\b/u, "focus trap disables enforced focus"],
    [/\bdisableRestoreFocus\b/u, "focus trap disables focus return"],
    [/\bdisableEscapeKeyDown\b/u, "dialog Escape close disabled"],
    [/\bhideBackdrop\b/u, "temporary surface backdrop hidden"],
    [/^import\s+.+from\s+["']@material-ui(?:\/|["'])/mu, "legacy Material UI import"],
    [/\bcreateMuiTheme\b/u, "deprecated createMuiTheme"],
    [/\bMuiThemeProvider\b/u, "deprecated MuiThemeProvider"],
    [/\bGridLegacy\b/u, "deprecated GridLegacy"],
    [/<[A-Z][\w.:-]*\b[^>]*\bcomponentsProps\s*=/u, "deprecated componentsProps prop"],
    [/<[A-Z][\w.:-]*\b[^>]*\bcomponents\s*=/u, "deprecated components prop"],
    [/\bReactDOM\.render\s*\(/u, "legacy ReactDOM.render"],
    [/\bfindDOMNode\s*\(/u, "legacy findDOMNode"],
    [/@mui\/x-/u, "MUI X package is deferred"],
    [/\bpage\.sidebar\.panel\b/u, "broad page.sidebar.panel mounting is deferred"],
    [/\bquick-capture\.mobile-input\b/u, "mobile Quick Capture toolbar mounting is deferred"],
    [/\bsync\.(?:start|push|pull)\b/u, "executable Sync transport is deferred"],
    [/\bsettings\.(?:save|update|persist|connect)\b/u, "executable settings persistence is deferred"],
    [/\b(?:fetch|XMLHttpRequest)\s*\(/u, "network/provider execution is deferred"],
    [/\b(?:localStorage|sessionStorage)\b/u, "browser storage settings persistence is deferred"],
  ];

  for (const [pattern, label] of forbiddenPatterns) {
    if (pattern.test(sourceFile.source)) {
      violations.push(`${sourceFile.filePath}: ${label}`);
    }
  }

  return violations;
}

function findTask045TestViolations(sourceFile: SourceFile): string[] {
  const violations: string[] = [];
  const forbiddenPatterns: Array<[RegExp, string]> = [
    [/\b(?:describe|it|test)\.(?:only|skip)\s*\(/u, "focused or skipped test"],
    [new RegExp("\\bfire" + "Event\\b", "u"), "low-level event API"],
    [/\buserEvent\.(?:click|type|keyboard|tab|hover|unhover|clear)\s*\(/u, "direct userEvent API without setup instance"],
    [/@testing-library\/react-hooks/u, "stale react-hooks testing package"],
  ];

  for (const [pattern, label] of forbiddenPatterns) {
    if (pattern.test(sourceFile.source)) {
      violations.push(`${sourceFile.filePath}: ${label}`);
    }
  }

  return violations;
}

function toRepoRelativePath(absolutePath: string): string {
  return path.relative(repoRoot, absolutePath).split(path.sep).join("/");
}

async function runGitLines(args: readonly string[]): Promise<string[]> {
  const output = await runGitOutput(args);

  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

async function runGitOutput(args: readonly string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd: repoRoot,
    maxBuffer: 10 * 1024 * 1024,
  });

  return stdout;
}
