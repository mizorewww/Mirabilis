import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ComponentType } from "react";
import { describe, expect, it, vi } from "vitest";

import { BUILT_IN_PLUGINS, createAppRuntime, type AppRuntime } from "../bootstrap";
import {
  createCoreStores,
  exportStructuredDocumentToMarkdown,
  type AppEvent,
  type BlockNode,
  type CoreStores,
  type DbQuery,
  type MarkdownPage,
  type MetadataRecord,
  type NativeBridge,
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

type ToggleTaskStatusInput = {
  sourcePageId: string;
  sourceBlockId: string;
};

type ToggleTaskStatusResult = {
  pageId: string;
  status: "todo" | "done";
};

type CreateRuntimeOptions = {
  pageIds?: readonly string[];
  eventIds?: readonly string[];
  eventTimes?: readonly string[];
};

type MarkdownEditorDocument = {
  id: string;
  title: string;
  markdown: string;
  body?: StructuredMarkdownDocument;
};

type MarkdownCommandBus = {
  execute(commandId: string, input?: unknown): Promise<unknown>;
};

type MarkdownPageFacade = {
  load(pageId: string): Promise<MarkdownEditorDocument>;
  save(input: {
    pageId: string;
    markdown: string;
  }): Promise<MarkdownEditorDocument>;
};

type TaskCheckboxMarkdownPageEditorBaseProps = {
  commands: MarkdownCommandBus;
  markdownRuntime?: {
    collectEditorExtensions(): readonly unknown[];
  };
  onOpenPage?(pageId: string): void;
};

type DirectTaskCheckboxMarkdownPageEditorProps =
  TaskCheckboxMarkdownPageEditorBaseProps & {
    page: MarkdownEditorDocument;
  };

type LoadedTaskCheckboxMarkdownPageEditorProps =
  TaskCheckboxMarkdownPageEditorBaseProps & {
    pageId: string;
    pageFacade: MarkdownPageFacade;
  };

type TaskCheckboxMarkdownPageEditorProps =
  | DirectTaskCheckboxMarkdownPageEditorProps
  | LoadedTaskCheckboxMarkdownPageEditorProps;

type Deferred<Value> = {
  promise: Promise<Value>;
  resolve(value: Value): void;
  reject(reason: unknown): void;
};

const toggleTaskStatusCommandId = "task.toggle-status";
const openTaskPageCommandId = "task.open-task-page";
const resolveTaskBlockCommandId = "task.resolve-task-block";
const taskNamespace = "task";
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

describe("Task checkbox toggle and task events", () => {
  it("registers only the canonical task.toggle-status command through the built-in Task Plugin", async () => {
    const runtime = await createRuntime();
    const builtInPluginIds = BUILT_IN_PLUGINS.map(
      (plugin) => plugin.manifest.id,
    );
    const taskCommandIds = runtime.registries.commands
      .list({ pluginId: taskNamespace })
      .map((command) => command.id);

    expect.soft(builtInPluginIds).toContain(taskNamespace);
    expect(taskCommandIds).toContain(toggleTaskStatusCommandId);
    expect(taskCommandIds).not.toContain("task.toggle_status");
    expect(taskCommandIds).not.toContain("task.toggle_checkbox");
  });

  it("completes an unchecked source task by toggling the source marker, metadata, and completed event atomically", async () => {
    const runtime = await createRuntime({
      pageIds: ["source-page", "task-page-a"],
      eventIds: ["event-task-completed"],
      eventTimes: ["2026-05-21T06:00:00.000Z"],
    });
    const sourcePage = createSourcePage(runtime, "Inbox", [
      { blockId: "intro-block", text: "Inbox notes" },
      {
        blockId: "task-block-a",
        text: "  - [ ] A",
        attrs: { customAttr: "preserved" },
      },
    ]);

    await expect(
      executeToggleTaskStatus(runtime, {
        sourcePageId: sourcePage.id,
        sourceBlockId: "task-block-a",
      }),
    ).resolves.toStrictEqual({
      pageId: "task-page-a",
      status: "done",
    } satisfies ToggleTaskStatusResult);

    const taskPage = expectSingleTaskPageForSource(
      runtime,
      sourcePage.id,
      "task-block-a",
    );

    expect(taskPage).toMatchObject({
      id: "task-page-a",
      title: "A",
    });
    expectTaskMetadata(runtime, {
      taskPageId: taskPage.id,
      sourcePageId: sourcePage.id,
      sourceBlockId: "task-block-a",
      status: "done",
    });
    expectSourceBlock(runtime, {
      sourcePageId: sourcePage.id,
      sourceBlockId: "task-block-a",
      text: "  - [x] A",
      attrs: {
        customAttr: "preserved",
        boundPageId: taskPage.id,
      },
    });
    expectTaskEvent(runtime, {
      eventId: "event-task-completed",
      taskPageId: taskPage.id,
      sourcePageId: sourcePage.id,
      sourceBlockId: "task-block-a",
      type: "completed",
      previousStatus: "todo",
      status: "done",
      createdAt: "2026-05-21T06:00:00.000Z",
    });
  });

  it("reopens lowercase and uppercase checked source tasks as todo with reopened events", async () => {
    const cases: Array<{
      name: string;
      sourceText: string;
      expectedText: string;
      eventId: string;
    }> = [
      {
        name: "lowercase checked marker",
        sourceText: "- [x] A",
        expectedText: "- [ ] A",
        eventId: "event-task-reopened-lowercase",
      },
      {
        name: "uppercase checked marker",
        sourceText: "- [X] A",
        expectedText: "- [ ] A",
        eventId: "event-task-reopened-uppercase",
      },
    ];

    for (const testCase of cases) {
      const runtime = await createRuntime({
        pageIds: ["source-page", "task-page-a"],
        eventIds: [testCase.eventId],
        eventTimes: ["2026-05-21T06:05:00.000Z"],
      });
      const sourcePage = createSourcePage(runtime, `Done ${testCase.name}`, [
        {
          blockId: "task-block-a",
          text: testCase.sourceText,
          attrs: { boundPageId: "task-page-a" },
        },
      ]);
      const taskPage = createTaskPageWithMetadata(runtime, {
        title: "A",
        sourcePageId: sourcePage.id,
        sourceBlockId: "task-block-a",
        status: "done",
      });

      await expect(
        executeToggleTaskStatus(runtime, {
          sourcePageId: sourcePage.id,
          sourceBlockId: "task-block-a",
        }),
        testCase.name,
      ).resolves.toStrictEqual({
        pageId: taskPage.id,
        status: "todo",
      } satisfies ToggleTaskStatusResult);

      expectTaskMetadata(runtime, {
        taskPageId: taskPage.id,
        sourcePageId: sourcePage.id,
        sourceBlockId: "task-block-a",
        status: "todo",
      });
      expectSourceBlock(runtime, {
        sourcePageId: sourcePage.id,
        sourceBlockId: "task-block-a",
        text: testCase.expectedText,
        attrs: { boundPageId: taskPage.id },
      });
      expectTaskEvent(runtime, {
        eventId: testCase.eventId,
        taskPageId: taskPage.id,
        sourcePageId: sourcePage.id,
        sourceBlockId: "task-block-a",
        type: "reopened",
        previousStatus: "done",
        status: "todo",
        createdAt: "2026-05-21T06:05:00.000Z",
      });
    }
  });

  it("does not let a forged source attrs.boundPageId choose the task page or event target", async () => {
    const runtime = await createRuntime({
      pageIds: ["source-page", "forged-page", "task-page-a"],
      eventIds: ["event-task-completed"],
      eventTimes: ["2026-05-21T06:08:00.000Z"],
    });
    const sourcePage = createSourcePage(runtime, "Forged source binding", [
      {
        blockId: "task-block-a",
        text: "- [ ] A",
        attrs: { boundPageId: "forged-page" },
      },
    ]);
    const forgedPage = runtime.pages.create({
      title: "Forged target",
      body: createEmptyStructuredDocument(),
    });

    await expect(
      executeToggleTaskStatus(runtime, {
        sourcePageId: sourcePage.id,
        sourceBlockId: "task-block-a",
      }),
    ).resolves.toStrictEqual({
      pageId: "task-page-a",
      status: "done",
    } satisfies ToggleTaskStatusResult);

    expect(runtime.pages.get(forgedPage.id).title).toBe("Forged target");
    expect(
      runtime.metadata.list({
        pageId: forgedPage.id,
        namespace: taskNamespace,
      }),
    ).toStrictEqual([]);
    expectTaskMetadata(runtime, {
      taskPageId: "task-page-a",
      sourcePageId: sourcePage.id,
      sourceBlockId: "task-block-a",
      status: "done",
    });
    expectSourceBlock(runtime, {
      sourcePageId: sourcePage.id,
      sourceBlockId: "task-block-a",
      text: "- [x] A",
      attrs: { boundPageId: "task-page-a" },
    });
    expectTaskEvent(runtime, {
      eventId: "event-task-completed",
      taskPageId: "task-page-a",
      sourcePageId: sourcePage.id,
      sourceBlockId: "task-block-a",
      type: "completed",
      previousStatus: "todo",
      status: "done",
      createdAt: "2026-05-21T06:08:00.000Z",
    });
  });

  it("does not accept malformed payloads or caller-supplied trusted task fields", async () => {
    const invalidPayloads: readonly unknown[] = [
      undefined,
      null,
      "",
      [],
      { sourceBlockId: "task-block-a" },
      { sourcePageId: "source-page" },
      { sourcePageId: "", sourceBlockId: "task-block-a" },
      { sourcePageId: "source-page", sourceBlockId: "   " },
      {
        sourcePageId: "source-page",
        sourceBlockId: "task-block-a",
        pageId: "forged-task-page",
      },
      {
        sourcePageId: "source-page",
        sourceBlockId: "task-block-a",
        boundPageId: "forged-task-page",
      },
      {
        sourcePageId: "source-page",
        sourceBlockId: "task-block-a",
        status: "done",
      },
      {
        sourcePageId: "source-page",
        sourceBlockId: "task-block-a",
        title: "Injected title",
      },
      {
        sourcePageId: "source-page",
        sourceBlockId: "task-block-a",
        type: "completed",
      },
      {
        sourcePageId: "source-page",
        sourceBlockId: "task-block-a",
        createdAt: "2026-05-21T06:10:00.000Z",
      },
    ];

    for (const payload of invalidPayloads) {
      const runtime = await createRuntime({ pageIds: ["source-page"] });

      createSourcePage(runtime, "Invalid payload source", [
        { blockId: "task-block-a", text: "- [ ] A" },
      ]);
      const before = snapshotPageMetadataEventState(runtime);

      await expect(
        runtime.commands.execute(toggleTaskStatusCommandId, payload),
      ).rejects.toThrow();
      expect(snapshotPageMetadataEventState(runtime)).toStrictEqual(before);
    }
  });

  it("rejects valid-shaped invalid source blocks without page, metadata, event, or source mutation", async () => {
    const invalidSources: readonly {
      name: string;
      sourceBlockId: string;
      blocks: readonly BlockNode[];
    }[] = [
      {
        name: "missing source block",
        sourceBlockId: "missing-task-block",
        blocks: [
          {
            blockId: "other-block",
            type: "markdown.line",
            text: "- [ ] A",
          },
        ],
      },
      {
        name: "duplicate source block ids",
        sourceBlockId: "task-block-a",
        blocks: [
          {
            blockId: "task-block-a",
            type: "markdown.line",
            text: "- [ ] A",
          },
          {
            blockId: "task-block-a",
            type: "markdown.line",
            text: "- [ ] Duplicate",
          },
        ],
      },
      {
        name: "non markdown line source block",
        sourceBlockId: "task-block-a",
        blocks: [
          {
            blockId: "task-block-a",
            type: "paragraph",
            text: "- [ ] A",
          },
        ],
      },
      {
        name: "malformed checkbox line",
        sourceBlockId: "task-block-a",
        blocks: [
          {
            blockId: "task-block-a",
            type: "markdown.line",
            text: "- [/] A",
          },
        ],
      },
      {
        name: "empty task title",
        sourceBlockId: "task-block-a",
        blocks: [
          {
            blockId: "task-block-a",
            type: "markdown.line",
            text: "- [ ]    ",
          },
        ],
      },
      {
        name: "fenced code task-looking line",
        sourceBlockId: "task-block-a",
        blocks: [
          {
            blockId: "fence-open",
            type: "markdown.line",
            text: "```",
          },
          {
            blockId: "task-block-a",
            type: "markdown.line",
            text: "- [ ] A",
          },
          {
            blockId: "fence-close",
            type: "markdown.line",
            text: "```",
          },
        ],
      },
    ];

    for (const invalidSource of invalidSources) {
      const runtime = await createRuntime({
        pageIds: ["source-page", "unexpected-task-page"],
        eventIds: ["unexpected-event"],
        eventTimes: ["2026-05-21T06:20:00.000Z"],
      });
      const sourcePage = runtime.pages.create({
        title: invalidSource.name,
        body: {
          type: "doc",
          content: invalidSource.blocks.map((block) => ({ ...block })),
        },
      });
      const before = snapshotPageMetadataEventState(runtime);

      await expect(
        executeToggleTaskStatus(runtime, {
          sourcePageId: sourcePage.id,
          sourceBlockId: invalidSource.sourceBlockId,
        }),
        invalidSource.name,
      ).rejects.toThrow();
      expect(
        snapshotPageMetadataEventState(runtime),
        invalidSource.name,
      ).toStrictEqual(before);
    }
  });

  it("rolls back source text, metadata, task page, and event writes when event append fails", async () => {
    const runtime = await createRuntime({
      pageIds: ["source-page", "task-page-a"],
      eventIds: ["event-collision", "event-collision"],
      eventTimes: [
        "2026-05-21T06:15:00.000Z",
        "2026-05-21T06:16:00.000Z",
      ],
    });
    const sourcePage = createSourcePage(runtime, "Rollback source", [
      { blockId: "task-block-a", text: "- [ ] A" },
    ]);

    runtime.events.append({
      pageId: sourcePage.id,
      namespace: "seed",
      type: "existing",
      payload: {},
      sourcePluginId: "seed",
    });
    const before = snapshotPageMetadataEventState(runtime);

    await expect(
      executeToggleTaskStatus(runtime, {
        sourcePageId: sourcePage.id,
        sourceBlockId: "task-block-a",
      }),
    ).rejects.toThrow();

    expect(snapshotPageMetadataEventState(runtime)).toStrictEqual(before);
    expectSourceBlock(runtime, {
      sourcePageId: sourcePage.id,
      sourceBlockId: "task-block-a",
      text: "- [ ] A",
      attrs: undefined,
    });
    expect(runtime.pages.list().map((page) => page.id)).not.toContain(
      "task-page-a",
    );
  });

  it("clicks a real accessible checkbox through source-only payload and preserves title-open behavior", async () => {
    const runtime = await createRuntime();
    const user = userEvent.setup();
    const sourcePage = createSourcePage(runtime, "Clickable checkbox", [
      {
        blockId: "task-block-a",
        text: "- [ ] A",
        attrs: { boundPageId: "forged-task-page" },
      },
    ]);
    const execute = vi.fn(async (commandId: string) => {
      if (commandId === openTaskPageCommandId) {
        return { pageId: "opened-task-page" };
      }

      return {
        pageId: "resolved-task-page",
        status: "done",
      } satisfies ToggleTaskStatusResult;
    });
    const commands = { execute } satisfies MarkdownCommandBus;
    const onOpenPage = vi.fn();

    renderMarkdownPageEditor(runtime, {
      page: editorDocumentFromRuntimePage(sourcePage),
      commands,
      onOpenPage,
      markdownRuntime: runtime.markdown,
    });

    await user.click(await screen.findByRole("button", { name: "A" }));
    await waitFor(() =>
      expect(execute).toHaveBeenCalledWith(openTaskPageCommandId, {
        sourcePageId: sourcePage.id,
        sourceBlockId: "task-block-a",
      }),
    );
    expect(onOpenPage).toHaveBeenCalledWith("opened-task-page");

    const checkbox = await screen.findByRole("checkbox", {
      name: "A",
      checked: false,
    });

    expect(checkbox).toHaveAttribute("type", "checkbox");

    await user.click(checkbox);

    await waitFor(() =>
      expect(execute).toHaveBeenCalledWith(toggleTaskStatusCommandId, {
        sourcePageId: sourcePage.id,
        sourceBlockId: "task-block-a",
      } satisfies ToggleTaskStatusInput),
    );
    expect(lastCommandPayloadFor(execute, toggleTaskStatusCommandId)).toStrictEqual({
      sourcePageId: sourcePage.id,
      sourceBlockId: "task-block-a",
    } satisfies ToggleTaskStatusInput);
    expect(onOpenPage).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: /markdown/i })).toHaveValue(
        "- [x] A",
      ),
    );
  });

  it("uses the visible task title only once as the open affordance and keeps checkbox toggles separate", async () => {
    const runtime = await createRuntime();
    const user = userEvent.setup();
    const taskTitle = "Open from title only";
    const sourcePage = createSourcePage(runtime, "Title interaction source", [
      {
        blockId: "task-block-a",
        text: `- [ ] ${taskTitle}`,
      },
    ]);
    const execute = vi.fn(async (commandId: string) => {
      if (commandId === openTaskPageCommandId) {
        return { pageId: "opened-task-page" };
      }

      return {
        pageId: "resolved-task-page",
        status: "done",
      } satisfies ToggleTaskStatusResult;
    });
    const onOpenPage = vi.fn();

    renderMarkdownPageEditor(runtime, {
      page: editorDocumentFromRuntimePage(sourcePage),
      commands: { execute },
      onOpenPage,
      markdownRuntime: runtime.markdown,
    });

    const titleButton = await screen.findByRole("button", { name: taskTitle });
    const checkbox = screen.getByRole("checkbox");

    expect(checkbox).toHaveAccessibleName(/.+/u);
    expect(screen.getAllByText(taskTitle)).toHaveLength(1);

    await user.click(titleButton);

    await waitFor(() =>
      expect(execute).toHaveBeenCalledWith(openTaskPageCommandId, {
        sourcePageId: sourcePage.id,
        sourceBlockId: "task-block-a",
      }),
    );
    expect(onOpenPage).toHaveBeenCalledWith("opened-task-page");
    expect(commandPayloadsFor(execute, toggleTaskStatusCommandId)).toStrictEqual(
      [],
    );

    await user.click(checkbox);

    await waitFor(() =>
      expect(execute).toHaveBeenCalledWith(toggleTaskStatusCommandId, {
        sourcePageId: sourcePage.id,
        sourceBlockId: "task-block-a",
      } satisfies ToggleTaskStatusInput),
    );
    expect(commandPayloadsFor(execute, openTaskPageCommandId)).toHaveLength(1);
  });

  it("keeps a checked checkbox visible after a direct-page toggle so the task can immediately reopen", async () => {
    const runtime = await createRuntime();
    const user = userEvent.setup();
    const sourcePage = createSourcePage(runtime, "Direct checkbox reopen", [
      { blockId: "task-block-a", text: "- [ ] A" },
    ]);
    let nextStatus: ToggleTaskStatusResult["status"] = "done";
    const execute = vi.fn(async (commandId: string) => {
      if (commandId !== toggleTaskStatusCommandId) {
        throw new Error(`Unexpected command ${commandId}`);
      }

      const status = nextStatus;

      nextStatus = status === "done" ? "todo" : "done";

      return {
        pageId: "resolved-task-page",
        status,
      } satisfies ToggleTaskStatusResult;
    });

    renderMarkdownPageEditor(runtime, {
      page: editorDocumentFromRuntimePage(sourcePage),
      commands: { execute },
      markdownRuntime: runtime.markdown,
    });

    await user.click(
      await screen.findByRole("checkbox", { name: "A", checked: false }),
    );

    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: /markdown/i })).toHaveValue(
        "- [x] A",
      ),
    );

    const checkedCheckbox = await screen.findByRole("checkbox", {
      name: "A",
      checked: true,
    });

    await user.click(checkedCheckbox);

    await waitFor(() => expect(execute).toHaveBeenCalledTimes(2));
    expect(commandPayloadsFor(execute, toggleTaskStatusCommandId)).toStrictEqual([
      {
        sourcePageId: sourcePage.id,
        sourceBlockId: "task-block-a",
      },
      {
        sourcePageId: sourcePage.id,
        sourceBlockId: "task-block-a",
      },
    ] satisfies ToggleTaskStatusInput[]);
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: /markdown/i })).toHaveValue(
        "- [ ] A",
      ),
    );
    expect(
      await screen.findByRole("checkbox", { name: "A", checked: false }),
    ).toBeVisible();
  });

  it("loads structured pageFacade tasks, toggles by source-only payload, and keeps the checked checkbox visible", async () => {
    const runtime = await createRuntime();
    const user = userEvent.setup();
    const sourcePage = createSourcePage(runtime, "Loaded checkbox source", [
      { blockId: "task-block-a", text: "- [ ] A" },
    ]);
    const loadedDocument = editorDocumentFromRuntimePage(sourcePage);
    const pageFacade: MarkdownPageFacade = {
      load: vi.fn(async () => loadedDocument),
      save: vi.fn(async () => loadedDocument),
    };
    const execute = vi.fn(async (commandId: string) => {
      if (commandId !== toggleTaskStatusCommandId) {
        throw new Error(`Unexpected command ${commandId}`);
      }

      return {
        pageId: "resolved-task-page",
        status: "done",
      } satisfies ToggleTaskStatusResult;
    });

    renderMarkdownPageEditor(runtime, {
      pageId: sourcePage.id,
      pageFacade,
      commands: { execute },
      markdownRuntime: runtime.markdown,
    });

    const editor = await screen.findByRole("textbox", { name: /markdown/i });

    expect(pageFacade.load).toHaveBeenCalledWith(sourcePage.id);
    expect(editor).toHaveValue("- [ ] A");

    await user.click(
      await screen.findByRole("checkbox", { name: "A", checked: false }),
    );

    await waitFor(() =>
      expect(execute).toHaveBeenCalledWith(toggleTaskStatusCommandId, {
        sourcePageId: sourcePage.id,
        sourceBlockId: "task-block-a",
      } satisfies ToggleTaskStatusInput),
    );
    expect(lastCommandPayloadFor(execute, toggleTaskStatusCommandId)).toStrictEqual({
      sourcePageId: sourcePage.id,
      sourceBlockId: "task-block-a",
    } satisfies ToggleTaskStatusInput);
    await waitFor(() => expect(editor).toHaveValue("- [x] A"));
    expect(
      await screen.findByRole("checkbox", { name: "A", checked: true }),
    ).toBeVisible();
    expect(pageFacade.save).not.toHaveBeenCalled();
  });

  it("ignores repeated checkbox toggles for the same source block while the first toggle is pending", async () => {
    const runtime = await createRuntime();
    const user = userEvent.setup();
    const toggleCompletion = createDeferred<ToggleTaskStatusResult>();
    const sourcePage = createSourcePage(runtime, "Pending toggle source", [
      { blockId: "task-block-a", text: "- [ ] A" },
    ]);
    const execute = vi.fn((commandId: string) => {
      if (commandId !== toggleTaskStatusCommandId) {
        throw new Error(`Unexpected command ${commandId}`);
      }

      return toggleCompletion.promise;
    });

    renderMarkdownPageEditor(runtime, {
      page: editorDocumentFromRuntimePage(sourcePage),
      commands: { execute },
      markdownRuntime: runtime.markdown,
    });

    const checkbox = await screen.findByRole("checkbox", {
      name: "A",
      checked: false,
    });

    await user.click(checkbox);
    await waitFor(() => expect(execute).toHaveBeenCalledTimes(1));

    await user.click(checkbox);

    expect(commandPayloadsFor(execute, toggleTaskStatusCommandId)).toStrictEqual([
      {
        sourcePageId: sourcePage.id,
        sourceBlockId: "task-block-a",
      },
    ] satisfies ToggleTaskStatusInput[]);

    await act(async () => {
      toggleCompletion.resolve({
        pageId: "resolved-task-page",
        status: "done",
      });
      await toggleCompletion.promise;
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: /markdown/i })).toHaveValue(
        "- [x] A",
      ),
    );
    expect(
      await screen.findByRole("checkbox", { name: "A", checked: true }),
    ).toBeVisible();
  });

  it("opens completed task titles through task.open-task-page using only source identity", async () => {
    const runtime = await createRuntime({
      pageIds: ["source-page", "task-page-a"],
    });
    const user = userEvent.setup();
    const sourcePage = createSourcePage(runtime, "Completed open source", [
      {
        blockId: "task-block-a",
        text: "- [x] A",
        attrs: { boundPageId: "task-page-a" },
      },
    ]);
    const taskPage = createTaskPageWithMetadata(runtime, {
      title: "A",
      sourcePageId: sourcePage.id,
      sourceBlockId: "task-block-a",
      status: "done",
    });
    const execute = vi.fn((commandId: string, input?: unknown) =>
      runtime.commands.execute(commandId, input),
    );
    const onOpenPage = vi.fn();

    renderMarkdownPageEditor(runtime, {
      page: editorDocumentFromRuntimePage(sourcePage),
      commands: { execute },
      onOpenPage,
      markdownRuntime: runtime.markdown,
    });

    await user.click(await screen.findByRole("button", { name: "A" }));

    await waitFor(() =>
      expect(execute).toHaveBeenCalledWith(openTaskPageCommandId, {
        sourcePageId: sourcePage.id,
        sourceBlockId: "task-block-a",
      }),
    );
    expect(lastCommandPayloadFor(execute, openTaskPageCommandId)).toStrictEqual({
      sourcePageId: sourcePage.id,
      sourceBlockId: "task-block-a",
    });
    await waitFor(() => expect(onOpenPage).toHaveBeenCalledWith(taskPage.id));
  });

  it("creates and opens an unresolved checked task as done without completed or reopened events", async () => {
    const runtime = await createRuntime({
      pageIds: ["source-page", "task-page-a"],
    });
    const sourcePage = createSourcePage(runtime, "Unresolved checked source", [
      {
        blockId: "task-block-a",
        text: "- [x] A",
        attrs: { customAttr: "preserved" },
      },
    ]);

    await expect(
      runtime.commands.execute(openTaskPageCommandId, {
        sourcePageId: sourcePage.id,
        sourceBlockId: "task-block-a",
      }),
    ).resolves.toStrictEqual({
      pageId: "task-page-a",
    });

    const taskPage = expectSingleTaskPageForSource(
      runtime,
      sourcePage.id,
      "task-block-a",
    );

    expect(taskPage).toMatchObject({
      id: "task-page-a",
      title: "A",
    });
    expectTaskMetadata(runtime, {
      taskPageId: taskPage.id,
      sourcePageId: sourcePage.id,
      sourceBlockId: "task-block-a",
      status: "done",
    });
    expectSourceBlock(runtime, {
      sourcePageId: sourcePage.id,
      sourceBlockId: "task-block-a",
      text: "- [x] A",
      attrs: {
        customAttr: "preserved",
        boundPageId: taskPage.id,
      },
    });
    expect(runtime.events.list()).toStrictEqual([]);
  });

  it("keeps task.resolve-task-block unchecked-only for unresolved checked task lines", async () => {
    const runtime = await createRuntime({
      pageIds: ["source-page", "unexpected-task-page"],
    });
    const sourcePage = createSourcePage(runtime, "Checked resolver source", [
      { blockId: "task-block-a", text: "- [x] A" },
    ]);
    const before = snapshotPageMetadataEventState(runtime);

    await expect(
      runtime.commands.execute(resolveTaskBlockCommandId, {
        sourcePageId: sourcePage.id,
        sourceBlockId: "task-block-a",
      }),
    ).rejects.toThrow();
    expect(snapshotPageMetadataEventState(runtime)).toStrictEqual(before);
  });

  it("ignores a stale delayed checkbox toggle after the editor switches pages", async () => {
    const runtime = await createRuntime();
    const user = userEvent.setup();
    const toggleCompletion = createDeferred<ToggleTaskStatusResult>();
    const sourcePage = createSourcePage(runtime, "Slow source", [
      { blockId: "task-block-a", text: "- [ ] A" },
    ]);
    const nextPage = createSourcePage(runtime, "Next source", [
      { blockId: "other-block", text: "Different page" },
    ]);
    const execute = vi.fn(() => toggleCompletion.promise);
    const commands = { execute } satisfies MarkdownCommandBus;
    const Editor = getMarkdownPageEditorComponent(runtime);
    const { rerender } = render(
      <Editor
        page={editorDocumentFromRuntimePage(sourcePage)}
        commands={commands}
        markdownRuntime={runtime.markdown}
      />,
    );

    await user.click(
      await screen.findByRole("checkbox", { name: "A", checked: false }),
    );
    await waitFor(() =>
      expect(execute).toHaveBeenCalledWith(toggleTaskStatusCommandId, {
        sourcePageId: sourcePage.id,
        sourceBlockId: "task-block-a",
      } satisfies ToggleTaskStatusInput),
    );

    rerender(
      <Editor
        page={editorDocumentFromRuntimePage(nextPage)}
        commands={commands}
        markdownRuntime={runtime.markdown}
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: /markdown/i })).toHaveValue(
        "Different page",
      ),
    );

    await act(async () => {
      toggleCompletion.resolve({
        pageId: "stale-task-page",
        status: "done",
      });
      await toggleCompletion.promise;
      await Promise.resolve();
    });

    expect(screen.getByRole("textbox", { name: /markdown/i })).toHaveValue(
      "Different page",
    );
    expect(screen.queryByRole("checkbox", { name: "A" })).not.toBeInTheDocument();
  });

  it("ignores a stale delayed checkbox toggle after same-page unsaved edits", async () => {
    const runtime = await createRuntime();
    const user = userEvent.setup();
    const toggleCompletion = createDeferred<ToggleTaskStatusResult>();
    const sourcePage = createSourcePage(runtime, "Slow same-page source", [
      { blockId: "task-block-a", text: "- [ ] A" },
    ]);
    const execute = vi.fn(() => toggleCompletion.promise);
    const commands = { execute } satisfies MarkdownCommandBus;

    renderMarkdownPageEditor(runtime, {
      page: editorDocumentFromRuntimePage(sourcePage),
      commands,
      markdownRuntime: runtime.markdown,
    });

    await user.click(
      await screen.findByRole("checkbox", { name: "A", checked: false }),
    );
    await waitFor(() =>
      expect(execute).toHaveBeenCalledWith(toggleTaskStatusCommandId, {
        sourcePageId: sourcePage.id,
        sourceBlockId: "task-block-a",
      } satisfies ToggleTaskStatusInput),
    );

    const editor = screen.getByRole("textbox", { name: /markdown/i });

    await user.clear(editor);
    await user.type(editor, "Edited before toggle resolves");
    await waitFor(() =>
      expect(editor).toHaveValue("Edited before toggle resolves"),
    );

    const staleCheckbox = screen.queryByRole("checkbox", { name: "A" });
    const staleCheckboxCanToggle =
      staleCheckbox !== null && !staleCheckbox.hasAttribute("disabled");

    expect(staleCheckboxCanToggle).toBe(false);

    await act(async () => {
      toggleCompletion.resolve({
        pageId: "stale-task-page",
        status: "done",
      });
      await toggleCompletion.promise;
      await Promise.resolve();
    });

    expect(editor).toHaveValue("Edited before toggle resolves");
  });

  it("renders unsafe task titles as inert checkbox labels without HTML, href, or script semantics", async () => {
    const runtime = await createRuntime();
    const unsafeTitle =
      "<img src=x onerror=alert(1)> [open](javascript:alert(1))";
    const sourcePage = createSourcePage(runtime, "Unsafe checkbox title", [
      { blockId: "unsafe-task", text: `- [ ] ${unsafeTitle}` },
    ]);
    const commands: MarkdownCommandBus = {
      execute: vi.fn(async () => ({
        pageId: "resolved-safe-page",
        status: "done",
      })),
    };

    renderMarkdownPageEditor(runtime, {
      page: editorDocumentFromRuntimePage(sourcePage),
      commands,
      markdownRuntime: runtime.markdown,
    });

    const checkbox = await screen.findByRole("checkbox", {
      name: unsafeTitle,
      checked: false,
    });

    expect(checkbox).toHaveAttribute("type", "checkbox");
    expect(screen.queryByRole("link", { name: unsafeTitle })).not.toBeInTheDocument();
    expect(document.body.innerHTML).not.toMatch(
      /<script[\s>]|<img[\s>]|<iframe[\s>]|<object[\s>]|<embed[\s>]/i,
    );
    expect(document.body.innerHTML).not.toMatch(
      /<[^>]+\son(?:error|click)=|<a\b[^>]*\shref=["']javascript:/i,
    );
  });

  it("does not require package, Cargo, Tauri config, capability, permission, or native command surface changes", async () => {
    const changedNativeSurfaceFiles = await listNativeSurfaceChangesFromMaster();

    expect(changedNativeSurfaceFiles).toStrictEqual([]);
  });
});

async function createRuntime(
  options: CreateRuntimeOptions = {},
): Promise<AppRuntime> {
  const createPageId =
    options.pageIds === undefined
      ? undefined
      : createSequenceFactory(options.pageIds);
  const createEventId =
    options.eventIds === undefined
      ? undefined
      : createSequenceFactory(options.eventIds);
  const eventNow =
    options.eventTimes === undefined
      ? undefined
      : createSequenceFactory(options.eventTimes);

  return createAppRuntime({
    createNativeBridge: () => createNoopNativeBridge(),
    ...(createPageId === undefined &&
    createEventId === undefined &&
    eventNow === undefined
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
              ...(createEventId === undefined && eventNow === undefined
                ? {}
                : {
                    events: {
                      ...(createEventId === undefined
                        ? {}
                        : { createId: createEventId }),
                      ...(eventNow === undefined ? {} : { now: eventNow }),
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

function createEmptyStructuredDocument(): StructuredMarkdownDocument {
  return {
    type: "doc",
    content: [],
  };
}

async function executeToggleTaskStatus(
  runtime: AppRuntime,
  input: ToggleTaskStatusInput,
): Promise<ToggleTaskStatusResult> {
  const result = await runtime.commands.execute(toggleTaskStatusCommandId, input);

  return readToggleTaskStatusResult(result);
}

function readToggleTaskStatusResult(result: unknown): ToggleTaskStatusResult {
  if (
    typeof result !== "object" ||
    result === null ||
    Array.isArray(result) ||
    !("pageId" in result) ||
    typeof result.pageId !== "string" ||
    result.pageId.trim().length === 0 ||
    !("status" in result) ||
    (result.status !== "todo" && result.status !== "done")
  ) {
    throw new Error("task.toggle-status must return { pageId, status }");
  }

  expect(Object.keys(result).sort()).toStrictEqual(["pageId", "status"]);

  return {
    pageId: result.pageId,
    status: result.status,
  };
}

function createTaskPageWithMetadata(
  runtime: AppRuntime,
  input: {
    title: string;
    sourcePageId: string;
    sourceBlockId: string;
    status: "todo" | "done";
  },
): MarkdownPage {
  const taskPage = runtime.pages.create({
    title: input.title,
    body: createEmptyStructuredDocument(),
  });

  writeTaskMetadataDirectly(runtime, {
    taskPageId: taskPage.id,
    sourcePageId: input.sourcePageId,
    sourceBlockId: input.sourceBlockId,
    status: input.status,
  });

  return taskPage;
}

function writeTaskMetadataDirectly(
  runtime: AppRuntime,
  input: {
    taskPageId: string;
    sourcePageId: string;
    sourceBlockId: string;
    status: "todo" | "done";
  },
): void {
  runtime.metadata.set({
    pageId: input.taskPageId,
    namespace: taskNamespace,
    key: "enabled",
    value: true,
    valueType: "boolean",
    sourcePluginId: taskNamespace,
  });
  runtime.metadata.set({
    pageId: input.taskPageId,
    namespace: taskNamespace,
    key: "status",
    value: input.status,
    valueType: "string",
    sourcePluginId: taskNamespace,
  });
  runtime.metadata.set({
    pageId: input.taskPageId,
    namespace: taskNamespace,
    key: "sourcePageId",
    value: input.sourcePageId,
    valueType: "string",
    sourcePluginId: taskNamespace,
  });
  runtime.metadata.set({
    pageId: input.taskPageId,
    namespace: taskNamespace,
    key: "sourceBlockId",
    value: input.sourceBlockId,
    valueType: "string",
    sourcePluginId: taskNamespace,
  });
}

function expectTaskMetadata(
  runtime: AppRuntime,
  input: {
    taskPageId: string;
    sourcePageId: string;
    sourceBlockId: string;
    status: "todo" | "done";
  },
): void {
  const records = runtime.metadata.list({
    pageId: input.taskPageId,
    namespace: taskNamespace,
  });

  expect(records).toEqual(
    expect.arrayContaining([
      expectTaskMetadataRecord("enabled", true, "boolean"),
      expectTaskMetadataRecord("status", input.status, "string"),
      expectTaskMetadataRecord("sourcePageId", input.sourcePageId, "string"),
      expectTaskMetadataRecord("sourceBlockId", input.sourceBlockId, "string"),
    ]),
  );
}

function expectTaskMetadataRecord(
  key: string,
  value: unknown,
  valueType: string,
): Partial<MetadataRecord> {
  return expect.objectContaining({
    namespace: taskNamespace,
    key,
    value,
    valueType,
    sourcePluginId: taskNamespace,
  }) as Partial<MetadataRecord>;
}

function expectTaskEvent(
  runtime: AppRuntime,
  input: {
    eventId: string;
    taskPageId: string;
    sourcePageId: string;
    sourceBlockId: string;
    type: "completed" | "reopened";
    previousStatus: "todo" | "done";
    status: "todo" | "done";
    createdAt: string;
  },
): void {
  const events = runtime.events.list({
    pageId: input.taskPageId,
    namespace: taskNamespace,
  });

  expect(events).toStrictEqual([
    expect.objectContaining({
      id: input.eventId,
      pageId: input.taskPageId,
      namespace: taskNamespace,
      type: input.type,
      sourcePluginId: taskNamespace,
      createdAt: input.createdAt,
      payload: {
        taskPageId: input.taskPageId,
        sourcePageId: input.sourcePageId,
        sourceBlockId: input.sourceBlockId,
        previousStatus: input.previousStatus,
        status: input.status,
      },
    }) as AppEvent,
  ]);
}

function expectSingleTaskPageForSource(
  runtime: AppRuntime,
  sourcePageId: string,
  sourceBlockId: string,
): MarkdownPage {
  const taskPages = taskPagesForSource(runtime, sourcePageId, sourceBlockId);

  expect(taskPages).toHaveLength(1);

  const [taskPage] = taskPages;

  if (taskPage === undefined) {
    throw new Error(
      `Expected one task page for ${sourcePageId}/${sourceBlockId}`,
    );
  }

  return taskPage;
}

function taskPagesForSource(
  runtime: AppRuntime,
  sourcePageId: string,
  sourceBlockId: string,
): MarkdownPage[] {
  const sourcePageRecords = runtime.metadata
    .list({ namespace: taskNamespace, key: "sourcePageId" })
    .filter((record) => record.value === sourcePageId);
  const sourceBlockPageIds = new Set(
    runtime.metadata
      .list({ namespace: taskNamespace, key: "sourceBlockId" })
      .filter((record) => record.value === sourceBlockId)
      .map((record) => record.pageId),
  );

  return sourcePageRecords
    .filter((record) => sourceBlockPageIds.has(record.pageId))
    .map((record) => runtime.pages.get(record.pageId));
}

function expectSourceBlock(
  runtime: AppRuntime,
  input: {
    sourcePageId: string;
    sourceBlockId: string;
    text: string;
    attrs: Record<string, unknown> | undefined;
  },
): void {
  const sourcePage = runtime.pages.get(input.sourcePageId);
  const sourceBlock = findTopLevelBlock(sourcePage, input.sourceBlockId);

  expect(sourceBlock).toEqual(
    expect.objectContaining({
      blockId: input.sourceBlockId,
      type: "markdown.line",
      text: input.text,
      ...(input.attrs === undefined ? {} : { attrs: input.attrs }),
    }),
  );

  if (input.attrs === undefined) {
    expect(sourceBlock.attrs).toBeUndefined();
  }
}

function findTopLevelBlock(page: MarkdownPage, blockId: string): BlockNode {
  const block = page.body.content.find(
    (candidate) => candidate.blockId === blockId,
  );

  if (block === undefined) {
    throw new Error(`Missing block ${blockId} in page ${page.id}`);
  }

  return block;
}

function snapshotPageMetadataEventState(runtime: AppRuntime): {
  pages: MarkdownPage[];
  metadata: MetadataRecord[];
  events: AppEvent[];
} {
  return {
    pages: runtime.pages.list({ includeArchived: true }),
    metadata: runtime.metadata.list(),
    events: runtime.events.list(),
  };
}

function editorDocumentFromRuntimePage(
  page: MarkdownPage,
): MarkdownEditorDocument {
  return {
    id: page.id,
    title: page.title,
    markdown: exportStructuredDocumentToMarkdown(page.body),
    body: page.body,
  };
}

function renderMarkdownPageEditor(
  runtime: AppRuntime,
  props: TaskCheckboxMarkdownPageEditorProps,
) {
  const Editor = getMarkdownPageEditorComponent(runtime);

  return render(<Editor {...props} />);
}

function getMarkdownPageEditorComponent(
  runtime: AppRuntime,
): ComponentType<TaskCheckboxMarkdownPageEditorProps> {
  const pageEditor = runtime.registries.views.get(
    "markdown.page-editor",
  ) as unknown as {
    component: ComponentType<TaskCheckboxMarkdownPageEditorProps>;
  };

  return pageEditor.component;
}

function lastCommandPayloadFor(
  execute: ReturnType<typeof vi.fn>,
  commandId: string,
): unknown {
  const matchingCalls = execute.mock.calls.filter((call) => call[0] === commandId);
  const lastCall = matchingCalls[matchingCalls.length - 1];

  if (lastCall === undefined) {
    throw new Error(`Expected ${commandId} to be executed`);
  }

  return lastCall[1];
}

function commandPayloadsFor(
  execute: ReturnType<typeof vi.fn>,
  commandId: string,
): unknown[] {
  return execute.mock.calls
    .filter((call) => call[0] === commandId)
    .map((call) => call[1]);
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

function createDeferred<Value>(): Deferred<Value> {
  let resolve: Deferred<Value>["resolve"] | undefined;
  let reject: Deferred<Value>["reject"] | undefined;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  if (resolve === undefined || reject === undefined) {
    throw new Error("Failed to create deferred promise");
  }

  return {
    promise,
    resolve,
    reject,
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
