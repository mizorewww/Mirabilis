import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as ts from "typescript";
import { describe, expect, expectTypeOf, it } from "vitest";

import type {
  AppEvent,
  FilterCondition,
  FilterDefinition,
  FilterGroup,
  FilterOperator,
  FilterQuery,
  FilterSort,
  MarkdownPage,
  MetadataRecord,
  MetadataValueType,
  StructuredMarkdownDocument,
} from "../core";

const createdAt = "2026-05-19T10:00:00.000Z";
const updatedAt = "2026-05-19T10:05:00.000Z";
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const coreEntryPoint = path.join(repoRoot, "src", "core", "index.ts");
const requiredPublicTypeExports = [
  "MarkdownPage",
  "StructuredMarkdownDocument",
  "MetadataRecord",
  "AppEvent",
  "FilterDefinition",
] as const;

describe("Core domain type exports", () => {
  it("explicitly exports required public types from the Core entrypoint", async () => {
    const sourceText = await readFile(coreEntryPoint, "utf8");
    const exportedTypeNames = findExplicitTypeExports(sourceText);

    expect(
      requiredPublicTypeExports.filter((name) => !exportedTypeNames.has(name)),
    ).toEqual([]);
  });

  it("exports MarkdownPage with a structured document body", () => {
    type DocumentBlock = StructuredMarkdownDocument["content"][number];

    expectTypeOf<StructuredMarkdownDocument["type"]>().toEqualTypeOf<"doc">();
    expectTypeOf<DocumentBlock>().toMatchObjectType<{ blockId: string }>();
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
    expectTypeOf<MetadataValueType>().toEqualTypeOf<
      "string" | "number" | "boolean" | "json" | "date" | "null"
    >();
    expectTypeOf<MetadataRecord>().toEqualTypeOf<{
      id: string;
      pageId: string;
      namespace: string;
      key: string;
      value: unknown;
      valueType: MetadataValueType;
      sourcePluginId: string;
      createdAt: string;
      updatedAt: string;
    }>();
    expectTypeOf<MetadataRecord>().toMatchObjectType<{
      value: unknown;
      valueType: MetadataValueType;
      sourcePluginId: string;
    }>();
    expectTypeOf<MetadataRecord["value"]>().toEqualTypeOf<unknown>();
    expectTypeOf<MetadataRecord["valueType"]>().toEqualTypeOf<MetadataValueType>();

    const metadata = {
      id: "metadata_alpha",
      pageId: "page_alpha",
      namespace: "example",
      key: "reviewState",
      value: { state: "ready", revision: 2 },
      valueType: "json",
      sourcePluginId: "example-plugin",
      createdAt,
      updatedAt,
    } satisfies MetadataRecord;

    expect(metadata.namespace).toBe("example");
    expect(metadata.value).toEqual({ state: "ready", revision: 2 });
  });

  it("keeps event payloads unknown and plugin-agnostic", () => {
    expectTypeOf<AppEvent>().toEqualTypeOf<{
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
    expectTypeOf<FilterOperator>().toEqualTypeOf<
      "eq" | "neq" | "gt" | "lt" | "includes" | "exists" | "within"
    >();
    expectTypeOf<FilterCondition>().toEqualTypeOf<{
      field: string;
      op: FilterOperator;
      value?: unknown;
    }>();
    expectTypeOf<FilterQuery>().toEqualTypeOf<{
      where: FilterCondition[];
      and?: FilterQuery[];
      or?: FilterQuery[];
    }>();
    expectTypeOf<FilterQuery["and"]>().toEqualTypeOf<
      FilterQuery[] | undefined
    >();
    expectTypeOf<FilterQuery["or"]>().toEqualTypeOf<
      FilterQuery[] | undefined
    >();
    expectTypeOf<FilterSort>().toEqualTypeOf<{
      field: string;
      direction: "asc" | "desc";
    }>();
    expectTypeOf<FilterGroup>().toEqualTypeOf<{
      field: string;
    }>();
    expectTypeOf<FilterDefinition>().toEqualTypeOf<{
      id: string;
      name: string;
      query: FilterQuery;
      sort?: FilterSort[];
      group?: FilterGroup;
      viewType: string;
      sourcePluginId?: string;
      createdAt: string;
      updatedAt: string;
    }>();
    expectTypeOf<FilterDefinition>().toMatchObjectType<{
      query: FilterQuery;
      viewType: string;
    }>();
    expectTypeOf<FilterDefinition["viewType"]>().toEqualTypeOf<string>();
    expectTypeOf<FilterDefinition["query"]>().toEqualTypeOf<FilterQuery>();
    expectTypeOf<FilterDefinition["sort"]>().toEqualTypeOf<
      FilterSort[] | undefined
    >();
    expectTypeOf<FilterDefinition["group"]>().toEqualTypeOf<
      FilterGroup | undefined
    >();
    expectTypeOf<FilterDefinition["sourcePluginId"]>().toEqualTypeOf<
      string | undefined
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

function findExplicitTypeExports(sourceText: string): Set<string> {
  const sourceFile = ts.createSourceFile(
    "index.ts",
    sourceText,
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TS,
  );
  const exportedNames = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (isExportedTypeDeclaration(statement)) {
      exportedNames.add(statement.name.text);
      continue;
    }

    if (
      ts.isExportDeclaration(statement) &&
      statement.exportClause &&
      ts.isNamedExports(statement.exportClause)
    ) {
      for (const element of statement.exportClause.elements) {
        if (statement.isTypeOnly || element.isTypeOnly) {
          exportedNames.add(element.name.text);
        }
      }
    }
  }

  return exportedNames;
}

function isExportedTypeDeclaration(
  statement: ts.Statement,
): statement is ts.InterfaceDeclaration | ts.TypeAliasDeclaration {
  return (
    (ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement)) &&
    hasExportModifier(statement)
  );
}

function hasExportModifier(statement: ts.Statement): boolean {
  return (
    ts.canHaveModifiers(statement) &&
    (ts.getModifiers(statement)?.some((modifier) => {
      return modifier.kind === ts.SyntaxKind.ExportKeyword;
    }) ??
      false)
  );
}
