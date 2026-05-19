import { describe, expect, it } from "vitest";

import { PageStoreError, createInMemoryPageStore } from "../core";
import type {
  CreatePageInput,
  ListPagesOptions,
  MarkdownPage,
  PageStore,
  StructuredMarkdownDocument,
  UpdatePageInput,
} from "../core";

const firstInstant = "2026-05-19T10:00:00.000Z";
const secondInstant = "2026-05-19T10:05:00.000Z";
const thirdInstant = "2026-05-19T10:10:00.000Z";
const fourthInstant = "2026-05-19T10:15:00.000Z";

describe("in-memory Page Store", () => {
  it("creates, reads, and lists an active page with injected ids and timestamps", () => {
    const store = createStore({
      ids: ["page_alpha"],
      instants: [firstInstant],
    });
    const input = createPageInput({
      title: "Alpha memo",
      body: documentWithText("block_alpha", "Opening text"),
    });

    const created = store.create(input);

    expect(created).toEqual({
      id: "page_alpha",
      title: "Alpha memo",
      body: documentWithText("block_alpha", "Opening text"),
      createdAt: firstInstant,
      updatedAt: firstInstant,
    });
    expect(created.archivedAt).toBeUndefined();
    expect(store.get("page_alpha")).toEqual(created);
    expect(store.list()).toEqual([created]);
  });

  it("keeps generated ids unique, stable, and listed in creation order", () => {
    const store = createStore({
      ids: ["page_alpha", "page_beta", "page_gamma"],
      instants: [firstInstant, secondInstant, thirdInstant],
    });

    const alpha = store.create(
      createPageInput({
        title: "Alpha memo",
        body: documentWithText("block_alpha", "Alpha text"),
      }),
    );
    const beta = store.create(
      createPageInput({
        title: "Beta memo",
        body: documentWithText("block_beta", "Beta text"),
      }),
    );
    const gamma = store.create(
      createPageInput({
        title: "Gamma memo",
        body: documentWithText("block_gamma", "Gamma text"),
      }),
    );

    expect([alpha.id, beta.id, gamma.id]).toEqual([
      "page_alpha",
      "page_beta",
      "page_gamma",
    ]);
    expect(new Set([alpha.id, beta.id, gamma.id]).size).toBe(3);
    expect(store.list().map((page) => page.id)).toEqual([
      "page_alpha",
      "page_beta",
      "page_gamma",
    ]);
    expect(store.get(beta.id).id).toBe("page_beta");
  });

  it("sets creation timestamps and leaves archive metadata unset", () => {
    const store = createStore({
      ids: ["page_alpha"],
      instants: [firstInstant],
    });

    const created = store.create(
      createPageInput({
        title: "Timestamp memo",
        body: documentWithText("block_alpha", "Timestamp text"),
      }),
    );

    expect(created.createdAt).toBe(firstInstant);
    expect(created.updatedAt).toBe(firstInstant);
    expect(created.createdAt).toBe(created.updatedAt);
    expect(created.archivedAt).toBeUndefined();
    expect(created).not.toHaveProperty("archivedAt");
  });

  it("updates page fields without replacing identity or nested block structure", () => {
    const store = createStore({
      ids: ["page_alpha"],
      instants: [firstInstant, secondInstant],
    });
    const created = store.create(
      createPageInput({
        title: "Draft memo",
        parentPageId: "page_parent",
        body: nestedDocument("Original text"),
      }),
    );
    const update: UpdatePageInput = {
      title: "Refined memo",
      parentPageId: null,
      body: nestedDocument("Refined text"),
    };

    const updated = store.update(created.id, update);

    expect(updated.id).toBe(created.id);
    expect(updated.createdAt).toBe(created.createdAt);
    expect(updated.updatedAt).toBe(secondInstant);
    expect(updated.parentPageId).toBeUndefined();
    expect(updated.body).toEqual(nestedDocument("Refined text"));
    expect(updated.body.content[0]?.blockId).toBe("block_section");
    expect(updated.body.content[0]?.content?.[0]?.blockId).toBe(
      "block_paragraph",
    );
    expect(updated.body.content[0]?.content?.[0]?.text).toBe("Refined text");
  });

  it("archives pages without deleting them and keeps repeated archives idempotent", () => {
    const store = createStore({
      ids: ["page_alpha"],
      instants: [firstInstant, secondInstant, thirdInstant],
    });
    const created = store.create(
      createPageInput({
        title: "Archive memo",
        body: documentWithText("block_alpha", "Archive text"),
      }),
    );
    const includeArchived: ListPagesOptions = { includeArchived: true };

    const archived = store.archive(created.id);

    expect(archived.archivedAt).toBe(secondInstant);
    expect(archived.updatedAt).toBe(secondInstant);
    expect(store.list()).toEqual([]);
    expect(store.list(includeArchived)).toEqual([archived]);
    expect(store.get(created.id)).toEqual(archived);

    const archivedAgain = store.archive(created.id);

    expect(archivedAgain.archivedAt).toBe(secondInstant);
    expect(archivedAgain.updatedAt).toBe(secondInstant);
    expect(store.list(includeArchived)).toEqual([archived]);
  });

  it("throws typed errors for missing pages", () => {
    const store = createStore({
      ids: ["page_alpha"],
      instants: [firstInstant],
    });
    const missingPageId = "page_missing";

    expectPageStoreError(
      () => store.get(missingPageId),
      "PAGE_NOT_FOUND",
      missingPageId,
    );
    expectPageStoreError(
      () =>
        store.update(missingPageId, {
          title: "Missing memo",
        }),
      "PAGE_NOT_FOUND",
      missingPageId,
    );
    expectPageStoreError(
      () => store.archive(missingPageId),
      "PAGE_NOT_FOUND",
      missingPageId,
    );
  });

  it("uses defensive copies at input, create, get, and list boundaries", () => {
    const store = createStore({
      ids: ["page_alpha"],
      instants: [firstInstant],
    });
    const inputBody = nestedDocument("Stored text");
    const created = store.create(
      createPageInput({
        title: "Copy memo",
        body: inputBody,
      }),
    );

    inputBody.content[0]!.content![0]!.text = "Changed input";
    expect(nestedText(store.get(created.id))).toBe("Stored text");

    created.title = "Changed created";
    created.body.content[0]!.content![0]!.text = "Changed created";
    expect(store.get(created.id).title).toBe("Copy memo");
    expect(nestedText(store.get(created.id))).toBe("Stored text");

    const readPage = store.get(created.id);
    readPage.title = "Changed read";
    readPage.body.content[0]!.content![0]!.text = "Changed read";
    expect(store.get(created.id).title).toBe("Copy memo");
    expect(nestedText(store.get(created.id))).toBe("Stored text");

    const listedPages = store.list();
    listedPages[0]!.title = "Changed list";
    listedPages[0]!.body.content[0]!.content![0]!.text = "Changed list";
    listedPages.push({
      id: "page_extra",
      title: "Extra memo",
      body: documentWithText("block_extra", "Extra text"),
      createdAt: fourthInstant,
      updatedAt: fourthInstant,
    });

    expect(store.list()).toHaveLength(1);
    expect(store.get(created.id).title).toBe("Copy memo");
    expect(nestedText(store.get(created.id))).toBe("Stored text");
  });

  it("throws a typed collision error without overwriting the existing page", () => {
    const store = createStore({
      ids: ["page_alpha", "page_alpha"],
      instants: [firstInstant, secondInstant],
    });
    const firstPage = store.create(
      createPageInput({
        title: "Original memo",
        body: documentWithText("block_alpha", "Original text"),
      }),
    );

    expectPageStoreError(
      () =>
        store.create(
          createPageInput({
            title: "Collision memo",
            body: documentWithText("block_collision", "Collision text"),
          }),
        ),
      "PAGE_ID_COLLISION",
      "page_alpha",
    );
    expect(store.get("page_alpha")).toEqual(firstPage);
    expect(store.list()).toEqual([firstPage]);
  });
});

function createStore({
  ids,
  instants,
}: {
  ids: string[];
  instants: string[];
}): PageStore {
  return createInMemoryPageStore({
    createId: sequence("id", ids),
    now: sequence("instant", instants),
  });
}

function createPageInput(input: CreatePageInput): CreatePageInput {
  return input;
}

function sequence(label: string, values: string[]): () => string {
  let index = 0;

  return () => {
    const value = values[index];

    if (value === undefined) {
      throw new Error(`${label} sequence exhausted`);
    }

    index += 1;
    return value;
  };
}

function documentWithText(
  blockId: string,
  text: string,
): StructuredMarkdownDocument {
  return {
    type: "doc",
    content: [
      {
        blockId,
        type: "paragraph",
        text,
      },
    ],
  };
}

function nestedDocument(text: string): StructuredMarkdownDocument {
  return {
    type: "doc",
    content: [
      {
        blockId: "block_section",
        type: "section",
        attrs: { level: 1, label: "review" },
        content: [
          {
            blockId: "block_paragraph",
            type: "paragraph",
            attrs: { emphasis: true },
            text,
            marks: [{ name: "strong" }],
          },
        ],
      },
    ],
  };
}

function nestedText(page: MarkdownPage): string | undefined {
  return page.body.content[0]?.content?.[0]?.text;
}

function expectPageStoreError(
  action: () => unknown,
  code: string,
  pageId: string,
): void {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(PageStoreError);

    if (error instanceof PageStoreError) {
      expect(error.code).toBe(code);
      expect(error.pageId).toBe(pageId);
    }

    return;
  }

  throw new Error("Expected PageStoreError");
}
