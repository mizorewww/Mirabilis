import { describe, expect, it, vi } from "vitest";

import type {
  BlockNode,
  StructuredMarkdownDocument,
} from "../core";
import * as core from "../core";

type ImportMarkdownOptions = {
  createBlockId?: () => string;
  previousDocument?: StructuredMarkdownDocument;
  maxInputLength?: number;
  maxBlockCount?: number;
  maxDepth?: number;
};

type ValidateStructuredMarkdownDocumentOptions = {
  maxBlockCount?: number;
  maxDepth?: number;
};

type MarkdownConversionApi = {
  importMarkdownToStructuredDocument(
    markdown: string,
    options?: ImportMarkdownOptions,
  ): StructuredMarkdownDocument;
  exportStructuredDocumentToMarkdown(
    document: StructuredMarkdownDocument,
  ): string;
  validateStructuredMarkdownDocument(
    document: unknown,
    options?: ValidateStructuredMarkdownDocumentOptions,
  ): StructuredMarkdownDocument;
};

describe("Markdown import/export", () => {
  it("imports visible Markdown syntax into structured blocks with unique nonblank blockIds and exports it unchanged", () => {
    const {
      importMarkdownToStructuredDocument,
      exportStructuredDocumentToMarkdown,
    } = getMarkdownConversionApi();
    const markdown = [
      "# Heading",
      "",
      "Paragraph with #tag and [[Page]] and [unsafe](javascript:alert(1)).",
      "",
      "- list item",
      "- [ ] checkbox syntax stays text",
      "",
      "```js",
      "const html = \"<button onclick='run()'>\";",
      "```",
      "",
      "<img src=x onerror=alert(1)>",
    ].join("\n");

    const document = importMarkdownToStructuredDocument(markdown, {
      createBlockId: createBlockIdFactory("block"),
    });

    expect(document.type).toBe("doc");
    expect(Array.isArray(document.content)).toBe(true);
    expectEveryStructuredBlockHasAUniqueBlockId(document);
    expect(JSON.stringify(document)).toContain("#tag");
    expect(JSON.stringify(document)).toContain("[[Page]]");
    expect(JSON.stringify(document)).toContain("- [ ] checkbox syntax stays text");
    expect(JSON.stringify(document)).toContain("```js");
    expect(JSON.stringify(document)).toContain("<img src=x onerror=alert(1)>");
    expect(JSON.stringify(collectAttrs(document))).not.toMatch(
      /javascript:|onclick|onerror/i,
    );

    const exported = exportStructuredDocumentToMarkdown(document);

    expect(exported).toBe(markdown);
    expect(exported).not.toMatch(/\bblock-\d+\b/);
  });

  it("keeps duplicate block identities distinct and stable when one duplicate is edited", () => {
    const {
      importMarkdownToStructuredDocument,
      exportStructuredDocumentToMarkdown,
    } = getMarkdownConversionApi();
    const createBlockId = createBlockIdFactory("duplicate");
    const original = importMarkdownToStructuredDocument(
      ["Duplicate", "Duplicate", "Duplicate"].join("\n"),
      { createBlockId },
    );
    const originalIds = topLevelBlockIds(original);

    expect(originalIds).toHaveLength(3);
    expect(new Set(originalIds).size).toBe(3);

    const edited = importMarkdownToStructuredDocument(
      ["Duplicate", "Duplicate edited", "Duplicate"].join("\n"),
      {
        createBlockId,
        previousDocument: original,
      },
    );

    expect(topLevelBlockIds(edited)).toStrictEqual(originalIds);
    expect(exportStructuredDocumentToMarkdown(edited)).toBe(
      ["Duplicate", "Duplicate edited", "Duplicate"].join("\n"),
    );
  });

  it("preserves an existing blockId when only that block's visible Markdown changes", () => {
    const { importMarkdownToStructuredDocument } = getMarkdownConversionApi();
    const createBlockId = createBlockIdFactory("edit");
    const original = importMarkdownToStructuredDocument(
      ["# Title", "Paragraph", "- list item"].join("\n"),
      { createBlockId },
    );

    const edited = importMarkdownToStructuredDocument(
      ["# Title", "Paragraph with more detail", "- list item"].join("\n"),
      {
        createBlockId,
        previousDocument: original,
      },
    );

    expect(topLevelBlockIds(edited)).toStrictEqual(topLevelBlockIds(original));
  });

  it("does not assign a deleted blockId to a same-length inserted line", () => {
    const { importMarkdownToStructuredDocument } = getMarkdownConversionApi();
    const original = importMarkdownToStructuredDocument(
      ["Alpha", "Beta", "Gamma"].join("\n"),
      { createBlockId: createBlockIdFactory("same-length") },
    );
    const [alphaId, deletedBetaId, gammaId] = topLevelBlockIds(original);

    const replacement = importMarkdownToStructuredDocument(
      ["Alpha", "Inserted line with unrelated text", "Gamma"].join("\n"),
      {
        createBlockId: createBlockIdSequence([
          deletedBetaId,
          "same-length-fresh",
        ]),
        previousDocument: original,
      },
    );

    expect(topLevelBlockIds(replacement)).toStrictEqual([
      alphaId,
      "same-length-fresh",
      gammaId,
    ]);
    expect(topLevelBlockIds(replacement)).not.toContain(deletedBetaId);
  });

  it("preserves an edited existing blockId when another line is inserted", () => {
    const { importMarkdownToStructuredDocument } = getMarkdownConversionApi();
    const createBlockId = createBlockIdFactory("combined");
    const original = importMarkdownToStructuredDocument(
      ["Daily note", "Review PR", "Ship build"].join("\n"),
      { createBlockId },
    );
    const [dailyId, reviewId, shipId] = topLevelBlockIds(original);

    const editedWithInsertion = importMarkdownToStructuredDocument(
      [
        "Daily note",
        "Inserted reminder",
        "Review PR with notes",
        "Ship build",
      ].join("\n"),
      {
        createBlockId,
        previousDocument: original,
      },
    );

    const editedIds = topLevelBlockIds(editedWithInsertion);

    expect(editedIds).toHaveLength(4);
    expect(editedIds[0]).toBe(dailyId);
    expect(editedIds[2]).toBe(reviewId);
    expect(editedIds[3]).toBe(shipId);
    expect(editedIds[1]).not.toBe(dailyId);
    expect(editedIds[1]).not.toBe(reviewId);
    expect(editedIds[1]).not.toBe(shipId);
    expect(editedIds[1]?.trim()).not.toBe("");
  });

  it("keeps an edited old blockId when a similar new line is inserted before it", () => {
    const { importMarkdownToStructuredDocument } = getMarkdownConversionApi();
    const createBlockId = createBlockIdFactory("similar");
    const original = importMarkdownToStructuredDocument(
      ["Daily note", "Review PR", "Ship build"].join("\n"),
      { createBlockId },
    );
    const [dailyId, reviewId, shipId] = topLevelBlockIds(original);

    const editedWithSimilarInsertion = importMarkdownToStructuredDocument(
      [
        "Daily note",
        "Review PR backlog",
        "Review PR with notes",
        "Ship build",
      ].join("\n"),
      {
        createBlockId,
        previousDocument: original,
      },
    );
    const editedIds = topLevelBlockIds(editedWithSimilarInsertion);

    expect(editedIds).toHaveLength(4);
    expect(editedIds[0]).toBe(dailyId);
    expect(editedIds[2]).toBe(reviewId);
    expect(editedIds[3]).toBe(shipId);
    expect(editedIds[1]).not.toBe(dailyId);
    expect(editedIds[1]).not.toBe(reviewId);
    expect(editedIds[1]).not.toBe(shipId);
    expect(editedIds[1]?.trim()).not.toBe("");
  });

  it("keeps the actual edited old blockId when a longer similar line is inserted before it", () => {
    const { importMarkdownToStructuredDocument } = getMarkdownConversionApi();
    const createBlockId = createBlockIdFactory("longer-similar");
    const original = importMarkdownToStructuredDocument(
      ["Daily note", "Review PR", "Ship build"].join("\n"),
      { createBlockId },
    );
    const [dailyId, reviewId, shipId] = topLevelBlockIds(original);

    const editedWithLongerSimilarInsertion = importMarkdownToStructuredDocument(
      [
        "Daily note",
        "Review PR with extra backlog details",
        "Review PR with notes",
        "Ship build",
      ].join("\n"),
      {
        createBlockId,
        previousDocument: original,
      },
    );
    const editedIds = topLevelBlockIds(editedWithLongerSimilarInsertion);

    expect(editedIds).toHaveLength(4);
    expect(editedIds[0]).toBe(dailyId);
    expect(editedIds[2]).toBe(reviewId);
    expect(editedIds[3]).toBe(shipId);
    expect(editedIds[1]).not.toBe(dailyId);
    expect(editedIds[1]).not.toBe(reviewId);
    expect(editedIds[1]).not.toBe(shipId);
    expect(editedIds[1]?.trim()).not.toBe("");
  });

  it("preserves unchanged neighbor IDs across insertions and deletions without reusing a deleted ID", () => {
    const {
      importMarkdownToStructuredDocument,
      exportStructuredDocumentToMarkdown,
    } = getMarkdownConversionApi();
    const createBlockId = createBlockIdFactory("neighbor");
    const original = importMarkdownToStructuredDocument(
      ["Alpha", "Beta", "Gamma"].join("\n"),
      { createBlockId },
    );
    const [alphaId, betaId, gammaId] = topLevelBlockIds(original);

    const afterDelete = importMarkdownToStructuredDocument(
      ["Alpha", "Gamma"].join("\n"),
      {
        createBlockId,
        previousDocument: original,
      },
    );

    expect(topLevelBlockIds(afterDelete)).toStrictEqual([alphaId, gammaId]);
    expect(topLevelBlockIds(afterDelete)).not.toContain(betaId);

    const afterInsert = importMarkdownToStructuredDocument(
      ["Alpha", "Inserted", "Gamma"].join("\n"),
      {
        createBlockId,
        previousDocument: afterDelete,
      },
    );

    expect(topLevelBlockIds(afterInsert)[0]).toBe(alphaId);
    expect(topLevelBlockIds(afterInsert)[2]).toBe(gammaId);
    expect(topLevelBlockIds(afterInsert)[1]).not.toBe(betaId);
    expect(topLevelBlockIds(afterInsert)[1]).not.toBe(alphaId);
    expect(topLevelBlockIds(afterInsert)[1]).not.toBe(gammaId);
    expect(exportStructuredDocumentToMarkdown(afterInsert)).toBe(
      ["Alpha", "Inserted", "Gamma"].join("\n"),
    );
  });

  it("rejects malformed structured documents and oversized Markdown input", () => {
    const {
      importMarkdownToStructuredDocument,
      validateStructuredMarkdownDocument,
    } = getMarkdownConversionApi();

    expect(() =>
      validateStructuredMarkdownDocument(validStructuredDocument()),
    ).not.toThrow();

    const malformedCases: Array<{
      label: string;
      document: unknown;
      options?: ValidateStructuredMarkdownDocumentOptions;
    }> = [
      {
        label: "missing blockId",
        document: {
          type: "doc",
          content: [{ type: "paragraph", text: "Missing ID" }],
        },
      },
      {
        label: "duplicate blockId",
        document: {
          type: "doc",
          content: [
            { blockId: "block-1", type: "paragraph", text: "One" },
            { blockId: "block-1", type: "paragraph", text: "Two" },
          ],
        },
      },
      {
        label: "non-doc root",
        document: {
          type: "paragraph",
          content: [],
        },
      },
      {
        label: "non-array content",
        document: {
          type: "doc",
          content: { blockId: "block-1" },
        },
      },
      {
        label: "excessive depth",
        document: nestedDocument(4),
        options: { maxDepth: 2 },
      },
      {
        label: "excessive block count",
        document: {
          type: "doc",
          content: [
            { blockId: "block-1", type: "paragraph", text: "One" },
            { blockId: "block-2", type: "paragraph", text: "Two" },
          ],
        },
        options: { maxBlockCount: 1 },
      },
      {
        label: "executable-like attrs",
        document: {
          type: "doc",
          content: [
            {
              blockId: "block-1",
              type: "link",
              text: "Run",
              attrs: {
                href: "javascript:alert(1)",
                onClick: "alert(1)",
              },
            },
          ],
        },
      },
      {
        label: "data URL attrs",
        document: {
          type: "doc",
          content: [
            {
              blockId: "block-1",
              type: "link",
              text: "Data URL",
              attrs: {
                href: "data:text/html,<script>alert(1)</script>",
              },
            },
          ],
        },
      },
      {
        label: "control-character javascript attrs",
        document: {
          type: "doc",
          content: [
            {
              blockId: "block-1",
              type: "link",
              text: "Control URL",
              attrs: {
                href: "java\u0000script:alert(1)",
              },
            },
          ],
        },
      },
      {
        label: "malformed marks",
        document: {
          type: "doc",
          content: [
            {
              blockId: "block-1",
              type: "markdown.line",
              text: "Malformed marks",
              marks: {
                bold: true,
              },
            },
          ],
        },
      },
      {
        label: "executable mark attrs",
        document: {
          type: "doc",
          content: [
            {
              blockId: "block-1",
              type: "markdown.line",
              text: "Marked link",
              marks: [
                {
                  type: "link",
                  attrs: {
                    href: "javascript:alert(1)",
                    onClick: "alert(1)",
                  },
                },
              ],
            },
          ],
        },
      },
    ];

    for (const { label, document, options } of malformedCases) {
      expect(
        () => validateStructuredMarkdownDocument(document, options),
        label,
      ).toThrow();
    }

    expect(() =>
      importMarkdownToStructuredDocument("x".repeat(12), {
        createBlockId: createBlockIdFactory("oversized"),
        maxInputLength: 10,
      }),
    ).toThrow();
  });

  it("rejects too many imported blocks before allocating blockIds", () => {
    const { importMarkdownToStructuredDocument } = getMarkdownConversionApi();
    let nextId = 1;
    const createBlockId = vi.fn(() => `block-${nextId++}`);

    expect(() =>
      importMarkdownToStructuredDocument(["One", "Two"].join("\n"), {
        createBlockId,
        maxBlockCount: 1,
      }),
    ).toThrow();
    expect(createBlockId).not.toHaveBeenCalled();
  });
});

function getMarkdownConversionApi(): MarkdownConversionApi {
  const candidate = core as Partial<MarkdownConversionApi>;
  const requiredExports: Array<keyof MarkdownConversionApi> = [
    "importMarkdownToStructuredDocument",
    "exportStructuredDocumentToMarkdown",
    "validateStructuredMarkdownDocument",
  ];
  const missingExports = requiredExports.filter(
    (exportName) => typeof candidate[exportName] !== "function",
  );

  expect(missingExports).toStrictEqual([]);

  if (
    candidate.importMarkdownToStructuredDocument === undefined ||
    candidate.exportStructuredDocumentToMarkdown === undefined ||
    candidate.validateStructuredMarkdownDocument === undefined
  ) {
    throw new Error(`Missing Markdown conversion exports: ${missingExports.join(", ")}`);
  }

  return candidate as MarkdownConversionApi;
}

function createBlockIdFactory(prefix: string): () => string {
  let nextId = 1;

  return () => `${prefix}-${nextId++}`;
}

function createBlockIdSequence(ids: readonly string[]): () => string {
  let nextIndex = 0;

  return () => ids[nextIndex++] ?? `unexpected-block-${nextIndex}`;
}

function expectEveryStructuredBlockHasAUniqueBlockId(
  document: StructuredMarkdownDocument,
): void {
  const blocks = collectBlocks(document);
  const blockIds = blocks.map((block) => block.blockId);

  expect(blocks.length).toBeGreaterThan(0);
  expect(blockIds.every((blockId) => blockId.trim().length > 0)).toBe(true);
  expect(new Set(blockIds).size).toBe(blockIds.length);
}

function collectBlocks(document: StructuredMarkdownDocument): BlockNode[] {
  const blocks: BlockNode[] = [];

  for (const block of document.content) {
    collectBlock(block, blocks);
  }

  return blocks;
}

function collectBlock(block: BlockNode, blocks: BlockNode[]): void {
  blocks.push(block);

  for (const child of block.content ?? []) {
    collectBlock(child, blocks);
  }
}

function collectAttrs(
  document: StructuredMarkdownDocument,
): Array<Record<string, unknown>> {
  return collectBlocks(document)
    .map((block) => block.attrs)
    .filter((attrs): attrs is Record<string, unknown> => attrs !== undefined);
}

function topLevelBlockIds(document: StructuredMarkdownDocument): string[] {
  return document.content.map((block) => block.blockId);
}

function validStructuredDocument(): StructuredMarkdownDocument {
  return {
    type: "doc",
    content: [
      {
        blockId: "block-valid",
        type: "paragraph",
        text: "Valid",
      },
    ],
  };
}

function nestedDocument(depth: number): StructuredMarkdownDocument {
  let node: BlockNode = {
    blockId: `block-depth-${depth}`,
    type: "paragraph",
    text: "Leaf",
  };

  for (let level = depth - 1; level >= 0; level -= 1) {
    node = {
      blockId: `block-depth-${level}`,
      type: "container",
      content: [node],
    };
  }

  return {
    type: "doc",
    content: [node],
  };
}
