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
const maxBlockIdReconciliationLookahead = 128;

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
  const maxBlockCount = readLimit(
    options.maxBlockCount,
    defaultMaxBlockCount,
    "maxBlockCount",
  );
  const lines = markdown.split("\n");

  if (lines.length > maxBlockCount) {
    throw new Error("Structured Markdown document has too many blocks");
  }

  const previousDocument =
    options.previousDocument === undefined
      ? undefined
      : validateStructuredMarkdownDocument(
          options.previousDocument,
          validationOptions,
        );
  const createBlockId = options.createBlockId ?? createOpaqueBlockId;
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
  const assignedPreviousBlockIds = new Set<string>();
  const unavailableBlockIds = new Set(
    previousBlocks.map((block) => block.blockId),
  );

  if (previousBlocks.length === 0) {
    return lines.map(() => {
      const blockId = createUniqueBlockId(
        options.createBlockId,
        unavailableBlockIds,
      );

      unavailableBlockIds.add(blockId);

      return blockId;
    });
  }

  let start = 0;

  while (
    start < lines.length &&
    start < previousBlocks.length &&
    blockToMarkdown(previousBlocks[start]) === lines[start]
  ) {
    retainPreviousBlockId(start, previousBlocks[start], {
      assignedBlockIds,
      assignedPreviousBlockIds,
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
      assignedPreviousBlockIds,
    });
    previousEnd -= 1;
    lineEnd -= 1;
  }

  retainEditedBlockIds({
    lines,
    previousBlocks,
    start,
    lineEnd,
    previousEnd,
    assignedBlockIds,
    assignedPreviousBlockIds,
  });

  for (let index = 0; index < lines.length; index += 1) {
    if (assignedBlockIds[index] !== undefined) {
      continue;
    }

    const blockId = createUniqueBlockId(
      options.createBlockId,
      unavailableBlockIds,
    );
    assignedBlockIds[index] = blockId;
    unavailableBlockIds.add(blockId);
  }

  return assignedBlockIds.map((blockId) => blockId ?? "");
}

function retainEditedBlockIds(input: {
  lines: readonly string[];
  previousBlocks: readonly BlockNode[];
  start: number;
  lineEnd: number;
  previousEnd: number;
  assignedBlockIds: Array<string | undefined>;
  assignedPreviousBlockIds: Set<string>;
}): void {
  let nextLineIndex = input.start;

  for (
    let previousIndex = input.start;
    previousIndex <= input.previousEnd;
    previousIndex += 1
  ) {
    const previousBlock = input.previousBlocks[previousIndex];

    if (
      previousBlock === undefined ||
      input.assignedPreviousBlockIds.has(previousBlock.blockId)
    ) {
      continue;
    }

    let bestLineIndex: number | undefined;
    let bestScore = 0;

    const candidateLineEnd = Math.min(
      input.lineEnd,
      nextLineIndex + maxBlockIdReconciliationLookahead - 1,
    );

    for (
      let lineIndex = nextLineIndex;
      lineIndex <= candidateLineEnd;
      lineIndex += 1
    ) {
      if (input.assignedBlockIds[lineIndex] !== undefined) {
        continue;
      }

      const score = blockSimilarityScore(
        blockToMarkdown(previousBlock),
        input.lines[lineIndex] ?? "",
      );

      if (score > bestScore) {
        bestScore = score;
        bestLineIndex = lineIndex;
      }

      if (score === 1) {
        break;
      }
    }

    if (bestLineIndex === undefined || bestScore < 0.5) {
      continue;
    }

    retainPreviousBlockId(bestLineIndex, previousBlock, {
      assignedBlockIds: input.assignedBlockIds,
      assignedPreviousBlockIds: input.assignedPreviousBlockIds,
    });
    nextLineIndex = bestLineIndex + 1;
  }
}

function blockSimilarityScore(previousLine: string, nextLine: string): number {
  const previous = previousLine.trim().toLocaleLowerCase();
  const next = nextLine.trim().toLocaleLowerCase();

  if (previous === next) {
    return 1;
  }

  if (previous.length === 0 || next.length === 0) {
    return 0;
  }

  if (
    previous.length >= 3 &&
    (next.startsWith(previous) || next.includes(previous))
  ) {
    return 0.9;
  }

  if (
    next.length >= 3 &&
    (previous.startsWith(next) || previous.includes(next))
  ) {
    return 0.9;
  }

  const previousTokens = tokenizeForSimilarity(previous);
  const nextTokens = tokenizeForSimilarity(next);

  if (previousTokens.length === 0 || nextTokens.length === 0) {
    return 0;
  }

  const nextTokenSet = new Set(nextTokens);
  const sharedTokenCount = previousTokens.filter((token) =>
    nextTokenSet.has(token),
  ).length;

  return sharedTokenCount / Math.max(previousTokens.length, nextTokens.length);
}

function tokenizeForSimilarity(value: string): string[] {
  return value
    .split(/[^\p{L}\p{N}_]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function retainPreviousBlockId(
  index: number,
  block: BlockNode | undefined,
  state: {
    assignedBlockIds: Array<string | undefined>;
    assignedPreviousBlockIds: Set<string>;
  },
): void {
  if (
    block === undefined ||
    state.assignedPreviousBlockIds.has(block.blockId)
  ) {
    return;
  }

  state.assignedBlockIds[index] = block.blockId;
  state.assignedPreviousBlockIds.add(block.blockId);
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

  if (block.type === "markdown.text") {
    throw new Error("Legacy Markdown text nodes are not structured blocks");
  }

  if (block.text !== undefined && typeof block.text !== "string") {
    throw new Error("Structured Markdown block text must be a string");
  }

  if (block.attrs !== undefined) {
    validateAttrs(block.attrs);
  }

  if (block.marks !== undefined) {
    validateMarks(block.marks);
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

  validateNonExecutableObject(attrs, "attrs");
}

function validateMarks(marks: unknown): void {
  if (!Array.isArray(marks)) {
    throw new Error("Structured Markdown block marks must be an array");
  }

  for (const mark of marks) {
    if (!isRecord(mark)) {
      throw new Error("Structured Markdown mark must be an object");
    }

    if (mark.type !== undefined && typeof mark.type !== "string") {
      throw new Error("Structured Markdown mark type must be a string");
    }

    if (mark.attrs !== undefined) {
      validateAttrs(mark.attrs);
    }

    validateNonExecutableObject(mark, "marks");
  }
}

function validateNonExecutableObject(
  object: Record<string, unknown>,
  label: string,
): void {
  for (const [key, value] of Object.entries(object)) {
    if (/^on/i.test(key)) {
      throw new Error(`Structured Markdown block ${label} cannot be executable`);
    }

    if (key === "attrs") {
      validateAttrs(value);
    } else {
      validateJsonCompatibleNonExecutableValue(value, label);
    }
  }
}

function validateJsonCompatibleNonExecutableValue(
  value: unknown,
  label: string,
): void {
  if (typeof value === "string") {
    if (isExecutableUrlLike(value)) {
      throw new Error(`Structured Markdown block ${label} cannot be executable`);
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
      validateJsonCompatibleNonExecutableValue(item, label);
    }

    return;
  }

  if (isRecord(value)) {
    validateNonExecutableObject(value, label);

    return;
  }

  throw new Error(`Structured Markdown block ${label} must be JSON-compatible`);
}

function isExecutableUrlLike(value: string): boolean {
  const normalizedValue = value
    .replace(/[\u0000-\u001F\u007F\s]+/gu, "")
    .toLocaleLowerCase();

  return (
    normalizedValue.startsWith("javascript:") ||
    normalizedValue.startsWith("data:")
  );
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
