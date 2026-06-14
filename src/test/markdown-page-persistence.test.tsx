import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ComponentType } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

import { createAppRuntime, type AppRuntime } from "../bootstrap";
import {
  DB_PERSISTENCE_OPERATIONS,
  exportStructuredDocumentToMarkdown,
  type BlockNode,
  type DbQuery,
  type StructuredMarkdownDocument,
} from "../core";

type MarkdownEditorDocument = {
  id: string;
  title: string;
  markdown: string;
  body?: StructuredMarkdownDocument;
};

type MarkdownPageFacade = {
  load(pageId: string): Promise<MarkdownEditorDocument>;
  save(input: {
    pageId: string;
    markdown: string;
  }): Promise<MarkdownEditorDocument>;
};

type RuntimeMarkdownPageFacade = AppRuntime["markdown"] & {
  pages?: MarkdownPageFacade;
};

type MarkdownCommandBus = {
  execute(commandId: string, input?: unknown): Promise<unknown>;
};

type PersistedMarkdownPageEditorProps = {
  pageId: string;
  pageFacade: MarkdownPageFacade;
  commands: MarkdownCommandBus;
};

type RecordingNativeBridge = {
  db: {
    execute: Mock<(query: DbQuery) => Promise<unknown>>;
    transaction<Response>(
      queries: DbQuery[],
    ): Promise<NativeBridgeTransactionResult<Response>>;
  };
  shortcuts: {
    register(shortcut: string, commandId: string): Promise<void>;
    unregister(shortcut: string): Promise<void>;
  };
  notifications: {
    notify(input: { title: string; body?: string }): Promise<void>;
  };
  files: {
    importMarkdown: Mock<(path: string) => Promise<string>>;
    exportMarkdown: Mock<(pageId: string, path: string) => Promise<void>>;
  };
};

type NativeBridgeTransactionResult<Response> =
  Response extends readonly unknown[]
    ? number extends Response["length"]
      ? Array<Response>
      : Response
    : Array<Response>;

type CoreMarkdownPageDto = {
  id: string;
  title: string;
  parentPageId: string | null;
  body: CoreMarkdownPageBody;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
};

type CoreMarkdownPageBody =
  | StructuredMarkdownDocument
  | LegacyMarkdownTextBody;

type LegacyMarkdownTextBody = {
  type: "doc";
  content: readonly [
    {
      type: "markdown.text";
      text: string;
    },
  ];
};

type Deferred<Value> = {
  promise: Promise<Value>;
  resolve(value: Value): void;
  reject(reason: unknown): void;
};

type PageUpdatePayload = {
  id: string;
  title: string;
  parentPageId: string | null;
  body: StructuredMarkdownDocument;
  updatedAt: string;
};

const updatedAt = "2026-01-01T00:00:00.000Z";
const createdAt = "2025-12-31T00:00:00.000Z";

describe("Markdown page persistence", () => {
  it("uses a production runtime page facade that persists through allowlisted NativeBridge page DTOs", async () => {
    const runtimePage = createCorePageDto({
      id: "page-runtime-facade",
      title: "Inbox",
      markdown: "",
    });
    const nativeBridge = createRecordingCorePageNativeBridge(runtimePage);
    const runtime = await createAppRuntime({
      createNativeBridge: () => nativeBridge,
    });
    const productionPageFacade = (runtime.markdown as RuntimeMarkdownPageFacade)
      .pages;

    expect.soft(productionPageFacade).toEqual({
      load: expect.any(Function),
      save: expect.any(Function),
    });

    if (productionPageFacade === undefined) {
      return;
    }

    nativeBridge.db.execute.mockClear();

    const user = userEvent.setup();
    const savedMarkdown = [
      "# Runtime facade",
      "",
      "Saved through NativeBridge",
      "- [ ] checked later",
      "#tag",
      "[[Reopen]]",
    ].join("\n");

    const { unmount } = renderPersistedMarkdownEditor(runtime, {
      pageId: "page-runtime-facade",
      pageFacade: productionPageFacade,
      commands: createCommandBus(runtime),
    });
    const editor = await screen.findByRole("textbox", { name: /markdown/i });

    await waitFor(() => expect(editor).toHaveValue(""));
    await user.click(editor);
    await user.keyboard(toKeyboardLiteral(savedMarkdown));
    await user.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(pageUpdateQueries(nativeBridge)).toHaveLength(1));
    const [updateQuery] = pageUpdateQueries(nativeBridge);
    const updatePayload = expectPageUpdatePayload(updateQuery);

    expect(updatePayload).toMatchObject({
      id: "page-runtime-facade",
      title: "Inbox",
      parentPageId: null,
      updatedAt,
    });
    expectStructuredBodyMarkdown(updatePayload.body, savedMarkdown);
    expectEveryBlockHasUniqueNonblankBlockId(updatePayload.body);

    unmount();

    renderPersistedMarkdownEditor(runtime, {
      pageId: "page-runtime-facade",
      pageFacade: productionPageFacade,
      commands: createCommandBus(runtime),
    });

    expect(
      await screen.findByRole("textbox", { name: /markdown/i }),
    ).toHaveValue(savedMarkdown);
    expect(nativeBridge.db.execute.mock.calls.map(([query]) => query.operation))
      .toStrictEqual([
        DB_PERSISTENCE_OPERATIONS.pagesGet,
        DB_PERSISTENCE_OPERATIONS.pagesUpdate,
        DB_PERSISTENCE_OPERATIONS.pagesGet,
      ]);
    expect(JSON.stringify(nativeBridge.db.execute.mock.calls)).not.toMatch(
      /\bsql\b|\bparams\b|select\s+\*|core_pages|\bpath\b|\bfile\b/i,
    );
  });

  it("loads structured stored bodies to editor Markdown and keeps the legacy markdown.text fallback", async () => {
    const structuredMarkdown = [
      "# Stored heading",
      "",
      "Paragraph with #tag and [[Page]]",
      "- [ ] task syntax remains text",
    ].join("\n");
    const structuredPageFacade = await createProductionPageFacade(
      createRecordingCorePageNativeBridge(
        createCorePageDto({
          id: "page-structured-load",
          title: "Structured",
          body: structuredBodyFromMarkdown(structuredMarkdown, [
            "block-heading",
            "block-blank",
            "block-paragraph",
            "block-task",
          ]),
        }),
      ),
    );

    await expect(
      structuredPageFacade.load("page-structured-load"),
    ).resolves.toMatchObject({
      id: "page-structured-load",
      title: "Structured",
      markdown: structuredMarkdown,
    });

    const legacyMarkdown = [
      "# Legacy",
      "",
      "TASK-016 stored this as one markdown.text node.",
    ].join("\n");
    const legacyPageFacade = await createProductionPageFacade(
      createRecordingCorePageNativeBridge(
        createCorePageDto({
          id: "page-legacy-load",
          title: "Legacy",
          body: markdownToNativeBody(legacyMarkdown),
        }),
      ),
    );

    await expect(legacyPageFacade.load("page-legacy-load")).resolves.toMatchObject({
      id: "page-legacy-load",
      title: "Legacy",
      markdown: legacyMarkdown,
    });
  });

  it("returns structured body from the real runtime page facade load path", async () => {
    const structuredMarkdown = ["- [ ] A", "Nested task page notes"].join("\n");
    const structuredBody = structuredBodyFromMarkdown(structuredMarkdown, [
      "task-block-a",
      "notes-block",
    ]);
    const productionPageFacade = await createProductionPageFacade(
      createRecordingCorePageNativeBridge(
        createCorePageDto({
          id: "page-runtime-structured-body",
          title: "Structured task source",
          body: structuredBody,
        }),
      ),
    );

    await expect(
      productionPageFacade.load("page-runtime-structured-body"),
    ).resolves.toStrictEqual({
      id: "page-runtime-structured-body",
      title: "Structured task source",
      markdown: structuredMarkdown,
      body: structuredBody,
    });
  });

  it("rejects legacy-looking markdown.text bodies unless they match the exact old one-node shape", async () => {
    const invalidBodies: Array<{
      label: string;
      body: unknown;
    }> = [
      {
        label: "legacy node with blockId",
        body: {
          type: "doc",
          content: [
            {
              type: "markdown.text",
              text: "Legacy text",
              blockId: "legacy-block",
            },
          ],
        },
      },
      {
        label: "legacy node with non-string blockId",
        body: {
          type: "doc",
          content: [
            {
              type: "markdown.text",
              text: "Legacy text",
              blockId: 123,
            },
          ],
        },
      },
      {
        label: "legacy node with attrs",
        body: {
          type: "doc",
          content: [
            {
              type: "markdown.text",
              text: "Legacy text",
              attrs: {
                href: "https://example.invalid",
              },
            },
          ],
        },
      },
      {
        label: "legacy node with child content",
        body: {
          type: "doc",
          content: [
            {
              type: "markdown.text",
              text: "Legacy text",
              content: [],
            },
          ],
        },
      },
      {
        label: "legacy node with marks",
        body: {
          type: "doc",
          content: [
            {
              type: "markdown.text",
              text: "Legacy text",
              marks: [
                {
                  type: "bold",
                },
              ],
            },
          ],
        },
      },
    ];

    for (const [index, { label, body }] of invalidBodies.entries()) {
      const pageId = `page-malformed-legacy-${index}`;
      const pageFacade = await createProductionPageFacade(
        createRecordingCorePageNativeBridge(
          createCorePageDto({
            id: pageId,
            title: "Malformed legacy",
            body: body as CoreMarkdownPageBody,
          }),
        ),
      );

      await expect(pageFacade.load(pageId), label).rejects.toThrow();
    }
  });

  it("saves edited Markdown as structured blocks and reuses prior blockIds", async () => {
    const nativeBridge = createRecordingCorePageNativeBridge(
      createCorePageDto({
        id: "page-stable-save",
        title: "Stable IDs",
        body: structuredBodyFromMarkdown(["Alpha", "Beta"].join("\n"), [
          "block-alpha",
          "block-beta",
        ]),
      }),
    );
    const pageFacade = await createProductionPageFacade(nativeBridge);

    await expect(pageFacade.load("page-stable-save")).resolves.toMatchObject({
      markdown: ["Alpha", "Beta"].join("\n"),
    });
    await expect(
      pageFacade.save({
        pageId: "page-stable-save",
        markdown: ["Alpha edited", "Beta"].join("\n"),
      }),
    ).resolves.toMatchObject({
      id: "page-stable-save",
      title: "Stable IDs",
      markdown: ["Alpha edited", "Beta"].join("\n"),
    });

    const [updateQuery] = pageUpdateQueries(nativeBridge);
    const updatePayload = expectPageUpdatePayload(updateQuery);

    expect(exportStructuredDocumentToMarkdown(updatePayload.body)).toBe(
      ["Alpha edited", "Beta"].join("\n"),
    );
    expect(collectBlockIds(updatePayload.body)).toEqual(
      expect.arrayContaining(["block-alpha", "block-beta"]),
    );
    expectEveryBlockHasUniqueNonblankBlockId(updatePayload.body);
    expect(JSON.stringify(nativeBridge.db.execute.mock.calls)).not.toMatch(
      /\bfiles?_import\b|\bfiles?_export\b|\bpath\b|\bfile\b/i,
    );
    expect(nativeBridge.files.importMarkdown).not.toHaveBeenCalled();
    expect(nativeBridge.files.exportMarkdown).not.toHaveBeenCalled();
  });

  it("saves through a narrow page facade and reopens the same page with saved Markdown", async () => {
    const runtime = await createRuntime();
    const user = userEvent.setup();
    const nativeBridge = createRecordingNativeBridge({
      id: "page-persisted",
      title: "Inbox",
      markdown: "",
    });
    const pageFacade = createNativeBackedPageFacade(nativeBridge);
    const commandBus = createCommandBus(runtime);
    const savedMarkdown = [
      "# Saved",
      "",
      "Paragraph text",
      "- item",
      "- [ ] task",
      "#tag",
      "[[Page]]",
    ].join("\n");

    const { unmount } = renderPersistedMarkdownEditor(runtime, {
      pageId: "page-persisted",
      pageFacade,
      commands: commandBus,
    });
    const editor = await screen.findByRole("textbox", { name: /markdown/i });

    await waitFor(() => expect(editor).toHaveValue(""));
    await user.click(editor);
    await user.keyboard(toKeyboardLiteral(savedMarkdown));
    await user.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(pageUpdateQueries(nativeBridge)).toHaveLength(1));
    const [updateQuery] = pageUpdateQueries(nativeBridge);
    const updatePayload = expectPageUpdatePayload(updateQuery);

    expect(updatePayload).toMatchObject({
      id: "page-persisted",
      title: "Inbox",
      parentPageId: null,
      updatedAt,
    });
    expectStructuredBodyMarkdown(updatePayload.body, savedMarkdown);
    expectEveryBlockHasUniqueNonblankBlockId(updatePayload.body);

    unmount();

    renderPersistedMarkdownEditor(runtime, {
      pageId: "page-persisted",
      pageFacade,
      commands: commandBus,
    });

    expect(
      await screen.findByRole("textbox", { name: /markdown/i }),
    ).toHaveValue(savedMarkdown);
    const queries = nativeBridge.db.execute.mock.calls.map(([query]) => query);
    expect(queries.map((query) => query.operation)).toStrictEqual([
      DB_PERSISTENCE_OPERATIONS.pagesGet,
      DB_PERSISTENCE_OPERATIONS.pagesUpdate,
      DB_PERSISTENCE_OPERATIONS.pagesGet,
    ]);
    expect(queries[0]).toStrictEqual({
      operation: DB_PERSISTENCE_OPERATIONS.pagesGet,
      payload: {
        id: "page-persisted",
      },
    } satisfies DbQuery);
    expect(queries[2]).toStrictEqual({
      operation: DB_PERSISTENCE_OPERATIONS.pagesGet,
      payload: {
        id: "page-persisted",
      },
    } satisfies DbQuery);
    expect(JSON.stringify(nativeBridge.db.execute.mock.calls)).not.toMatch(
      /\bsql\b|\bparams\b|select\s+\*|core_pages|\bpath\b|\bfile\b/i,
    );
  });

  it("does not save stale old-page content while a new pageId is loading", async () => {
    const runtime = await createRuntime();
    const user = userEvent.setup();
    const commandBus = createCommandBus(runtime);
    const nextPageLoad = createDeferred<MarkdownEditorDocument>();
    const pageFacade: MarkdownPageFacade = {
      load: vi.fn((pageId: string) => {
        if (pageId === "page-a") {
          return Promise.resolve(createEditorDocument("page-a", "Alpha page"));
        }

        return nextPageLoad.promise;
      }),
      save: vi.fn(async (input) =>
        createEditorDocument(input.pageId, input.markdown),
      ),
    };
    const Editor = getPersistedMarkdownPageEditorComponent(runtime);

    const { rerender } = render(
      <Editor
        pageId="page-a"
        pageFacade={pageFacade}
        commands={commandBus}
      />,
    );
    const editor = await screen.findByRole("textbox", { name: /markdown/i });

    await waitFor(() => expect(editor).toHaveValue("Alpha page"));
    await user.clear(editor);
    await user.type(editor, "Alpha edited");

    rerender(
      <Editor
        pageId="page-b"
        pageFacade={pageFacade}
        commands={commandBus}
      />,
    );

    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(pageFacade.save).not.toHaveBeenCalledWith({
      pageId: "page-b",
      markdown: "Alpha edited",
    });

    nextPageLoad.resolve(createEditorDocument("page-b", "Beta page"));
    await waitFor(() => expect(editor).toHaveValue("Beta page"));
    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() =>
      expect(pageFacade.save).toHaveBeenLastCalledWith({
        pageId: "page-b",
        markdown: "Beta page",
      }),
    );
  });

  it("keeps edits made after save starts when the save response completes", async () => {
    const runtime = await createRuntime();
    const user = userEvent.setup();
    const saveCompletion = createDeferred<MarkdownEditorDocument>();
    const pageFacade: MarkdownPageFacade = {
      load: vi.fn(async () => createEditorDocument("page-save-race", "Draft")),
      save: vi.fn(() => saveCompletion.promise),
    };

    renderPersistedMarkdownEditor(runtime, {
      pageId: "page-save-race",
      pageFacade,
      commands: createCommandBus(runtime),
    });
    const editor = await screen.findByRole("textbox", { name: /markdown/i });

    await waitFor(() => expect(editor).toHaveValue("Draft"));
    await user.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() =>
      expect(pageFacade.save).toHaveBeenCalledWith({
        pageId: "page-save-race",
        markdown: "Draft",
      }),
    );

    await user.click(editor);
    await user.type(editor, " plus local edit");
    expect(editor).toHaveValue("Draft plus local edit");

    saveCompletion.resolve(createEditorDocument("page-save-race", "Draft"));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /save/i })).toBeEnabled(),
    );
    expect(editor).toHaveValue("Draft plus local edit");
  });
});

function renderPersistedMarkdownEditor(
  runtime: AppRuntime,
  props: PersistedMarkdownPageEditorProps,
) {
  const Editor = getPersistedMarkdownPageEditorComponent(runtime);

  return render(<Editor {...props} />);
}

function getPersistedMarkdownPageEditorComponent(
  runtime: AppRuntime,
): ComponentType<PersistedMarkdownPageEditorProps> {
  const pageEditor = runtime.registries.views.get(
    "markdown.page-editor",
  ) as unknown as {
    component: ComponentType<PersistedMarkdownPageEditorProps>;
  };

  return pageEditor.component;
}

async function createRuntime(): Promise<AppRuntime> {
  return createAppRuntime({
    createNativeBridge: () =>
      createRecordingNativeBridge({
        id: "unused",
        title: "Unused",
        markdown: "",
      }),
  });
}

function createCommandBus(runtime: AppRuntime): MarkdownCommandBus {
  return {
    execute: vi.fn((commandId: string, input?: unknown) =>
      runtime.commands.execute(commandId, input),
    ),
  };
}

async function createProductionPageFacade(
  nativeBridge: RecordingNativeBridge,
): Promise<MarkdownPageFacade> {
  const runtime = await createAppRuntime({
    createNativeBridge: () => nativeBridge,
  });
  const productionPageFacade = (runtime.markdown as RuntimeMarkdownPageFacade)
    .pages;

  expect(productionPageFacade).toEqual({
    load: expect.any(Function),
    save: expect.any(Function),
  });

  if (productionPageFacade === undefined) {
    throw new Error("Production markdown page facade is missing");
  }

  return productionPageFacade;
}

function createNativeBackedPageFacade(
  nativeBridge: RecordingNativeBridge,
): MarkdownPageFacade {
  return {
    async load(pageId) {
      return nativeBridge.db.execute({
        operation: DB_PERSISTENCE_OPERATIONS.pagesGet,
        payload: {
          id: pageId,
        },
      }) as Promise<MarkdownEditorDocument>;
    },
    async save(input) {
      return nativeBridge.db.execute({
        operation: DB_PERSISTENCE_OPERATIONS.pagesUpdate,
        payload: {
          id: input.pageId,
          title: "Inbox",
          parentPageId: null,
          body: structuredBodyFromMarkdown(input.markdown),
          updatedAt,
        },
      }) as Promise<MarkdownEditorDocument>;
    },
  };
}

function createRecordingCorePageNativeBridge(
  initialPage: CoreMarkdownPageDto,
): RecordingNativeBridge {
  let currentPage = initialPage;
  const execute = vi.fn(async (query: DbQuery) => {
    if (query.operation === DB_PERSISTENCE_OPERATIONS.pagesGet) {
      return currentPage;
    }

    if (query.operation === DB_PERSISTENCE_OPERATIONS.pagesUpdate) {
      const payload = query.payload as {
        id: string;
        title: string;
        parentPageId: string | null;
        body: CoreMarkdownPageBody;
        updatedAt: string;
      };

      currentPage = {
        id: payload.id,
        title: payload.title,
        parentPageId: payload.parentPageId,
        body: payload.body,
        createdAt: currentPage.createdAt,
        updatedAt: payload.updatedAt,
      };

      return currentPage;
    }

    return undefined;
  });

  return {
    db: {
      execute,
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
      importMarkdown: vi.fn(async () => ""),
      exportMarkdown: vi.fn(async () => undefined),
    },
  };
}

function createRecordingNativeBridge(
  initialPage: MarkdownEditorDocument,
): RecordingNativeBridge {
  let currentPage = initialPage;
  const execute = vi.fn(async (query: DbQuery) => {
    if (query.operation === DB_PERSISTENCE_OPERATIONS.pagesGet) {
      return currentPage;
    }

    if (query.operation === DB_PERSISTENCE_OPERATIONS.pagesUpdate) {
      const payload = query.payload as {
        id: string;
        title: string;
        body: StructuredMarkdownDocument;
      };

      currentPage = {
        id: payload.id,
        title: payload.title,
        markdown: exportStructuredDocumentToMarkdown(payload.body),
      };

      return currentPage;
    }

    return undefined;
  });

  return {
    db: {
      execute,
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
      importMarkdown: vi.fn(async () => ""),
      exportMarkdown: vi.fn(async () => undefined),
    },
  };
}

function createCorePageDto(input: {
  id: string;
  title: string;
  markdown?: string;
  body?: CoreMarkdownPageBody;
}): CoreMarkdownPageDto {
  return {
    id: input.id,
    title: input.title,
    parentPageId: null,
    body: input.body ?? markdownToNativeBody(input.markdown ?? ""),
    createdAt,
    updatedAt,
  };
}

function createEditorDocument(
  id: string,
  markdown: string,
): MarkdownEditorDocument {
  return {
    id,
    title: "Inbox",
    markdown,
  };
}

function pageUpdateQueries(nativeBridge: RecordingNativeBridge): DbQuery[] {
  return nativeBridge.db.execute.mock.calls
    .map(([query]) => query)
    .filter((query) => query.operation === DB_PERSISTENCE_OPERATIONS.pagesUpdate);
}

function expectPageUpdatePayload(query: DbQuery | undefined): PageUpdatePayload {
  expect(query).toEqual(
    expect.objectContaining({
      operation: DB_PERSISTENCE_OPERATIONS.pagesUpdate,
      payload: expect.objectContaining({
        id: expect.any(String),
        title: expect.any(String),
        body: expect.objectContaining({
          type: "doc",
          content: expect.any(Array),
        }),
        updatedAt: expect.any(String),
      }),
    }),
  );

  if (query === undefined || query.payload === undefined) {
    throw new Error("Missing page update query payload");
  }

  return query.payload as unknown as PageUpdatePayload;
}

function expectStructuredBodyMarkdown(
  body: StructuredMarkdownDocument,
  markdown: string,
): void {
  expect(body.type).toBe("doc");
  expect(Array.isArray(body.content)).toBe(true);
  expect(body.content).not.toStrictEqual(markdownToNativeBody(markdown).content);
  expect(exportStructuredDocumentToMarkdown(body)).toBe(markdown);
}

function expectEveryBlockHasUniqueNonblankBlockId(
  document: StructuredMarkdownDocument,
): void {
  const blockIds = collectBlockIds(document);

  expect(blockIds.length).toBeGreaterThan(0);
  expect(blockIds.every((blockId) => blockId.trim().length > 0)).toBe(true);
  expect(new Set(blockIds).size).toBe(blockIds.length);
}

function collectBlockIds(document: StructuredMarkdownDocument): string[] {
  return collectBlocks(document).map((block) => block.blockId);
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

function structuredBodyFromMarkdown(
  markdown: string,
  blockIds?: readonly string[],
): StructuredMarkdownDocument {
  return {
    type: "doc",
    content: markdown.split("\n").map((line, index) => ({
      blockId: blockIds?.[index] ?? `block-${index + 1}`,
      type: "markdown.line",
      text: line,
    })),
  };
}

function markdownToNativeBody(markdown: string): LegacyMarkdownTextBody {
  return {
    type: "doc",
    content: [
      {
        type: "markdown.text",
        text: markdown,
      },
    ],
  };
}

function toKeyboardLiteral(markdown: string): string {
  return markdown.split("[").join("[[").split("{").join("{{");
}

function createDeferred<Value>(): Deferred<Value> {
  let resolve: Deferred<Value>["resolve"] | undefined;
  let reject: Deferred<Value>["reject"] | undefined;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  if (resolve === undefined || reject === undefined) {
    throw new Error("Failed to create deferred promise");
  }

  return {
    promise,
    resolve,
    reject,
  };
}
