import {
  DB_PERSISTENCE_OPERATIONS,
  type NativeBridge,
} from "../native";

export type MarkdownEditorDocument = {
  id: string;
  title: string;
  markdown: string;
};

export type MarkdownPageRuntimeFacade = {
  load(pageId: string): Promise<MarkdownEditorDocument>;
  save(input: {
    pageId: string;
    markdown: string;
  }): Promise<MarkdownEditorDocument>;
};

type NativeMarkdownTextNode = {
  type: "markdown.text";
  text: string;
};

type NativeMarkdownBody = {
  type: "doc";
  content: readonly NativeMarkdownTextNode[];
};

type NativeMarkdownPageDto = {
  id: string;
  title: string;
  parentPageId?: string | null;
  body?: NativeMarkdownBody;
  markdown?: string;
  createdAt?: string;
  updatedAt?: string;
  archivedAt?: string | null;
};

type CachedNativeMarkdownPage = {
  id: string;
  title: string;
  parentPageId: string | null;
  body: NativeMarkdownBody;
  markdown: string;
  updatedAt?: string;
};

export function createMarkdownPageRuntimeFacade(
  nativeBridge: Pick<NativeBridge, "db">,
): MarkdownPageRuntimeFacade {
  const pageCache = new Map<string, CachedNativeMarkdownPage>();

  return {
    async load(pageId) {
      const dto = await nativeBridge.db.execute<NativeMarkdownPageDto | null>({
        operation: DB_PERSISTENCE_OPERATIONS.pagesGet,
        payload: {
          id: pageId,
        },
      });
      const page = normalizeNativePage(pageId, dto);

      pageCache.set(pageId, page);

      return toEditorDocument(page);
    },

    async save(input) {
      const cachedPage =
        pageCache.get(input.pageId) ??
        normalizeNativePage(input.pageId, await loadNativePage(input.pageId));
      const body = markdownToNativeBody(input.markdown);
      const updatedPage = {
        ...cachedPage,
        body,
        markdown: input.markdown,
      } satisfies CachedNativeMarkdownPage;

      const response = await nativeBridge.db.execute<NativeMarkdownPageDto | null>({
        operation: DB_PERSISTENCE_OPERATIONS.pagesUpdate,
        payload: {
          id: input.pageId,
          title: cachedPage.title,
          parentPageId: cachedPage.parentPageId,
          body,
          updatedAt: cachedPage.updatedAt ?? new Date().toISOString(),
        },
      });
      const savedPage =
        response === null || response === undefined
          ? updatedPage
          : normalizeNativePage(input.pageId, response);

      pageCache.set(input.pageId, savedPage);

      return toEditorDocument(savedPage);
    },
  };

  function loadNativePage(pageId: string): Promise<NativeMarkdownPageDto | null> {
    return nativeBridge.db.execute<NativeMarkdownPageDto | null>({
      operation: DB_PERSISTENCE_OPERATIONS.pagesGet,
      payload: {
        id: pageId,
      },
    });
  }
}

function normalizeNativePage(
  pageId: string,
  dto: NativeMarkdownPageDto | null | undefined,
): CachedNativeMarkdownPage {
  if (dto === null || dto === undefined) {
    throw new Error(`Markdown page was not found: ${pageId}`);
  }

  const markdown = readMarkdownFromNativePage(dto);

  return {
    id: dto.id,
    title: dto.title,
    parentPageId: dto.parentPageId ?? null,
    body: dto.body ?? markdownToNativeBody(markdown),
    markdown,
    updatedAt: dto.updatedAt,
  };
}

function readMarkdownFromNativePage(dto: NativeMarkdownPageDto): string {
  if (typeof dto.markdown === "string") {
    return dto.markdown;
  }

  return dto.body?.content[0]?.text ?? "";
}

function markdownToNativeBody(markdown: string): NativeMarkdownBody {
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

function toEditorDocument(
  page: CachedNativeMarkdownPage,
): MarkdownEditorDocument {
  return {
    id: page.id,
    title: page.title,
    markdown: page.markdown,
  };
}
