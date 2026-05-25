import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode, useEffect, useState, type ComponentType } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "../App";
import { createAppRuntime, type AppRuntime } from "../bootstrap";
import {
  createCoreStores,
  exportStructuredDocumentToMarkdown,
  type BlockNode,
  type CoreStores,
  type DbQuery,
  type MarkdownPage,
  type NativeBridge,
  type StructuredMarkdownDocument,
} from "../core";
import { useMarkdownWorkspaceBridge } from "../shell/hosts";

type NativeBridgeTransactionResult<Response> =
  Response extends readonly unknown[]
    ? number extends Response["length"]
      ? Array<Response>
      : Response
    : Array<Response>;

type Deferred<Value> = {
  promise: Promise<Value>;
  resolve(value: Value): void;
  reject(reason: unknown): void;
};

type MarkdownInsertTextResult = {
  markdown: string;
  selectionStart: number;
  selectionEnd: number;
};

type CreateRuntimeOptions = {
  pageIds?: readonly string[];
};

type CapturedEditorProps = Record<string, unknown>;

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const execFileAsync = promisify(execFile);
const sourcePageTitle = "Home";
const markdownInsertCommandId = "markdown.insert-text";
const openTaskPageCommandId = "task.open-task-page";
const toggleTaskStatusCommandId = "task.toggle-status";
const task037NativeAndPackageSurfaceEntrypoints = [
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

afterEach(() => {
  vi.restoreAllMocks();
});

describe("TASK-037 Home workspace editor", () => {
  it("shows an editable Home Markdown workspace as the ready first screen", async () => {
    const runtime = await createRuntime({
      pageIds: ["home-session-page"],
    });
    const user = userEvent.setup();

    renderReadyApp(runtime);

    const main = await screen.findByRole("main", { name: /home/i });
    const editor = await within(main).findByRole("textbox", {
      name: /markdown/i,
    });

    expect(editor).toBeEnabled();
    expect(editor).toHaveValue("");
    expect(
      within(main).queryByRole("region", {
        name: /^Home route placeholders$/i,
      }),
    ).not.toBeInTheDocument();
    expect(
      within(main).queryByText(/^Markdown editor view placeholder$/i),
    ).not.toBeInTheDocument();
    expect(
      within(main).queryByText(/startup|landing|hero/i),
    ).not.toBeInTheDocument();

    await user.type(editor, "Empty Home page is editable");

    expect(editor).toHaveValue("Empty Home page is editable");
  });

  it("creates and selects exactly one session Home page across StrictMode rerenders", async () => {
    const runtime = await createRuntime({
      pageIds: ["home-session-page", "duplicate-home-page"],
    });
    const capturedProps: CapturedEditorProps[] = [];

    replaceRegisteredPageEditor(
      runtime,
      createCapturingEditor("Replacement registered page editor", capturedProps),
    );

    const initializeRuntime = vi.fn(async () => runtime);
    const { rerender } = render(
      <StrictMode>
        <App initializeRuntime={initializeRuntime} />
      </StrictMode>,
    );

    expect(
      await screen.findByText("Replacement registered page editor"),
    ).toBeVisible();
    expect(await screen.findByTestId("registered-editor-page-id")).toHaveTextContent(
      "home-session-page",
    );

    rerender(
      <StrictMode>
        <App initializeRuntime={initializeRuntime} />
      </StrictMode>,
    );

    await waitFor(() =>
      expect(homePages(runtime).map((page) => page.id)).toStrictEqual([
        "home-session-page",
      ]),
    );
    expect(
      new Set(capturedProps.map(readCapturedPageId).filter(isDefined)),
    ).toStrictEqual(new Set(["home-session-page"]));
  });

  it("renders the registered page.editor view through ViewHost without leaking raw runtime surfaces", async () => {
    const runtime = await createRuntime({
      pageIds: ["home-session-page"],
    });
    const capturedProps: CapturedEditorProps[] = [];

    replaceRegisteredPageEditor(
      runtime,
      createCapturingEditor("Registry swapped Home editor", capturedProps),
    );

    renderReadyApp(runtime);

    expect(await screen.findByText("Registry swapped Home editor")).toBeVisible();
    expect(capturedProps.length).toBeGreaterThan(0);

    const latestProps = capturedProps[capturedProps.length - 1];

    expect(latestProps).toBeDefined();

    if (latestProps === undefined) {
      return;
    }

    expect(Object.isFrozen(latestProps)).toBe(true);
    expect(latestProps.data).toMatchObject({
      kind: "markdown-page",
    });
    expect(collectForbiddenLeakPaths(latestProps)).toStrictEqual([]);
    expect(collectFunctionValuePaths(latestProps)).toStrictEqual([]);
  });

  it("keeps hosted editor page loads scoped to the current Home page", async () => {
    const runtime = await createRuntime();
    const foreignPage = createRuntimePage(runtime, "Foreign secret page", [
      {
        blockId: "foreign-secret-line",
        text: "Sensitive non-current page body",
      },
    ]);

    replaceRegisteredPageEditor(
      runtime,
      createForeignLoadProbeEditor(foreignPage.id),
    );

    renderReadyApp(runtime);

    expect(
      await screen.findByText("Foreign page load probe editor"),
    ).toBeVisible();

    const probeStatus = await screen.findByRole("status", {
      name: /foreign page load probe/i,
    });

    await waitFor(() =>
      expect(probeStatus).not.toHaveTextContent("foreign page probe pending"),
    );
    expect(probeStatus).toHaveTextContent("foreign page blocked");
    expect(probeStatus).not.toHaveTextContent(/Foreign secret page/u);
    expect(probeStatus).not.toHaveTextContent(/Sensitive non-current page body/u);
    expect(
      screen.queryByText(/Sensitive non-current page body/u),
    ).not.toBeInTheDocument();
  });

  it("lets a user type Markdown, use snippet toolbar buttons, save, and see the saved Home result", async () => {
    const runtime = await createRuntime({
      pageIds: ["home-session-page"],
    });
    const user = userEvent.setup();
    const executeSpy = vi.spyOn(runtime.commands, "execute");

    renderReadyApp(runtime);

    const main = await screen.findByRole("main", { name: /home/i });
    const editor = await within(main).findByRole("textbox", {
      name: /markdown/i,
    });

    await user.click(editor);
    await user.type(editor, "# Home workspace\n\n");
    await user.click(
      within(main).getByRole("button", { name: /insert task syntax/i }),
    );
    await waitFor(() =>
      expect(readTextAreaValue(editor)).toMatch(/- \[ \] $/u),
    );
    await user.type(editor, "Ship TASK-037\n");
    await user.click(
      within(main).getByRole("button", {
        name: /insert heading or tag marker/i,
      }),
    );
    await waitFor(() => expect(readTextAreaValue(editor)).toMatch(/#$/u));
    await user.type(editor, "focus\n");
    await user.click(
      within(main).getByRole("button", { name: /insert page link syntax/i }),
    );
    await waitFor(() =>
      expect(readTextAreaValue(editor)).toMatch(/\[\[ \]\]$/u),
    );

    const savedMarkdown = readTextAreaValue(editor);

    await user.click(within(main).getByRole("button", { name: /^Save$/i }));

    await waitFor(() =>
      expect(within(main).getByText(/saved/i)).toBeVisible(),
    );
    expectHomeMarkdown(runtime, savedMarkdown);
    expect(executeSpy).toHaveBeenCalledWith(
      markdownInsertCommandId,
      expect.objectContaining({
        pageId: "home-session-page",
      }),
    );
  });

  it("opens task titles only to the command-returned page and toggles checkbox status visibly on Home", async () => {
    const runtime = await createRuntime({
      pageIds: ["home-session-page", "task-page-returned"],
    });
    const homePage = createRuntimePage(runtime, sourcePageTitle, [
      {
        blockId: "home-task-block",
        text: "- [ ] Build adapter",
        attrs: {
          boundPageId: "forged-page-id",
        },
      },
    ]);
    const user = userEvent.setup();
    const executeSpy = vi.spyOn(runtime.commands, "execute");

    renderReadyApp(runtime);

    const editor = await screen.findByRole("textbox", { name: /markdown/i });

    expect(editor).toHaveValue("- [ ] Build adapter");

    await user.click(await screen.findByRole("button", { name: "Build adapter" }));

    await waitFor(() =>
      expect(executeSpy).toHaveBeenCalledWith(openTaskPageCommandId, {
        sourcePageId: homePage.id,
        sourceBlockId: "home-task-block",
      }),
    );
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: /markdown/i })).toHaveValue(""),
    );
    expect(runtime.pages.get("task-page-returned").title).toBe("Build adapter");
    expect(screen.queryByRole("button", { name: "Build adapter" })).not.toBeInTheDocument();

    await user.click(
      within(screen.getByRole("navigation", { name: /workspace/i })).getByRole(
        "button",
        { name: /home/i },
      ),
    );

    expect(
      await screen.findByRole("checkbox", {
        checked: false,
        name: "Build adapter",
      }),
    ).toBeVisible();

    await user.click(screen.getByRole("checkbox", { name: "Build adapter" }));

    await waitFor(() =>
      expect(executeSpy).toHaveBeenCalledWith(toggleTaskStatusCommandId, {
        sourcePageId: homePage.id,
        sourceBlockId: "home-task-block",
      }),
    );
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: /markdown/i })).toHaveValue(
        "- [x] Build adapter",
      ),
    );
    expect(
      screen.getByRole("checkbox", {
        checked: true,
        name: "Build adapter",
      }),
    ).toBeVisible();
    expect(
      exportStructuredDocumentToMarkdown(runtime.pages.get(homePage.id).body),
    ).toBe("- [x] Build adapter");
  });

  it("ignores a stale toolbar insert after switching away from Home", async () => {
    const runtime = await createRuntime({
      pageIds: ["home-session-page"],
    });
    createRuntimePage(runtime, sourcePageTitle, [
      {
        blockId: "home-line",
        text: "Original Home text",
      },
    ]);
    const user = userEvent.setup();
    const insertCompletion = createDeferred<MarkdownInsertTextResult>();
    const originalExecute = runtime.commands.execute.bind(runtime.commands);
    const insertCalls: unknown[] = [];

    vi.spyOn(runtime.commands, "execute").mockImplementation(
      (commandId: string, input?: unknown) => {
        if (commandId === markdownInsertCommandId) {
          insertCalls.push(input);

          return insertCompletion.promise;
        }

        return originalExecute(commandId, input);
      },
    );

    renderReadyApp(runtime);

    const homeEditor = await screen.findByRole("textbox", { name: /markdown/i });

    expect(homeEditor).toHaveValue("Original Home text");

    await user.click(
      screen.getByRole("button", { name: /insert task syntax/i }),
    );
    await waitFor(() => expect(insertCalls).toHaveLength(1));
    await user.click(
      within(screen.getByRole("navigation", { name: /workspace/i })).getByRole(
        "button",
        { name: /inbox/i },
      ),
    );

    const inboxMain = await screen.findByRole("main", { name: /inbox/i });

    expect(
      within(inboxMain).queryByRole("textbox", { name: /markdown/i }),
    ).not.toBeInTheDocument();

    await act(async () => {
      insertCompletion.resolve({
        markdown: "STALE OVERWRITE",
        selectionStart: 15,
        selectionEnd: 15,
      });
      await insertCompletion.promise;
      await Promise.resolve();
    });

    expect(screen.getByRole("main", { name: /inbox/i })).not.toHaveTextContent(
      "STALE OVERWRITE",
    );

    await user.click(
      within(screen.getByRole("navigation", { name: /workspace/i })).getByRole(
        "button",
        { name: /home/i },
      ),
    );

    expect(
      await screen.findByRole("textbox", { name: /markdown/i }),
    ).toHaveValue("Original Home text");
  });

  it("ignores a stale task title open after switching away from Home", async () => {
    const runtime = await createRuntime({
      pageIds: ["home-session-page", "delayed-task-page"],
    });
    const homePage = createRuntimePage(runtime, sourcePageTitle, [
      {
        blockId: "delayed-task-block",
        text: "- [ ] Delayed open",
      },
    ]);
    const returnedTaskPage = createRuntimePage(runtime, "Delayed task page", []);
    const user = userEvent.setup();
    const openCompletion = createDeferred<{ pageId: string }>();
    const originalExecute = runtime.commands.execute.bind(runtime.commands);
    const openCalls: unknown[] = [];

    vi.spyOn(runtime.commands, "execute").mockImplementation(
      (commandId: string, input?: unknown) => {
        if (commandId === openTaskPageCommandId) {
          openCalls.push(input);

          return openCompletion.promise;
        }

        return originalExecute(commandId, input);
      },
    );

    renderReadyApp(runtime);

    await user.click(await screen.findByRole("button", { name: "Delayed open" }));
    await waitFor(() =>
      expect(openCalls).toStrictEqual([
        {
          sourcePageId: homePage.id,
          sourceBlockId: "delayed-task-block",
        },
      ]),
    );
    await user.click(
      within(screen.getByRole("navigation", { name: /workspace/i })).getByRole(
        "button",
        { name: /today/i },
      ),
    );

    const todayMain = await screen.findByRole("main", { name: /today/i });

    expect(
      within(todayMain).queryByRole("textbox", { name: /markdown/i }),
    ).not.toBeInTheDocument();

    await act(async () => {
      openCompletion.resolve({ pageId: returnedTaskPage.id });
      await openCompletion.promise;
      await Promise.resolve();
    });

    expect(screen.getByRole("main", { name: /today/i })).toBeVisible();
    expect(
      screen.queryByRole("textbox", { name: /markdown/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("main", { name: /home/i }),
    ).not.toBeInTheDocument();
  });

  it("keeps non-Home routes as placeholders without mounting the Markdown editor", async () => {
    const runtime = await createRuntime({
      pageIds: ["home-session-page"],
    });
    const user = userEvent.setup();

    renderReadyApp(runtime);

    expect(
      await screen.findByRole("textbox", { name: /markdown/i }),
    ).toBeVisible();

    for (const route of [
      {
        name: /inbox/i,
        placeholder: /^Inbox filter placeholder$/i,
      },
      {
        name: /today/i,
        placeholder: /^Today filter placeholder$/i,
      },
      {
        name: /all tasks/i,
        placeholder: /^Saved filter placeholder$/i,
      },
      {
        name: /reports/i,
        placeholder: /^Stats projection placeholder$/i,
      },
    ]) {
      await user.click(
        within(screen.getByRole("navigation", { name: /workspace/i })).getByRole(
          "button",
          { name: route.name },
        ),
      );

      const main = await screen.findByRole("main", { name: route.name });

      expect(within(main).getByText(route.placeholder)).toBeVisible();
      expect(
        within(main).queryByRole("textbox", { name: /markdown/i }),
      ).not.toBeInTheDocument();
    }
  });

  it("keeps TASK-037 free of package, native, Tauri, IPC, capability, permission, and release drift", async () => {
    expect(await listTask037SurfaceChangesFromMaster()).toStrictEqual([]);
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

function createSequenceFactory(values: readonly string[]): () => string {
  let index = 0;

  return () => {
    const value = values[index];

    index += 1;

    if (value === undefined) {
      return `generated-page-${index}`;
    }

    return value;
  };
}

function replaceRegisteredPageEditor(
  runtime: AppRuntime,
  component: ComponentType<Record<string, unknown>>,
): void {
  runtime.registries.views.unregister("markdown.page-editor");
  runtime.registries.views.register({
    id: "markdown.page-editor",
    pluginId: "markdown",
    type: "page.editor",
    title: "Replacement Markdown page editor",
    component,
    accepts: {
      kind: "markdown-page",
    },
  });
}

function createCapturingEditor(
  label: string,
  capturedProps: CapturedEditorProps[],
): ComponentType<Record<string, unknown>> {
  return function CapturingEditor(props: Record<string, unknown>) {
    capturedProps.push(props);

    return (
      <section aria-label="Registered Home page editor">
        <p>{label}</p>
        <p data-testid="registered-editor-kind">
          {readCapturedDataKind(props) ?? "missing-kind"}
        </p>
        <p data-testid="registered-editor-page-id">
          {readCapturedPageId(props) ?? "missing-page-id"}
        </p>
      </section>
    );
  };
}

function createForeignLoadProbeEditor(
  foreignPageId: string,
): ComponentType<Record<string, unknown>> {
  return function ForeignLoadProbeEditor() {
    const bridge = useMarkdownWorkspaceBridge();
    const [status, setStatus] = useState("foreign page probe pending");

    useEffect(() => {
      let active = true;

      if (bridge === undefined) {
        setStatus("foreign page blocked");

        return () => {
          active = false;
        };
      }

      void bridge.pages.load(foreignPageId).then(
        (page) => {
          if (active) {
            setStatus(`foreign page loaded: ${page.title} ${page.markdown}`);
          }
        },
        () => {
          if (active) {
            setStatus("foreign page blocked");
          }
        },
      );

      return () => {
        active = false;
      };
    }, [bridge, foreignPageId]);

    return (
      <section aria-label="Foreign page load probe editor">
        <p>Foreign page load probe editor</p>
        <p aria-label="Foreign page load probe" role="status">
          {status}
        </p>
      </section>
    );
  };
}

function readCapturedDataKind(props: CapturedEditorProps): string | undefined {
  const data = props.data;

  return isRecord(data) && typeof data.kind === "string" ? data.kind : undefined;
}

function readCapturedPageId(props: CapturedEditorProps): string | undefined {
  const data = props.data;

  if (!isRecord(data)) {
    return undefined;
  }

  if (typeof data.pageId === "string") {
    return data.pageId;
  }

  if (typeof data.id === "string") {
    return data.id;
  }

  const page = data.page;

  return isRecord(page) && typeof page.id === "string" ? page.id : undefined;
}

function createRuntimePage(
  runtime: AppRuntime,
  title: string,
  lines: readonly {
    blockId: string;
    text: string;
    attrs?: Record<string, unknown>;
  }[],
): MarkdownPage {
  return runtime.pages.create({
    title,
    body: structuredDocument(lines),
  });
}

function structuredDocument(
  lines: readonly {
    blockId: string;
    text: string;
    attrs?: Record<string, unknown>;
  }[],
): StructuredMarkdownDocument {
  return {
    type: "doc",
    content: lines.map((line): BlockNode => {
      const block: BlockNode = {
        blockId: line.blockId,
        type: "markdown.line",
        text: line.text,
      };

      if (line.attrs !== undefined) {
        block.attrs = line.attrs;
      }

      return block;
    }),
  };
}

function homePages(runtime: AppRuntime): MarkdownPage[] {
  return runtime.pages
    .list()
    .filter((page) => page.title === sourcePageTitle);
}

function expectHomeMarkdown(runtime: AppRuntime, expectedMarkdown: string): void {
  const [homePage] = homePages(runtime);

  if (homePage === undefined) {
    throw new Error("Expected Home page to exist");
  }

  expect(exportStructuredDocumentToMarkdown(homePage.body)).toBe(expectedMarkdown);
}

function readTextAreaValue(element: HTMLElement): string {
  if (!(element instanceof HTMLTextAreaElement)) {
    throw new Error("Expected Markdown editor to be a textarea");
  }

  return element.value;
}

function createDeferred<Value>(): Deferred<Value> {
  let resolve: Deferred<Value>["resolve"] | undefined;
  let reject: Deferred<Value>["reject"] | undefined;
  const promise = new Promise<Value>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  if (resolve === undefined || reject === undefined) {
    throw new Error("Deferred promise callbacks were not initialized");
  }

  return {
    promise,
    resolve,
    reject,
  };
}

function collectForbiddenLeakPaths(value: unknown, pathPrefix = "props"): string[] {
  if (!isRecord(value) && !Array.isArray(value)) {
    return [];
  }

  return Object.entries(value).flatMap(([key, nestedValue]) => {
    const pathName = `${pathPrefix}.${key}`;
    const ownViolation = isForbiddenLeakKey(key) ? [pathName] : [];

    if (typeof nestedValue === "function") {
      return ownViolation;
    }

    if (isRecord(nestedValue) || Array.isArray(nestedValue)) {
      return [
        ...ownViolation,
        ...collectForbiddenLeakPaths(nestedValue, pathName),
      ];
    }

    return ownViolation;
  });
}

function collectFunctionValuePaths(value: unknown, pathPrefix = "props"): string[] {
  if (!isRecord(value) && !Array.isArray(value)) {
    return [];
  }

  return Object.entries(value).flatMap(([key, nestedValue]) => {
    const pathName = `${pathPrefix}.${key}`;

    if (typeof nestedValue === "function") {
      return [pathName];
    }

    if (isRecord(nestedValue) || Array.isArray(nestedValue)) {
      return collectFunctionValuePaths(nestedValue, pathName);
    }

    return [];
  });
}

function isForbiddenLeakKey(key: string): boolean {
  return new Set([
    "bridge",
    "commandregistry",
    "commands",
    "db",
    "execute",
    "file",
    "files",
    "filesystem",
    "fs",
    "invoke",
    "load",
    "nativebridge",
    "pagefacade",
    "path",
    "pluginhost",
    "registries",
    "runtime",
    "save",
    "services",
    "stores",
    "tauri",
  ]).has(key.toLowerCase().replace(/[-_]/gu, ""));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDefined<Value>(value: Value | undefined): value is Value {
  return value !== undefined;
}

async function listTask037SurfaceChangesFromMaster(): Promise<string[]> {
  const changedTrackedFiles = await runGitLines([
    "diff",
    "--name-only",
    "master",
    "--",
    ...task037NativeAndPackageSurfaceEntrypoints,
  ]);
  const untrackedFiles = await runGitLines([
    "ls-files",
    "--others",
    "--exclude-standard",
    "--",
    ...task037NativeAndPackageSurfaceEntrypoints,
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
  const { stdout } = await execFileAsync("git", args, {
    cwd: repoRoot,
  });

  return stdout;
}
