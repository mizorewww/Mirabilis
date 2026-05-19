import { describe, expect, expectTypeOf, it } from "vitest";

import type {
  AppEvent,
  FilterDefinition,
  MarkdownPage,
  MetadataRecord,
  StructuredMarkdownDocument,
} from "../core";

const createdAt = "2026-05-19T10:00:00.000Z";
const updatedAt = "2026-05-19T10:05:00.000Z";

describe("Core domain type exports", () => {
  it("exports MarkdownPage with a structured document body", () => {
    type DocumentBlock = StructuredMarkdownDocument["content"][number];

    expectTypeOf<StructuredMarkdownDocument["type"]>().toEqualTypeOf<"doc">();
    expectTypeOf<DocumentBlock>().toMatchTypeOf<{ blockId: string }>();
    expectTypeOf<MarkdownPage["body"]>().toEqualTypeOf<StructuredMarkdownDocument>();
    expectTypeOf<MarkdownPage["parentPageId"]>().toEqualTypeOf<
      string | undefined
    >();
    expectTypeOf<MarkdownPage["archivedAt"]>().toEqualTypeOf<
      string | undefined
    >();

    const firstBlock = { blockId: "block-intro" } satisfies Pick<
      DocumentBlock,
      "blockId"
    >;
    const secondBlock = { blockId: "block-detail" } satisfies Pick<
      DocumentBlock,
      "blockId"
    >;

    const document = {
      type: "doc",
      content: [firstBlock as DocumentBlock, secondBlock as DocumentBlock],
    } satisfies StructuredMarkdownDocument;

    const page = {
      id: "page_alpha",
      title: "Plain note",
      body: document,
      createdAt,
      updatedAt,
    } satisfies MarkdownPage;

    expect(page.body.type).toBe("doc");
    expect(page.body.content).toEqual([firstBlock, secondBlock]);
  });

  it("keeps metadata values unknown and plugin-agnostic", () => {
    expectTypeOf<MetadataRecord>().toMatchTypeOf<{
      id: string;
      pageId: string;
      namespace: string;
      key: string;
      value: unknown;
      valueType: MetadataRecord["valueType"];
      sourcePluginId: string;
      createdAt: string;
      updatedAt: string;
    }>();
    expectTypeOf<MetadataRecord["value"]>().toEqualTypeOf<unknown>();

    const metadata = {
      id: "metadata_alpha",
      pageId: "page_alpha",
      namespace: "example",
      key: "reviewState",
      value: { state: "ready", revision: 2 },
      valueType: "json" as MetadataRecord["valueType"],
      sourcePluginId: "example-plugin",
      createdAt,
      updatedAt,
    } satisfies MetadataRecord;

    expect(metadata.namespace).toBe("example");
    expect(metadata.value).toEqual({ state: "ready", revision: 2 });
  });

  it("keeps event payloads unknown and plugin-agnostic", () => {
    expectTypeOf<AppEvent>().toMatchTypeOf<{
      id: string;
      pageId?: string;
      namespace: string;
      type: string;
      payload: unknown;
      sourcePluginId: string;
      createdAt: string;
    }>();
    expectTypeOf<AppEvent["pageId"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<AppEvent["payload"]>().toEqualTypeOf<unknown>();

    const event = {
      id: "event_alpha",
      pageId: "page_alpha",
      namespace: "example",
      type: "page-reviewed",
      payload: { reviewedAt: createdAt, reviewer: "local-user" },
      sourcePluginId: "example-plugin",
      createdAt,
    } satisfies AppEvent;

    expect(event.type).toBe("page-reviewed");
    expect(event.payload).toEqual({
      reviewedAt: createdAt,
      reviewer: "local-user",
    });
  });

  it("exports filter definitions with view and generic query shapes", () => {
    expectTypeOf<FilterDefinition["viewType"]>().toEqualTypeOf<string>();
    expectTypeOf<FilterDefinition["query"]>().toMatchTypeOf<object>();
    expectTypeOf<NonNullable<FilterDefinition["sort"]>>().toMatchTypeOf<
      Array<object>
    >();
    expectTypeOf<NonNullable<FilterDefinition["group"]>>().toMatchTypeOf<
      object
    >();

    const filter = {
      id: "filter_review",
      name: "Needs Review",
      query: {
        where: [
          { field: "metadata.example.reviewState", op: "eq", value: "ready" },
        ],
      },
      sort: [{ field: "updatedAt", direction: "desc" }],
      group: { field: "metadata.example.reviewState" },
      viewType: "example.list",
      sourcePluginId: "example-plugin",
      createdAt,
      updatedAt,
    } satisfies FilterDefinition;

    expect(filter.viewType).toBe("example.list");
    expect(filter.query.where).toHaveLength(1);
    expect(filter.sort[0]?.field).toBe("updatedAt");
    expect(filter.group.field).toBe("metadata.example.reviewState");
  });
});
