import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ComponentType } from "react";
import { describe, expect, it, vi } from "vitest";

import { BUILT_IN_PLUGINS, createAppRuntime, type AppRuntime } from "../bootstrap";
import {
  createCoreStores,
  type BlockNode,
  type CoreStores,
  type DbQuery,
  type FilterDefinition,
  type MarkdownPage,
  type MetadataRecord,
  type NativeBridge,
  type SlotContribution,
  type StructuredMarkdownDocument,
} from "../core";

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
  pageIds?: readonly string[];
  metadataIds?: readonly string[];
  filterIds?: readonly string[];
};

type TagCommandResult = {
  pageId: string;
  tags: string[];
};

type CreateTagFilterResult = {
  filterId: string;
};

type TagMetadataSlotProps = {
  pageId: string;
  tags: readonly string[];
  commands: {
    execute(commandId: string, input?: unknown): Promise<unknown>;
  };
};

type RuntimeSnapshot = {
  pages: MarkdownPage[];
  metadata: MetadataRecord[];
  filters: FilterDefinition[];
};

const tagPluginId = "tag";
const tagMetadataNamespace = "tag";
const tagMetadataKey = "tags";
const tagRefreshCommandId = "tag.refresh-tags";
const tagAddCommandId = "tag.add-tag";
const tagRemoveCommandId = "tag.remove-tag";
const tagCreateFilterCommandId = "tag.create-filter";
const tagMetadataSlotId = "tag.page-header-metadata.tags";
const pageHeaderMetadataSlot = "page.header.metadata";
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
  "src-tauri/permissions",
  "src-tauri/src/commands",
  "src-tauri/src/lib.rs",
  "src-tauri/src/main.rs",
  "src-tauri/tauri.conf.json",
];

describe("Tag Plugin baseline", () => {
  it("registers the built-in Tag Plugin manifest descriptors, commands, and metadata header slot", async () => {
    const runtime = await createRuntime();
    const tagPlugin = BUILT_IN_PLUGINS.find(
      (plugin) => plugin.manifest.id === tagPluginId,
    );
    const tagCommandIds = runtime.registries.commands
      .list({ pluginId: tagPluginId })
      .map((command) => command.id);
    const tagSyntax = runtime.markdown
      .collectEditorExtensions()
      .filter((extension) => extension.pluginId === tagPluginId);

    expect.soft(tagPlugin).toBeDefined();
    expect.soft(tagPlugin?.manifest.contributes?.markdownSyntax).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "tag.hashtag",
          syntax: "#tag",
        }),
      ]),
    );
    expect.soft(tagPlugin?.manifest.contributes?.metadataFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "tag.tags",
          namespace: tagMetadataNamespace,
          key: tagMetadataKey,
          valueType: "json",
        }),
      ]),
    );
    expect.soft(tagSyntax).toEqual([
      expect.objectContaining({
        pluginId: tagPluginId,
        id: "tag.hashtag",
        syntax: "#tag",
      }),
    ]);
    expect.soft(tagCommandIds.sort()).toStrictEqual([
      tagAddCommandId,
      tagCreateFilterCommandId,
      tagRefreshCommandId,
      tagRemoveCommandId,
    ].sort());
    expect(tagCommandIds).not.toContain("tag.toggle-tag");
    expect(runtime.registries.slots.list({ slot: pageHeaderMetadataSlot })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: tagMetadataSlotId,
          pluginId: tagPluginId,
          slot: pageHeaderMetadataSlot,
          order: 300,
          component: expect.anything(),
        }),
      ]),
    );
  });

  it("refreshes saved structured Markdown into normalized tag metadata while ignoring unsafe token locations", async () => {
    const runtime = await createRuntime({
      pageIds: ["tag-source-page", "empty-tag-source-page"],
      metadataIds: ["metadata-tags", "metadata-empty-tags"],
    });
    const sourcePage = createSourcePage(runtime, "Tagged source", [
      { blockId: "heading", text: "# Heading" },
      {
        blockId: "tags",
        text:
          "Plan #Architecture, #timer. Duplicate #architecture #dev_ops #release-2026 #x_y!",
      },
      {
        blockId: "ignored-inline",
        text:
          "Ignore escaped \\#escaped, joined foo#bar, URL https://example.test/page#fragment, and [link](docs#section).",
      },
      {
        blockId: "ignored-html",
        text: "Ignore raw <span>#html</span> and <#raw> fragments.",
      },
      { blockId: "fence-open", text: "```" },
      { blockId: "fenced-tag", text: "#code #also-code" },
      { blockId: "fence-close", text: "```" },
      { blockId: "punctuation", text: "Ship #product; review #ml!" },
    ]);
    const emptyPage = createSourcePage(runtime, "No recognized tags", [
      { blockId: "empty-heading", text: "# Roadmap" },
      { blockId: "empty-escaped", text: "\\#ignored foo#bar" },
      { blockId: "empty-url", text: "https://example.test/#ignored" },
      { blockId: "empty-fence-open", text: "```" },
      { blockId: "empty-fenced", text: "#ignored" },
      { blockId: "empty-fence-close", text: "```" },
    ]);

    await expect(
      executeRefreshTags(runtime, { pageId: sourcePage.id }),
    ).resolves.toStrictEqual({
      pageId: sourcePage.id,
      tags: [
        "architecture",
        "timer",
        "dev_ops",
        "release-2026",
        "x_y",
        "product",
        "ml",
      ],
    });
    expectTagMetadata(runtime, sourcePage.id, [
      "architecture",
      "timer",
      "dev_ops",
      "release-2026",
      "x_y",
      "product",
      "ml",
    ]);

    await expect(
      executeRefreshTags(runtime, { pageId: emptyPage.id }),
    ).resolves.toStrictEqual({
      pageId: emptyPage.id,
      tags: [],
    });
    expectTagMetadata(runtime, emptyPage.id, []);
  });

  it("replaces stale tag metadata with exactly the refreshed source tags", async () => {
    const runtime = await createRuntime({
      pageIds: ["stale-refresh-page", "empty-stale-refresh-page"],
      metadataIds: ["metadata-stale-tags", "metadata-empty-stale-tags"],
    });
    const taggedPage = createSourcePage(runtime, "Stale tags", [
      { blockId: "content", text: "Current source only has #New." },
    ]);
    const emptyPage = createSourcePage(runtime, "No current tags", [
      { blockId: "content", text: "Current source has no tags." },
    ]);

    runtime.metadata.set({
      pageId: taggedPage.id,
      namespace: tagMetadataNamespace,
      key: tagMetadataKey,
      value: ["old", "keep"],
      valueType: "json",
      sourcePluginId: tagPluginId,
    });
    runtime.metadata.set({
      pageId: emptyPage.id,
      namespace: tagMetadataNamespace,
      key: tagMetadataKey,
      value: ["old", "keep"],
      valueType: "json",
      sourcePluginId: tagPluginId,
    });

    await expect(
      executeRefreshTags(runtime, { pageId: taggedPage.id }),
    ).resolves.toStrictEqual({
      pageId: taggedPage.id,
      tags: ["new"],
    });
    expectTagMetadata(runtime, taggedPage.id, ["new"]);

    await expect(
      executeRefreshTags(runtime, { pageId: emptyPage.id }),
    ).resolves.toStrictEqual({
      pageId: emptyPage.id,
      tags: [],
    });
    expectTagMetadata(runtime, emptyPage.id, []);
  });

  it("caps refreshed page tags at the first 32 unique ASCII slug tokens", async () => {
    const runtime = await createRuntime({
      pageIds: ["many-tags-page"],
      metadataIds: ["metadata-many-tags"],
    });
    const uniqueTags = Array.from({ length: 33 }, (_value, index) =>
      `tag${String(index + 1).padStart(2, "0")}`,
    );
    const sourcePage = createSourcePage(runtime, "Many tags", [
      {
        blockId: "many-tags",
        text: uniqueTags.map((tag) => `#${tag}`).join(" "),
      },
    ]);

    await expect(
      executeRefreshTags(runtime, { pageId: sourcePage.id }),
    ).resolves.toStrictEqual({
      pageId: sourcePage.id,
      tags: uniqueTags.slice(0, 32),
    });
    expectTagMetadata(runtime, sourcePage.id, uniqueTags.slice(0, 32));
  });

  it("ignores invalid source-token forms instead of indexing their valid-looking prefixes", async () => {
    const runtime = await createRuntime({
      pageIds: ["invalid-token-source-page"],
      metadataIds: ["metadata-invalid-token-tags"],
    });
    const sourcePage = createSourcePage(runtime, "Invalid token forms", [
      {
        blockId: "invalid-token-forms",
        text:
          "Keep #valid and #still_ok, but ignore #time:now, #https://example.test/tag, #产品, and #bad\u0000token.",
      },
    ]);

    await expect(
      executeRefreshTags(runtime, { pageId: sourcePage.id }),
    ).resolves.toStrictEqual({
      pageId: sourcePage.id,
      tags: ["valid", "still_ok"],
    });
    expectTagMetadata(runtime, sourcePage.id, ["valid", "still_ok"]);
  });

  it("rejects raw non-ASCII tags before Unicode case folding in commands and source extraction", async () => {
    const runtime = await createRuntime({
      pageIds: ["unicode-command-page", "unicode-source-page"],
      metadataIds: ["metadata-unicode-command-tags", "metadata-unicode-source-tags"],
    });
    const commandPage = createSourcePage(runtime, "Unicode command tag", [
      { blockId: "content", text: "No tags yet" },
    ]);
    const sourcePage = createSourcePage(runtime, "Unicode source tag", [
      { blockId: "content", text: "Ignore #K but keep #valid." },
    ]);
    const beforeInvalidCommand = snapshotRuntimeState(runtime);
    const error = await captureOptionalAsyncError(() =>
      runtime.commands.execute(tagAddCommandId, {
        pageId: commandPage.id,
        tag: "K",
      }),
    );

    expect(error).toBeDefined();
    expect(snapshotRuntimeState(runtime)).toStrictEqual(beforeInvalidCommand);
    await expect(
      executeRefreshTags(runtime, { pageId: sourcePage.id }),
    ).resolves.toStrictEqual({
      pageId: sourcePage.id,
      tags: ["valid"],
    });
    expectTagMetadata(runtime, sourcePage.id, ["valid"]);
  });

  it("adds and removes tags through strict page-scoped commands without caller-supplied ownership", async () => {
    const runtime = await createRuntime({
      pageIds: ["tag-picker-page"],
      metadataIds: ["metadata-picker-tags"],
    });
    const page = createSourcePage(runtime, "Picker page", [
      { blockId: "content", text: "Unindexed text" },
    ]);

    await expect(
      executeAddTag(runtime, { pageId: page.id, tag: "#Architecture" }),
    ).resolves.toStrictEqual({
      pageId: page.id,
      tags: ["architecture"],
    });
    await expect(
      executeAddTag(runtime, { pageId: page.id, tag: " timer_plugin " }),
    ).resolves.toStrictEqual({
      pageId: page.id,
      tags: ["architecture", "timer_plugin"],
    });
    await expect(
      executeAddTag(runtime, { pageId: page.id, tag: "#architecture" }),
    ).resolves.toStrictEqual({
      pageId: page.id,
      tags: ["architecture", "timer_plugin"],
    });
    await expect(
      executeRemoveTag(runtime, { pageId: page.id, tag: "#architecture" }),
    ).resolves.toStrictEqual({
      pageId: page.id,
      tags: ["timer_plugin"],
    });
    await expect(
      executeRemoveTag(runtime, { pageId: page.id, tag: "missing" }),
    ).resolves.toStrictEqual({
      pageId: page.id,
      tags: ["timer_plugin"],
    });
    await expect(
      executeRemoveTag(runtime, { pageId: page.id, tag: "timer_plugin" }),
    ).resolves.toStrictEqual({
      pageId: page.id,
      tags: [],
    });
    expectTagMetadata(runtime, page.id, []);

    const beforeInvalidCommands = snapshotRuntimeState(runtime);
    const rejectedInputs = [
      [tagAddCommandId, { pageId: "missing-page", tag: "product" }],
      [tagAddCommandId, { pageId: page.id, tag: "two words" }],
      [tagAddCommandId, { pageId: page.id, tag: "<script>" }],
      [tagAddCommandId, { pageId: page.id, tag: "https://example.test/tag" }],
      [tagAddCommandId, { pageId: page.id, tag: "time:now" }],
      [tagAddCommandId, { pageId: page.id, tag: "产品" }],
      [tagAddCommandId, { pageId: page.id, tag: "a".repeat(33) }],
      [
        tagAddCommandId,
        { pageId: page.id, tag: "product", sourcePluginId: "evil" },
      ],
      [tagRemoveCommandId, { pageId: page.id, tag: "product", pluginId: "evil" }],
      [tagRefreshCommandId, { pageId: page.id, namespace: "task" }],
      [tagRefreshCommandId, { pageId: page.id, key: "tags" }],
      [tagRefreshCommandId, { pageId: page.id, markdown: "#forged" }],
    ] as const;

    for (const [commandId, input] of rejectedInputs) {
      const error = await captureOptionalAsyncError(() =>
        runtime.commands.execute(commandId, input),
      );

      expect(error, `${commandId} should reject ${JSON.stringify(input)}`).toBeDefined();
    }

    expect(snapshotRuntimeState(runtime)).toStrictEqual(beforeInvalidCommands);
  });

  it("persists an explicit empty tag record when removing a missing tag from a page with no tag metadata", async () => {
    const runtime = await createRuntime({
      pageIds: ["remove-missing-no-record-page"],
      metadataIds: ["metadata-remove-missing-empty-tags"],
    });
    const page = createSourcePage(runtime, "No tag record", [
      { blockId: "content", text: "No tag metadata yet" },
    ]);

    expect(
      runtime.metadata.list({
        pageId: page.id,
        namespace: tagMetadataNamespace,
        key: tagMetadataKey,
      }),
    ).toStrictEqual([]);
    await expect(
      executeRemoveTag(runtime, { pageId: page.id, tag: "missing" }),
    ).resolves.toStrictEqual({
      pageId: page.id,
      tags: [],
    });
    expectTagMetadata(runtime, page.id, []);
  });

  it("rejects adding a 33rd unique tag without changing existing tag metadata", async () => {
    const runtime = await createRuntime({
      pageIds: ["tag-limit-page"],
      metadataIds: ["metadata-limit-tags"],
    });
    const page = createSourcePage(runtime, "Tag limit page", [
      { blockId: "content", text: "" },
    ]);

    for (let index = 1; index <= 32; index += 1) {
      await executeAddTag(runtime, {
        pageId: page.id,
        tag: `tag${String(index).padStart(2, "0")}`,
      });
    }

    const beforeLimitFailure = snapshotRuntimeState(runtime);
    await expect(
      runtime.commands.execute(tagAddCommandId, {
        pageId: page.id,
        tag: "tag33",
      }),
    ).rejects.toBeDefined();
    expect(snapshotRuntimeState(runtime)).toStrictEqual(beforeLimitFailure);
    expectTagMetadata(
      runtime,
      page.id,
      Array.from({ length: 32 }, (_value, index) =>
        `tag${String(index + 1).padStart(2, "0")}`,
      ),
    );
  });

  it("renders the registered metadata slot as inert tag chips and edits through exact command-bus payloads", async () => {
    const runtime = await createRuntime();
    const user = userEvent.setup();
    const TagMetadataSlot = getTagMetadataSlotComponent(runtime);
    const execute = vi.fn(
      async (commandId: string, input?: unknown): Promise<unknown> => {
        if (commandId === tagAddCommandId) {
          if (
            isRecord(input) &&
            input.pageId === "slot-page" &&
            input.tag === "product"
          ) {
            return {
              pageId: "slot-page",
              tags: [
                "architecture",
                "timer",
                "<img src=x onerror=alert(1)>",
                "product",
              ],
            };
          }

          throw new Error("Rejected tag add");
        }

        if (commandId === tagRemoveCommandId) {
          return {
            pageId: "slot-page",
            tags: ["timer", "<img src=x onerror=alert(1)>", "product"],
          };
        }

        throw new Error(`Unexpected command ${commandId}`);
      },
    );
    render(
      <TagMetadataSlot
        pageId="slot-page"
        tags={["architecture", "timer", "<img src=x onerror=alert(1)>"]}
        commands={{ execute }}
      />,
    );

    expect(screen.getByText("#architecture")).toBeVisible();
    expect(screen.getByText("#timer")).toBeVisible();
    expect(screen.getByText("#<img src=x onerror=alert(1)>")).toBeVisible();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();

    await user.type(screen.getByRole("textbox", { name: /tag/i }), "product");
    await user.click(screen.getByRole("button", { name: /^add tag$/i }));

    await waitFor(() => expect(screen.getByText("#product")).toBeVisible());
    expect(execute).toHaveBeenNthCalledWith(1, tagAddCommandId, {
      pageId: "slot-page",
      tag: "product",
    });

    await user.click(
      screen.getByRole("button", { name: /remove #architecture/i }),
    );

    await waitFor(() =>
      expect(screen.queryByText("#architecture")).not.toBeInTheDocument(),
    );
    expect(execute).toHaveBeenNthCalledWith(2, tagRemoveCommandId, {
      pageId: "slot-page",
      tag: "architecture",
    });
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("rejects add and remove command results for a different page without stamping those tags", async () => {
    const runtime = await createRuntime();
    const user = userEvent.setup();
    const TagMetadataSlot = getTagMetadataSlotComponent(runtime);
    const addExecute = vi.fn(async (): Promise<unknown> => ({
      pageId: "other-page",
      tags: ["mismatched-add"],
    }));
    const view = render(
      <TagMetadataSlot
        pageId="current-page"
        tags={["keep"]}
        commands={{ execute: addExecute }}
      />,
    );

    await user.type(
      screen.getByRole("textbox", { name: /tag/i }),
      "mismatched-add",
    );
    await user.click(screen.getByRole("button", { name: /^add tag$/i }));

    await waitFor(() => expectVisibleTagFeedback());
    expect(screen.getByText("#keep")).toBeVisible();
    expect(screen.queryByText("#mismatched-add")).not.toBeInTheDocument();
    expect(addExecute).toHaveBeenCalledWith(tagAddCommandId, {
      pageId: "current-page",
      tag: "mismatched-add",
    });
    view.unmount();

    const removeExecute = vi.fn(async (): Promise<unknown> => ({
      pageId: "other-page",
      tags: ["mismatched-remove"],
    }));
    render(
      <TagMetadataSlot
        pageId="current-page"
        tags={["keep"]}
        commands={{ execute: removeExecute }}
      />,
    );

    await user.click(screen.getByRole("button", { name: /remove #keep/i }));

    await waitFor(() => expectVisibleTagFeedback());
    expect(screen.getByText("#keep")).toBeVisible();
    expect(screen.queryByText("#mismatched-remove")).not.toBeInTheDocument();
    expect(removeExecute).toHaveBeenCalledWith(tagRemoveCommandId, {
      pageId: "current-page",
      tag: "keep",
    });
  });

  it("shows accessible local feedback for blank or invalid add-tag submissions", async () => {
    const runtime = await createRuntime();
    const user = userEvent.setup();
    const TagMetadataSlot = getTagMetadataSlotComponent(runtime);
    const execute = vi.fn(
      async (commandId: string, input?: unknown): Promise<unknown> => {
        void input;

        if (commandId === tagAddCommandId) {
          throw new Error("Tag command rejected the submitted tag");
        }

        throw new Error(`Unexpected command ${commandId}`);
      },
    );
    render(
      <TagMetadataSlot
        pageId="feedback-page"
        tags={["architecture"]}
        commands={{ execute }}
      />,
    );

    await user.click(screen.getByRole("button", { name: /^add tag$/i }));

    await waitFor(() => expectVisibleTagFeedback());
    if (execute.mock.calls.length > 0) {
      expect(execute).toHaveBeenLastCalledWith(tagAddCommandId, {
        pageId: "feedback-page",
        tag: "",
      });
    }

    execute.mockClear();
    await user.type(screen.getByRole("textbox", { name: /tag/i }), "two words");
    await user.click(screen.getByRole("button", { name: /^add tag$/i }));

    await waitFor(() => expectVisibleTagFeedback());
    if (execute.mock.calls.length > 0) {
      expect(execute).toHaveBeenLastCalledWith(tagAddCommandId, {
        pageId: "feedback-page",
        tag: "two words",
      });
    }
    expect(screen.queryByText("#two words")).not.toBeInTheDocument();
  });

  it("keeps tag input label associations distinct when multiple metadata slots render", async () => {
    const runtime = await createRuntime();
    const user = userEvent.setup();
    const TagMetadataSlot = getTagMetadataSlotComponent(runtime);
    const execute = vi.fn(async (): Promise<unknown> => ({
      pageId: "unused",
      tags: [],
    }));
    render(
      <>
        <TagMetadataSlot
          pageId="first-page"
          tags={["architecture"]}
          commands={{ execute }}
        />
        <TagMetadataSlot
          pageId="second-page"
          tags={["timer"]}
          commands={{ execute }}
        />
      </>,
    );
    const labels = screen.getAllByText("Tag", { selector: "label" });
    const [firstLabel, secondLabel] = labels as [
      HTMLLabelElement,
      HTMLLabelElement,
    ];
    const firstInput = firstLabel.control;
    const secondInput = secondLabel.control;

    expect(labels).toHaveLength(2);
    if (
      !(firstInput instanceof HTMLInputElement) ||
      !(secondInput instanceof HTMLInputElement)
    ) {
      throw new Error("Tag labels must be associated with text inputs");
    }
    expect(firstInput).not.toBe(secondInput);

    await user.type(firstInput, "product");
    await user.type(secondInput, "release");

    expect(firstInput).toHaveValue("product");
    expect(secondInput).toHaveValue("release");
  });

  it("creates plugin-owned tag filters with the canonical static metadata query only", async () => {
    const runtime = await createRuntime({
      filterIds: ["filter-architecture"],
    });

    await expect(
      executeCreateTagFilter(runtime, {
        tag: "#Architecture",
      }),
    ).resolves.toStrictEqual({
      filterId: "filter-architecture",
    });
    expect(runtime.filters.get("filter-architecture")).toMatchObject({
      id: "filter-architecture",
      name: "#architecture",
      query: {
        where: [
          {
            field: "metadata.tag.tags",
            op: "includes",
            value: "architecture",
          },
        ],
      },
      viewType: "page.list",
      sourcePluginId: tagPluginId,
    });

    const beforeRejectedFilterPayload = snapshotRuntimeState(runtime);
    const error = await captureOptionalAsyncError(() =>
      runtime.commands.execute(tagCreateFilterCommandId, {
        tag: "timer",
        query: {
          where: [
            { field: "metadata.task.status", op: "eq", value: "done" },
          ],
        },
        viewType: "calendar",
        sourcePluginId: "evil",
      }),
    );

    expect(error).toBeDefined();
    expect(snapshotRuntimeState(runtime)).toStrictEqual(
      beforeRejectedFilterPayload,
    );
  });

  it("keeps native surfaces unchanged and refreshes source-line tags without trusting task bindings", async () => {
    const runtime = await createRuntime({
      pageIds: ["forged-bound-task-page", "task-looking-source-page"],
      metadataIds: [
        "task-status",
        "task-source-page-id",
        "task-source-block-id",
        "source-tag-tags",
      ],
    });
    const taskPage = createSourcePage(runtime, "Existing task", [
      { blockId: "task-body", text: "" },
    ]);

    runtime.metadata.set({
      pageId: taskPage.id,
      namespace: "task",
      key: "status",
      value: "todo",
      valueType: "string",
      sourcePluginId: "task",
    });
    runtime.metadata.set({
      pageId: taskPage.id,
      namespace: "task",
      key: "sourcePageId",
      value: "other-page",
      valueType: "string",
      sourcePluginId: "task",
    });
    runtime.metadata.set({
      pageId: taskPage.id,
      namespace: "task",
      key: "sourceBlockId",
      value: "other-block",
      valueType: "string",
      sourcePluginId: "task",
    });

    const sourcePage = createSourcePage(runtime, "Task-looking source", [
      {
        blockId: "task-looking-line",
        text: "- [ ] Build the tag plugin #architecture",
        attrs: {
          boundPageId: taskPage.id,
        },
      },
    ]);
    const beforeTaskMetadata = runtime.metadata.list({
      pageId: taskPage.id,
      namespace: "task",
    });

    expect(await listNativeSurfaceChangesFromMaster()).toStrictEqual([]);
    await expect(
      executeRefreshTags(runtime, { pageId: sourcePage.id }),
    ).resolves.toStrictEqual({
      pageId: sourcePage.id,
      tags: ["architecture"],
    });

    expectTagMetadata(runtime, sourcePage.id, ["architecture"]);
    expect(
      runtime.metadata.list({
        pageId: taskPage.id,
        namespace: tagMetadataNamespace,
      }),
    ).toStrictEqual([]);
    expect(
      runtime.metadata.list({ pageId: taskPage.id, namespace: "task" }),
    ).toStrictEqual(beforeTaskMetadata);
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
  const createFilterId =
    options.filterIds === undefined
      ? undefined
      : createSequenceFactory(options.filterIds);

  return createAppRuntime({
    createNativeBridge: () => createNoopNativeBridge(),
    ...(createPageId === undefined &&
    createMetadataId === undefined &&
    createFilterId === undefined
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
              ...(createFilterId === undefined
                ? {}
                : {
                    filters: {
                      createId: createFilterId,
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
    title,
    body: structuredDocument(lines),
  });
}

function structuredDocument(
  lines: readonly SourceLine[],
): StructuredMarkdownDocument {
  return {
    type: "doc",
    content: lines.map((line) => {
      const block: BlockNode = {
        blockId: line.blockId,
        type: "markdown.line",
        text: line.text,
      };

      if (line.attrs !== undefined) {
        block.attrs = line.attrs;
      }

      return block;
    }),
  };
}

async function executeRefreshTags(
  runtime: AppRuntime,
  input: unknown,
): Promise<TagCommandResult> {
  return readTagCommandResult(
    await runtime.commands.execute(tagRefreshCommandId, input),
  );
}

async function executeAddTag(
  runtime: AppRuntime,
  input: unknown,
): Promise<TagCommandResult> {
  return readTagCommandResult(
    await runtime.commands.execute(tagAddCommandId, input),
  );
}

async function executeRemoveTag(
  runtime: AppRuntime,
  input: unknown,
): Promise<TagCommandResult> {
  return readTagCommandResult(
    await runtime.commands.execute(tagRemoveCommandId, input),
  );
}

async function executeCreateTagFilter(
  runtime: AppRuntime,
  input: unknown,
): Promise<CreateTagFilterResult> {
  return readCreateTagFilterResult(
    await runtime.commands.execute(tagCreateFilterCommandId, input),
  );
}

function readTagCommandResult(result: unknown): TagCommandResult {
  if (!isRecord(result)) {
    throw new Error("Tag command must return an object");
  }

  expect(Object.keys(result).sort()).toStrictEqual(["pageId", "tags"]);

  if (typeof result.pageId !== "string" || !Array.isArray(result.tags)) {
    throw new Error("Tag command must return { pageId, tags }");
  }

  for (const tag of result.tags) {
    if (typeof tag !== "string") {
      throw new Error("Tag command tags must be strings");
    }
  }

  return {
    pageId: result.pageId,
    tags: result.tags,
  };
}

function readCreateTagFilterResult(result: unknown): CreateTagFilterResult {
  if (!isRecord(result)) {
    throw new Error("tag.create-filter must return an object");
  }

  expect(Object.keys(result).sort()).toStrictEqual(["filterId"]);

  if (typeof result.filterId !== "string" || result.filterId.trim().length === 0) {
    throw new Error("tag.create-filter must return { filterId }");
  }

  return {
    filterId: result.filterId,
  };
}

function expectTagMetadata(
  runtime: AppRuntime,
  pageId: string,
  tags: readonly string[],
): void {
  expect(runtime.metadata.get(pageId, tagMetadataNamespace, tagMetadataKey)).toMatchObject({
    pageId,
    namespace: tagMetadataNamespace,
    key: tagMetadataKey,
    value: tags,
    valueType: "json",
    sourcePluginId: tagPluginId,
  });
}

function expectVisibleTagFeedback(): void {
  const feedback = [
    ...screen.queryAllByRole("alert"),
    ...screen.queryAllByRole("status"),
  ].find((element) => /tag/i.test(element.textContent ?? ""));

  expect(feedback).toBeDefined();
  expect(feedback).toBeVisible();
}

function getTagMetadataSlotComponent(
  runtime: AppRuntime,
): ComponentType<TagMetadataSlotProps> {
  const slot = runtime.registries.slots
    .list({ slot: pageHeaderMetadataSlot })
    .find((contribution) => contribution.id === tagMetadataSlotId);

  if (slot === undefined) {
    throw new Error(`Missing ${tagMetadataSlotId} slot contribution`);
  }

  return (slot as SlotContribution<TagMetadataSlotProps>).component;
}

function snapshotRuntimeState(runtime: AppRuntime): RuntimeSnapshot {
  return {
    pages: runtime.pages.list({ includeArchived: true }),
    metadata: runtime.metadata.list(),
    filters: runtime.filters.list(),
  };
}

async function captureOptionalAsyncError(
  action: () => Promise<unknown>,
): Promise<unknown | undefined> {
  try {
    await action();
  } catch (error) {
    return error;
  }

  return undefined;
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
    shortcuts: {
      async register() {
        return undefined;
      },
      async unregister() {
        return undefined;
      },
    },
    notifications: {
      async notify() {
        return undefined;
      },
    },
    files: {
      async importMarkdown() {
        return "";
      },
      async exportMarkdown() {
        return undefined;
      },
    },
  };
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
