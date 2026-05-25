import { createElement, type ReactElement } from "react";

import type {
  AppPlugin,
  BlockNode,
  MarkdownPage,
  PluginContext,
  StructuredMarkdownDocument,
} from "../../core";

type SearchQueryPayload = {
  limit: number;
  query: string;
};

type SearchResultsData = {
  kind: "search.results";
  query: string;
  results: SearchResultItem[];
};

type SearchResultItem = {
  matchedFields: SearchMatchedField[];
  pageId: string;
  snippet: string;
  title: string;
};

type SearchResultsViewProps = {
  data: SearchResultsData;
};

type SearchMatchedField = "body" | "title";

const pluginId = "search";
const queryCommandId = "search.query";
const resultsKind = "search.results";
const defaultSearchLimit = 20;
const maxSearchResults = 50;
const maxSearchQueryLength = 200;
const maxSearchSnippetLength = 160;
const maxSearchTitleLength = 200;
const maxScannedPages = 1_000;
const maxScannedBodyLength = 50_000;
const queryPayloadKeys = new Set(["query"]);
const queryPayloadOptionalKeys = new Set(["limit"]);
const resultsDataKeys = new Set(["kind", "query", "results"]);
const resultItemKeys = new Set([
  "matchedFields",
  "pageId",
  "snippet",
  "title",
]);
const allowedMatchedFields = new Set<SearchMatchedField>(["body", "title"]);

export const SearchPlugin: AppPlugin = {
  manifest: {
    id: pluginId,
    name: "Search Plugin",
    version: "1.0.0",
    description: "Search unarchived Markdown pages on demand.",
    minAppVersion: "0.1.0",
    contributes: {
      views: [
        {
          accepts: {
            kind: resultsKind,
          },
          id: resultsKind,
          title: "Search results",
          type: resultsKind,
        },
      ],
    },
  },
  register(ctx) {
    ctx.commands.register<unknown, SearchResultsData>({
      id: queryCommandId,
      title: "Search",
      handler: runSearchQuery,
    });

    ctx.views.register<SearchResultsViewProps>({
      accepts: {
        kind: resultsKind,
      },
      component: SearchResultsView,
      id: resultsKind,
      title: "Search results",
      type: resultsKind,
    });
  },
};

function runSearchQuery(
  input: unknown,
  ctx: PluginContext,
): SearchResultsData {
  const payload = readSearchPayload(input);
  const trimmedQuery = payload.query.trim();

  if (trimmedQuery.length === 0) {
    return {
      kind: resultsKind,
      query: payload.query,
      results: [],
    };
  }

  const normalizedQuery = trimmedQuery.toLowerCase();
  const results: SearchResultItem[] = [];
  const pages = ctx.pages.list().slice(0, maxScannedPages);

  for (const page of pages) {
    const item = searchPage(page, normalizedQuery);

    if (item === null) {
      continue;
    }

    results.push(item);

    if (results.length >= payload.limit) {
      break;
    }
  }

  return {
    kind: resultsKind,
    query: payload.query,
    results,
  };
}

function searchPage(
  page: MarkdownPage,
  normalizedQuery: string,
): SearchResultItem | null {
  const title = capText(page.title, maxSearchTitleLength);
  const titleMatches = page.title.toLowerCase().includes(normalizedQuery);
  const bodyText = readBodyText(page.body);
  const bodyMatches = bodyText.toLowerCase().includes(normalizedQuery);

  if (!titleMatches && !bodyMatches) {
    return null;
  }

  const matchedFields: SearchMatchedField[] = [];

  if (titleMatches) {
    matchedFields.push("title");
  }

  if (bodyMatches) {
    matchedFields.push("body");
  }

  return {
    matchedFields,
    pageId: page.id,
    snippet: createSnippet(
      bodyMatches ? bodyText : page.title,
      normalizedQuery,
      maxSearchSnippetLength,
    ),
    title,
  };
}

function readBodyText(document: StructuredMarkdownDocument): string {
  const lines: string[] = [];
  let remainingCharacters = maxScannedBodyLength;

  for (const block of document.content) {
    if (remainingCharacters <= 0) {
      break;
    }

    remainingCharacters = collectBlockText(block, lines, remainingCharacters);
  }

  return lines.join("\n").slice(0, maxScannedBodyLength);
}

function collectBlockText(
  block: BlockNode,
  lines: string[],
  remainingCharacters: number,
): number {
  let remaining = remainingCharacters;

  if (typeof block.text === "string" && remaining > 0) {
    const text = block.text.slice(0, remaining);

    lines.push(text);
    remaining -= text.length;
  }

  if (block.content !== undefined) {
    for (const child of block.content) {
      if (remaining <= 0) {
        break;
      }

      remaining = collectBlockText(child, lines, remaining);
    }
  }

  return remaining;
}

function createSnippet(
  source: string,
  normalizedQuery: string,
  maxLength: number,
): string {
  if (source.length <= maxLength) {
    return source;
  }

  const sourceLower = source.toLowerCase();
  const matchIndex = sourceLower.indexOf(normalizedQuery);

  if (matchIndex < 0) {
    return source.slice(0, maxLength);
  }

  const halfWindow = Math.max(0, Math.floor((maxLength - normalizedQuery.length) / 2));
  const start = Math.max(0, matchIndex - halfWindow);

  return source.slice(start, start + maxLength);
}

function capText(input: string, maxLength: number): string {
  return input.length <= maxLength ? input : input.slice(0, maxLength);
}

function readSearchPayload(input: unknown): SearchQueryPayload {
  const payload = readExactRecord(
    input,
    queryPayloadKeys,
    `${queryCommandId} input`,
    queryPayloadOptionalKeys,
  );
  const query = payload.query;
  const limit = readSearchLimit(payload.limit);

  if (typeof query !== "string" || query.length > maxSearchQueryLength) {
    throw new Error(`${queryCommandId} requires bounded query text`);
  }

  return {
    limit,
    query,
  };
}

function readSearchLimit(input: unknown): number {
  if (input === undefined) {
    return defaultSearchLimit;
  }

  if (
    typeof input !== "number" ||
    !Number.isSafeInteger(input) ||
    input <= 0
  ) {
    throw new Error(`${queryCommandId} requires a positive integer limit`);
  }

  return Math.min(input, maxSearchResults);
}

function readExactRecord(
  input: unknown,
  requiredKeys: ReadonlySet<string>,
  label: string,
  optionalKeys: ReadonlySet<string> = new Set(),
): Record<string, unknown> {
  if (
    typeof input !== "object" ||
    input === null ||
    Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Object.prototype
  ) {
    throw new Error(`${label} must be exact plain data`);
  }

  const ownKeys = Reflect.ownKeys(input);

  if (
    ownKeys.length < requiredKeys.size ||
    ownKeys.length > requiredKeys.size + optionalKeys.size
  ) {
    throw new Error(`${label} contains untrusted fields`);
  }

  for (const key of ownKeys) {
    if (
      typeof key !== "string" ||
      (!requiredKeys.has(key) && !optionalKeys.has(key))
    ) {
      throw new Error(`${label} contains untrusted fields`);
    }

    const descriptor = Object.getOwnPropertyDescriptor(input, key);

    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, "value")
    ) {
      throw new Error(`${label} must be exact plain data`);
    }
  }

  for (const key of requiredKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);

    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, "value")
    ) {
      throw new Error(`${label} is missing ${key}`);
    }
  }

  return input as Record<string, unknown>;
}

function SearchResultsView({ data }: SearchResultsViewProps): ReactElement {
  const resultsData = readSearchResultsData(data);

  return createElement(
    "ul",
    {
      "aria-label": "Search results",
    },
    resultsData.results.map((item) =>
      createElement(
        "li",
        {
          key: item.pageId,
        },
        [
          createElement("p", { key: "title" }, item.title),
          createElement("p", { key: "snippet" }, item.snippet),
          createElement(
            "p",
            { key: "fields" },
            `Matched ${item.matchedFields.join(", ")}`,
          ),
        ],
      ),
    ),
  );
}

function readSearchResultsData(input: unknown): SearchResultsData {
  const payload = readExactRecord(input, resultsDataKeys, "search results data");

  if (payload.kind !== resultsKind || typeof payload.query !== "string") {
    throw new Error("search results data must have matching kind and query");
  }

  const resultInputs = copyInertPlainArray(payload.results, maxSearchResults);
  const results = resultInputs.map(readSearchResultItem);

  return {
    kind: resultsKind,
    query: payload.query,
    results,
  };
}

function readSearchResultItem(input: unknown): SearchResultItem {
  const payload = readExactRecord(input, resultItemKeys, "search result item");
  const matchedFieldInputs = copyInertPlainArray(
    payload.matchedFields,
    allowedMatchedFields.size,
  );
  const matchedFields: SearchMatchedField[] = [];

  for (const field of matchedFieldInputs) {
    if (!allowedMatchedFields.has(field as SearchMatchedField)) {
      throw new Error("search result item has invalid matched field");
    }

    matchedFields.push(field as SearchMatchedField);
  }

  if (
    typeof payload.pageId !== "string" ||
    payload.pageId.trim().length === 0 ||
    typeof payload.title !== "string" ||
    payload.title.length > maxSearchTitleLength ||
    typeof payload.snippet !== "string" ||
    payload.snippet.length > maxSearchSnippetLength
  ) {
    throw new Error("search result item must be bounded plain data");
  }

  return {
    matchedFields,
    pageId: payload.pageId,
    snippet: payload.snippet,
    title: payload.title,
  };
}

function copyInertPlainArray(
  input: unknown,
  maxItems: number,
): readonly unknown[] {
  if (
    !Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Array.prototype
  ) {
    throw new Error("Expected an inert plain array");
  }

  const lengthDescriptor = Object.getOwnPropertyDescriptor(input, "length");

  if (
    lengthDescriptor === undefined ||
    !Object.prototype.hasOwnProperty.call(lengthDescriptor, "value") ||
    !Number.isSafeInteger(lengthDescriptor.value) ||
    lengthDescriptor.value < 0 ||
    lengthDescriptor.value > maxItems
  ) {
    throw new Error("Expected a bounded inert plain array");
  }

  const length = lengthDescriptor.value;

  for (const key of Reflect.ownKeys(input)) {
    if (key === "length") {
      continue;
    }

    if (typeof key !== "string" || readArrayIndex(key, length) === null) {
      throw new Error("Expected an inert plain array");
    }
  }

  const values: unknown[] = [];

  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(input, String(index));

    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, "value")
    ) {
      throw new Error("Expected an inert plain array");
    }

    values.push(descriptor.value);
  }

  return values;
}

function readArrayIndex(key: string, length: number): number | null {
  if (!/^(?:0|[1-9]\d*)$/u.test(key)) {
    return null;
  }

  const index = Number(key);

  return Number.isSafeInteger(index) && index >= 0 && index < length
    ? index
    : null;
}
