import {
  DB_PERSISTENCE_OPERATIONS,
  type DbValue,
  type NativeBridge,
} from "../native";
import {
  exportStructuredDocumentToMarkdown,
  importMarkdownToStructuredDocument,
  validateStructuredMarkdownDocument,
} from "../markdown";
import type { StructuredMarkdownDocument } from "../types";

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

type LegacyMarkdownTextNode = {
  type: "markdown.text";
  text: string;
};

type LegacyMarkdownBody = {
  type: "doc";
  content: readonly LegacyMarkdownTextNode[];
};

type NativeMarkdownBody = StructuredMarkdownDocument | LegacyMarkdownBody;

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
      const body = importMarkdownToStructuredDocument(input.markdown, {
        previousDocument: readStructuredBody(cachedPage.body),
      });
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
          body: body as unknown as DbValue,
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

  const body = readNativeBody(dto);
  const markdown = nativeBodyToMarkdown(body);

  return {
    id: dto.id,
    title: dto.title,
    parentPageId: dto.parentPageId ?? null,
    body,
    markdown,
    updatedAt: dto.updatedAt,
  };
}

function readNativeBody(dto: NativeMarkdownPageDto): NativeMarkdownBody {
  if (dto.body !== undefined) {
    if (isLegacyMarkdownBody(dto.body)) {
      return dto.body;
    }

    return validateStructuredMarkdownDocument(dto.body);
  }

  return importMarkdownToStructuredDocument(dto.markdown ?? "");
}

function nativeBodyToMarkdown(body: NativeMarkdownBody): string {
  if (isLegacyMarkdownBody(body)) {
    return body.content[0]?.text ?? "";
  }

  return exportStructuredDocumentToMarkdown(body);
}

function readStructuredBody(
  body: NativeMarkdownBody,
): StructuredMarkdownDocument | undefined {
  if (isLegacyMarkdownBody(body)) {
    return undefined;
  }

  return validateStructuredMarkdownDocument(body);
}

function isLegacyMarkdownBody(body: unknown): body is LegacyMarkdownBody {
  if (!isRecord(body) || body.type !== "doc" || !Array.isArray(body.content)) {
    return false;
  }

  if (!hasExactKeys(body, ["content", "type"])) {
    return false;
  }

  if (body.content.length !== 1) {
    return false;
  }

  const [node] = body.content;

  return (
    isRecord(node) &&
    node.type === "markdown.text" &&
    typeof node.text === "string" &&
    hasExactKeys(node, ["text", "type"])
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
): boolean {
  const actualKeys = Object.keys(value).sort();
  const sortedExpectedKeys = [...expectedKeys].sort();

  return (
    actualKeys.length === sortedExpectedKeys.length &&
    actualKeys.every((key, index) => key === sortedExpectedKeys[index])
  );
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
