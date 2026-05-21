import type { BlockNode, StructuredMarkdownDocument } from "../types";

export type ImportMarkdownToStructuredDocumentOptions = {
  createBlockId?: () => string;
  previousDocument?: StructuredMarkdownDocument;
  maxInputLength?: number;
  maxBlockCount?: number;
  maxDepth?: number;
};

export type ValidateStructuredMarkdownDocumentOptions = {
  maxBlockCount?: number;
  maxDepth?: number;
};

const defaultMaxInputLength = 1_000_000;
const defaultMaxBlockCount = 20_000;
const defaultMaxDepth = 100;
const maxBlockIdGenerationAttempts = 1_000;

let fallbackBlockIdCounter = 0;

export function importMarkdownToStructuredDocument(
  markdown: string,
  options: ImportMarkdownToStructuredDocumentOptions = {},
): StructuredMarkdownDocument {
  if (typeof markdown !== "string") {
    throw new Error("Markdown input must be a string");
  }

  const maxInputLength = readLimit(
    options.maxInputLength,
    defaultMaxInputLength,
    "maxInputLength",
  );

  if (markdown.length > maxInputLength) {
    throw new Error("Markdown input is too large");
  }

  const validationOptions = {
    maxBlockCount: options.maxBlockCount,
    maxDepth: options.maxDepth,
  } satisfies ValidateStructuredMarkdownDocumentOptions;
  const previousDocument =
    options.previousDocument === undefined
      ? undefined
      : validateStructuredMarkdownDocument(
          options.previousDocument,
          validationOptions,
        );
  const createBlockId = options.createBlockId ?? createOpaqueBlockId;
  const lines = markdown.split("\n");
  const blockIds = assignBlockIds(lines, previousDocument?.content ?? [], {
    createBlockId,
  });
  const document = {
    type: "doc",
    content: lines.map((line, index) => ({
      blockId: blockIds[index],
      type: "markdown.line",
      text: line,
    })),
  } satisfies StructuredMarkdownDocument;

  return validateStructuredMarkdownDocument(document, validationOptions);
}

export function exportStructuredDocumentToMarkdown(
  document: StructuredMarkdownDocument,
): string {
  const validatedDocument = validateStructuredMarkdownDocument(document);

  return validatedDocument.content.map(blockToMarkdown).join("\n");
}

export function validateStructuredMarkdownDocument(
  document: unknown,
  options: ValidateStructuredMarkdownDocumentOptions = {},
): StructuredMarkdownDocument {
  if (!isRecord(document) || document.type !== "doc") {
    throw new Error("Structured Markdown document root must be a doc");
  }

  if (!Array.isArray(document.content)) {
    throw new Error("Structured Markdown document content must be an array");
  }

  const maxBlockCount = readLimit(
    options.maxBlockCount,
    defaultMaxBlockCount,
    "maxBlockCount",
  );
  const maxDepth = readLimit(options.maxDepth, defaultMaxDepth, "maxDepth");
  const blockIds = new Set<string>();
  const blockCountRef = {
    value: 0,
  };

  for (const block of document.content) {
    validateBlock(block, {
      blockIds,
      blockCountRef,
      depth: 1,
      maxBlockCount,
      maxDepth,
    });
  }

  return document as StructuredMarkdownDocument;
}

type BlockIdAssignmentOptions = {
  createBlockId: () => string;
};

function assignBlockIds(
  lines: readonly string[],
  previousBlocks: readonly BlockNode[],
  options: BlockIdAssignmentOptions,
): string[] {
  const assignedBlockIds = new Array<string | undefined>(lines.length);
  const usedBlockIds = new Set<string>();

  if (previousBlocks.length === lines.length) {
    return previousBlocks.map((block) => block.blockId);
  }

  let start = 0;

  while (
    start < lines.length &&
    start < previousBlocks.length &&
    blockToMarkdown(previousBlocks[start]) === lines[start]
  ) {
    retainPreviousBlockId(start, previousBlocks[start], {
      assignedBlockIds,
      usedBlockIds,
    });
    start += 1;
  }

  let previousEnd = previousBlocks.length - 1;
  let lineEnd = lines.length - 1;

  while (
    lineEnd >= start &&
    previousEnd >= start &&
    blockToMarkdown(previousBlocks[previousEnd]) === lines[lineEnd]
  ) {
    retainPreviousBlockId(lineEnd, previousBlocks[previousEnd], {
      assignedBlockIds,
      usedBlockIds,
    });
    previousEnd -= 1;
    lineEnd -= 1;
  }

  for (let index = 0; index < lines.length; index += 1) {
    if (assignedBlockIds[index] !== undefined) {
      continue;
    }

    const blockId = createUniqueBlockId(options.createBlockId, usedBlockIds);
    assignedBlockIds[index] = blockId;
    usedBlockIds.add(blockId);
  }

  return assignedBlockIds.map((blockId) => blockId ?? "");
}

function retainPreviousBlockId(
  index: number,
  block: BlockNode | undefined,
  state: {
    assignedBlockIds: Array<string | undefined>;
    usedBlockIds: Set<string>;
  },
): void {
  if (block === undefined || state.usedBlockIds.has(block.blockId)) {
    return;
  }

  state.assignedBlockIds[index] = block.blockId;
  state.usedBlockIds.add(block.blockId);
}

function createUniqueBlockId(
  createBlockId: () => string,
  usedBlockIds: ReadonlySet<string> | readonly string[],
): string {
  const used =
    usedBlockIds instanceof Set ? usedBlockIds : new Set(usedBlockIds);

  for (
    let attempt = 0;
    attempt < maxBlockIdGenerationAttempts;
    attempt += 1
  ) {
    const blockId = createBlockId();

    if (typeof blockId !== "string" || blockId.trim().length === 0) {
      continue;
    }

    if (!used.has(blockId)) {
      return blockId;
    }
  }

  throw new Error("Unable to generate a unique blockId");
}

function createOpaqueBlockId(): string {
  const randomId = globalThis.crypto?.randomUUID?.();

  if (typeof randomId === "string" && randomId.length > 0) {
    return `block_${randomId}`;
  }

  fallbackBlockIdCounter += 1;

  return `block_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2)}_${fallbackBlockIdCounter.toString(36)}`;
}

function blockToMarkdown(block: BlockNode): string {
  if (typeof block.text === "string") {
    return block.text;
  }

  if (Array.isArray(block.content)) {
    return block.content.map(blockToMarkdown).join("\n");
  }

  return "";
}

type BlockValidationContext = {
  blockIds: Set<string>;
  blockCountRef: {
    value: number;
  };
  depth: number;
  maxBlockCount: number;
  maxDepth: number;
};

function validateBlock(block: unknown, context: BlockValidationContext): void {
  if (!isRecord(block)) {
    throw new Error("Structured Markdown block must be an object");
  }

  if (context.depth > context.maxDepth) {
    throw new Error("Structured Markdown document is too deeply nested");
  }

  if (typeof block.blockId !== "string" || block.blockId.trim().length === 0) {
    throw new Error("Structured Markdown block is missing blockId");
  }

  if (context.blockIds.has(block.blockId)) {
    throw new Error("Structured Markdown blockId must be unique");
  }

  context.blockIds.add(block.blockId);
  context.blockCountRef.value += 1;

  if (context.blockCountRef.value > context.maxBlockCount) {
    throw new Error("Structured Markdown document has too many blocks");
  }

  if (block.type !== undefined && typeof block.type !== "string") {
    throw new Error("Structured Markdown block type must be a string");
  }

  if (block.text !== undefined && typeof block.text !== "string") {
    throw new Error("Structured Markdown block text must be a string");
  }

  if (block.attrs !== undefined) {
    validateAttrs(block.attrs);
  }

  if (block.content !== undefined) {
    if (!Array.isArray(block.content)) {
      throw new Error("Structured Markdown block content must be an array");
    }

    for (const child of block.content) {
      validateBlock(child, {
        ...context,
        depth: context.depth + 1,
      });
    }
  }
}

function validateAttrs(attrs: unknown): void {
  if (!isRecord(attrs)) {
    throw new Error("Structured Markdown block attrs must be an object");
  }

  for (const [key, value] of Object.entries(attrs)) {
    if (/^on/i.test(key)) {
      throw new Error("Structured Markdown block attrs cannot be executable");
    }

    validateAttrValue(value);
  }
}

function validateAttrValue(value: unknown): void {
  if (typeof value === "string") {
    if (/^\s*javascript\s*:/i.test(value)) {
      throw new Error("Structured Markdown block attrs cannot be executable");
    }

    return;
  }

  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      validateAttrValue(item);
    }

    return;
  }

  if (isRecord(value)) {
    validateAttrs(value);

    return;
  }

  throw new Error("Structured Markdown block attrs must be JSON-compatible");
}

function readLimit(
  value: number | undefined,
  fallback: number,
  label: string,
): number {
  if (value === undefined) {
    return fallback;
  }

  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
