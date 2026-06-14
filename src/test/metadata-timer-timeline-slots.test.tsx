import { execFile } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "../App";
import { BUILT_IN_PLUGINS, createAppRuntime, type AppRuntime } from "../bootstrap";
import {
  createCoreStores,
  type AppPlugin,
  type BlockNode,
  type CoreStores,
  type DbQuery,
  type MarkdownPage,
  type MetadataValueType,
  type NativeBridge,
  type StructuredMarkdownDocument,
} from "../core";
import { disallowedNativeSurfaceChanges } from "./native-surface-guard";

type NativeBridgeTransactionResult<Response> =
  Response extends readonly unknown[]
    ? number extends Response["length"]
      ? Array<Response>
      : Response
    : Array<Response>;

type CreateRuntimeOptions = {
  builtInPlugins?: readonly AppPlugin[];
  eventIds?: readonly string[];
  metadataIds?: readonly string[];
  pageIds?: readonly string[];
};

type CapturedProps = Record<string, unknown>;

type SourceFile = {
  filePath: string;
  source: string;
};

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const execFileAsync = promisify(execFile);

const homeTitle = "Home";
const taskPluginId = "task";
const tagPluginId = "tag";
const timerPluginId = "timer";
const metadataUiPluginId = "metadata-ui";
const pageHeaderMetadataSlot = "page.header.metadata";
const pageTimelineSlot = "page.timeline";
const globalFloatingSlot = "global.floating";
const timerStartCommandId = "timer.start";
const timerPauseCommandId = "timer.pause";
const timerResumeCommandId = "timer.resume";
const timerStopCommandId = "timer.stop";
const task039StartedAt = "2026-05-31T00:00:00.000Z";
const unsafeToken =
  "RAW_SLOT_FAILURE_TOKEN /home/aac6fef/.config/mirabilis/openai-api-key SELECT * FROM core_pages plugin=timer";

const appShellEntrypoints = ["src/App.tsx", "src/shell", "src/providers"];
const task039TestFile = "src/test/metadata-timer-timeline-slots.test.tsx";
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
  "CHANGELOG.md",
];
const sourceExtensions = new Set([".ts", ".tsx"]);

describe("TASK-039 metadata, timer, and timeline app-shell slots", () => {
  afterEach(() => {
    if (vi.isFakeTimers()) {
      act(() => {
        vi.runOnlyPendingTimers();
      });
    }

    vi.useRealTimers();
  });

  it("mounts page metadata below the workspace title and above the editor with Task, Tag, and Timer controls", async () => {
    const runtime = await createRuntime({
      metadataIds: createSequence("metadata", 12),
      pageIds: ["home-page"],
    });
    const user = userEvent.setup();
    const homePage = createPage(runtime, homeTitle, "Editable Home body");

    setTaskMetadata(runtime, homePage.id, {
      due: "2026-06-03",
      enabled: true,
      scheduled: "2026-06-01",
      sourceBlockId: "source-block-1",
      sourcePageId: "source-page-1",
      status: "todo",
    });
    setTags(runtime, homePage.id, [
      "focus",
      "<script>alert(1)</script>",
    ]);
    renderReadyApp(runtime);

    const main = await screen.findByRole("main", { name: /home/i });
    const workspaceTitle = within(main).getByRole("heading", {
      name: /^Home Workspace$/i,
    });
    const editor = await within(main).findByRole("textbox", {
      name: /markdown/i,
    });
    const metadataRegion = await within(main).findByRole("region", {
      name: /page metadata/i,
    });

    expectElementOrder(workspaceTitle, metadataRegion);
    expectElementOrder(metadataRegion, editor);

    const taskMetadata = within(metadataRegion).getByRole("group", {
      name: /task metadata/i,
    });

    expect(within(taskMetadata).getByText("Status")).toBeVisible();
    expect(within(taskMetadata).getByText("todo")).toBeVisible();
    expect(within(taskMetadata).getByText("Scheduled")).toBeVisible();
    expect(within(taskMetadata).getByText("2026-06-01")).toBeVisible();
    expect(within(taskMetadata).queryByRole("button")).not.toBeInTheDocument();
    expect(within(taskMetadata).queryByRole("textbox")).not.toBeInTheDocument();

    const tags = within(metadataRegion).getByRole("region", { name: /tags/i });

    expect(within(tags).getByText("#focus")).toBeVisible();
    expect(within(tags).getByText("#<script>alert(1)</script>")).toBeVisible();
    expectNoDangerousDom();

    await user.type(within(tags).getByRole("textbox", { name: /^tag$/i }), "review");
    await user.click(within(tags).getByRole("button", { name: /add tag/i }));

    const addedTag = await within(tags).findByText("#review");

    expect(addedTag).toBeVisible();
    expect(addedTag).not.toHaveAttribute("href");
    expect(within(tags).queryByRole("link", { name: "#review" })).not.toBeInTheDocument();
    expect(within(tags).queryByRole("button", { name: /^#review$/i })).not.toBeInTheDocument();

    await user.click(
      within(tags).getByRole("button", { name: /remove #review/i }),
    );

    await waitFor(() =>
      expect(within(tags).queryByText("#review")).not.toBeInTheDocument(),
    );
    expect(
      within(metadataRegion).getByRole("button", { name: /start timer/i }),
    ).toBeEnabled();
  });

  it("starts the timer from metadata, renders the active timer through a floating portal, and shows the stopped segment in the current page timeline", async () => {
    useFakeClock(task039StartedAt);
    const runtime = await createRuntime({
      eventIds: createSequence("timer-event", 10),
      metadataIds: createSequence("metadata", 8),
      pageIds: ["home-page", "timer-page"],
    });
    const user = userEvent.setup({
      advanceTimers: (milliseconds) => vi.advanceTimersByTime(milliseconds),
    });
    createPage(runtime, homeTitle, "Home body");
    const timerPage = createPage(runtime, "Timer Focus", "Timed page body");

    renderReadyApp(runtime);
    await openRecentPage("Timer Focus");

    const main = await screen.findByRole("main", { name: /timer focus/i });
    const metadataRegion = await within(main).findByRole("region", {
      name: /page metadata/i,
    });

    await user.click(
      within(metadataRegion).getByRole("button", { name: /start timer/i }),
    );

    const activeTimer = await screen.findByRole("region", {
      name: /active timer/i,
    });

    expect(main).not.toContainElement(activeTimer);
    expect(within(activeTimer).getByText(timerPage.title)).toBeVisible();
    const elapsed = within(activeTimer).getByText("00:00:00");

    await act(async () => {
      vi.advanceTimersByTime(65_000);
    });

    expect(elapsed).toHaveTextContent("00:01:05");

    await user.click(within(activeTimer).getByRole("button", { name: /pause/i }));
    await waitFor(() =>
      expect(
        within(activeTimer).getByRole("button", { name: /resume/i }),
      ).toBeEnabled(),
    );

    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });

    expect(elapsed).toHaveTextContent("00:01:05");

    await user.click(
      within(activeTimer).getByRole("button", { name: /resume/i }),
    );
    await waitFor(() =>
      expect(
        within(activeTimer).getByRole("button", { name: /pause/i }),
      ).toBeEnabled(),
    );

    await act(async () => {
      vi.advanceTimersByTime(15_000);
    });

    expect(elapsed).toHaveTextContent("00:01:20");

    await user.click(within(activeTimer).getByRole("button", { name: /stop/i }));

    await waitFor(() =>
      expect(
        screen.queryByRole("region", { name: /active timer/i }),
      ).not.toBeInTheDocument(),
    );

    const timeline = await within(main).findByRole("region", {
      name: /time segments/i,
    });

    expect(within(timeline).getByText(/80s/u)).toBeVisible();
    expect(runtime.events.list({ namespace: "timer" })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pageId: timerPage.id,
          sourcePluginId: timerPluginId,
          type: "time_segment_created",
        }),
      ]),
    );
  });

  it("renders page timeline notes for the current page only and keeps unsafe page titles and note text inert", async () => {
    useFakeClock(task039StartedAt);
    const runtime = await createRuntime({
      eventIds: createSequence("timeline-event", 12),
      metadataIds: createSequence("metadata", 8),
      pageIds: [
        "home-page",
        "timeline-page",
        "other-timeline-page",
        "timeline-note-page",
      ],
    });
    const user = userEvent.setup({
      advanceTimers: (milliseconds) => vi.advanceTimersByTime(milliseconds),
    });
    createPage(runtime, homeTitle, "Home body");
    const page = createPage(
      runtime,
      "Timeline <img src=x onerror=alert(1)>",
      "Timeline body",
    );
    const otherPage = createPage(runtime, "Other Timeline Page", "Other body");
    const segmentId = await createStoppedSegment(runtime, page, 75_000);

    await createStoppedSegment(runtime, otherPage, 30_000);

    renderReadyApp(runtime);
    await openRecentPage("Timeline <img src=x onerror=alert(1)>");

    const main = await screen.findByRole("main", { name: /timeline/i });
    const timeline = await within(main).findByRole("region", {
      name: /time segments/i,
    });

    expect(within(timeline).getByText(/75s/u)).toBeVisible();
    expect(within(timeline).queryByText(/30s/u)).not.toBeInTheDocument();

    await user.click(
      within(timeline).getByRole("button", { name: /add note/i }),
    );

    const noteEditor = await within(timeline).findByRole("textbox", {
      name: /note/i,
    });
    const unsafeNote =
      "Initial note <script>alert(1)</script>\n[x](javascript:alert(1))\n<img src=x onerror=alert(1)>";

    await user.type(noteEditor, unsafeNote);
    await user.click(
      within(timeline).getByRole("button", { name: /save note/i }),
    );

    await waitFor(() =>
      expect(within(timeline).getByText("<script>alert(1)</script>"))
        .toBeVisible(),
    );
    expect(within(timeline).getByText("[x](javascript:alert(1))")).toBeVisible();
    expect(within(timeline).getByText("<img src=x onerror=alert(1)>"))
      .toBeVisible();
    expectNoDangerousDom();

    vi.advanceTimersByTime(30_000);

    await user.click(
      within(timeline).getByRole("button", { name: /edit note/i }),
    );

    const editEditor = await within(timeline).findByRole("textbox", {
      name: /note/i,
    });

    await user.clear(editEditor);
    await user.type(editEditor, "Updated current-page note stays inert.");
    await user.click(
      within(timeline).getByRole("button", { name: /save note/i }),
    );

    await waitFor(() =>
      expect(
        within(timeline).getByText("Updated current-page note stays inert."),
      ).toBeVisible(),
    );
    expect(within(timeline).queryByText("<script>alert(1)</script>"))
      .not.toBeInTheDocument();
    expect(timerNoteEvents(runtime, segmentId)).toHaveLength(2);
    expectNoDangerousDom();
  });

  it("keeps metadata and timeline scoped to page routes and sends Start Timer for the selected page only", async () => {
    useFakeClock(task039StartedAt);
    const runtime = await createRuntime({
      eventIds: createSequence("scope-event", 16),
      metadataIds: createSequence("scope-metadata", 16),
      pageIds: [
        "home-page",
        "page-a",
        "page-b",
        "page-a-note",
        "page-b-note",
      ],
    });
    const user = userEvent.setup({
      advanceTimers: (milliseconds) => vi.advanceTimersByTime(milliseconds),
    });
    createPage(runtime, homeTitle, "Home body");
    const pageA = createPage(runtime, "Project Alpha", "Alpha body");
    const pageB = createPage(runtime, "Project Beta", "Beta body");
    const segmentA = await createStoppedSegment(runtime, pageA, 45_000);

    await addSegmentNote(runtime, segmentA, "Alpha private note");

    const segmentB = await createStoppedSegment(runtime, pageB, 90_000);

    await addSegmentNote(runtime, segmentB, "Beta private note");
    setTags(runtime, pageA.id, ["alpha"]);
    setTags(runtime, pageB.id, ["beta"]);

    const originalExecute = runtime.commands.execute.bind(runtime.commands);
    const execute = vi.fn((commandId: string, input?: unknown) =>
      originalExecute(commandId, input),
    );

    runtime.commands.execute = execute;
    renderReadyApp(runtime);

    await openRecentPage("Project Alpha");

    const alphaMain = await screen.findByRole("main", { name: /project alpha/i });

    expect(
      within(await findPageMetadata(alphaMain)).getByText("#alpha"),
    ).toBeVisible();
    expect(
      within(await findPageTimeline(alphaMain)).getByText("Alpha private note"),
    ).toBeVisible();
    expect(screen.queryByText("#beta")).not.toBeInTheDocument();
    expect(screen.queryByText("Beta private note")).not.toBeInTheDocument();

    await user.click(await findNavigationButton(/today/i));

    const todayMain = await screen.findByRole("main", { name: /today/i });

    expect(within(todayMain).queryByRole("region", { name: /page metadata/i }))
      .not.toBeInTheDocument();
    expect(within(todayMain).queryByRole("region", { name: /time segments/i }))
      .not.toBeInTheDocument();
    expect(screen.queryByText("Alpha private note")).not.toBeInTheDocument();

    await user.click(await findNavigationButton(/reports/i));

    const reportsMain = await screen.findByRole("main", { name: /reports/i });

    expect(within(reportsMain).queryByRole("region", { name: /page metadata/i }))
      .not.toBeInTheDocument();
    expect(within(reportsMain).queryByRole("region", { name: /time segments/i }))
      .not.toBeInTheDocument();

    await openRecentPage("Project Beta");

    const betaMain = await screen.findByRole("main", { name: /project beta/i });
    const betaMetadata = await findPageMetadata(betaMain);
    const betaTimeline = await findPageTimeline(betaMain);

    expect(within(betaMetadata).getByText("#beta")).toBeVisible();
    expect(within(betaTimeline).getByText("Beta private note")).toBeVisible();
    expect(screen.queryByText("#alpha")).not.toBeInTheDocument();
    expect(screen.queryByText("Alpha private note")).not.toBeInTheDocument();

    execute.mockClear();

    await user.click(
      within(betaMetadata).getByRole("button", { name: /start timer/i }),
    );

    await waitFor(() =>
      expect(execute).toHaveBeenCalledWith(timerStartCommandId, {
        pageId: pageB.id,
      }),
    );
    expect(execute).not.toHaveBeenCalledWith(timerStartCommandId, {
      pageId: pageA.id,
    });
  });

  it("fails closed for inactive, missing, and throwing slot owners while passing only controlled props to slot contributions", async () => {
    useFakeClock(task039StartedAt);
    const capturedMetadataProps: CapturedProps[] = [];
    const capturedTimelineProps: CapturedProps[] = [];
    const capturedFloatingProps: CapturedProps[] = [];
    const inactivePlugin = createStaticSlotPlugin({
      label: "Inactive metadata leak",
      pluginId: "inactive-metadata-owner",
      slot: pageHeaderMetadataSlot,
      slotId: "inactive-metadata-owner.slot",
    });
    const runtime = await createRuntime({
      builtInPlugins: [
        ...BUILT_IN_PLUGINS,
        inactivePlugin,
        createCapturingMetadataPlugin(capturedMetadataProps),
        createCapturingTimelinePlugin(capturedTimelineProps),
        createCapturingFloatingPlugin(capturedFloatingProps),
        createThrowingSlotPlugin({
          pluginId: "throwing-metadata-owner",
          slot: pageHeaderMetadataSlot,
          slotId: "throwing-metadata-owner.slot",
        }),
        createThrowingSlotPlugin({
          pluginId: "throwing-timeline-owner",
          slot: pageTimelineSlot,
          slotId: "throwing-timeline-owner.slot",
        }),
        createThrowingSlotPlugin({
          pluginId: "throwing-floating-owner",
          slot: globalFloatingSlot,
          slotId: "throwing-floating-owner.slot",
        }),
      ],
      eventIds: createSequence("failure-event", 8),
      metadataIds: createSequence("failure-metadata", 8),
      pageIds: ["home-page"],
    });
    createPage(runtime, homeTitle, "Failure boundary body");
    await deactivatePlugin(runtime, inactivePlugin.manifest.id);
    runtime.registries.slots.register({
      id: "missing-owner.metadata",
      pluginId: "missing-owner",
      slot: pageHeaderMetadataSlot,
      component: () => <span>Missing owner metadata leak</span>,
    });
    runtime.registries.slots.register({
      id: "missing-owner.timeline",
      pluginId: "missing-owner",
      slot: pageTimelineSlot,
      component: () => <span>Missing owner timeline leak</span>,
    });
    await runtime.commands.execute(timerStartCommandId, { pageId: "home-page" });

    renderReadyApp(runtime);

    const main = await screen.findByRole("main", { name: /home/i });
    const metadataRegion = await findPageMetadata(main);
    const metadataFallback = within(metadataRegion).getByRole("alert", {
      name: /metadata contribution unavailable/i,
    });
    const timelineFallback = await within(main).findByRole("alert", {
      name: /slot contribution unavailable/i,
    });
    const floatingFallback = await screen.findByRole("alert", {
      name: /floating slot unavailable/i,
    });

    expect(within(metadataRegion).getByText("Captured metadata slot")).toBeVisible();
    expect(metadataFallback).toBeVisible();
    expect(metadataFallback).toHaveTextContent(
      /^Metadata contribution unavailable$/u,
    );
    expect(await screen.findByText("Captured timeline slot")).toBeVisible();
    expect(await screen.findByText(/no time segments/i)).toBeVisible();
    expect(timelineFallback).toBeVisible();
    expect(timelineFallback).toHaveTextContent(/^Contribution unavailable$/u);
    expect(await screen.findByText("Captured floating slot")).toBeVisible();
    expect(floatingFallback).toBeVisible();
    expect(floatingFallback).toHaveTextContent(
      /^Floating contribution unavailable$/u,
    );
    expect(screen.queryByText("Inactive metadata leak")).not.toBeInTheDocument();
    expect(screen.queryByText("Missing owner metadata leak")).not
      .toBeInTheDocument();
    expect(screen.queryByText("Missing owner timeline leak")).not
      .toBeInTheDocument();

    await waitFor(() => {
      expect(capturedMetadataProps).toHaveLength(1);
      expect(capturedTimelineProps).toHaveLength(1);
      expect(capturedFloatingProps.length).toBeGreaterThan(0);
    });

    expect(Object.keys(capturedMetadataProps[0] ?? {}).sort()).toStrictEqual([
      "commands",
      "fields",
      "pageId",
      "pluginId",
      "values",
    ]);
    expect(capturedMetadataProps[0]).toMatchObject({
      pageId: "home-page",
      pluginId: "capture-metadata-owner",
    });
    expectControlledPropSurface(capturedMetadataProps[0], {
      allowCommands: true,
    });
    expect(capturedTimelineProps[0]).toMatchObject({
      page: {
        id: "home-page",
        title: homeTitle,
      },
    });
    expect(Object.keys(readRecord(capturedTimelineProps[0]?.page, "timeline page")).sort())
      .toStrictEqual(["id", "title"]);
    expectControlledPropSurface(capturedTimelineProps[0]);

    for (const floatingProps of capturedFloatingProps) {
      expect(floatingProps).not.toHaveProperty("page");
      expect(floatingProps).not.toHaveProperty("pageId");
      expect(floatingProps.commands).not.toBe(runtime.commands);
      expectControlledPropSurface(floatingProps, {
        allowCommands: true,
      });
    }

    expectNoSensitiveTextLeak();
  });

  it("allows only timer-owned floating controls to dispatch timer pause/resume/stop and blocks foreign global.floating command attempts", async () => {
    useFakeClock(task039StartedAt);
    const runtime = await createRuntime({
      builtInPlugins: [
        ...BUILT_IN_PLUGINS,
        createForeignFloatingStopAttemptPlugin(),
      ],
      eventIds: createSequence("floating-event", 12),
      metadataIds: createSequence("floating-metadata", 8),
      pageIds: ["home-page"],
    });
    const user = userEvent.setup({
      advanceTimers: (milliseconds) => vi.advanceTimersByTime(milliseconds),
    });
    createPage(runtime, homeTitle, "Floating command body");

    const originalExecute = runtime.commands.execute.bind(runtime.commands);
    const execute = vi.fn((commandId: string, input?: unknown) =>
      originalExecute(commandId, input),
    );

    runtime.commands.execute = execute;
    renderReadyApp(runtime);

    const metadataRegion = await findPageMetadata(
      await screen.findByRole("main", { name: /home/i }),
    );

    await user.click(
      within(metadataRegion).getByRole("button", { name: /start timer/i }),
    );

    const activeTimer = await screen.findByRole("region", {
      name: /active timer/i,
    });

    await waitFor(() =>
      expect(execute).toHaveBeenCalledWith(timerStartCommandId, {
        pageId: "home-page",
      }),
    );
    execute.mockClear();

    await user.click(within(activeTimer).getByRole("button", { name: /pause/i }));
    await waitFor(() =>
      expect(execute.mock.calls).toStrictEqual([[timerPauseCommandId, {}]]),
    );

    await user.click(
      within(activeTimer).getByRole("button", { name: /resume/i }),
    );
    await waitFor(() =>
      expect(execute.mock.calls).toStrictEqual([
        [timerPauseCommandId, {}],
        [timerResumeCommandId, {}],
      ]),
    );

    await user.click(
      await screen.findByRole("button", { name: /foreign stop attack/i }),
    );

    await waitFor(() =>
      expect(screen.getByRole("status", { name: /foreign stop attempt/i }))
        .toHaveTextContent(/blocked/i),
    );
    expect(execute.mock.calls).toStrictEqual([
      [timerPauseCommandId, {}],
      [timerResumeCommandId, {}],
    ]);

    await user.click(within(activeTimer).getByRole("button", { name: /stop/i }));

    await waitFor(() =>
      expect(execute.mock.calls).toStrictEqual([
        [timerPauseCommandId, {}],
        [timerResumeCommandId, {}],
        [timerStopCommandId, {}],
      ]),
    );
  });

  it("keeps TASK-039 static boundaries free of direct business imports, native drift, deprecated APIs, and unsafe test interaction patterns", async () => {
    const appShellFiles = await listExistingSourceFiles(appShellEntrypoints);
    const sourceFiles = await readSourceFiles(appShellFiles);
    const task039Source = await readFile(
      path.join(repoRoot, task039TestFile),
      "utf8",
    );

    expect(findForbiddenAppShellStaticPatterns(sourceFiles)).toStrictEqual([]);
    expect(findForbiddenTask039TestPatterns(task039Source)).toStrictEqual([]);
    expect(
      await disallowedNativeSurfaceChanges(
        await listNativeSurfaceChangesFromMaster(nativeSurfaceEntrypoints),
      ),
    ).toStrictEqual([]);
  });
});

function renderReadyApp(runtime: AppRuntime) {
  return render(<App initializeRuntime={vi.fn(async () => runtime)} />);
}

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
    builtInPlugins: options.builtInPlugins,
    createNativeBridge: () => createNoopNativeBridge(),
    createStorageFacade: () => ({ persistence: "in-memory-core" }),
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
      async exportMarkdown() {
        return undefined;
      },
      async importMarkdown() {
        return "";
      },
    },
    notifications: {
      async notify() {
        return undefined;
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
  };
}

function createPage(
  runtime: AppRuntime,
  title: string,
  text: string,
): MarkdownPage {
  return runtime.pages.create({
    title,
    body: documentWithText(`${title.toLowerCase().replace(/\W+/gu, "-")}-body`, text),
  });
}

function documentWithText(
  blockId: string,
  text: string,
): StructuredMarkdownDocument {
  const content: BlockNode[] =
    text.length === 0
      ? []
      : [
          {
            blockId,
            text,
            type: "markdown.line",
          },
        ];

  return {
    content,
    type: "doc",
  };
}

function setTaskMetadata(
  runtime: AppRuntime,
  pageId: string,
  input: {
    due: string;
    enabled: boolean;
    scheduled: string;
    sourceBlockId: string;
    sourcePageId: string;
    status: "todo" | "done";
  },
): void {
  setMetadata(runtime, pageId, {
    key: "enabled",
    value: input.enabled,
    valueType: "boolean",
  });
  setMetadata(runtime, pageId, {
    key: "status",
    value: input.status,
    valueType: "string",
  });
  setMetadata(runtime, pageId, {
    key: "sourcePageId",
    value: input.sourcePageId,
    valueType: "string",
  });
  setMetadata(runtime, pageId, {
    key: "sourceBlockId",
    value: input.sourceBlockId,
    valueType: "string",
  });
  setMetadata(runtime, pageId, {
    key: "scheduled",
    value: input.scheduled,
    valueType: "date",
  });
  setMetadata(runtime, pageId, {
    key: "due",
    value: input.due,
    valueType: "date",
  });
}

function setMetadata(
  runtime: AppRuntime,
  pageId: string,
  input: {
    key: string;
    value: unknown;
    valueType: MetadataValueType;
  },
): void {
  runtime.metadata.set({
    pageId,
    namespace: taskPluginId,
    key: input.key,
    value: input.value as never,
    valueType: input.valueType,
    sourcePluginId: taskPluginId,
  });
}

function setTags(runtime: AppRuntime, pageId: string, tags: string[]): void {
  runtime.metadata.set({
    pageId,
    namespace: tagPluginId,
    key: "tags",
    sourcePluginId: tagPluginId,
    value: tags,
    valueType: "json",
  });
}

function useFakeClock(isoInstant: string): void {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(isoInstant));
}

async function createStoppedSegment(
  runtime: AppRuntime,
  page: MarkdownPage,
  durationMs: number,
): Promise<string> {
  const startResult = await runtime.commands.execute(timerStartCommandId, {
    pageId: page.id,
  });
  const segmentId = readNonBlankString(
    readRecord(readRecord(startResult, "timer start").activeTimer, "active timer")
      .segmentId,
    "segmentId",
  );

  vi.advanceTimersByTime(durationMs);

  await runtime.commands.execute(timerStopCommandId, {});

  return segmentId;
}

async function addSegmentNote(
  runtime: AppRuntime,
  segmentId: string,
  markdown: string,
): Promise<void> {
  await runtime.commands.execute("timer.add-note", {
    markdown,
    segmentId,
  });
}

function timerNoteEvents(runtime: AppRuntime, segmentId: string) {
  return runtime.events
    .list({ namespace: "timer" })
    .filter((event) => {
      const payload = event.payload;

      return (
        event.type === "time_segment_note_added" &&
        isRecord(payload) &&
        payload.segmentId === segmentId
      );
    });
}

async function openRecentPage(title: string): Promise<void> {
  const user = userEvent.setup({
    advanceTimers: (milliseconds) => vi.advanceTimersByTime(milliseconds),
  });
  const navigation = await screen.findByRole("navigation", {
    name: /^Workspace$/i,
  });
  const recentPages = within(navigation).getByRole("list", {
    name: /^Recent pages$/i,
  });

  await user.click(
    within(recentPages).getByRole("button", {
      name: new RegExp(`^${escapeRegExp(title)}(?:\\s|$)`, "iu"),
    }),
  );
}

async function findNavigationButton(name: RegExp): Promise<HTMLElement> {
  const navigation = await screen.findByRole("navigation", {
    name: /^Workspace$/i,
  });

  return within(navigation).findByRole("button", { name });
}

function findPageMetadata(main: HTMLElement): Promise<HTMLElement> {
  return within(main).findByRole("region", { name: /page metadata/i });
}

function findPageTimeline(main: HTMLElement): Promise<HTMLElement> {
  return within(main).findByRole("region", { name: /time segments/i });
}

function expectElementOrder(before: HTMLElement, after: HTMLElement): void {
  expect(
    before.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
}

function createCapturingMetadataPlugin(capturedProps: CapturedProps[]): AppPlugin {
  return {
    manifest: {
      id: "capture-metadata-owner",
      minAppVersion: "0.1.0",
      name: "Capture metadata owner",
      version: "1.0.0",
      contributes: {
        metadataFields: [
          {
            id: "capture-metadata-owner.status",
            key: "status",
            namespace: "capture-metadata-owner",
            valueType: "string",
          },
        ],
      },
    },
    register(ctx) {
      ctx.slots.register({
        id: "capture-metadata-owner.slot",
        slot: pageHeaderMetadataSlot,
        component: (props: CapturedProps) => {
          capturedProps.push(props);

          return <span>Captured metadata slot</span>;
        },
      });
    },
  };
}

function createCapturingTimelinePlugin(capturedProps: CapturedProps[]): AppPlugin {
  return {
    manifest: {
      id: "capture-timeline-owner",
      minAppVersion: "0.1.0",
      name: "Capture timeline owner",
      version: "1.0.0",
    },
    register(ctx) {
      ctx.slots.register({
        id: "capture-timeline-owner.slot",
        slot: pageTimelineSlot,
        component: (props: CapturedProps) => {
          capturedProps.push(props);

          return <span>Captured timeline slot</span>;
        },
      });
    },
  };
}

function createCapturingFloatingPlugin(capturedProps: CapturedProps[]): AppPlugin {
  return {
    manifest: {
      id: "capture-floating-owner",
      minAppVersion: "0.1.0",
      name: "Capture floating owner",
      version: "1.0.0",
    },
    register(ctx) {
      ctx.slots.register({
        id: "capture-floating-owner.slot",
        slot: globalFloatingSlot,
        component: (props: CapturedProps) => {
          capturedProps.push(props);

          return <span>Captured floating slot</span>;
        },
      });
    },
  };
}

function createThrowingSlotPlugin(input: {
  pluginId: string;
  slot: string;
  slotId: string;
}): AppPlugin {
  return {
    manifest: {
      id: input.pluginId,
      minAppVersion: "0.1.0",
      name: `${input.pluginId} plugin`,
      version: "1.0.0",
      ...(input.slot === pageHeaderMetadataSlot
        ? {
            contributes: {
              metadataFields: [
                {
                  id: `${input.pluginId}.field`,
                  key: "field",
                  namespace: input.pluginId,
                  valueType: "string",
                },
              ],
            },
          }
        : {}),
    },
    register(ctx) {
      ctx.slots.register({
        id: input.slotId,
        slot: input.slot,
        component: () => {
          throw new Error(unsafeToken);
        },
      });
    },
  };
}

function createStaticSlotPlugin(input: {
  label: string;
  pluginId: string;
  slot: string;
  slotId: string;
}): AppPlugin {
  return {
    manifest: {
      id: input.pluginId,
      minAppVersion: "0.1.0",
      name: `${input.pluginId} plugin`,
      version: "1.0.0",
      ...(input.slot === pageHeaderMetadataSlot
        ? {
            contributes: {
              metadataFields: [
                {
                  id: `${input.pluginId}.field`,
                  key: "field",
                  namespace: input.pluginId,
                  valueType: "string",
                },
              ],
            },
          }
        : {}),
    },
    register(ctx) {
      ctx.slots.register({
        id: input.slotId,
        slot: input.slot,
        component: () => <span>{input.label}</span>,
      });
    },
  };
}

function createForeignFloatingStopAttemptPlugin(): AppPlugin {
  return {
    manifest: {
      id: "foreign-floating-owner",
      minAppVersion: "0.1.0",
      name: "Foreign floating owner",
      version: "1.0.0",
    },
    register(ctx) {
      ctx.slots.register({
        id: "foreign-floating-owner.stop-attempt",
        slot: globalFloatingSlot,
        component: ForeignFloatingStopAttempt,
      });
    },
  };
}

function ForeignFloatingStopAttempt(props: CapturedProps) {
  const [status, setStatus] = useState("ready");

  async function attemptStop(): Promise<void> {
    const commands = readCommands(props);

    if (commands === undefined) {
      setStatus("blocked");
      return;
    }

    try {
      await commands.execute(timerStopCommandId, {});
      setStatus("executed");
    } catch {
      setStatus("blocked");
    }
  }

  return (
    <section aria-label="Foreign floating command probe">
      <button
        type="button"
        onClick={() => {
          void attemptStop();
        }}
      >
        Foreign stop attack
      </button>
      <p aria-label="Foreign stop attempt" role="status">
        {status}
      </p>
    </section>
  );
}

function readCommands(
  props: CapturedProps,
):
  | {
      execute(commandId: string, input?: unknown): Promise<unknown>;
    }
  | undefined {
  const commands = props.commands;

  if (
    isRecord(commands) &&
    typeof commands.execute === "function"
  ) {
    return commands as {
      execute(commandId: string, input?: unknown): Promise<unknown>;
    };
  }

  return undefined;
}

async function deactivatePlugin(
  runtime: AppRuntime,
  pluginId: string,
): Promise<void> {
  const pluginHost = runtime.pluginHost as AppRuntime["pluginHost"] & {
    deactivate?(targetPluginId: string): Promise<unknown>;
  };

  await pluginHost.deactivate?.(pluginId);
}

function expectControlledPropSurface(
  props: CapturedProps | undefined,
  options: { allowCommands?: boolean } = {},
): void {
  expect(props).toBeDefined();
  expect(collectUnsafePropPaths(props, options)).toStrictEqual([]);
}

function collectUnsafePropPaths(
  value: unknown,
  options: { allowCommands?: boolean },
  pathPrefix = "props",
  seen = new WeakSet<object>(),
): string[] {
  if (value === null || typeof value !== "object") {
    return [];
  }

  if (seen.has(value)) {
    return [`${pathPrefix}: cycle`];
  }

  seen.add(value);

  const unsafePaths: string[] = [];
  const entries = Array.isArray(value)
    ? value.map((entry, index) => [String(index), entry] as const)
    : Object.entries(value);

  for (const [key, child] of entries) {
    const childPath = `${pathPrefix}.${key}`;

    if (isUnsafePropKey(key, options)) {
      unsafePaths.push(childPath);
      continue;
    }

    if (typeof child === "function") {
      if (!(options.allowCommands === true && childPath === "props.commands.execute")) {
        unsafePaths.push(childPath);
      }

      continue;
    }

    unsafePaths.push(
      ...collectUnsafePropPaths(child, options, childPath, seen),
    );
  }

  seen.delete(value);

  return unsafePaths;
}

function isUnsafePropKey(
  key: string,
  options: { allowCommands?: boolean },
): boolean {
  const normalized = key.toLowerCase().replace(/[-_]/gu, "");
  const unsafeKeys = new Set([
    "body",
    "database",
    "db",
    "events",
    "filesystem",
    "file",
    "files",
    "metadata",
    "nativebridge",
    "pagebody",
    "path",
    "pluginhost",
    "provider",
    "providersettings",
    "registries",
    "registry",
    "runtime",
    "services",
    "sql",
    "sqlite",
    "stores",
    "token",
    "tokens",
    "secret",
    "secrets",
  ]);

  if (normalized === "commands") {
    return options.allowCommands !== true;
  }

  return unsafeKeys.has(normalized);
}

function expectNoDangerousDom(): void {
  // Security assertions need direct DOM inspection for executable elements.
  // eslint-disable-next-line testing-library/no-node-access
  expect(document.querySelector("script")).toBeNull();
  // eslint-disable-next-line testing-library/no-node-access
  expect(document.querySelector("img")).toBeNull();
  // eslint-disable-next-line testing-library/no-node-access
  expect(document.querySelector("iframe")).toBeNull();

  // Security-only scan: Testing Library cannot assert absence of executable
  // attributes across every rendered node.
  for (const element of [...document.querySelectorAll("*")]) {
    for (const attribute of [...element.attributes]) {
      expect(attribute.name).not.toMatch(/^on/iu);
      expect(attribute.value).not.toMatch(
        /(?:javascript:|data:text\/html|<script\b)/iu,
      );

      if (element instanceof HTMLAnchorElement && attribute.name === "href") {
        throw new Error(`Unexpected TASK-039 link href ${attribute.value}`);
      }
    }
  }
}

function expectNoSensitiveTextLeak(): void {
  expect(document.body).not.toHaveTextContent(/RAW_SLOT_FAILURE_TOKEN/u);
  expect(document.body).not.toHaveTextContent(/openai-api-key/u);
  expect(document.body).not.toHaveTextContent(/SELECT \*/u);
  expect(document.body).not.toHaveTextContent(/plugin=timer/u);
  expect(document.body).not.toHaveTextContent(/\/home\/aac6fef/u);
}

function readRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`Expected ${label} to be a record`);
  }

  return value;
}

function readNonBlankString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Expected ${label} to be a non-blank string`);
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function createSequence(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_unused, index) => `${prefix}-${index}`);
}

function createSequenceFactory(values: readonly string[]): () => string {
  let index = 0;

  return () => {
    const value = values[index];

    index += 1;

    return value ?? `generated-id-${index}`;
  };
}

async function listExistingSourceFiles(
  relativePaths: readonly string[],
): Promise<string[]> {
  const fileGroups = await Promise.all(
    relativePaths.map((relativePath) =>
      listSourceFilesIfExists(path.join(repoRoot, relativePath)),
    ),
  );

  return fileGroups.flat().sort();
}

async function listSourceFilesIfExists(absolutePath: string): Promise<string[]> {
  const entry = await statIfExists(absolutePath);

  if (entry === undefined) {
    return [];
  }

  if (entry.isFile()) {
    return sourceExtensions.has(path.extname(absolutePath)) ? [absolutePath] : [];
  }

  if (!entry.isDirectory()) {
    return [];
  }

  const childEntries = await readdir(absolutePath, { withFileTypes: true });
  const childFiles = await Promise.all(
    childEntries.map((childEntry) =>
      listSourceFilesIfExists(path.join(absolutePath, childEntry.name)),
    ),
  );

  return childFiles.flat();
}

async function readSourceFiles(filePaths: readonly string[]): Promise<SourceFile[]> {
  return Promise.all(
    filePaths.map(async (filePath) => ({
      filePath,
      source: await readFile(filePath, "utf8"),
    })),
  );
}

async function statIfExists(absolutePath: string) {
  try {
    return await stat(absolutePath);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return undefined;
    }

    throw error;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

async function listNativeSurfaceChangesFromMaster(
  relativePaths: readonly string[],
): Promise<string[]> {
  const { stdout } = await execFileAsync("git", [
    "diff",
    "--name-only",
    "master",
    "--",
    ...relativePaths,
  ], {
    cwd: repoRoot,
  });

  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .sort();
}

function findForbiddenAppShellStaticPatterns(files: readonly SourceFile[]): string[] {
  const violations: string[] = [];

  for (const file of files) {
    const relativePath = toRepoRelativePath(file.filePath);

    for (const moduleSpecifier of collectModuleSpecifiers(file.source)) {
      const importViolation = findForbiddenAppShellImport(
        file.filePath,
        moduleSpecifier,
      );

      if (importViolation !== undefined) {
        violations.push(`${relativePath} -> ${moduleSpecifier}: ${importViolation}`);
      }
    }

    for (const sourceViolation of findForbiddenAppShellSourcePatterns(file.source)) {
      violations.push(`${relativePath}: ${sourceViolation}`);
    }
  }

  return violations.sort();
}

function findForbiddenAppShellImport(
  filePath: string,
  moduleSpecifier: string,
): string | undefined {
  if (moduleSpecifier === "@mui/material") {
    return "MUI material barrel import";
  }

  if (moduleSpecifier === "@mui/icons-material") {
    return "MUI icon barrel import";
  }

  if (
    moduleSpecifier.startsWith("@tauri-apps/") ||
    moduleSpecifier.includes("src-tauri")
  ) {
    return "raw Tauri/native import";
  }

  if (moduleSpecifier === "react-dom/test" + "-utils") {
    return "legacy React test utility import";
  }

  if (moduleSpecifier === "react-dom" || moduleSpecifier === "react-dom/client") {
    return undefined;
  }

  const resolvedPath = resolveModuleSpecifier(filePath, moduleSpecifier);

  if (resolvedPath === undefined || !resolvedPath.includes("/src/plugins/")) {
    return undefined;
  }

  if (isAllowedMetadataUiImport(resolvedPath)) {
    return undefined;
  }

  return "direct business plugin or plugin-private import";
}

function findForbiddenAppShellSourcePatterns(source: string): string[] {
  const forbiddenPatterns: Array<[RegExp, string]> = [
    [/\bReactDOM\s*\.\s*createPortal\b/u, "direct ReactDOM.createPortal usage"],
    [/\bcreatePortal\s*\(/u, "direct createPortal usage"],
    [/\bcreateMuiTheme\b/u, "deprecated createMuiTheme usage"],
    [/\bMuiThemeProvider\b/u, "deprecated MuiThemeProvider usage"],
    [/\bmakeStyles\b/u, "deprecated makeStyles usage"],
    [/\bGridLegacy\b/u, "deprecated GridLegacy usage"],
    [/\bHidden\b/u, "deprecated Hidden usage"],
    [/\bcomponentsProps\b/u, "deprecated componentsProps usage"],
    [/\bcomponents\s*=\s*\{/u, "deprecated components slot prop usage"],
    [/<ListItem\b[^>]*\bbutton\b/u, "deprecated ListItem button usage"],
    [new RegExp("\\bfire" + "Event\\b", "u"), "fire" + "Event interaction usage"],
    [/\bjest\./u, "jest global usage"],
    [
      new RegExp("\\bdelay\\s*:\\s*nu" + "ll\\b", "u"),
      "user-event disabled delay",
    ],
  ];

  return forbiddenPatterns
    .filter(([pattern]) => pattern.test(source))
    .map(([, label]) => label);
}

function findForbiddenTask039TestPatterns(source: string): string[] {
  const violations: string[] = [];
  const forbiddenPatterns: Array<[RegExp, string]> = [
    [new RegExp("\\.(?:only|skip)\\s*\\(", "u"), "exclusive or skipped test"],
    [new RegExp("\\bfire" + "Event\\b", "u"), "forbidden event helper"],
    [new RegExp("\\bje" + "st\\.", "u"), "forbidden test global"],
    [new RegExp("\\bdelay\\s*:\\s*nu" + "ll\\b", "u"), "disabled user-event delay"],
    [new RegExp("react-dom/test" + "-utils", "u"), "legacy React test utility"],
  ];
  const userInteractionPattern = new RegExp(
    "\\buser\\.(?:click|type|clear|keyboard|tab)\\(",
    "u",
  );
  const awaitedUserInteractionPattern = new RegExp(
    "\\b(?:await|return)\\s+user\\.(?:click|type|clear|keyboard|tab)\\(",
    "u",
  );

  for (const [pattern, label] of forbiddenPatterns) {
    if (pattern.test(source)) {
      violations.push(label);
    }
  }

  source.split("\n").forEach((line, index) => {
    if (
      userInteractionPattern.test(line) &&
      !awaitedUserInteractionPattern.test(line)
    ) {
      violations.push(`line ${index + 1}: non-awaited user interaction`);
    }
  });

  return violations.sort();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function collectModuleSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const patterns = [
    /\bimport\s+(?:type\s+)?(?:[^'"]+\s+from\s+)?["']([^"']+)["']/gu,
    /\bexport\s+(?:type\s+)?[^'"]+\s+from\s+["']([^"']+)["']/gu,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/gu,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/gu,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1];

      if (specifier !== undefined) {
        specifiers.push(specifier);
      }
    }
  }

  return specifiers;
}

function resolveModuleSpecifier(
  filePath: string,
  moduleSpecifier: string,
): string | undefined {
  if (moduleSpecifier.startsWith(".")) {
    return toPosixPath(path.resolve(path.dirname(filePath), moduleSpecifier));
  }

  if (moduleSpecifier.startsWith("src/")) {
    return toPosixPath(path.join(repoRoot, moduleSpecifier));
  }

  return moduleSpecifier;
}

function isAllowedMetadataUiImport(resolvedPath: string): boolean {
  const metadataUiPath = toPosixPath(
    path.join(repoRoot, "src", "plugins", metadataUiPluginId),
  );

  return (
    resolvedPath === metadataUiPath ||
    resolvedPath === `${metadataUiPath}/index`
  );
}

function toRepoRelativePath(filePath: string): string {
  return toPosixPath(path.relative(repoRoot, filePath));
}

function toPosixPath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}
