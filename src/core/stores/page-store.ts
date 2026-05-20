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

type InMemoryPageStoreState = {
  pages: Map<string, MarkdownPage>;
};

export type InMemoryPageStoreTransactionParticipant = {
  snapshot(): InMemoryPageStoreState;
  createStoreFromSnapshot(snapshot: InMemoryPageStoreState): PageStore;
  replaceState(snapshot: InMemoryPageStoreState): void;
};

const inMemoryPageStoreTransactionParticipants = new WeakMap<
  PageStore,
  InMemoryPageStoreTransactionParticipant
>();

export function getInMemoryPageStoreTransactionParticipant(
  store: PageStore,
): InMemoryPageStoreTransactionParticipant | undefined {
  return inMemoryPageStoreTransactionParticipants.get(store);
}

export function createInMemoryPageStore(
  options: CreateInMemoryPageStoreOptions = {},
): PageStore {
  const createId = options.createId ?? createDefaultId;
  const now = options.now ?? createCurrentInstant;
  const storeOptions: CreateInMemoryPageStoreOptions = { createId, now };
  let state = createEmptyState();

  function requirePage(pageId: string): MarkdownPage {
    const page = state.pages.get(pageId);

    if (page === undefined) {
      throw new PageStoreError("PAGE_NOT_FOUND", pageId);
    }

    return page;
  }

  const store: PageStore = {
    create(input) {
      const pageId = createId();

      if (state.pages.has(pageId)) {
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

      state.pages.set(pageId, page);

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

      state.pages.set(pageId, next);

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

      state.pages.set(pageId, next);

      return output;
    },

    list(options = {}) {
      return [...state.pages.values()]
        .filter(
          (page) =>
            options.includeArchived === true || page.archivedAt === undefined,
        )
        .map((page) => clonePage(page));
    },
  };

  inMemoryPageStoreTransactionParticipants.set(store, {
    snapshot() {
      return cloneState(state);
    },
    createStoreFromSnapshot(snapshot: InMemoryPageStoreState) {
      return createInMemoryPageStoreFromState(
        storeOptions,
        cloneState(snapshot),
      );
    },
    replaceState(snapshot: InMemoryPageStoreState) {
      state = cloneState(snapshot);
    },
  });

  return store;
}

function createInMemoryPageStoreFromState(
  options: CreateInMemoryPageStoreOptions,
  initialState: InMemoryPageStoreState,
): PageStore {
  const store = createInMemoryPageStore(options);
  const participant = getInMemoryPageStoreTransactionParticipant(store);

  if (participant === undefined) {
    throw new Error("Expected in-memory page store transaction participant");
  }

  participant.replaceState(initialState);

  return store;
}

function createEmptyState(): InMemoryPageStoreState {
  return {
    pages: new Map(),
  };
}

function cloneState(state: InMemoryPageStoreState): InMemoryPageStoreState {
  return {
    pages: new Map(
      [...state.pages].map(([pageId, page]) => [pageId, clonePage(page)]),
    ),
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
