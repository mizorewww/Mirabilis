import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { render, screen, within } from "@testing-library/react";
import { createElement, type ComponentType } from "react";
import { describe, expect, it } from "vitest";

import { BUILT_IN_PLUGINS, createAppRuntime, type AppRuntime } from "../bootstrap";
import {
  createCoreStores,
  exportStructuredDocumentToMarkdown,
  type AppEvent,
  type BlockNode,
  type CoreStores,
  type DbQuery,
  type FilterDefinition,
  type MarkdownPage,
  type MetadataRecord,
  type NativeBridge,
  type StructuredMarkdownDocument,
  type ViewDefinition,
} from "../core";
import { disallowedNativeSurfaceChanges } from "./native-surface-guard";

type NativeBridgeTransactionResult<Response> =
  Response extends readonly unknown[]
    ? number extends Response["length"]
      ? Array<Response>
      : Response
    : Array<Response>;

type SourceLine = {
  blockId: string;
  text: string;
  attrs?: Record<string, unknown>;
};

type CreateRuntimeOptions = {
  eventIds?: readonly string[];
  metadataIds?: readonly string[];
  nativeBridge?: NativeBridge;
  pageIds?: readonly string[];
};

type RuntimeSnapshot = {
  events: AppEvent[];
  filters: FilterDefinition[];
  metadata: MetadataRecord[];
  pages: MarkdownPage[];
};

type QuickCaptureSavePayload = {
  markdown: string;
};

type QuickCaptureSaveResult = {
  appendedBlockIds: string[];
  createdInbox: boolean;
  kind: "quick-capture.save-result";
  pageId: string;
};

type QuickCaptureSaveAndOpenResult = QuickCaptureSaveResult & {
  openPageId: string;
};

type SearchQueryPayload = {
  limit?: number;
  query: string;
};

type SearchResultsData = {
  kind: "search.results";
  query: string;
  results: SearchResultItem[];
};

type SearchResultItem = {
  matchedFields: string[];
  pageId: string;
  snippet: string;
  title: string;
};

type SearchResultsViewProps = {
  data: SearchResultsData;
};

type RecordingNativeBridge = NativeBridge & {
  calls: string[];
};

const quickCapturePluginId = "quick-capture";
const searchPluginId = "search";
const quickCaptureSaveCommandId = "quick-capture.save";
const quickCaptureSaveAndOpenCommandId = "quick-capture.save-and-open";
const quickCaptureCommandIds = [
  "quick-capture.open",
  quickCaptureSaveCommandId,
  quickCaptureSaveAndOpenCommandId,
] as const;
const quickCaptureViewIds = [
  "quick-capture.mobile-input",
  "quick-capture.modal",
] as const;
const quickCaptureMetadataFieldId = "quick-capture.unprocessed";
const quickCaptureFilterId = "quick-capture.filter.inbox";
const quickCaptureNamespace = "quick-capture";
const quickCaptureMetadataKey = "unprocessed";
const searchCommandId = "search.query";
const searchResultsKind = "search.results";
const staleQuickCaptureIds = [
  "inbox.unprocessed",
  "quick_capture.mobile_input",
  "quick_capture.modal",
  "quick_capture.open",
  "quick_capture.save",
  "quick_capture.save_and_open",
] as const;
const tagRefreshCommandId = "tag.refresh-tags";
const taskResolveCommandId = "task.resolve-task-block";
const maxCaptureMarkdownLength = 50_000;
const maxSearchResults = 50;
const maxSearchQueryLength = 200;
const maxSearchSnippetLength = 160;
const maxSearchTitleLength = 200;
const maxScannedPages = 1_000;
const maxScannedBodyLength = 50_000;
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const execFileAsync = promisify(execFile);
const nativeSurfaceEntrypoints = [
  "package.json",
  "bun.lock",
  "src-tauri/Cargo.lock",
  "src-tauri/Cargo.toml",
  "src-tauri/build.rs",
  "src-tauri/capabilities",
  "src-tauri/gen/schemas",
  "src-tauri/permissions",
  "src-tauri/src/commands",
  "src-tauri/src/db",
  "src-tauri/src/lib.rs",
  "src-tauri/src/main.rs",
  "src-tauri/tauri.conf.json",
] as const;
const quickCaptureSearchProductionEntrypoints = [
  "src/bootstrap/built-in-plugins.ts",
  "src/plugins/quick-capture",
  "src/plugins/search",
] as const;

describe("Quick Capture and Search plugins", () => {
  it("registers Quick Capture and Search built-ins with canonical commands, views, metadata, and filter ids only", async () => {
    const runtime = await createRuntime();
    const builtInPluginIds = BUILT_IN_PLUGINS.map(
      (plugin) => plugin.manifest.id,
    );
    const quickCapturePlugin = getBuiltInPlugin(quickCapturePluginId);
    const searchPlugin = getBuiltInPlugin(searchPluginId);
    const quickCaptureRuntimeCommandIds = runtime.registries.commands
      .list({ pluginId: quickCapturePluginId })
      .map((command) => command.id)
      .sort();
    const searchRuntimeCommandIds = runtime.registries.commands
      .list({ pluginId: searchPluginId })
      .map((command) => command.id)
      .sort();
    const quickCaptureRuntimeViewIds = runtime.registries.views
      .list({ pluginId: quickCapturePluginId })
      .map((view) => view.id)
      .sort();
    const searchRuntimeViews = runtime.registries.views.list({
      pluginId: searchPluginId,
    });
    const quickCaptureFilterIds = runtime.filters
      .list({ sourcePluginId: quickCapturePluginId })
      .map((filter) => filter.id)
      .sort();
    const metadataFieldIds =
      quickCapturePlugin.manifest.contributes?.metadataFields?.map(
        (field) => field.id,
      ) ?? [];
    const searchView = searchRuntimeViews.find(
      (view) => view.id === searchResultsKind,
    );
    const inboxFilter = getQuickCaptureInboxFilter(runtime);

    expect.soft(builtInPluginIds).toEqual(
      expect.arrayContaining([quickCapturePluginId, searchPluginId]),
    );
    expect.soft(quickCaptureRuntimeCommandIds).toStrictEqual(
      [...quickCaptureCommandIds].sort(),
    );
    expect.soft(quickCaptureRuntimeViewIds).toStrictEqual(
      [...quickCaptureViewIds].sort(),
    );
    expect.soft(searchRuntimeCommandIds).toStrictEqual([searchCommandId]);
    expect.soft(searchRuntimeViews.map((view) => view.id)).toStrictEqual([
      searchResultsKind,
    ]);
    expect.soft(searchView).toMatchObject({
      accepts: { kind: searchResultsKind },
      id: searchResultsKind,
      pluginId: searchPluginId,
      type: searchResultsKind,
    });
    expect.soft(metadataFieldIds).toContain(quickCaptureMetadataFieldId);
    expect.soft(quickCapturePlugin.manifest.contributes?.metadataFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: quickCaptureMetadataFieldId,
          key: quickCaptureMetadataKey,
          namespace: quickCaptureNamespace,
          valueType: "boolean",
        }),
      ]),
    );
    expect.soft(quickCaptureFilterIds).toStrictEqual([quickCaptureFilterId]);
    expect(inboxFilter).toMatchObject({
      id: quickCaptureFilterId,
      name: "Inbox",
      query: {
        where: [
          {
            field: "metadata.quick-capture.unprocessed",
            op: "eq",
            value: true,
          },
        ],
      },
      sourcePluginId: quickCapturePluginId,
      viewType: "page.list",
    });

    for (const staleId of staleQuickCaptureIds) {
      expect(quickCaptureRuntimeCommandIds, `${staleId}: command`).not.toContain(
        staleId,
      );
      expect(quickCaptureRuntimeViewIds, `${staleId}: view`).not.toContain(
        staleId,
      );
      expect(quickCaptureFilterIds, `${staleId}: filter`).not.toContain(staleId);
      expect(metadataFieldIds, `${staleId}: metadata field`).not.toContain(
        staleId,
      );
    }
    expect(searchPlugin.manifest.id).toBe(searchPluginId);
  });

  it("renders Quick Capture modal as a labelled region with accessible textbox semantics, not a bare dialog", async () => {
    const runtime = await createRuntime();
    const QuickCaptureModalView = getQuickCaptureModalViewComponent(runtime);

    render(createElement(QuickCaptureModalView));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    const region = screen.getByRole("region", { name: "Quick Capture" });
    const textbox = within(region).getByRole("textbox", {
      name: "Quick Capture Markdown",
    });

    expect(region).toHaveAccessibleName("Quick Capture");
    expect(textbox).toHaveAccessibleName("Quick Capture Markdown");
  });

  it("creates one trusted Inbox on first save and later appends without replacing prior captured Markdown", async () => {
    const runtime = await createRuntime({
      metadataIds: createMetadataIds(4),
      pageIds: ["trusted-inbox"],
    });

    const firstSave = await executeQuickCaptureSave(runtime, {
      markdown: "First capture #architecture",
    });
    const firstInbox = runtime.pages.get(firstSave.pageId);

    expect(firstSave).toStrictEqual({
      appendedBlockIds: firstSave.appendedBlockIds,
      createdInbox: true,
      kind: "quick-capture.save-result",
      pageId: "trusted-inbox",
    } satisfies QuickCaptureSaveResult);
    expect(firstSave.appendedBlockIds).toHaveLength(1);
    expect(firstInbox).toMatchObject({
      id: "trusted-inbox",
      title: "Inbox",
    });
    expectQuickCaptureInboxMetadata(runtime, firstInbox.id);
    expect(readMarkdown(firstInbox)).toContain("First capture #architecture");

    const secondSave = await executeQuickCaptureSave(runtime, {
      markdown: "Second capture stays appended",
    });
    const secondInbox = runtime.pages.get(secondSave.pageId);
    const finalMarkdown = exportStructuredDocumentToMarkdown(secondInbox.body);

    expect(secondSave).toStrictEqual({
      appendedBlockIds: secondSave.appendedBlockIds,
      createdInbox: false,
      kind: "quick-capture.save-result",
      pageId: firstInbox.id,
    } satisfies QuickCaptureSaveResult);
    expect(secondSave.appendedBlockIds).toHaveLength(1);
    expect(finalMarkdown).toContain("First capture #architecture");
    expect(finalMarkdown).toContain("Second capture stays appended");
    expect(finalMarkdown.indexOf("First capture")).toBeLessThan(
      finalMarkdown.indexOf("Second capture"),
    );
    expect(
      runtime.pages.list({ includeArchived: true }).filter(
        (page) => page.title === "Inbox",
      ),
    ).toHaveLength(1);
  });

  it("does not adopt a title-only untrusted Inbox page when saving captured Markdown", async () => {
    const runtime = await createRuntime({
      metadataIds: createMetadataIds(4),
      pageIds: ["user-inbox", "trusted-inbox"],
    });
    const userInbox = createSourcePage(runtime, "Inbox", [
      { blockId: "user-note", text: "A user's existing Inbox page" },
    ]);

    const result = await executeQuickCaptureSave(runtime, {
      markdown: "Captured into the trusted Inbox",
    });
    const trustedInbox = runtime.pages.get(result.pageId);
    const inboxPages = runtime.pages
      .list({ includeArchived: true })
      .filter((page) => page.title === "Inbox");

    expect(result).toMatchObject({
      createdInbox: true,
      kind: "quick-capture.save-result",
      pageId: "trusted-inbox",
    });
    expect(inboxPages.map((page) => page.id).sort()).toStrictEqual([
      userInbox.id,
      trustedInbox.id,
    ].sort());
    expect(runtime.pages.get(userInbox.id)).toStrictEqual(userInbox);
    expect(
      runtime.metadata.list({
        namespace: quickCaptureNamespace,
        pageId: userInbox.id,
      }),
    ).toStrictEqual([]);
    expectQuickCaptureInboxMetadata(runtime, trustedInbox.id);
    expect(readMarkdown(trustedInbox)).toContain("Captured into the trusted Inbox");
  });

  it("preserves unsafe-looking Task and Tag Markdown as inert Inbox text until explicit Task/Tag commands process it", async () => {
    const capturedMarkdown = [
      "- [ ] Draft roadmap #architecture",
      "<script>alert('x')</script>",
      "<img src=x onerror=alert(1)>",
      "[unsafe](javascript:alert(1))",
    ].join("\n");
    const runtime = await createRuntime({
      metadataIds: createMetadataIds(12),
      pageIds: ["trusted-inbox", "task-page"],
    });

    const captureResult = await executeQuickCaptureSave(runtime, {
      markdown: capturedMarkdown,
    });
    const inbox = runtime.pages.get(captureResult.pageId);
    const taskSourceBlockId = captureResult.appendedBlockIds[0];

    expect(taskSourceBlockId).toEqual(expect.any(String));
    expect(exportStructuredDocumentToMarkdown(inbox.body)).toBe(capturedMarkdown);
    expect(inbox.body.content.map((block) => block.text)).toStrictEqual([
      "- [ ] Draft roadmap #architecture",
      "<script>alert('x')</script>",
      "<img src=x onerror=alert(1)>",
      "[unsafe](javascript:alert(1))",
    ]);
    expect(runtime.pages.list({ includeArchived: true })).toHaveLength(1);
    expect(runtime.metadata.list({ namespace: "task" })).toStrictEqual([]);
    expect(runtime.metadata.list({ namespace: "tag" })).toStrictEqual([]);
    expect(runtime.events.list({ namespace: "task" })).toStrictEqual([]);
    expect(runtime.events.list({ namespace: "tag" })).toStrictEqual([]);

    await expect(
      runtime.commands.execute(tagRefreshCommandId, { pageId: inbox.id }),
    ).resolves.toStrictEqual({
      pageId: inbox.id,
      tags: ["architecture"],
    });
    await expect(
      runtime.commands.execute(taskResolveCommandId, {
        sourceBlockId: taskSourceBlockId,
        sourcePageId: inbox.id,
      }),
    ).resolves.toMatchObject({
      id: "task-page",
      title: "Draft roadmap #architecture",
    });

    expect(runtime.metadata.get(inbox.id, "tag", "tags")).toMatchObject({
      namespace: "tag",
      pageId: inbox.id,
      sourcePluginId: "tag",
      value: ["architecture"],
    });
    expect(runtime.metadata.list({ namespace: "task" })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "sourcePageId",
          pageId: "task-page",
          sourcePluginId: "task",
          value: inbox.id,
        }),
        expect.objectContaining({
          key: "sourceBlockId",
          pageId: "task-page",
          sourcePluginId: "task",
          value: taskSourceBlockId,
        }),
      ]),
    );
  });

  it("returns save-and-open results without invoking native shortcuts, files, notifications, or db calls", async () => {
    const nativeBridge = createRecordingNativeBridge();
    const runtime = await createRuntime({
      metadataIds: createMetadataIds(4),
      nativeBridge,
      pageIds: ["trusted-inbox"],
    });

    nativeBridge.calls = [];

    await expect(
      executeQuickCaptureSaveAndOpen(runtime, {
        markdown: "Open this Inbox capture",
      }),
    ).resolves.toStrictEqual({
      appendedBlockIds: expect.arrayContaining([expect.any(String)]),
      createdInbox: true,
      kind: "quick-capture.save-result",
      openPageId: "trusted-inbox",
      pageId: "trusted-inbox",
    } satisfies QuickCaptureSaveAndOpenResult);
    expect(nativeBridge.calls).toStrictEqual([]);
    expect(readMarkdown(runtime.pages.get("trusted-inbox"))).toContain(
      "Open this Inbox capture",
    );
  });

  it("rejects hostile Quick Capture save payloads without mutating pages, metadata, events, or filters", async () => {
    const runtime = await createRuntime({
      metadataIds: createMetadataIds(4),
      pageIds: ["unexpected-inbox"],
    });

    for (const { input, label } of createInvalidQuickCaptureSavePayloads()) {
      const before = snapshotRuntimeState(runtime);

      await expect(
        runtime.commands.execute(quickCaptureSaveCommandId, input),
        label,
      ).rejects.toThrow();
      expect(snapshotRuntimeState(runtime), label).toStrictEqual(before);
    }
  });

  it("rejects hostile Quick Capture save-and-open payloads with the same no-mutation contract as save", async () => {
    const runtime = await createRuntime({
      metadataIds: createMetadataIds(4),
      pageIds: ["unexpected-inbox"],
    });

    for (const { input, label } of createInvalidQuickCaptureSavePayloads()) {
      const before = snapshotRuntimeState(runtime);

      await expect(
        runtime.commands.execute(quickCaptureSaveAndOpenCommandId, input),
        label,
      ).rejects.toThrow();
      expect(snapshotRuntimeState(runtime), label).toStrictEqual(before);
    }
  });

  it("searches unarchived page titles and structured Markdown body text case-insensitively", async () => {
    const runtime = await createRuntime();
    const titleMatch = createSourcePage(runtime, "Architecture Notes", [
      { blockId: "title-body", text: "Planning notes" },
    ]);
    const bodyMatch = createSourcePage(runtime, "Daily notes", [
      { blockId: "body-match", text: "Draft Quick Capture architecture links" },
    ]);
    const archived = createSourcePage(runtime, "Archived architecture", [
      { blockId: "archived-body", text: "architecture should be hidden" },
    ]);

    runtime.pages.archive(archived.id);

    const result = await executeSearchQuery(runtime, {
      query: "ARCHITECTURE",
    });
    const resultsByPageId = new Map(
      result.results.map((item) => [item.pageId, item]),
    );

    expect(result).toMatchObject({
      kind: searchResultsKind,
      query: "ARCHITECTURE",
    });
    expect([...resultsByPageId.keys()].sort()).toStrictEqual([
      bodyMatch.id,
      titleMatch.id,
    ].sort());
    expect(resultsByPageId.get(titleMatch.id)?.matchedFields).toContain("title");
    expect(resultsByPageId.get(bodyMatch.id)?.matchedFields).toContain("body");
    expect(resultsByPageId.has(archived.id)).toBe(false);
    for (const item of result.results) {
      expectNoFullBodyInSearchResult(item);
    }
  });

  it("treats regex-looking input literally, caps limits/results/snippets, returns no blank results, and reflects later page edits", async () => {
    const runtime = await createRuntime();
    const literalPatternPage = createSourcePage(runtime, "Literal pattern", [
      { blockId: "literal-pattern", text: "Keep the .* marker as plain text." },
    ]);
    const regexBaitPage = createSourcePage(runtime, "Regex bait", [
      { blockId: "regex-bait", text: "This page should not match a regex." },
    ]);
    const mutablePage = createSourcePage(runtime, "Mutable page", [
      { blockId: "mutable-line", text: "No matching term yet." },
    ]);

    for (const index of Array.from({ length: 75 }, (_value, item) => item + 1)) {
      createSourcePage(runtime, `Bulk page ${index}`, [
        {
          blockId: `bulk-line-${index}`,
          text: `needle ${"x".repeat(500)} ${index}`,
        },
      ]);
    }

    await expect(
      executeSearchQuery(runtime, { query: "   " }),
    ).resolves.toStrictEqual({
      kind: searchResultsKind,
      query: "   ",
      results: [],
    } satisfies SearchResultsData);

    await expect(
      executeSearchQuery(runtime, { query: ".*" }),
    ).resolves.toMatchObject({
      kind: searchResultsKind,
      query: ".*",
      results: [
        expect.objectContaining({
          pageId: literalPatternPage.id,
          title: "Literal pattern",
        }),
      ],
    });
    expect(
      (await executeSearchQuery(runtime, { query: ".*" })).results.map(
        (item) => item.pageId,
      ),
    ).not.toContain(regexBaitPage.id);

    await expect(
      executeSearchQuery(runtime, { limit: 1, query: "needle" }),
    ).resolves.toMatchObject({
      results: [expect.any(Object)],
    });
    expect((await executeSearchQuery(runtime, { limit: 1, query: "needle" }))
      .results).toHaveLength(1);

    const cappedResults = await executeSearchQuery(runtime, {
      limit: 1_000,
      query: "needle",
    });

    expect(cappedResults.results.length).toBeLessThanOrEqual(maxSearchResults);
    for (const item of cappedResults.results) {
      expect(item.snippet.length).toBeLessThanOrEqual(maxSearchSnippetLength);
      expectNoFullBodyInSearchResult(item);
    }

    await expect(
      executeSearchQuery(runtime, { query: "newly-indexed" }),
    ).resolves.toMatchObject({ results: [] });
    runtime.pages.update(mutablePage.id, {
      body: structuredDocument([
        { blockId: "mutable-line", text: "Now contains newly-indexed text." },
      ]),
    });
    await expect(
      executeSearchQuery(runtime, { query: "newly-indexed" }),
    ).resolves.toMatchObject({
      results: [
        expect.objectContaining({
          matchedFields: expect.arrayContaining(["body"]),
          pageId: mutablePage.id,
        }),
      ],
    });
  });

  it("rejects hostile Search query payloads without mutating pages, metadata, events, or filters", async () => {
    const runtime = await createRuntime();

    createSourcePage(runtime, "Needle source", [
      { blockId: "needle-source", text: "needle remains searchable" },
    ]);

    const invalidPayloads: Array<{ input: unknown; label: string }> = [
      { input: undefined, label: "undefined payload" },
      { input: null, label: "null payload" },
      { input: "needle", label: "non-object payload" },
      { input: [], label: "array payload" },
      { input: {}, label: "empty payload" },
      { input: { query: 1 }, label: "number query" },
      { input: { query: false }, label: "boolean query" },
      { input: { query: { text: "needle" } }, label: "object query" },
      {
        input: { query: "x".repeat(maxSearchQueryLength + 1) },
        label: "oversized query",
      },
      {
        input: { query: "needle", target: "page-1" },
        label: "target field",
      },
      {
        input: { query: "needle", targetPageId: "page-1" },
        label: "targetPageId field",
      },
      {
        input: { query: "needle", path: "/tmp/search.md" },
        label: "path field",
      },
      {
        input: { query: "needle", title: "Caller title" },
        label: "title field",
      },
      {
        input: { pluginId: "task", query: "needle" },
        label: "pluginId spoof",
      },
      {
        input: { query: "needle", sourcePluginId: "task" },
        label: "sourcePluginId spoof",
      },
      {
        input: createAccessorFieldPayload("query", "needle"),
        label: "accessor-backed query",
      },
      {
        input: createSymbolExtraPayload({ query: "needle" }),
        label: "symbol-keyed extra",
      },
      {
        input: createPrototypeCarriedPayload({ query: "needle" }),
        label: "prototype-carried query",
      },
      {
        input: createNonEnumerableFieldPayload({ query: "needle" }, "query"),
        label: "non-enumerable query",
      },
      {
        input: createNonEnumerableExtraPayload({ query: "needle" }),
        label: "non-enumerable extra",
      },
      {
        input: { limit: 0, query: "needle" },
        label: "zero limit",
      },
      {
        input: { limit: -1, query: "needle" },
        label: "negative limit",
      },
      {
        input: { limit: 1.5, query: "needle" },
        label: "fractional limit",
      },
      {
        input: { limit: Number.POSITIVE_INFINITY, query: "needle" },
        label: "infinite limit",
      },
      {
        input: { limit: "1", query: "needle" },
        label: "string limit",
      },
    ];

    for (const { input, label } of invalidPayloads) {
      const before = snapshotRuntimeState(runtime);

      await expect(
        runtime.commands.execute(searchCommandId, input),
        label,
      ).rejects.toThrow();
      expect(snapshotRuntimeState(runtime), label).toStrictEqual(before);
    }
  });

  it("caps Search result titles and does not leak matches beyond scanned page or body limits", async () => {
    const titleRuntime = await createRuntime();
    const longTitlePage = createSourcePage(
      titleRuntime,
      "Long title ".repeat(40),
      [{ blockId: "title-cap-body", text: "needle inside capped title result" }],
    );

    const titleResult = await executeSearchQuery(titleRuntime, {
      query: "needle",
    });
    const longTitleResult = titleResult.results.find(
      (item) => item.pageId === longTitlePage.id,
    );

    expect(longTitleResult).toBeDefined();
    if (longTitleResult === undefined) {
      throw new Error("Expected capped title search result");
    }
    expect(longTitleResult?.title.length).toBeLessThanOrEqual(
      maxSearchTitleLength,
    );
    expect(longTitleResult.title).toBe(
      longTitlePage.title.slice(0, maxSearchTitleLength),
    );
    expectNoFullBodyInSearchResult(longTitleResult);

    const bodyRuntime = await createRuntime();

    createSourcePage(bodyRuntime, "Body cap page", [
      {
        blockId: "body-cap-line",
        text: `${"a".repeat(maxScannedBodyLength)}hidden-body-needle`,
      },
    ]);
    await expect(
      executeSearchQuery(bodyRuntime, { query: "hidden-body-needle" }),
    ).resolves.toStrictEqual({
      kind: searchResultsKind,
      query: "hidden-body-needle",
      results: [],
    } satisfies SearchResultsData);

    const pageRuntime = await createRuntime();

    for (const index of Array.from(
      { length: maxScannedPages },
      (_value, item) => item + 1,
    )) {
      createSourcePage(pageRuntime, `Scanned page ${index}`, [
        { blockId: `scanned-line-${index}`, text: "ordinary searchable text" },
      ]);
    }
    const beyondScanCap = createSourcePage(pageRuntime, "Beyond scan cap", [
      { blockId: "beyond-scan-cap", text: "hidden-page-needle" },
    ]);

    await expect(
      executeSearchQuery(pageRuntime, { query: "hidden-page-needle" }),
    ).resolves.toStrictEqual({
      kind: searchResultsKind,
      query: "hidden-page-needle",
      results: [],
    } satisfies SearchResultsData);
    expect(pageRuntime.pages.get(beyondScanCap.id)).toStrictEqual(
      beyondScanCap,
    );
  });

  it("renders unsafe Search result titles and snippets as inert accessible list items", async () => {
    const runtime = await createRuntime();
    const SearchResultsView = getSearchResultsViewComponent(runtime);

    render(
      createElement(SearchResultsView, {
        data: {
          kind: searchResultsKind,
          query: "unsafe",
          results: [
            {
              matchedFields: ["title", "body"],
              pageId: "unsafe-page",
              snippet:
                "<script>alert('x')</script> <img src=x onerror=alert(1)> javascript:alert(1)",
              title: "<img src=x onerror=alert(1)> Unsafe title",
            },
          ],
        },
      }),
    );

    const list = screen.getByRole("list", { name: /search results/i });
    const item = within(list).getByRole("listitem");

    expect(item).toHaveTextContent("<img src=x onerror=alert(1)> Unsafe title");
    expect(item).toHaveTextContent("<script>alert('x')</script>");
    expect(item).toHaveTextContent("javascript:alert(1)");
    expectNoDangerousDom();
  });

  it("exposes a status summary for non-empty and empty Search results", async () => {
    const runtime = await createRuntime();
    const SearchResultsView = getSearchResultsViewComponent(runtime);
    const { rerender } = render(
      createElement(SearchResultsView, {
        data: {
          kind: searchResultsKind,
          query: "needle",
          results: [
            {
              matchedFields: ["body"],
              pageId: "needle-page",
              snippet: "needle in a bounded snippet",
              title: "Needle page",
            },
          ],
        },
      }),
    );

    expect(screen.getByRole("status")).toHaveTextContent(/1 result/i);

    rerender(
      createElement(SearchResultsView, {
        data: {
          kind: searchResultsKind,
          query: "missing",
          results: [],
        },
      }),
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      /no results|0 results/i,
    );
  });

  it("keeps Quick Capture and Search isolated from raw stores, sibling internals, HTML execution sinks, and package/native diffs", async () => {
    const productionSources = await readProductionSources(
      quickCaptureSearchProductionEntrypoints,
    );
    const productionFilePaths = productionSources
      .map(({ filePath }) => filePath)
      .sort();

    expect(productionFilePaths).toEqual(
      expect.arrayContaining([
        "src/bootstrap/built-in-plugins.ts",
        "src/plugins/quick-capture/index.ts",
        "src/plugins/search/index.ts",
      ]),
    );
    expect(
      productionFilePaths.some((filePath) =>
        /^src\/plugins\/quick-capture\/plugin\.tsx?$/u.test(filePath),
      ),
    ).toBe(true);
    expect(
      productionFilePaths.some((filePath) =>
        /^src\/plugins\/search\/plugin\.tsx?$/u.test(filePath),
      ),
    ).toBe(true);

    for (const { filePath, source } of productionSources.filter(({ filePath }) =>
      /^src\/plugins\/(?:quick-capture|search)\//u.test(filePath),
    )) {
      expect(source, `${filePath}: raw store/runtime/native import`).not.toMatch(
        /@tauri-apps|\bNativeBridge\b|createTauriNativeBridge|\bPluginHost\b|\buseRuntime\b|runtime-context|from\s+["'][^"']*(?:core\/(?:stores|registries|runtime|native)|plugin-host|bootstrap)["']/u,
      );
      expect(source, `${filePath}: raw core factory import`).not.toMatch(
        /import\s+(?:type\s+)?\{[^}]*\b(?:createCoreStores|createCoreRegistries|createCoreServices)\b[^}]*\}\s+from\s+["']\.\.\/\.\.\/core["']/su,
      );
      expect(source, `${filePath}: root core namespace import`).not.toMatch(
        /import\s+\*\s+as\s+\w+\s+from\s+["']\.\.\/\.\.\/core["']/u,
      );
      expect(source, `${filePath}: sibling plugin internals`).not.toMatch(
        /from\s+["'][^"']*(?:plugins\/(?:task|tag)|\.\.\/(?:task|tag)(?:\/|["']))/u,
      );
      expect(source, `${filePath}: filesystem or opener import`).not.toMatch(
        /from\s+["'](?:node:)?(?:fs|path|child_process|shell|opener|sqlite|better-sqlite3)["']|@tauri-apps\/plugin-(?:fs|shell|opener|sql)/u,
      );
      expect(source, `${filePath}: HTML or code execution sink`).not.toMatch(
        /dangerouslySetInnerHTML|\.innerHTML\b|\bDOMParser\b|renderMarkdown|markdownToHtml|marked|sanitizeHtml|\beval\s*\(|new\s+Function\b/iu,
      );
    }

    expect(
      await disallowedNativeSurfaceChanges(
        await listNativeSurfaceChangesFromMaster(),
      ),
    ).toStrictEqual([]);
  });
});

async function createRuntime(
  options: CreateRuntimeOptions = {},
): Promise<AppRuntime> {
  const createPageId =
    options.pageIds === undefined
      ? undefined
      : createSequenceFactory(options.pageIds);
  const createMetadataId =
    options.metadataIds === undefined
      ? undefined
      : createSequenceFactory(options.metadataIds);
  const createEventId =
    options.eventIds === undefined
      ? undefined
      : createSequenceFactory(options.eventIds);

  return createAppRuntime({
    createNativeBridge: () => options.nativeBridge ?? createNoopNativeBridge(),
    ...(createPageId === undefined &&
    createMetadataId === undefined &&
    createEventId === undefined
      ? {}
      : {
          createStores: (): CoreStores =>
            createCoreStores({
              ...(createPageId === undefined
                ? {}
                : {
                    pages: {
                      createId: createPageId,
                    },
                  }),
              ...(createMetadataId === undefined
                ? {}
                : {
                    metadata: {
                      createId: createMetadataId,
                    },
                  }),
              ...(createEventId === undefined
                ? {}
                : {
                    events: {
                      createId: createEventId,
                    },
                  }),
            }),
        }),
  });
}

function createSourcePage(
  runtime: AppRuntime,
  title: string,
  lines: readonly SourceLine[],
): MarkdownPage {
  return runtime.pages.create({
    body: structuredDocument(lines),
    title,
  });
}

function structuredDocument(
  lines: readonly SourceLine[],
): StructuredMarkdownDocument {
  return {
    content: lines.map((line) => {
      const block: BlockNode = {
        blockId: line.blockId,
        text: line.text,
        type: "markdown.line",
      };

      if (line.attrs !== undefined) {
        block.attrs = line.attrs;
      }

      return block;
    }),
    type: "doc",
  };
}

async function executeQuickCaptureSave(
  runtime: AppRuntime,
  payload: QuickCaptureSavePayload,
): Promise<QuickCaptureSaveResult> {
  const result = await runtime.commands.execute(
    quickCaptureSaveCommandId,
    payload,
  );

  return readQuickCaptureSaveResult(result);
}

async function executeQuickCaptureSaveAndOpen(
  runtime: AppRuntime,
  payload: QuickCaptureSavePayload,
): Promise<QuickCaptureSaveAndOpenResult> {
  const result = await runtime.commands.execute(
    quickCaptureSaveAndOpenCommandId,
    payload,
  );

  return readQuickCaptureSaveAndOpenResult(result);
}

function readQuickCaptureSaveResult(result: unknown): QuickCaptureSaveResult {
  const record = requireRecord(result, "quick-capture.save result");

  expect(Object.keys(record).sort()).toStrictEqual([
    "appendedBlockIds",
    "createdInbox",
    "kind",
    "pageId",
  ]);
  expect(record.kind).toBe("quick-capture.save-result");
  expect(record.pageId).toEqual(expect.any(String));
  expect(record.createdInbox).toEqual(expect.any(Boolean));
  expect(record.appendedBlockIds).toEqual(expect.any(Array));

  const appendedBlockIds = record.appendedBlockIds as unknown[];

  for (const blockId of appendedBlockIds) {
    expect(blockId).toEqual(expect.any(String));
    expect(String(blockId).trim().length).toBeGreaterThan(0);
  }

  return {
    appendedBlockIds: appendedBlockIds as string[],
    createdInbox: record.createdInbox as boolean,
    kind: "quick-capture.save-result",
    pageId: record.pageId as string,
  };
}

function readQuickCaptureSaveAndOpenResult(
  result: unknown,
): QuickCaptureSaveAndOpenResult {
  const record = requireRecord(result, "quick-capture.save-and-open result");

  expect(Object.keys(record).sort()).toStrictEqual([
    "appendedBlockIds",
    "createdInbox",
    "kind",
    "openPageId",
    "pageId",
  ]);
  expect(record.openPageId).toBe(record.pageId);

  return {
    ...readQuickCaptureSaveResult({
      appendedBlockIds: record.appendedBlockIds,
      createdInbox: record.createdInbox,
      kind: record.kind,
      pageId: record.pageId,
    }),
    openPageId: record.openPageId as string,
  };
}

async function executeSearchQuery(
  runtime: AppRuntime,
  payload: SearchQueryPayload,
): Promise<SearchResultsData> {
  const result = await runtime.commands.execute(searchCommandId, payload);

  return readSearchResults(result);
}

function readSearchResults(result: unknown): SearchResultsData {
  const record = requireRecord(result, "search.query result");

  expect(Object.keys(record).sort()).toStrictEqual(["kind", "query", "results"]);
  expect(record.kind).toBe(searchResultsKind);
  expect(record.query).toEqual(expect.any(String));
  expect(record.results).toEqual(expect.any(Array));

  const items = (record.results as unknown[]).map((item) => {
    const itemRecord = requireRecord(item, "search result item");

    expect(Object.keys(itemRecord).sort()).toStrictEqual([
      "matchedFields",
      "pageId",
      "snippet",
      "title",
    ]);
    expect(itemRecord.pageId).toEqual(expect.any(String));
    expect(itemRecord.title).toEqual(expect.any(String));
    expect(itemRecord.snippet).toEqual(expect.any(String));
    expect(itemRecord.matchedFields).toEqual(expect.any(Array));

    return {
      matchedFields: itemRecord.matchedFields as string[],
      pageId: itemRecord.pageId as string,
      snippet: itemRecord.snippet as string,
      title: itemRecord.title as string,
    } satisfies SearchResultItem;
  });

  return {
    kind: searchResultsKind,
    query: record.query as string,
    results: items,
  };
}

function getSearchResultsViewComponent(
  runtime: AppRuntime,
): ComponentType<SearchResultsViewProps> {
  const view = runtime.registries.views.get(
    searchResultsKind,
  ) as ViewDefinition<SearchResultsViewProps>;

  return view.component;
}

function getQuickCaptureModalViewComponent(runtime: AppRuntime): ComponentType {
  const view = runtime.registries.views.get(
    "quick-capture.modal",
  ) as ViewDefinition<Record<string, never>>;

  return view.component;
}

function getBuiltInPlugin(pluginId: string): (typeof BUILT_IN_PLUGINS)[number] {
  const plugin = BUILT_IN_PLUGINS.find(
    (candidate) => candidate.manifest.id === pluginId,
  );

  if (plugin === undefined) {
    throw new Error(`Missing built-in plugin ${pluginId}`);
  }

  return plugin;
}

function getQuickCaptureInboxFilter(runtime: AppRuntime): FilterDefinition {
  const filter = runtime.filters
    .list({ sourcePluginId: quickCapturePluginId })
    .find((candidate) => candidate.id === quickCaptureFilterId);

  if (filter === undefined) {
    throw new Error(`Missing Quick Capture Inbox filter ${quickCaptureFilterId}`);
  }

  return filter;
}

function expectQuickCaptureInboxMetadata(
  runtime: AppRuntime,
  pageId: string,
): void {
  expect(
    runtime.metadata.get(
      pageId,
      quickCaptureNamespace,
      quickCaptureMetadataKey,
    ),
  ).toMatchObject({
    key: quickCaptureMetadataKey,
    namespace: quickCaptureNamespace,
    pageId,
    sourcePluginId: quickCapturePluginId,
    value: true,
    valueType: "boolean",
  });
}

function readMarkdown(page: MarkdownPage): string {
  return exportStructuredDocumentToMarkdown(page.body);
}

function expectNoFullBodyInSearchResult(item: SearchResultItem): void {
  const record = item as SearchResultItem & Record<string, unknown>;

  expect(record.body).toBeUndefined();
  expect(record.markdown).toBeUndefined();
  expect(record.content).toBeUndefined();
}

function snapshotRuntimeState(runtime: AppRuntime): RuntimeSnapshot {
  return {
    events: runtime.events.list(),
    filters: runtime.filters.list(),
    metadata: runtime.metadata.list(),
    pages: runtime.pages.list({ includeArchived: true }),
  };
}

function createInvalidQuickCaptureSavePayloads(): Array<{
  input: unknown;
  label: string;
}> {
  return [
    { input: undefined, label: "undefined payload" },
    { input: null, label: "null payload" },
    { input: {}, label: "empty payload" },
    { input: [], label: "array payload" },
    { input: { markdown: "" }, label: "blank markdown" },
    { input: { markdown: " \n\t " }, label: "whitespace markdown" },
    {
      input: { markdown: "x".repeat(maxCaptureMarkdownLength + 1) },
      label: "oversized markdown",
    },
    {
      input: { markdown: "Valid text", extra: true },
      label: "extra field",
    },
    {
      input: { markdown: "Valid text", pageId: "target-page" },
      label: "target page field",
    },
    {
      input: { markdown: "Valid text", targetPageId: "target-page" },
      label: "targetPageId field",
    },
    {
      input: { markdown: "Valid text", path: "/tmp/inbox.md" },
      label: "path field",
    },
    {
      input: { markdown: "Valid text", title: "Caller title" },
      label: "title field",
    },
    {
      input: { markdown: "Valid text", sourcePluginId: "task" },
      label: "sourcePluginId spoof",
    },
    {
      input: { markdown: "Valid text", pluginId: "task" },
      label: "pluginId spoof",
    },
    {
      input: createAccessorMarkdownPayload("Accessor markdown"),
      label: "accessor-backed markdown",
    },
    {
      input: createSymbolExtraPayload({ markdown: "Symbol extra" }),
      label: "symbol-keyed extra",
    },
    {
      input: createNonEnumerableExtraPayload({
        markdown: "Non-enumerable extra",
      }),
      label: "non-enumerable extra",
    },
    {
      input: createNonEnumerableFieldPayload(
        { markdown: "Hidden markdown" },
        "markdown",
      ),
      label: "non-enumerable markdown",
    },
    {
      input: createPrototypeCarriedPayload({
        markdown: "Prototype markdown",
      }),
      label: "prototype-carried markdown",
    },
  ];
}

function createAccessorMarkdownPayload(markdown: string): Record<string, unknown> {
  return createAccessorFieldPayload("markdown", markdown);
}

function createAccessorFieldPayload(
  field: string,
  value: unknown,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  Object.defineProperty(payload, field, {
    enumerable: true,
    get() {
      return value;
    },
  });

  return payload;
}

function createSymbolExtraPayload(
  base: Record<string, unknown>,
): Record<string, unknown> {
  const payload = { ...base } as Record<PropertyKey, unknown>;

  Object.defineProperty(payload, Symbol("sourcePluginId"), {
    enumerable: true,
    value: quickCapturePluginId,
  });

  return payload as Record<string, unknown>;
}

function createNonEnumerableExtraPayload(
  base: Record<string, unknown>,
): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...base };

  Object.defineProperty(payload, "sourcePluginId", {
    enumerable: false,
    value: quickCapturePluginId,
  });

  return payload;
}

function createNonEnumerableFieldPayload(
  base: Record<string, unknown>,
  field: string,
): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...base };

  Object.defineProperty(payload, field, {
    configurable: true,
    enumerable: false,
    value: payload[field],
    writable: true,
  });

  return payload;
}

function createPrototypeCarriedPayload(
  prototype: Record<string, unknown>,
): Record<string, unknown> {
  return Object.create(prototype) as Record<string, unknown>;
}

function createMetadataIds(count: number): string[] {
  return Array.from({ length: count }, (_value, index) => {
    return `metadata-${index + 1}`;
  });
}

function createSequenceFactory(values: readonly string[]): () => string {
  let index = 0;

  return () => {
    const value = values[index];

    if (value === undefined) {
      throw new Error("No test id remains");
    }

    index += 1;

    return value;
  };
}

function requireRecord(
  value: unknown,
  description: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${description} must be a plain object`);
  }

  return value as Record<string, unknown>;
}

function createNoopNativeBridge(): NativeBridge {
  return {
    db: {
      async execute<Response>(_query: DbQuery): Promise<Response> {
        void _query;

        return undefined as Response;
      },
      async transaction<Response>(
        _queries: DbQuery[],
      ): Promise<NativeBridgeTransactionResult<Response>> {
        void _queries;

        return [] as NativeBridgeTransactionResult<Response>;
      },
    },
    files: {
      async exportMarkdown(_pageId: string, _path: string) {
        void _pageId;
        void _path;

        return undefined;
      },
      async importMarkdown(_path: string) {
        void _path;

        return "";
      },
    },
    notifications: {
      async notify(_input) {
        void _input;

        return undefined;
      },
    },
    shortcuts: {
      async register(_shortcut: string, _commandId: string) {
        void _shortcut;
        void _commandId;

        return undefined;
      },
      async unregister(_shortcut: string) {
        void _shortcut;

        return undefined;
      },
    },
  };
}

function createRecordingNativeBridge(): RecordingNativeBridge {
  const bridge: RecordingNativeBridge = {
    ...createNoopNativeBridge(),
    calls: [],
  };

  bridge.db = {
    async execute<Response>(_query: DbQuery): Promise<Response> {
      bridge.calls.push("db.execute");
      void _query;

      return undefined as Response;
    },
    async transaction<Response>(
      _queries: DbQuery[],
    ): Promise<NativeBridgeTransactionResult<Response>> {
      bridge.calls.push("db.transaction");
      void _queries;

      return [] as NativeBridgeTransactionResult<Response>;
    },
  };
  bridge.files = {
    async exportMarkdown(_pageId: string, _path: string) {
      bridge.calls.push("files.exportMarkdown");
      void _pageId;
      void _path;

      return undefined;
    },
    async importMarkdown(_path: string) {
      bridge.calls.push("files.importMarkdown");
      void _path;

      return "";
    },
  };
  bridge.notifications = {
    async notify(_input) {
      bridge.calls.push("notifications.notify");
      void _input;

      return undefined;
    },
  };
  bridge.shortcuts = {
    async register(_shortcut: string, _commandId: string) {
      bridge.calls.push("shortcuts.register");
      void _shortcut;
      void _commandId;

      return undefined;
    },
    async unregister(_shortcut: string) {
      bridge.calls.push("shortcuts.unregister");
      void _shortcut;

      return undefined;
    },
  };

  return bridge;
}

function expectNoDangerousDom(): void {
  // Security assertions need direct DOM inspection for executable elements.
  // eslint-disable-next-line testing-library/no-node-access
  expect(document.querySelector("script")).toBeNull();
  // eslint-disable-next-line testing-library/no-node-access
  expect(document.querySelector("img")).toBeNull();
  // eslint-disable-next-line testing-library/no-node-access
  expect(document.querySelector("iframe")).toBeNull();

  for (const element of [...document.querySelectorAll("*")]) {
    for (const attribute of [...element.attributes]) {
      expect(attribute.name).not.toMatch(/^on/iu);
      expect(attribute.value).not.toMatch(
        /(?:javascript:|data:text\/html|<script\b)/iu,
      );

      if (element instanceof HTMLAnchorElement && attribute.name === "href") {
        throw new Error(`Unexpected Search result link href ${attribute.value}`);
      }
    }
  }
}

async function readProductionSources(
  entrypoints: readonly string[],
): Promise<Array<{ filePath: string; source: string }>> {
  const files = await runGitLines([
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
    "--",
    ...entrypoints,
  ]);
  const sourceFiles = files.filter(
    (filePath) =>
      /\.(?:ts|tsx)$/u.test(filePath) &&
      !filePath.includes("/__tests__/") &&
      !filePath.endsWith(".test.ts") &&
      !filePath.endsWith(".test.tsx"),
  );

  return Promise.all(
    sourceFiles.map(async (filePath) => ({
      filePath,
      source: await readFile(path.join(repoRoot, filePath), "utf8"),
    })),
  );
}

async function listNativeSurfaceChangesFromMaster(): Promise<string[]> {
  return runGitLines([
    "diff",
    "--name-only",
    "master",
    "--",
    ...nativeSurfaceEntrypoints,
  ]);
}

async function runGitLines(args: readonly string[]): Promise<string[]> {
  const { stdout } = await execFileAsync("git", args, { cwd: repoRoot });

  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}
