import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ComponentType } from "react";
import { describe, expect, it, vi } from "vitest";

import { BUILT_IN_PLUGINS, createAppRuntime, type AppRuntime } from "../bootstrap";
import {
  createCoreStores,
  exportStructuredDocumentToMarkdown,
  type BlockNode,
  type CoreStores,
  type DbQuery,
  type MarkdownPage,
  type MetadataRecord,
  type NativeBridge,
  type StructuredMarkdownDocument,
} from "../core";

type NativeBridgeTransactionResult<Response> =
  Response extends readonly unknown[]
    ? number extends Response["length"]
      ? Array<Response>
      : Response
    : Array<Response>;

type SourceLine = {
  blockId: string;
  text: string;
  attrs?: Record<string, unknown>;
};

type OpenTaskPageInput = {
  sourcePageId: string;
  sourceBlockId: string;
};

type OpenTaskPageResult = {
  pageId: string;
};

type CreateRuntimeOptions = {
  pageIds?: readonly string[];
};

type MarkdownEditorDocument = {
  id: string;
  title: string;
  markdown: string;
  body?: StructuredMarkdownDocument;
};

type MarkdownCommandBus = {
  execute(commandId: string, input?: unknown): Promise<unknown>;
};

type TaskNavigableMarkdownPageEditorProps = {
  page: MarkdownEditorDocument;
  commands: MarkdownCommandBus;
  markdownRuntime?: {
    collectEditorExtensions(): readonly unknown[];
  };
  onOpenPage(pageId: string): void;
};

const openTaskPageCommandId = "task.open-task-page";
const taskNamespace = "task";
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const execFileAsync = promisify(execFile);
const nativeSurfaceEntrypoints = [
  "package.json",
  "bun.lock",
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

describe("Task navigation and infinite nesting", () => {
  it("registers task.open-task-page through real built-in Task Plugin activation and validates source payloads", async () => {
    const runtime = await createRuntime();
    const builtInPluginIds = BUILT_IN_PLUGINS.map(
      (plugin) => plugin.manifest.id,
    );
    const taskCommands = runtime.registries.commands.list({
      pluginId: "task",
    });

    expect.soft(builtInPluginIds).toContain("task");
    expect.soft(taskCommands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: openTaskPageCommandId,
          pluginId: "task",
          title: expect.stringMatching(/open|navigate/i),
        }),
      ]),
    );

    const invalidPayloads = [
      undefined,
      null,
      "",
      [],
      { sourceBlockId: "task-block-a" },
      { sourcePageId: "source-page" },
      { sourcePageId: "", sourceBlockId: "task-block-a" },
      { sourcePageId: "source-page", sourceBlockId: "   " },
    ];

    for (const payload of invalidPayloads) {
      const before = snapshotPageAndMetadataState(runtime);

      await expect(
        runtime.commands.execute(openTaskPageCommandId, payload),
      ).rejects.toThrow();
      expect(snapshotPageAndMetadataState(runtime)).toStrictEqual(before);
    }
  });

  it("opens an unbound task once, returns { pageId }, binds the source block, writes metadata, and exposes the page from the runtime page source", async () => {
    const runtime = await createRuntime({
      pageIds: ["source-page", "task-page-a"],
    });
    const sourcePage = createSourcePage(runtime, "Inbox", [
      { blockId: "intro-block", text: "Inbox notes" },
      { blockId: "task-block-a", text: "- [ ] A" },
    ]);

    await expect(
      executeOpenTaskPage(runtime, {
        sourcePageId: sourcePage.id,
        sourceBlockId: "task-block-a",
      }),
    ).resolves.toStrictEqual({
      pageId: "task-page-a",
    } satisfies OpenTaskPageResult);

    const taskPage = loadOpenedRuntimePage(runtime, "task-page-a");

    expect(taskPage.title).toBe("A");
    expect(taskPage.body).toStrictEqual(createEmptyStructuredDocument());
    expect(runtime.pages.list().filter((page) => page.title === "A"))
      .toHaveLength(1);
    expectTaskMetadata(runtime, {
      taskPageId: taskPage.id,
      sourcePageId: sourcePage.id,
      sourceBlockId: "task-block-a",
    });
    expectSourceBlockBoundToTaskPage(runtime, {
      sourcePageId: sourcePage.id,
      sourceBlockId: "task-block-a",
      taskPageId: taskPage.id,
    });

    await expect(
      executeOpenTaskPage(runtime, {
        sourcePageId: sourcePage.id,
        sourceBlockId: "task-block-a",
      }),
    ).resolves.toStrictEqual({
      pageId: taskPage.id,
    } satisfies OpenTaskPageResult);
    expect(runtime.pages.list().filter((page) => page.title === "A"))
      .toHaveLength(1);
  });

  it("reuses verified bindings and metadata-only attr-loss relations without duplicate task pages", async () => {
    const verifiedRuntime = await createRuntime();
    const verifiedTaskPage = verifiedRuntime.pages.create({
      title: "A",
      body: createEmptyStructuredDocument(),
    });
    const verifiedSourcePage = createSourcePage(verifiedRuntime, "Verified", [
      {
        blockId: "task-block-a",
        text: "- [ ] A",
        attrs: { boundPageId: verifiedTaskPage.id },
      },
    ]);
    writeTaskMetadataDirectly(verifiedRuntime, {
      taskPageId: verifiedTaskPage.id,
      sourcePageId: verifiedSourcePage.id,
      sourceBlockId: "task-block-a",
    });
    const verifiedPagesBefore = verifiedRuntime.pages.list({
      includeArchived: true,
    });

    await expect(
      executeOpenTaskPage(verifiedRuntime, {
        sourcePageId: verifiedSourcePage.id,
        sourceBlockId: "task-block-a",
      }),
    ).resolves.toStrictEqual({
      pageId: verifiedTaskPage.id,
    } satisfies OpenTaskPageResult);
    expect(verifiedRuntime.pages.list({ includeArchived: true })).toHaveLength(
      verifiedPagesBefore.length,
    );
    expectSourceBlockBoundToTaskPage(verifiedRuntime, {
      sourcePageId: verifiedSourcePage.id,
      sourceBlockId: "task-block-a",
      taskPageId: verifiedTaskPage.id,
    });

    const metadataOnlyRuntime = await createRuntime();
    const metadataOnlySourcePage = createSourcePage(
      metadataOnlyRuntime,
      "Attr loss",
      [{ blockId: "task-block-b", text: "- [ ] B" }],
    );
    const metadataOnlyTaskPage = createTaskPageWithMetadata(
      metadataOnlyRuntime,
      {
        title: "B",
        sourcePageId: metadataOnlySourcePage.id,
        sourceBlockId: "task-block-b",
      },
    );

    await expect(
      executeOpenTaskPage(metadataOnlyRuntime, {
        sourcePageId: metadataOnlySourcePage.id,
        sourceBlockId: "task-block-b",
      }),
    ).resolves.toStrictEqual({
      pageId: metadataOnlyTaskPage.id,
    } satisfies OpenTaskPageResult);
    expect(metadataOnlyRuntime.pages.list().filter((page) => page.title === "B"))
      .toHaveLength(1);
    expectSourceBlockBoundToTaskPage(metadataOnlyRuntime, {
      sourcePageId: metadataOnlySourcePage.id,
      sourceBlockId: "task-block-b",
      taskPageId: metadataOnlyTaskPage.id,
    });
  });

  it("does not navigate to a forged attrs.boundPageId", async () => {
    const runtime = await createRuntime();
    const forgedPage = runtime.pages.create({
      title: "Forged target",
      body: createEmptyStructuredDocument(),
    });
    const sourcePage = createSourcePage(runtime, "Forged binding", [
      {
        blockId: "task-block-a",
        text: "- [ ] A",
        attrs: { boundPageId: forgedPage.id },
      },
    ]);

    const result = await executeOpenTaskPage(runtime, {
      sourcePageId: sourcePage.id,
      sourceBlockId: "task-block-a",
    });

    expect(result.pageId).not.toBe(forgedPage.id);
    expect(loadOpenedRuntimePage(runtime, result.pageId).title).toBe("A");
    expect(runtime.pages.get(forgedPage.id).title).toBe("Forged target");
    expectSourceBlockBoundToTaskPage(runtime, {
      sourcePageId: sourcePage.id,
      sourceBlockId: "task-block-a",
      taskPageId: result.pageId,
    });
  });

  it("uses the same source relation mechanism for nested task pages", async () => {
    const runtime = await createRuntime({
      pageIds: ["root-page", "task-page-a", "task-page-b"],
    });
    const rootPage = createSourcePage(runtime, "Root", [
      { blockId: "task-block-a", text: "- [ ] A" },
    ]);

    const pageAResult = await executeOpenTaskPage(runtime, {
      sourcePageId: rootPage.id,
      sourceBlockId: "task-block-a",
    });
    const pageA = loadOpenedRuntimePage(runtime, pageAResult.pageId);

    runtime.pages.update(pageA.id, {
      body: structuredDocument([
        { blockId: "task-block-b", text: "- [ ] B" },
      ]),
    });

    const pageBResult = await executeOpenTaskPage(runtime, {
      sourcePageId: pageA.id,
      sourceBlockId: "task-block-b",
    });
    const pageB = loadOpenedRuntimePage(runtime, pageBResult.pageId);

    expect(pageA).toMatchObject({
      id: "task-page-a",
      title: "A",
    });
    expect(pageB).toMatchObject({
      id: "task-page-b",
      title: "B",
    });
    expectTaskMetadata(runtime, {
      taskPageId: pageA.id,
      sourcePageId: rootPage.id,
      sourceBlockId: "task-block-a",
    });
    expectTaskMetadata(runtime, {
      taskPageId: pageB.id,
      sourcePageId: pageA.id,
      sourceBlockId: "task-block-b",
    });
    expectSingleTaskPageForSource(runtime, pageA.id, "task-block-b");
    expectSourceBlockBoundToTaskPage(runtime, {
      sourcePageId: pageA.id,
      sourceBlockId: "task-block-b",
      taskPageId: pageB.id,
    });
  });

  it("rejects invalid, stale, non-task, and duplicate source blocks without navigation or mutation", async () => {
    const invalidCases: Array<{
      name: string;
      lines: readonly SourceLine[];
      payload(sourcePageId: string): OpenTaskPageInput;
    }> = [
      {
        name: "missing source page",
        lines: [{ blockId: "task-block-a", text: "- [ ] A" }],
        payload: () => ({
          sourcePageId: "missing-source-page",
          sourceBlockId: "task-block-a",
        }),
      },
      {
        name: "stale source block",
        lines: [{ blockId: "task-block-a", text: "- [ ] A" }],
        payload: (sourcePageId) => ({
          sourcePageId,
          sourceBlockId: "missing-task-block",
        }),
      },
      {
        name: "non-task block",
        lines: [{ blockId: "plain-block", text: "Plain paragraph" }],
        payload: (sourcePageId) => ({
          sourcePageId,
          sourceBlockId: "plain-block",
        }),
      },
      {
        name: "duplicate source block id",
        lines: [
          { blockId: "duplicate-task-block", text: "- [ ] A" },
          { blockId: "duplicate-task-block", text: "- [ ] A again" },
        ],
        payload: (sourcePageId) => ({
          sourcePageId,
          sourceBlockId: "duplicate-task-block",
        }),
      },
    ];

    for (const invalidCase of invalidCases) {
      const runtime = await createRuntime();
      const sourcePage = createSourcePage(
        runtime,
        `Invalid ${invalidCase.name}`,
        invalidCase.lines,
      );
      const before = snapshotPageAndMetadataState(runtime);

      await expect(
        executeOpenTaskPage(runtime, invalidCase.payload(sourcePage.id)),
        invalidCase.name,
      ).rejects.toThrow();
      expect(
        snapshotPageAndMetadataState(runtime),
        invalidCase.name,
      ).toStrictEqual(before);
    }
  });

  it("clicks visible task text through the task open command before opening the returned page id", async () => {
    const runtime = await createRuntime();
    const user = userEvent.setup();
    const sourcePage = createSourcePage(runtime, "Clickable source", [
      {
        blockId: "task-block-a",
        text: "- [ ] A",
        attrs: { boundPageId: "forged-page-id" },
      },
    ]);
    const commands: MarkdownCommandBus = {
      execute: vi.fn(async () => ({ pageId: "resolved-task-page" })),
    };
    const onOpenPage = vi.fn();

    renderMarkdownPageEditor(runtime, {
      page: editorDocumentFromRuntimePage(sourcePage),
      commands,
      onOpenPage,
      markdownRuntime: runtime.markdown,
    });

    await user.click(await screen.findByRole("button", { name: "A" }));

    await waitFor(() =>
      expect(commands.execute).toHaveBeenCalledWith(openTaskPageCommandId, {
        sourcePageId: sourcePage.id,
        sourceBlockId: "task-block-a",
      } satisfies OpenTaskPageInput),
    );
    expect(onOpenPage).toHaveBeenCalledWith("resolved-task-page");
    expect(onOpenPage).not.toHaveBeenCalledWith("forged-page-id");
  });

  it("renders unsafe task titles as inert clickable text without HTML, href, or script semantics", async () => {
    const runtime = await createRuntime();
    const user = userEvent.setup();
    const unsafeTitle =
      "<img src=x onerror=alert(1)> [open](javascript:alert(1))";
    const sourcePage = createSourcePage(runtime, "Unsafe task title", [
      {
        blockId: "unsafe-task",
        text: `- [ ] ${unsafeTitle}`,
        attrs: { boundPageId: "forged-unsafe-page" },
      },
    ]);
    const commands: MarkdownCommandBus = {
      execute: vi.fn(async () => ({ pageId: "resolved-safe-page" })),
    };
    const onOpenPage = vi.fn();
    renderMarkdownPageEditor(runtime, {
      page: editorDocumentFromRuntimePage(sourcePage),
      commands,
      onOpenPage,
      markdownRuntime: runtime.markdown,
    });

    const taskButton = await screen.findByRole("button", {
      name: unsafeTitle,
    });

    expect(taskButton).toHaveTextContent(unsafeTitle);
    expect(taskButton).not.toHaveAttribute("href");
    expect(screen.queryByRole("link", { name: unsafeTitle })).not.toBeInTheDocument();
    expect(document.body.innerHTML).not.toMatch(
      /<script[\s>]|<img[\s>]|<iframe[\s>]|<object[\s>]|<embed[\s>]/i,
    );
    expect(document.body.innerHTML).not.toMatch(
      /<[^>]+\son(?:error|click)=|<a\b[^>]*\shref=["']javascript:/i,
    );

    await user.click(taskButton);

    await waitFor(() =>
      expect(commands.execute).toHaveBeenCalledWith(openTaskPageCommandId, {
        sourcePageId: sourcePage.id,
        sourceBlockId: "unsafe-task",
      } satisfies OpenTaskPageInput),
    );
    expect(onOpenPage).toHaveBeenCalledWith("resolved-safe-page");
    expect(onOpenPage).not.toHaveBeenCalledWith("forged-unsafe-page");
  });

  it("does not require package, Cargo, Tauri config, capability, permission, or native command surface changes", async () => {
    const changedNativeSurfaceFiles = await listNativeSurfaceChangesFromMaster();

    expect(changedNativeSurfaceFiles).toStrictEqual([]);
  });
});

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

function createSourcePage(
  runtime: AppRuntime,
  title: string,
  lines: readonly SourceLine[],
): MarkdownPage {
  return runtime.pages.create({
    title,
    body: structuredDocument(lines),
  });
}

function structuredDocument(
  lines: readonly SourceLine[],
): StructuredMarkdownDocument {
  return {
    type: "doc",
    content: lines.map((line) => {
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

function createEmptyStructuredDocument(): StructuredMarkdownDocument {
  return {
    type: "doc",
    content: [],
  };
}

async function executeOpenTaskPage(
  runtime: AppRuntime,
  input: OpenTaskPageInput,
): Promise<OpenTaskPageResult> {
  const result = await runtime.commands.execute(openTaskPageCommandId, input);

  return readOpenTaskPageResult(result);
}

function readOpenTaskPageResult(result: unknown): OpenTaskPageResult {
  if (
    typeof result !== "object" ||
    result === null ||
    Array.isArray(result) ||
    !("pageId" in result) ||
    typeof result.pageId !== "string" ||
    result.pageId.trim().length === 0
  ) {
    throw new Error("task.open-task-page must return { pageId }");
  }

  expect(Object.keys(result).sort()).toStrictEqual(["pageId"]);

  return {
    pageId: result.pageId,
  };
}

function loadOpenedRuntimePage(
  runtime: AppRuntime,
  pageId: string,
): MarkdownPage {
  const page = runtime.pages.get(pageId);

  expect(page).toEqual(
    expect.objectContaining({
      id: pageId,
      body: expect.objectContaining({
        type: "doc",
      }),
    }),
  );

  return page;
}

function createTaskPageWithMetadata(
  runtime: AppRuntime,
  input: {
    title: string;
    sourcePageId: string;
    sourceBlockId: string;
  },
): MarkdownPage {
  const taskPage = runtime.pages.create({
    title: input.title,
    body: createEmptyStructuredDocument(),
  });

  writeTaskMetadataDirectly(runtime, {
    taskPageId: taskPage.id,
    sourcePageId: input.sourcePageId,
    sourceBlockId: input.sourceBlockId,
  });

  return taskPage;
}

function writeTaskMetadataDirectly(
  runtime: AppRuntime,
  input: {
    taskPageId: string;
    sourcePageId: string;
    sourceBlockId: string;
  },
): void {
  runtime.metadata.set({
    pageId: input.taskPageId,
    namespace: taskNamespace,
    key: "enabled",
    value: true,
    valueType: "boolean",
    sourcePluginId: taskNamespace,
  });
  runtime.metadata.set({
    pageId: input.taskPageId,
    namespace: taskNamespace,
    key: "status",
    value: "todo",
    valueType: "string",
    sourcePluginId: taskNamespace,
  });
  runtime.metadata.set({
    pageId: input.taskPageId,
    namespace: taskNamespace,
    key: "sourcePageId",
    value: input.sourcePageId,
    valueType: "string",
    sourcePluginId: taskNamespace,
  });
  runtime.metadata.set({
    pageId: input.taskPageId,
    namespace: taskNamespace,
    key: "sourceBlockId",
    value: input.sourceBlockId,
    valueType: "string",
    sourcePluginId: taskNamespace,
  });
}

function expectTaskMetadata(
  runtime: AppRuntime,
  input: {
    taskPageId: string;
    sourcePageId: string;
    sourceBlockId: string;
  },
): void {
  const records = runtime.metadata.list({
    pageId: input.taskPageId,
    namespace: taskNamespace,
  });

  expect(records).toEqual(
    expect.arrayContaining([
      expectTaskMetadataRecord("enabled", true, "boolean"),
      expectTaskMetadataRecord("status", "todo", "string"),
      expectTaskMetadataRecord("sourcePageId", input.sourcePageId, "string"),
      expectTaskMetadataRecord("sourceBlockId", input.sourceBlockId, "string"),
    ]),
  );
}

function expectTaskMetadataRecord(
  key: string,
  value: unknown,
  valueType: string,
): Partial<MetadataRecord> {
  return expect.objectContaining({
    namespace: taskNamespace,
    key,
    value,
    valueType,
    sourcePluginId: taskNamespace,
  }) as Partial<MetadataRecord>;
}

function expectSingleTaskPageForSource(
  runtime: AppRuntime,
  sourcePageId: string,
  sourceBlockId: string,
): MarkdownPage {
  const taskPages = taskPagesForSource(runtime, sourcePageId, sourceBlockId);

  expect(taskPages).toHaveLength(1);

  const [taskPage] = taskPages;

  if (taskPage === undefined) {
    throw new Error(
      `Expected one task page for ${sourcePageId}/${sourceBlockId}`,
    );
  }

  return taskPage;
}

function taskPagesForSource(
  runtime: AppRuntime,
  sourcePageId: string,
  sourceBlockId: string,
): MarkdownPage[] {
  const sourcePageRecords = runtime.metadata
    .list({ namespace: taskNamespace, key: "sourcePageId" })
    .filter((record) => record.value === sourcePageId);
  const sourceBlockPageIds = new Set(
    runtime.metadata
      .list({ namespace: taskNamespace, key: "sourceBlockId" })
      .filter((record) => record.value === sourceBlockId)
      .map((record) => record.pageId),
  );

  return sourcePageRecords
    .filter((record) => sourceBlockPageIds.has(record.pageId))
    .map((record) => runtime.pages.get(record.pageId));
}

function expectSourceBlockBoundToTaskPage(
  runtime: AppRuntime,
  input: {
    sourcePageId: string;
    sourceBlockId: string;
    taskPageId: string;
  },
): void {
  const sourcePage = runtime.pages.get(input.sourcePageId);
  const sourceBlock = findTopLevelBlock(sourcePage, input.sourceBlockId);

  expect(sourceBlock.type).toBe("markdown.line");
  expect(sourceBlock.attrs).toEqual(
    expect.objectContaining({
      boundPageId: input.taskPageId,
    }),
  );
}

function findTopLevelBlock(page: MarkdownPage, blockId: string): BlockNode {
  const block = page.body.content.find(
    (candidate) => candidate.blockId === blockId,
  );

  if (block === undefined) {
    throw new Error(`Missing block ${blockId} in page ${page.id}`);
  }

  return block;
}

function snapshotPageAndMetadataState(runtime: AppRuntime): {
  pages: MarkdownPage[];
  metadata: MetadataRecord[];
} {
  return {
    pages: runtime.pages.list({ includeArchived: true }),
    metadata: runtime.metadata.list(),
  };
}

function editorDocumentFromRuntimePage(
  page: MarkdownPage,
): MarkdownEditorDocument {
  return {
    id: page.id,
    title: page.title,
    markdown: exportStructuredDocumentToMarkdown(page.body),
    body: page.body,
  };
}

function renderMarkdownPageEditor(
  runtime: AppRuntime,
  props: TaskNavigableMarkdownPageEditorProps,
) {
  const Editor = getMarkdownPageEditorComponent(runtime);

  return render(<Editor {...props} />);
}

function getMarkdownPageEditorComponent(
  runtime: AppRuntime,
): ComponentType<TaskNavigableMarkdownPageEditorProps> {
  const pageEditor = runtime.registries.views.get(
    "markdown.page-editor",
  ) as unknown as {
    component: ComponentType<TaskNavigableMarkdownPageEditorProps>;
  };

  return pageEditor.component;
}

function createSequenceFactory(values: readonly string[]): () => string {
  let index = 0;

  return () => {
    const value = values[index];

    if (value === undefined) {
      throw new Error("No test page id remains");
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

async function listNativeSurfaceChangesFromMaster(): Promise<string[]> {
  return runGitLines([
    "diff",
    "--name-only",
    "master",
    "--",
    ...nativeSurfaceEntrypoints,
  ]);
}

async function runGitLines(args: readonly string[]): Promise<string[]> {
  const { stdout } = await execFileAsync("git", args, { cwd: repoRoot });

  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}
