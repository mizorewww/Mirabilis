import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import { BUILT_IN_PLUGINS, createAppRuntime, type AppRuntime } from "../bootstrap";
import {
  createCoreStores,
  exportStructuredDocumentToMarkdown,
  importMarkdownToStructuredDocument,
  type CoreStores,
  BlockNode,
  DbQuery,
  MarkdownPage,
  MetadataRecord,
  NativeBridge,
  StructuredMarkdownDocument,
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
  attrs?: Record<string, unknown>;
};

type ResolveTaskBlockInput = {
  sourcePageId: string;
  sourceBlockId: string;
};

type CreateRuntimeOptions = {
  pageIds?: readonly string[];
};

const resolveTaskBlockCommandId = "task.resolve-task-block";
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

describe("Task Plugin syntax and task page creation", () => {
  it("is a built-in plugin that contributes checkbox task syntax and a resolver command", async () => {
    const runtime = await createRuntime();
    const builtInPluginIds = BUILT_IN_PLUGINS.map(
      (plugin) => plugin.manifest.id,
    );
    const taskCommands = runtime.registries.commands.list({
      pluginId: "task",
    });
    const taskSyntax = runtime.markdown
      .collectEditorExtensions()
      .filter((extension) => extension.pluginId === "task");

    expect.soft(builtInPluginIds).toContain("task");
    expect.soft(taskCommands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: resolveTaskBlockCommandId,
          pluginId: "task",
          title: expect.stringMatching(/task/i),
        }),
      ]),
    );
    expect(taskSyntax).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pluginId: "task",
          syntax: expect.stringMatching(/-\s\[\s\]/),
        }),
      ]),
    );
  });

  it("resolves an unbound stable markdown.line task block into exactly one task page, metadata, and source binding", async () => {
    const runtime = await createRuntime();
    const sourcePage = createSourcePage(runtime, "Inbox", [
      { blockId: "intro-block", text: "Inbox notes" },
      { blockId: "task-block-a", text: "- [ ] A" },
    ]);

    await executeResolveTaskBlock(runtime, {
      sourcePageId: sourcePage.id,
      sourceBlockId: "task-block-a",
    });

    const taskPage = expectSingleTaskPageForSource(
      runtime,
      sourcePage.id,
      "task-block-a",
    );

    expect(taskPage.title).toBe("A");
    expect(
      runtime.pages.list().filter((page) => page.title === "A"),
    ).toHaveLength(1);
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
  });

  it("does not create duplicate task pages for the same source page and source block", async () => {
    const runtime = await createRuntime();
    const sourcePage = createSourcePage(runtime, "Daily plan", [
      { blockId: "task-block-a", text: "- [ ] A" },
    ]);

    await executeResolveTaskBlock(runtime, {
      sourcePageId: sourcePage.id,
      sourceBlockId: "task-block-a",
    });
    await executeResolveTaskBlock(runtime, {
      sourcePageId: sourcePage.id,
      sourceBlockId: "task-block-a",
    });

    const taskPage = expectSingleTaskPageForSource(
      runtime,
      sourcePage.id,
      "task-block-a",
    );

    expect(taskPage.title).toBe("A");
    expect(
      runtime.pages.list().filter((page) => page.title === "A"),
    ).toHaveLength(1);
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
  });

  it("rejects duplicate top-level source blockIds without mutating an unvalidated duplicate", async () => {
    const runtime = await createRuntime();
    const sourcePage = createSourcePage(runtime, "Ambiguous duplicate source", [
      { blockId: "duplicate-task-block", text: "- [ ] Valid task" },
      {
        blockId: "duplicate-task-block",
        text: "Plain text with the same block id",
        attrs: { preserved: true },
      },
    ]);
    const before = snapshotPageAndMetadataState(runtime);

    const error = await captureOptionalAsyncError(() =>
      executeResolveTaskBlock(runtime, {
        sourcePageId: sourcePage.id,
        sourceBlockId: "duplicate-task-block",
      }),
    );

    expect.soft(error).toBeInstanceOf(Error);
    expect(snapshotPageAndMetadataState(runtime)).toStrictEqual(before);
  });

  it("uses the full sourcePageId/sourceBlockId pair so equal blockIds on different pages create distinct task pages", async () => {
    const runtime = await createRuntime();
    const firstSourcePage = createSourcePage(runtime, "First source", [
      { blockId: "shared-task-block", text: "- [ ] Shared" },
    ]);
    const secondSourcePage = createSourcePage(runtime, "Second source", [
      { blockId: "shared-task-block", text: "- [ ] Shared" },
    ]);

    await executeResolveTaskBlock(runtime, {
      sourcePageId: firstSourcePage.id,
      sourceBlockId: "shared-task-block",
    });
    await executeResolveTaskBlock(runtime, {
      sourcePageId: secondSourcePage.id,
      sourceBlockId: "shared-task-block",
    });

    const firstTaskPage = expectSingleTaskPageForSource(
      runtime,
      firstSourcePage.id,
      "shared-task-block",
    );
    const secondTaskPage = expectSingleTaskPageForSource(
      runtime,
      secondSourcePage.id,
      "shared-task-block",
    );

    expect(firstTaskPage.id).not.toBe(secondTaskPage.id);
    expect(firstTaskPage.title).toBe("Shared");
    expect(secondTaskPage.title).toBe("Shared");
    expectTaskMetadata(runtime, {
      taskPageId: firstTaskPage.id,
      sourcePageId: firstSourcePage.id,
      sourceBlockId: "shared-task-block",
    });
    expectTaskMetadata(runtime, {
      taskPageId: secondTaskPage.id,
      sourcePageId: secondSourcePage.id,
      sourceBlockId: "shared-task-block",
    });
  });

  it("does not trust an existing boundPageId unless task metadata verifies the same source relation", async () => {
    const runtime = await createRuntime();
    const unrelatedPage = runtime.pages.create({
      title: "Unrelated note",
      body: structuredDocument([{ blockId: "unrelated-body", text: "" }]),
    });
    const sourcePage = createSourcePage(runtime, "Forged task binding", [
      {
        blockId: "task-block-a",
        text: "- [ ] A",
        attrs: { boundPageId: unrelatedPage.id },
      },
    ]);

    const resolvedPage = (await executeResolveTaskBlock(runtime, {
      sourcePageId: sourcePage.id,
      sourceBlockId: "task-block-a",
    })) as MarkdownPage;

    expect(resolvedPage.id).not.toBe(unrelatedPage.id);
    expect(resolvedPage.title).toBe("A");
    const taskPage = expectSingleTaskPageForSource(
      runtime,
      sourcePage.id,
      "task-block-a",
    );
    expect(taskPage.id).toBe(resolvedPage.id);
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
    expect(runtime.pages.get(unrelatedPage.id).title).toBe("Unrelated note");
  });

  it("reuses metadata-only task relations and restores the source block binding", async () => {
    const runtime = await createRuntime();
    const sourcePage = createSourcePage(runtime, "Metadata-only relation", [
      { blockId: "task-block-a", text: "- [ ] A" },
    ]);
    const existingTaskPage = createTaskPageWithMetadata(runtime, {
      title: "A",
      sourcePageId: sourcePage.id,
      sourceBlockId: "task-block-a",
    });

    const resolvedPage = (await executeResolveTaskBlock(runtime, {
      sourcePageId: sourcePage.id,
      sourceBlockId: "task-block-a",
    })) as MarkdownPage;

    expect(resolvedPage.id).toBe(existingTaskPage.id);
    expect(runtime.pages.list().filter((page) => page.title === "A"))
      .toHaveLength(1);
    expectSourceBlockBoundToTaskPage(runtime, {
      sourcePageId: sourcePage.id,
      sourceBlockId: "task-block-a",
      taskPageId: existingTaskPage.id,
    });
  });

  it("reuses verified pre-existing boundPageId relations without duplicate page creation", async () => {
    const runtime = await createRuntime();
    const existingTaskPage = runtime.pages.create({
      title: "A",
      body: structuredDocument([{ blockId: "task-body", text: "" }]),
    });
    const sourcePage = createSourcePage(runtime, "Verified binding", [
      {
        blockId: "task-block-a",
        text: "- [ ] A",
        attrs: { boundPageId: existingTaskPage.id },
      },
    ]);
    writeTaskMetadataDirectly(runtime, {
      taskPageId: existingTaskPage.id,
      sourcePageId: sourcePage.id,
      sourceBlockId: "task-block-a",
    });
    const pagesBefore = runtime.pages.list({ includeArchived: true });

    const resolvedPage = (await executeResolveTaskBlock(runtime, {
      sourcePageId: sourcePage.id,
      sourceBlockId: "task-block-a",
    })) as MarkdownPage;

    expect(resolvedPage.id).toBe(existingTaskPage.id);
    expect(runtime.pages.list({ includeArchived: true })).toHaveLength(
      pagesBefore.length,
    );
    expectSingleTaskPageForSource(runtime, sourcePage.id, "task-block-a");
    expectSourceBlockBoundToTaskPage(runtime, {
      sourcePageId: sourcePage.id,
      sourceBlockId: "task-block-a",
      taskPageId: existingTaskPage.id,
    });
  });

  it("recovers source binding from task metadata after visible Markdown save/import drops block attrs", async () => {
    const runtime = await createRuntime();
    const sourcePage = createSourcePage(runtime, "Save durability", [
      { blockId: "task-block-a", text: "- [ ] A" },
    ]);

    await executeResolveTaskBlock(runtime, {
      sourcePageId: sourcePage.id,
      sourceBlockId: "task-block-a",
    });
    const taskPage = expectSingleTaskPageForSource(
      runtime,
      sourcePage.id,
      "task-block-a",
    );
    const boundSourcePage = runtime.pages.get(sourcePage.id);
    const savedVisibleMarkdown =
      exportStructuredDocumentToMarkdown(boundSourcePage.body);
    const savedStructuredBody = importMarkdownToStructuredDocument(
      savedVisibleMarkdown,
      {
        previousDocument: boundSourcePage.body,
      },
    );

    runtime.pages.update(sourcePage.id, {
      body: savedStructuredBody,
    });

    await executeResolveTaskBlock(runtime, {
      sourcePageId: sourcePage.id,
      sourceBlockId: "task-block-a",
    });

    expect(runtime.pages.list().filter((page) => page.title === "A"))
      .toHaveLength(1);
    expectSingleTaskPageForSource(runtime, sourcePage.id, "task-block-a");
    expectSourceBlockBoundToTaskPage(runtime, {
      sourcePageId: sourcePage.id,
      sourceBlockId: "task-block-a",
      taskPageId: taskPage.id,
    });
  });

  it("derives task titles from the current source block and keeps unsafe-looking text inert", async () => {
    const runtime = await createRuntime();
    const unsafePlainTextTitle =
      "<img src=x onerror=alert(1)> [open](javascript:alert(1))";
    const sourcePage = createSourcePage(runtime, "Security notes", [
      {
        blockId: "unsafe-title-task",
        text: `- [ ] ${unsafePlainTextTitle}`,
      },
    ]);

    await executeResolveTaskBlock(runtime, {
      sourcePageId: sourcePage.id,
      sourceBlockId: "unsafe-title-task",
    });

    const taskPage = expectSingleTaskPageForSource(
      runtime,
      sourcePage.id,
      "unsafe-title-task",
    );

    expect(taskPage.title).toBe(unsafePlainTextTitle);
    expect(
      JSON.stringify(
        runtime.metadata.list({ pageId: taskPage.id, namespace: "task" }),
      ),
    ).not.toMatch(/javascript:|onerror/i);
    expectSourceBlockBoundToTaskPage(runtime, {
      sourcePageId: sourcePage.id,
      sourceBlockId: "unsafe-title-task",
      taskPageId: taskPage.id,
    });
  });

  it("does not mutate pages or metadata for invalid payloads, stale blocks, non-task blocks, or malformed task lines", async () => {
    const invalidCases: Array<{
      name: string;
      lines: readonly SourceLine[];
      payload(sourcePageId: string): unknown;
    }> = [
      {
        name: "missing sourcePageId",
        lines: [{ blockId: "task-block-a", text: "- [ ] A" }],
        payload: () => ({ sourceBlockId: "task-block-a" }),
      },
      {
        name: "missing sourceBlockId",
        lines: [{ blockId: "task-block-a", text: "- [ ] A" }],
        payload: (sourcePageId) => ({ sourcePageId }),
      },
      {
        name: "stale sourceBlockId",
        lines: [{ blockId: "task-block-a", text: "- [ ] A" }],
        payload: (sourcePageId) => ({
          sourcePageId,
          sourceBlockId: "missing-task-block",
        }),
      },
      {
        name: "caller-supplied title for a non-task block",
        lines: [{ blockId: "plain-block", text: "Plain paragraph" }],
        payload: (sourcePageId) => ({
          sourcePageId,
          sourceBlockId: "plain-block",
          title: "Injected arbitrary task",
        }),
      },
      {
        name: "malformed checkbox line",
        lines: [{ blockId: "malformed-task", text: "- [] Missing checkbox" }],
        payload: (sourcePageId) => ({
          sourcePageId,
          sourceBlockId: "malformed-task",
        }),
      },
      {
        name: "CommonMark indented code task-looking line",
        lines: [
          {
            blockId: "indented-code-task",
            text: "    - [ ] Not a real task",
          },
        ],
        payload: (sourcePageId) => ({
          sourcePageId,
          sourceBlockId: "indented-code-task",
        }),
      },
      {
        name: "tab-indented task-looking line",
        lines: [{ blockId: "tab-code-task", text: "\t- [ ] Not a real task" }],
        payload: (sourcePageId) => ({
          sourcePageId,
          sourceBlockId: "tab-code-task",
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

      await executeIgnoringResolverFailure(
        runtime,
        invalidCase.payload(sourcePage.id),
      );

      expect(
        snapshotPageAndMetadataState(runtime),
        invalidCase.name,
      ).toStrictEqual(before);
    }
  });

  it("does not create task pages from task-looking lines inside fenced code blocks", async () => {
    const runtime = await createRuntime();
    const sourcePage = createSourcePage(runtime, "Code sample", [
      { blockId: "fence-open", text: "```markdown" },
      { blockId: "code-task", text: "- [ ] Not a real task" },
      { blockId: "fence-close", text: "```" },
    ]);
    const before = snapshotPageAndMetadataState(runtime);

    await executeIgnoringResolverFailure(runtime, {
      sourcePageId: sourcePage.id,
      sourceBlockId: "code-task",
    });

    expect(snapshotPageAndMetadataState(runtime)).toStrictEqual(before);
  });

  it("rolls back task page and metadata writes when relation metadata binding fails", async () => {
    const runtime = await createRuntime({
      pageIds: ["source-page", "task-page"],
    });
    const sourcePage = createSourcePage(runtime, "Rollback source", [
      { blockId: "task-block-a", text: "- [ ] A" },
    ]);

    runtime.metadata.set({
      pageId: "task-page",
      namespace: "task",
      key: "sourceBlockId",
      value: "conflicting-owner",
      valueType: "string",
      sourcePluginId: "other",
    });
    const before = snapshotPageAndMetadataState(runtime);

    await expect(
      executeResolveTaskBlock(runtime, {
        sourcePageId: sourcePage.id,
        sourceBlockId: "task-block-a",
      }),
    ).rejects.toThrow();

    expect(snapshotPageAndMetadataState(runtime)).toStrictEqual(before);
    expect(runtime.pages.list().map((page) => page.id)).not.toContain(
      "task-page",
    );
  });

  it("does not require new package, Cargo, Tauri command, capability, permission, or native command surface changes", async () => {
    const changedNativeSurfaceFiles = await listNativeSurfaceChangesFromMaster();

    expect(
      await disallowedNativeSurfaceChanges(changedNativeSurfaceFiles),
    ).toStrictEqual([]);
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

async function executeResolveTaskBlock(
  runtime: AppRuntime,
  input: ResolveTaskBlockInput,
): Promise<unknown> {
  return runtime.commands.execute(resolveTaskBlockCommandId, input);
}

async function executeIgnoringResolverFailure(
  runtime: AppRuntime,
  input: unknown,
): Promise<void> {
  try {
    await runtime.commands.execute(resolveTaskBlockCommandId, input);
  } catch {
    return undefined;
  }
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
  const sourcePageMatches = runtime.metadata
    .list({ namespace: "task", key: "sourcePageId" })
    .filter((record) => record.value === sourcePageId);
  const sourceBlockPageIds = new Set(
    runtime.metadata
      .list({ namespace: "task", key: "sourceBlockId" })
      .filter((record) => record.value === sourceBlockId)
      .map((record) => record.pageId),
  );

  return sourcePageMatches
    .filter((record) => sourceBlockPageIds.has(record.pageId))
    .map((record) => runtime.pages.get(record.pageId));
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
    namespace: "task",
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
    body: structuredDocument([{ blockId: `${input.sourceBlockId}-body`, text: "" }]),
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
    namespace: "task",
    key: "enabled",
    value: true,
    valueType: "boolean",
    sourcePluginId: "task",
  });
  runtime.metadata.set({
    pageId: input.taskPageId,
    namespace: "task",
    key: "status",
    value: "todo",
    valueType: "string",
    sourcePluginId: "task",
  });
  runtime.metadata.set({
    pageId: input.taskPageId,
    namespace: "task",
    key: "sourcePageId",
    value: input.sourcePageId,
    valueType: "string",
    sourcePluginId: "task",
  });
  runtime.metadata.set({
    pageId: input.taskPageId,
    namespace: "task",
    key: "sourceBlockId",
    value: input.sourceBlockId,
    valueType: "string",
    sourcePluginId: "task",
  });
}

function expectTaskMetadataRecord(
  key: string,
  value: unknown,
  valueType: string,
): Partial<MetadataRecord> {
  return expect.objectContaining({
    namespace: "task",
    key,
    value,
    valueType,
    sourcePluginId: "task",
  }) as Partial<MetadataRecord>;
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

async function captureOptionalAsyncError(
  action: () => Promise<unknown>,
): Promise<unknown | undefined> {
  try {
    await action();
  } catch (error) {
    return error;
  }

  return undefined;
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
