import type { MarkdownPage, StructuredMarkdownDocument } from "../types";

export type PageStoreErrorCode =
  | "PAGE_NOT_FOUND"
  | "PAGE_ID_COLLISION"
  | "PAGE_CLONE_FAILED";

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

      const body = cloneForPage(pageId, input.body);
      const instant = now();
      const page: MarkdownPage = {
        id: pageId,
        title: input.title,
        body,
        createdAt: instant,
        updatedAt: instant,
      };

      if (input.parentPageId !== undefined) {
        page.parentPageId = input.parentPageId;
      }

      const output = clonePage(page);

      pages.set(pageId, page);

      return output;
    },

    get(pageId) {
      return clonePage(requirePage(pageId));
    },

    update(pageId, input) {
      const current = requirePage(pageId);
      const body =
        input.body === undefined ? undefined : cloneForPage(pageId, input.body);
      const next: MarkdownPage = {
        ...current,
        updatedAt: now(),
      };

      if (input.title !== undefined) {
        next.title = input.title;
      }

      if (body !== undefined) {
        next.body = body;
      }

      if (input.parentPageId === null) {
        delete next.parentPageId;
      } else if (input.parentPageId !== undefined) {
        next.parentPageId = input.parentPageId;
      }

      const output = clonePage(next);

      pages.set(pageId, next);

      return output;
    },

    archive(pageId) {
      const current = requirePage(pageId);

      if (current.archivedAt !== undefined) {
        return clonePage(current);
      }

      const instant = now();
      const next: MarkdownPage = {
        ...current,
        archivedAt: instant,
        updatedAt: instant,
      };

      const output = clonePage(next);

      pages.set(pageId, next);

      return output;
    },

    list(options = {}) {
      return [...pages.values()]
        .filter(
          (page) =>
            options.includeArchived === true || page.archivedAt === undefined,
        )
        .map((page) => clonePage(page));
    },
  };
}

function clonePage(page: MarkdownPage): MarkdownPage {
  return cloneForPage(page.id, page);
}

function cloneForPage<T>(pageId: string, value: T): T {
  try {
    return structuredClone(value);
  } catch {
    throw new PageStoreError("PAGE_CLONE_FAILED", pageId);
  }
}

function createDefaultId(): string {
  const cryptoSource = globalThis.crypto;
  const randomUuid = cryptoSource?.randomUUID?.();

  if (randomUuid !== undefined) {
    return `page_${randomUuid}`;
  }

  if (cryptoSource?.getRandomValues === undefined) {
    throw new Error("Unable to create a default page id: Web Crypto is absent");
  }

  const bytes = new Uint8Array(16);
  cryptoSource.getRandomValues(bytes);

  return `page_${bytesToHex(bytes)}`;
}

function createCurrentInstant(): string {
  return new Date().toISOString();
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
