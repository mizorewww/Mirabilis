import type {
  AppPlugin,
  BlockNode,
  MarkdownPage,
  PluginContext,
  PluginMetadataStore,
} from "../../core";
import { TagMetadataSlot } from "./components/TagMetadataSlot";

type RefreshTagsInput = {
  pageId: string;
};

type MutateTagInput = RefreshTagsInput & {
  tag: string;
};

type CreateTagFilterInput = {
  tag: string;
};

type TagCommandResult = {
  pageId: string;
  tags: string[];
};

type CreateTagFilterResult = {
  filterId: string;
};

type SourceLine = {
  text: string;
};

const tagPluginId = "tag";
const tagNamespace = "tag";
const tagMetadataKey = "tags";
const tagValueType = "json";
const refreshTagsCommandId = "tag.refresh-tags";
const addTagCommandId = "tag.add-tag";
const removeTagCommandId = "tag.remove-tag";
const createFilterCommandId = "tag.create-filter";
const tagMetadataSlotId = "tag.page-header-metadata.tags";
const pageHeaderMetadataSlot = "page.header.metadata";
const maxTagsPerPage = 32;
const tagPattern = /^[a-z0-9][a-z0-9_-]{0,31}$/u;
const rawTagPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/u;
const sourceTokenTrailingPunctuationPattern = /[.,;!?)}\]]+$/u;
const fenceLinePattern = /^\s{0,3}(?<fence>`{3,}|~{3,})/u;
const refreshTagsInputKeys = new Set(["pageId"]);
const mutateTagInputKeys = new Set(["pageId", "tag"]);
const createTagFilterInputKeys = new Set(["tag"]);

export const TagPlugin: AppPlugin = {
  manifest: {
    id: tagPluginId,
    name: "Tag Plugin",
    version: "1.0.0",
    description: "Recognize hashtag metadata and create tag filters.",
    minAppVersion: "0.1.0",
    contributes: {
      markdownSyntax: [
        {
          id: "tag.hashtag",
          name: "Hashtag",
          syntax: "#tag",
        },
      ],
      metadataFields: [
        {
          id: "tag.tags",
          namespace: tagNamespace,
          key: tagMetadataKey,
          valueType: tagValueType,
        },
      ],
    },
  },
  register(ctx) {
    ctx.commands.register({
      id: refreshTagsCommandId,
      title: "Refresh tags",
      handler: refreshTags,
    });

    ctx.commands.register({
      id: addTagCommandId,
      title: "Add tag",
      handler: addTag,
    });

    ctx.commands.register({
      id: removeTagCommandId,
      title: "Remove tag",
      handler: removeTag,
    });

    ctx.commands.register({
      id: createFilterCommandId,
      title: "Create tag filter",
      handler: createTagFilter,
    });

    ctx.slots.register({
      id: tagMetadataSlotId,
      slot: pageHeaderMetadataSlot,
      order: 300,
      component: TagMetadataSlot,
    });
  },
};

function refreshTags(
  input: unknown,
  ctx: PluginContext,
): Promise<TagCommandResult> {
  const payload = readRefreshTagsInput(input);

  return ctx.transaction.run((tx) => {
    const page = tx.pages.get(payload.pageId);
    const tags = extractTags(page);

    writeTagMetadata(tx.metadata, page.id, tags);

    return {
      pageId: page.id,
      tags,
    };
  });
}

function addTag(input: unknown, ctx: PluginContext): Promise<TagCommandResult> {
  const payload = readMutateTagInput(input);

  return ctx.transaction.run((tx) => {
    const page = tx.pages.get(payload.pageId);
    const existingTags = readExistingTags(tx.metadata, page.id);

    if (existingTags.includes(payload.tag)) {
      return {
        pageId: page.id,
        tags: existingTags,
      };
    }

    if (existingTags.length >= maxTagsPerPage) {
      throw new Error("Tag limit reached for page");
    }

    const tags = [...existingTags, payload.tag];

    writeTagMetadata(tx.metadata, page.id, tags);

    return {
      pageId: page.id,
      tags,
    };
  });
}

function removeTag(
  input: unknown,
  ctx: PluginContext,
): Promise<TagCommandResult> {
  const payload = readMutateTagInput(input);

  return ctx.transaction.run((tx) => {
    const page = tx.pages.get(payload.pageId);
    const existingTags = readExistingTags(tx.metadata, page.id);
    const tags = existingTags.filter((tag) => tag !== payload.tag);

    writeTagMetadata(tx.metadata, page.id, tags);

    return {
      pageId: page.id,
      tags,
    };
  });
}

function createTagFilter(
  input: unknown,
  ctx: PluginContext,
): CreateTagFilterResult {
  const payload = readCreateTagFilterInput(input);
  const filter = ctx.filters.save({
    name: `#${payload.tag}`,
    query: {
      where: [
        {
          field: "metadata.tag.tags",
          op: "includes",
          value: payload.tag,
        },
      ],
    },
    viewType: "page.list",
  });

  return {
    filterId: filter.id,
  };
}

function readRefreshTagsInput(input: unknown): RefreshTagsInput {
  const payload = readExactRecord(
    input,
    refreshTagsInputKeys,
    "tag.refresh-tags input",
  );
  const pageId = readNonBlankString(payload.pageId, "pageId");

  return { pageId };
}

function readMutateTagInput(input: unknown): MutateTagInput {
  const payload = readExactRecord(
    input,
    mutateTagInputKeys,
    "tag mutation input",
  );
  const pageId = readNonBlankString(payload.pageId, "pageId");
  const tag = normalizeCommandTag(payload.tag);

  return { pageId, tag };
}

function readCreateTagFilterInput(input: unknown): CreateTagFilterInput {
  const payload = readExactRecord(
    input,
    createTagFilterInputKeys,
    "tag.create-filter input",
  );

  return {
    tag: normalizeCommandTag(payload.tag),
  };
}

function readExactRecord(
  input: unknown,
  allowedKeys: ReadonlySet<string>,
  label: string,
): Record<string, unknown> {
  if (!isRecord(input)) {
    throw new Error(`${label} must be an object`);
  }

  const keys = Object.keys(input);

  if (keys.length !== allowedKeys.size) {
    throw new Error(`${label} contains untrusted fields`);
  }

  for (const key of keys) {
    if (!allowedKeys.has(key)) {
      throw new Error(`${label} contains untrusted fields`);
    }
  }

  for (const key of allowedKeys) {
    if (!Object.prototype.hasOwnProperty.call(input, key)) {
      throw new Error(`${label} is missing ${key}`);
    }
  }

  return input;
}

function readNonBlankString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Tag command requires ${field}`);
  }

  return value;
}

function normalizeCommandTag(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Tag command requires tag");
  }

  const trimmed = value.trim();
  const withoutHash = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;

  if (!rawTagPattern.test(withoutHash)) {
    throw new Error("Tag command received an invalid tag");
  }

  const normalized = withoutHash.toLowerCase();

  if (!tagPattern.test(normalized)) {
    throw new Error("Tag command received an invalid tag");
  }

  return normalized;
}

function extractTags(page: MarkdownPage): string[] {
  const tags: string[] = [];
  const seen = new Set<string>();
  let activeFence: string | undefined;

  for (const line of readSourceLines(page.body.content)) {
    const fence = matchFenceMarker(line.text);

    if (fence !== undefined) {
      if (activeFence === undefined) {
        activeFence = fence;
      } else if (
        fence[0] === activeFence[0] &&
        fence.length >= activeFence.length
      ) {
        activeFence = undefined;
      }

      continue;
    }

    if (activeFence !== undefined) {
      continue;
    }

    for (const tag of extractLineTags(line.text)) {
      if (seen.has(tag)) {
        continue;
      }

      seen.add(tag);
      tags.push(tag);

      if (tags.length >= maxTagsPerPage) {
        return tags;
      }
    }
  }

  return tags;
}

function readSourceLines(blocks: readonly BlockNode[]): SourceLine[] {
  return blocks.flatMap((block) => {
    if (block.type !== "markdown.line" || typeof block.text !== "string") {
      return [];
    }

    return [{ text: block.text }];
  });
}

function extractLineTags(line: string): string[] {
  const tags: string[] = [];

  for (let index = 0; index < line.length; index += 1) {
    if (line[index] !== "#") {
      continue;
    }

    if (
      isEscapedHash(line, index) ||
      !hasTagBoundary(line, index) ||
      isInsideHtmlLikeFragment(line, index)
    ) {
      continue;
    }

    const sourceToken = readSourceToken(line, index + 1);
    const rawTag = sourceToken.replace(
      sourceTokenTrailingPunctuationPattern,
      "",
    );

    if (rawTag.length === 0) {
      continue;
    }

    if (!rawTagPattern.test(rawTag)) {
      continue;
    }

    const normalizedTag = rawTag.toLowerCase();

    if (tagPattern.test(normalizedTag)) {
      tags.push(normalizedTag);
      index += sourceToken.length;
    }
  }

  return tags;
}

function isEscapedHash(line: string, index: number): boolean {
  return index > 0 && line[index - 1] === "\\";
}

function hasTagBoundary(line: string, index: number): boolean {
  return index === 0 || /\s/u.test(line[index - 1] ?? "");
}

function readSourceToken(line: string, startIndex: number): string {
  let token = "";

  for (let index = startIndex; index < line.length; index += 1) {
    const character = line[index] ?? "";

    if (/\s/u.test(character)) {
      break;
    }

    token += character;
  }

  return token;
}

function isInsideHtmlLikeFragment(line: string, index: number): boolean {
  const openingBracketIndex = line.lastIndexOf("<", index);
  const closingBracketIndex = line.lastIndexOf(">", index);

  if (openingBracketIndex === -1) {
    return false;
  }

  if (openingBracketIndex > closingBracketIndex) {
    return true;
  }

  const openingTag = line.slice(openingBracketIndex, closingBracketIndex + 1);
  const openingTagName = /^<([A-Za-z][A-Za-z0-9:-]*)\b[^>]*>$/u.exec(
    openingTag,
  )?.[1];

  if (openingTagName === undefined) {
    return false;
  }

  return line.indexOf(`</${openingTagName}>`, index) !== -1;
}

function matchFenceMarker(line: string): string | undefined {
  const match = fenceLinePattern.exec(line);

  return match?.groups?.fence;
}

function readExistingTags(
  metadata: PluginMetadataStore,
  pageId: string,
): string[] {
  const record = metadata.list({
    pageId,
    namespace: tagNamespace,
    key: tagMetadataKey,
  })[0];

  if (record === undefined) {
    return [];
  }

  if (!Array.isArray(record.value)) {
    throw new Error("Stored tag metadata is invalid");
  }

  return normalizeStoredTags(record.value);
}

function normalizeStoredTags(value: readonly unknown[]): string[] {
  const tags: string[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (typeof item !== "string" || !tagPattern.test(item)) {
      throw new Error("Stored tag metadata is invalid");
    }

    if (seen.has(item)) {
      continue;
    }

    seen.add(item);
    tags.push(item);
  }

  return tags;
}

function writeTagMetadata(
  metadata: PluginMetadataStore,
  pageId: string,
  tags: readonly string[],
): void {
  metadata.set({
    pageId,
    namespace: tagNamespace,
    key: tagMetadataKey,
    value: [...tags],
    valueType: tagValueType,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
