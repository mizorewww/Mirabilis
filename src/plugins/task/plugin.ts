import type {
  AppPlugin,
  BlockNode,
  MarkdownPage,
  PluginContext,
  PluginPageStore,
  PluginTransaction,
  StructuredMarkdownDocument,
} from "../../core";

type ResolveTaskBlockInput = {
  sourcePageId: string;
  sourceBlockId: string;
};

type OpenTaskPageResult = {
  pageId: string;
};

type SourceBlockMatch = {
  block: BlockNode;
  index: number;
};

const taskNamespace = "task";
const resolveTaskBlockCommandId = "task.resolve-task-block";
const openTaskPageCommandId = "task.open-task-page";
const uncheckedTaskLinePattern = /^ {0,3}-\s+\[\s\]\s+(?<title>.*)$/u;
const fenceLinePattern = /^\s{0,3}(?<fence>`{3,}|~{3,})/u;

export const TaskPlugin: AppPlugin = {
  manifest: {
    id: "task",
    name: "Task Plugin",
    version: "1.0.0",
    description: "Recognize checkbox task syntax and create task pages.",
    minAppVersion: "0.1.0",
    contributes: {
      markdownSyntax: [
        {
          id: "task.checkbox",
          name: "Checkbox task",
          syntax: "- [ ]",
        },
      ],
    },
  },
  register(ctx) {
    ctx.commands.register({
      id: resolveTaskBlockCommandId,
      title: "Resolve task block",
      handler: resolveTaskBlock,
    });

    ctx.commands.register({
      id: openTaskPageCommandId,
      title: "Open task page",
      handler: openTaskPage,
    });
  },
};

async function resolveTaskBlock(
  input: unknown,
  ctx: PluginContext,
): Promise<MarkdownPage> {
  const payload = readResolveTaskBlockInput(input);

  return resolveTaskPage(payload, ctx);
}

async function openTaskPage(
  input: unknown,
  ctx: PluginContext,
): Promise<OpenTaskPageResult> {
  const payload = readResolveTaskBlockInput(input);
  const taskPage = await resolveTaskPage(payload, ctx);

  return {
    pageId: taskPage.id,
  };
}

function resolveTaskPage(
  payload: ResolveTaskBlockInput,
  ctx: PluginContext,
): Promise<MarkdownPage> {
  return ctx.transaction.run((tx) => {
    const sourcePage = tx.pages.get(payload.sourcePageId);
    const sourceBlockMatch = findTopLevelSourceBlock(
      sourcePage,
      payload.sourceBlockId,
    );
    const title = parseTaskTitle(sourcePage.body.content, sourceBlockMatch);
    const existingTaskPage =
      findTaskPageForSource(tx, payload) ??
      findVerifiedBoundTaskPage(tx, sourceBlockMatch.block, payload);

    if (existingTaskPage !== undefined) {
      bindSourceBlockToTaskPage(
        tx.pages,
        sourcePage,
        sourceBlockMatch,
        existingTaskPage.id,
      );

      return existingTaskPage;
    }

    const taskPage = tx.pages.create({
      title,
      body: createEmptyMarkdownDocument(),
    });

    writeTaskMetadata(tx, {
      taskPageId: taskPage.id,
      sourcePageId: payload.sourcePageId,
      sourceBlockId: payload.sourceBlockId,
    });
    bindSourceBlockToTaskPage(
      tx.pages,
      sourcePage,
      sourceBlockMatch,
      taskPage.id,
    );

    return taskPage;
  });
}

function readResolveTaskBlockInput(input: unknown): ResolveTaskBlockInput {
  if (!isRecord(input)) {
    throw new Error("Task resolver input must be an object");
  }

  const sourcePageId = input.sourcePageId;
  const sourceBlockId = input.sourceBlockId;

  if (typeof sourcePageId !== "string" || sourcePageId.trim().length === 0) {
    throw new Error("Task resolver input requires sourcePageId");
  }

  if (typeof sourceBlockId !== "string" || sourceBlockId.trim().length === 0) {
    throw new Error("Task resolver input requires sourceBlockId");
  }

  return {
    sourcePageId,
    sourceBlockId,
  };
}

function findTopLevelSourceBlock(
  sourcePage: MarkdownPage,
  sourceBlockId: string,
): SourceBlockMatch {
  const matches = sourcePage.body.content
    .map((block, index) => ({ block, index }))
    .filter((match) => match.block.blockId === sourceBlockId);

  if (matches.length === 0) {
    throw new Error("Task source block was not found");
  }

  if (matches.length > 1) {
    throw new Error("Task source blockId is ambiguous");
  }

  const match = matches[0];

  if (match === undefined) {
    throw new Error("Task source block was not found");
  }

  return match;
}

function parseTaskTitle(
  blocks: readonly BlockNode[],
  sourceBlock: SourceBlockMatch,
): string {
  const block = sourceBlock.block;

  if (block.type !== "markdown.line" || typeof block.text !== "string") {
    throw new Error("Task source block must be a markdown.line block");
  }

  if (isInsideFencedCodeBlock(blocks, sourceBlock.index)) {
    throw new Error("Task-looking lines inside fenced code are inert");
  }

  const match = uncheckedTaskLinePattern.exec(block.text);
  const title = match?.groups?.title?.trim() ?? "";

  if (title.length === 0) {
    throw new Error("Task source block is not an unchecked task line");
  }

  return title;
}

function isInsideFencedCodeBlock(
  blocks: readonly BlockNode[],
  targetIndex: number,
): boolean {
  let activeFence: string | undefined;

  for (let index = 0; index < targetIndex; index += 1) {
    const block = blocks[index];

    if (block?.type !== "markdown.line" || typeof block.text !== "string") {
      continue;
    }

    const fence = matchFenceMarker(block.text);

    if (fence === undefined) {
      continue;
    }

    if (activeFence === undefined) {
      activeFence = fence;
    } else if (fence[0] === activeFence[0] && fence.length >= activeFence.length) {
      activeFence = undefined;
    }
  }

  return activeFence !== undefined;
}

function matchFenceMarker(line: string): string | undefined {
  const match = fenceLinePattern.exec(line);

  return match?.groups?.fence;
}

function findTaskPageForSource(
  tx: PluginTransaction,
  input: ResolveTaskBlockInput,
): MarkdownPage | undefined {
  const sourceBlockTaskPageIds = new Set(
    tx.metadata
      .list({
        namespace: taskNamespace,
        key: "sourceBlockId",
      })
      .filter((record) => record.value === input.sourceBlockId)
      .map((record) => record.pageId),
  );
  const sourcePageRecords = tx.metadata
    .list({
      namespace: taskNamespace,
      key: "sourcePageId",
    })
    .filter((record) => record.value === input.sourcePageId);

  for (const record of sourcePageRecords) {
    if (sourceBlockTaskPageIds.has(record.pageId)) {
      return tx.pages.get(record.pageId);
    }
  }

  return undefined;
}

function findVerifiedBoundTaskPage(
  tx: PluginTransaction,
  sourceBlock: BlockNode,
  input: ResolveTaskBlockInput,
): MarkdownPage | undefined {
  const boundPageId = sourceBlock.attrs?.boundPageId;

  if (boundPageId === undefined) {
    return undefined;
  }

  if (typeof boundPageId !== "string" || boundPageId.trim().length === 0) {
    return undefined;
  }

  if (!hasTaskSourceRelation(tx, boundPageId, input)) {
    return undefined;
  }

  return tx.pages.get(boundPageId);
}

function hasTaskSourceRelation(
  tx: PluginTransaction,
  taskPageId: string,
  input: ResolveTaskBlockInput,
): boolean {
  const taskMetadata = tx.metadata.list({
    pageId: taskPageId,
    namespace: taskNamespace,
  });
  const hasSourcePageId = taskMetadata.some(
    (record) => record.key === "sourcePageId" && record.value === input.sourcePageId,
  );
  const hasSourceBlockId = taskMetadata.some(
    (record) =>
      record.key === "sourceBlockId" && record.value === input.sourceBlockId,
  );

  return hasSourcePageId && hasSourceBlockId;
}

function writeTaskMetadata(
  tx: PluginTransaction,
  input: {
    taskPageId: string;
    sourcePageId: string;
    sourceBlockId: string;
  },
): void {
  tx.metadata.set({
    pageId: input.taskPageId,
    namespace: taskNamespace,
    key: "enabled",
    value: true,
    valueType: "boolean",
  });
  tx.metadata.set({
    pageId: input.taskPageId,
    namespace: taskNamespace,
    key: "status",
    value: "todo",
    valueType: "string",
  });
  tx.metadata.set({
    pageId: input.taskPageId,
    namespace: taskNamespace,
    key: "sourcePageId",
    value: input.sourcePageId,
    valueType: "string",
  });
  tx.metadata.set({
    pageId: input.taskPageId,
    namespace: taskNamespace,
    key: "sourceBlockId",
    value: input.sourceBlockId,
    valueType: "string",
  });
}

function bindSourceBlockToTaskPage(
  pages: PluginPageStore,
  sourcePage: MarkdownPage,
  sourceBlock: SourceBlockMatch,
  taskPageId: string,
): void {
  let changed = false;
  const content = sourcePage.body.content.map((block, index) => {
    if (index !== sourceBlock.index) {
      return block;
    }

    if (block.attrs?.boundPageId === taskPageId) {
      return block;
    }

    changed = true;

    return {
      ...block,
      attrs: {
        ...block.attrs,
        boundPageId: taskPageId,
      },
    };
  });

  if (!changed) {
    return;
  }

  pages.update(sourcePage.id, {
    body: {
      ...sourcePage.body,
      content,
    },
  });
}

function createEmptyMarkdownDocument(): StructuredMarkdownDocument {
  return {
    type: "doc",
    content: [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
