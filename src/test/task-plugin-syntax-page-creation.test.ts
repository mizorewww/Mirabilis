import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import { BUILT_IN_PLUGINS, createAppRuntime, type AppRuntime } from "../bootstrap";
import type {
  BlockNode,
  DbQuery,
  MarkdownPage,
  MetadataRecord,
  NativeBridge,
  StructuredMarkdownDocument,
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

type ResolveTaskBlockInput = {
  sourcePageId: string;
  sourceBlockId: string;
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

  it("does not require new package, Cargo, Tauri command, capability, permission, or native command surface changes", async () => {
    const changedNativeSurfaceFiles = await listNativeSurfaceChangesFromMaster();

    expect(changedNativeSurfaceFiles).toStrictEqual([]);
  });
});

async function createRuntime(): Promise<AppRuntime> {
  return createAppRuntime({
    createNativeBridge: () => createNoopNativeBridge(),
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
