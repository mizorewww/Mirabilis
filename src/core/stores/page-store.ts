import type { MarkdownPage, StructuredMarkdownDocument } from "../types";

export type PageStoreErrorCode = "PAGE_NOT_FOUND" | "PAGE_ID_COLLISION";

export class PageStoreError extends Error {
  readonly code: PageStoreErrorCode;
  readonly pageId: string;

  constructor(code: PageStoreErrorCode, pageId: string) {
    super(`${code}: ${pageId}`);
    this.name = "PageStoreError";
    this.code = code;
    this.pageId = pageId;
  }
}

export type CreatePageInput = {
  title: string;
  parentPageId?: string;
  body: StructuredMarkdownDocument;
};

export type UpdatePageInput = {
  title?: string;
  parentPageId?: string | null;
  body?: StructuredMarkdownDocument;
};

export type ListPagesOptions = {
  includeArchived?: boolean;
};

export type PageStore = {
  create(input: CreatePageInput): MarkdownPage;
  get(pageId: string): MarkdownPage;
  update(pageId: string, input: UpdatePageInput): MarkdownPage;
  archive(pageId: string): MarkdownPage;
  list(options?: ListPagesOptions): MarkdownPage[];
};

export type CreateInMemoryPageStoreOptions = {
  createId?: () => string;
  now?: () => string;
};

export function createInMemoryPageStore(
  options: CreateInMemoryPageStoreOptions = {},
): PageStore {
  const createId = options.createId ?? createDefaultId;
  const now = options.now ?? createCurrentInstant;
  const pages = new Map<string, MarkdownPage>();

  function requirePage(pageId: string): MarkdownPage {
    const page = pages.get(pageId);

    if (page === undefined) {
      throw new PageStoreError("PAGE_NOT_FOUND", pageId);
    }

    return page;
  }

  return {
    create(input) {
      const pageId = createId();

      if (pages.has(pageId)) {
        throw new PageStoreError("PAGE_ID_COLLISION", pageId);
      }

      const instant = now();
      const page: MarkdownPage = {
        id: pageId,
        title: input.title,
        body: cloneValue(input.body),
        createdAt: instant,
        updatedAt: instant,
      };

      if (input.parentPageId !== undefined) {
        page.parentPageId = input.parentPageId;
      }

      pages.set(pageId, page);

      return cloneValue(page);
    },

    get(pageId) {
      return cloneValue(requirePage(pageId));
    },

    update(pageId, input) {
      const current = requirePage(pageId);
      const next: MarkdownPage = {
        ...current,
        updatedAt: now(),
      };

      if (input.title !== undefined) {
        next.title = input.title;
      }

      if (input.body !== undefined) {
        next.body = cloneValue(input.body);
      }

      if (input.parentPageId === null) {
        delete next.parentPageId;
      } else if (input.parentPageId !== undefined) {
        next.parentPageId = input.parentPageId;
      }

      pages.set(pageId, next);

      return cloneValue(next);
    },

    archive(pageId) {
      const current = requirePage(pageId);

      if (current.archivedAt !== undefined) {
        return cloneValue(current);
      }

      const instant = now();
      const next: MarkdownPage = {
        ...current,
        archivedAt: instant,
        updatedAt: instant,
      };

      pages.set(pageId, next);

      return cloneValue(next);
    },

    list(options = {}) {
      return [...pages.values()]
        .filter(
          (page) =>
            options.includeArchived === true || page.archivedAt === undefined,
        )
        .map((page) => cloneValue(page));
    },
  };
}

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}

function createDefaultId(): string {
  const randomUuid = globalThis.crypto?.randomUUID?.();

  if (randomUuid !== undefined) {
    return `page_${randomUuid}`;
  }

  return `page_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2)}`;
}

function createCurrentInstant(): string {
  return new Date().toISOString();
}
