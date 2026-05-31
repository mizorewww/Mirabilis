import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement, type ComponentType } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BUILT_IN_PLUGINS, createAppRuntime, type AppRuntime } from "../bootstrap";
import {
  createCoreStores,
  type AppEvent,
  type CoreStores,
  type DbQuery,
  type MarkdownPage,
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

type CreateRuntimeOptions = {
  pageIds?: readonly string[];
  eventIds?: readonly string[];
};

type TimerCommandId = "timer.start" | "timer.stop" | "timer.add-note";

type TimerDtoRecord = Record<string, unknown> & {
  elapsedSeconds: number;
  pageId: string;
  pageTitle: string;
  segmentId: string;
  startedAt: string;
  status: "running" | "paused" | "stopped";
  stoppedAt?: string;
};

type ExpectedTimeSegmentDto = {
  durationSeconds: number;
  endAt: string;
  notePageId?: string;
  pageId: string;
  segmentId: string;
  startAt: string;
};

type TimeSegmentDtoRecord = Record<string, unknown> &
  ExpectedTimeSegmentDto & {
    source: "timer";
  };

type TimerPageTimelineProps = {
  page: Pick<MarkdownPage, "id" | "title">;
};

const timerPluginId = "timer";
const timerNamespace = "timer";
const timerStartedAt = "2026-05-24T01:00:00.000Z";
const pageTimelineSlot = "page.timeline";
const timerPageTimelineSlotId = "timer.page-timeline.segments";
const noteCommandId = "timer.add-note";

describe("Timer Time Segment notes and page timeline", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("registers timer.add-note and the page.timeline segment contribution without stale underscore names", async () => {
    const runtime = await createRuntime();
    const builtInPluginIds = BUILT_IN_PLUGINS.map(
      (plugin) => plugin.manifest.id,
    );
    const registeredCommandIds = runtime.registries.commands
      .list({ pluginId: timerPluginId })
      .map((command) => command.id);
    const timelineSlots = runtime.registries.slots.list({
      pluginId: timerPluginId,
      slot: pageTimelineSlot,
    });

    expect(builtInPluginIds).toContain(timerPluginId);
    expect(registeredCommandIds).toContain(noteCommandId);
    expect(registeredCommandIds).not.toContain("timer.add_note");
    expect(timelineSlots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: timerPageTimelineSlotId,
          pluginId: timerPluginId,
          slot: pageTimelineSlot,
        }),
      ]),
    );
  });

  it("rejects unknown, active-only, and unsafe timer.add-note payloads without mutation", async () => {
    useFakeClock(timerStartedAt);
    const runtime = await createRuntime({
      pageIds: ["active-note-page"],
      eventIds: [
        "event-active-started",
        "event-active-stopped",
        "event-active-time-segment-created",
      ],
    });
    const page = createPage(runtime, "Active note rejection");
    const startResult = await executeTimerCommand(runtime, "timer.start", {
      pageId: page.id,
    });
    const activeTimer = expectResultActiveTimer(startResult, page);
    const originalEvents = listTimerEvents(runtime);
    const originalPages = runtime.pages.list({ includeArchived: true });
    const originalMetadata = runtime.metadata.list({ namespace: timerNamespace });
    const invalidPayloads: Array<{ input: unknown; label: string }> = [
      {
        input: { segmentId: activeTimer.segmentId, markdown: "Still active" },
        label: "active-only segment",
      },
      {
        input: { segmentId: "missing-segment", markdown: "Unknown segment" },
        label: "unknown segment",
      },
      { input: undefined, label: "undefined payload" },
      { input: null, label: "null payload" },
      { input: {}, label: "empty payload" },
      { input: { segmentId: "", markdown: "Blank segment" }, label: "blank id" },
      { input: { segmentId: activeTimer.segmentId }, label: "missing markdown" },
      { input: { markdown: "Missing id" }, label: "missing segmentId" },
      {
        input: {
          segmentId: activeTimer.segmentId,
          markdown: "Caller note page",
          notePageId: "caller-note-page",
        },
        label: "caller notePageId",
      },
      {
        input: {
          segmentId: activeTimer.segmentId,
          markdown: "Caller page",
          pageId: page.id,
        },
        label: "caller pageId",
      },
      {
        input: {
          segmentId: activeTimer.segmentId,
          markdown: "Caller source",
          sourcePluginId: timerPluginId,
        },
        label: "caller sourcePluginId",
      },
      {
        input: [activeTimer.segmentId, "Array markdown"],
        label: "array payload",
      },
      {
        input: new TimerNotePayload(activeTimer.segmentId, "Class markdown"),
        label: "class instance payload",
      },
      {
        input: createAccessorNotePayload(activeTimer.segmentId, "Accessor note"),
        label: "accessor payload",
      },
      {
        input: createSymbolExtraNotePayload(activeTimer.segmentId, "Symbol note"),
        label: "symbol-key payload",
      },
      {
        input: createNonEnumerableExtraNotePayload(
          activeTimer.segmentId,
          "Non-enumerable note",
        ),
        label: "non-enumerable payload",
      },
      {
        input: createPrototypeCarriedNotePayload(
          activeTimer.segmentId,
          "Prototype note",
        ),
        label: "prototype-carried payload",
      },
      {
        input: createNullPrototypeNotePayload(
          activeTimer.segmentId,
          "Null prototype note",
        ),
        label: "non-empty null-prototype payload",
      },
    ];

    for (const { input, label } of invalidPayloads) {
      await expect(
        executeTimerCommand(runtime, "timer.add-note", input),
        label,
      ).rejects.toBeInstanceOf(Error);
      expect(listTimerEvents(runtime), label).toStrictEqual(originalEvents);
      expect(runtime.pages.list({ includeArchived: true }), label).toStrictEqual(
        originalPages,
      );
      expect(runtime.metadata.list({ namespace: timerNamespace }), label)
        .toStrictEqual(originalMetadata);
    }

    const stopResult = await executeTimerCommand(runtime, "timer.stop", {});
    expectCreatedSegmentResult(stopResult, {
      durationSeconds: 0,
      endAt: timerStartedAt,
      pageId: page.id,
      segmentId: activeTimer.segmentId,
      startAt: activeTimer.startedAt,
    });
    expectTimerEvents(runtime, ["started", "stopped", "time_segment_created"]);
  });

  it("creates a Markdown Page note for a stopped segment and updates the same note page later", async () => {
    useFakeClock(timerStartedAt);
    const runtime = await createRuntime({
      pageIds: ["noted-segment-page", "noted-segment-note-page"],
      eventIds: [
        "event-note-started",
        "event-note-stopped",
        "event-note-segment-created",
        "event-note-added",
        "event-note-updated",
      ],
    });
    const page = createPage(runtime, "Noted stopped segment");
    const stopped = await createStoppedSegment(runtime, page, 120_000);
    const originalSegmentPayload = expectEventPayload(
      stopped.segmentEvent,
      "original segment payload",
    );

    vi.advanceTimersByTime(15_000);

    const firstResult = await executeTimerCommand(runtime, "timer.add-note", {
      segmentId: stopped.segment.segmentId,
      markdown: "# Time Segment Note\nInitial decisions stayed plugin-owned.",
    });

    const firstNoteEvent = expectTimeSegmentNoteEvent(
      listTimerEvents(runtime)[3],
      {
        notePageId: "noted-segment-note-page",
        notedAt: "2026-05-24T01:02:15.000Z",
        pageId: page.id,
        segmentId: stopped.segment.segmentId,
      },
    );
    const firstNotePage = runtime.pages.get(firstNoteEvent.notePageId);

    expectAddNoteResult(firstResult, firstNoteEvent.notePageId);
    expect(runtime.pages.list({ includeArchived: true })).toHaveLength(2);
    expect(firstNotePage.title).toMatch(/time segment note/iu);
    expect(pageText(firstNotePage)).toContain(
      "Initial decisions stayed plugin-owned.",
    );

    vi.advanceTimersByTime(30_000);

    const secondResult = await executeTimerCommand(runtime, "timer.add-note", {
      segmentId: stopped.segment.segmentId,
      markdown: "# Time Segment Note\nUpdated blockers and next action.",
    });

    const secondNoteEvent = expectTimeSegmentNoteEvent(
      listTimerEvents(runtime)[4],
      {
        notePageId: firstNoteEvent.notePageId,
        notedAt: "2026-05-24T01:02:45.000Z",
        pageId: page.id,
        segmentId: stopped.segment.segmentId,
      },
    );
    const updatedNotePage = runtime.pages.get(secondNoteEvent.notePageId);
    const segmentPayloadAfterNotes = expectEventPayload(
      listTimerEvents(runtime)[2],
      "segment payload after note updates",
    );

    expectAddNoteResult(secondResult, firstNoteEvent.notePageId);
    expect(runtime.pages.list({ includeArchived: true })).toHaveLength(2);
    expect(secondNoteEvent.notePageId).toBe(firstNoteEvent.notePageId);
    expect(pageText(updatedNotePage)).toContain(
      "Updated blockers and next action.",
    );
    expect(pageText(updatedNotePage)).not.toContain(
      "Initial decisions stayed plugin-owned.",
    );
    expect(segmentPayloadAfterNotes).toStrictEqual(originalSegmentPayload);
    expect(segmentPayloadAfterNotes).not.toHaveProperty("notePageId");
    expectTimerEvents(runtime, [
      "started",
      "stopped",
      "time_segment_created",
      "time_segment_note_added",
      "time_segment_note_added",
    ]);
  });

  it("stores and renders unsafe note markdown as inert text", async () => {
    useFakeClock(timerStartedAt);
    const runtime = await createRuntime({
      pageIds: ["unsafe-note-page", "unsafe-note-markdown-page"],
      eventIds: [
        "event-unsafe-note-started",
        "event-unsafe-note-stopped",
        "event-unsafe-note-segment-created",
        "event-unsafe-note-added",
      ],
    });
    const page = createPage(runtime, "Unsafe note segment");
    const stopped = await createStoppedSegment(runtime, page, 60_000);
    const unsafeMarkdown =
      "# Segment note\n<script>alert(1)</script>\n<img src=x onerror=alert(1)>\n[x](javascript:alert(1))";

    await executeTimerCommand(runtime, "timer.add-note", {
      segmentId: stopped.segment.segmentId,
      markdown: unsafeMarkdown,
    });

    const notePayload = expectTimeSegmentNoteEvent(listTimerEvents(runtime)[3], {
      notePageId: "unsafe-note-markdown-page",
      notedAt: "2026-05-24T01:01:00.000Z",
      pageId: page.id,
      segmentId: stopped.segment.segmentId,
    });
    const notePage = runtime.pages.get(notePayload.notePageId);

    expect(pageText(notePage)).toContain("<script>alert(1)</script>");
    expect(pageText(notePage)).toContain("<img src=x onerror=alert(1)>");
    expect(pageText(notePage)).toContain("[x](javascript:alert(1))");

    const Timeline = getTimerPageTimelineComponent(runtime);

    render(createElement(Timeline, { page }));

    const timeline = screen.getByRole("region", { name: /time segments/i });

    expect(
      within(timeline).getByText("<script>alert(1)</script>"),
    ).toBeVisible();
    expectNoDangerousDom();
  });

  it("renders only valid current-page Timer-owned timeline segments from narrow page props", async () => {
    useFakeClock(timerStartedAt);
    const runtime = await createRuntime({
      pageIds: [
        "timeline-page",
        "timeline-other-page",
        "timeline-valid-note-page",
        "timeline-wrong-source-note-page",
        "timeline-cross-page-note-page",
        "timeline-malformed-note-page",
      ],
      eventIds: Array.from(
        { length: 12 },
        (_unused, index) => `event-timeline-${index}`,
      ),
    });
    const page = createPage(runtime, "Timeline current page");
    const otherPage = createPage(runtime, "Timeline other page");
    const stopped = await createStoppedSegment(runtime, page, 90_000);

    await executeTimerCommand(runtime, "timer.add-note", {
      segmentId: stopped.segment.segmentId,
      markdown: "Valid current-page note text.",
    });

    const wrongSourceNote = createPageWithText(
      runtime,
      "Wrong source note",
      "Wrong source note text.",
    );
    const crossPageNote = createPageWithText(
      runtime,
      "Cross page note",
      "Cross-page note text.",
    );
    const malformedNote = createPageWithText(
      runtime,
      "Malformed note",
      "Malformed segment note text.",
    );

    appendTimerSegmentEvent(runtime, {
      durationSeconds: 30,
      endAt: "2026-05-24T02:00:30.000Z",
      pageId: page.id,
      segmentId: "wrong-source-segment",
      sourcePluginId: "task",
      startAt: "2026-05-24T02:00:00.000Z",
    });
    appendTimerNoteEvent(runtime, {
      notePageId: wrongSourceNote.id,
      pageId: page.id,
      segmentId: "wrong-source-segment",
      sourcePluginId: timerPluginId,
    });
    appendTimerSegmentEvent(runtime, {
      durationSeconds: 45,
      endAt: "2026-05-24T02:10:45.000Z",
      pageId: otherPage.id,
      segmentId: "cross-page-segment",
      sourcePluginId: timerPluginId,
      startAt: "2026-05-24T02:10:00.000Z",
    });
    appendTimerNoteEvent(runtime, {
      notePageId: crossPageNote.id,
      pageId: otherPage.id,
      segmentId: "cross-page-segment",
      sourcePluginId: timerPluginId,
    });
    runtime.events.append({
      pageId: page.id,
      namespace: timerNamespace,
      type: "time_segment_created",
      sourcePluginId: timerPluginId,
      payload: {
        notePageId: malformedNote.id,
        pageId: page.id,
        segmentId: "malformed-segment",
        source: "timer",
      },
    });

    const Timeline = getTimerPageTimelineComponent(runtime);

    render(createElement(Timeline, { page }));

    const timeline = screen.getByRole("region", { name: /time segments/i });

    expect(within(timeline).getByText("Valid current-page note text."))
      .toBeVisible();
    expect(within(timeline).queryByText("Wrong source note text."))
      .not.toBeInTheDocument();
    expect(within(timeline).queryByText("Cross-page note text."))
      .not.toBeInTheDocument();
    expect(within(timeline).queryByText("Malformed segment note text."))
      .not.toBeInTheDocument();
    expectNoDangerousDom();
  });

  it("creates and edits a segment note through the real page timeline UI", async () => {
    useFakeClock(timerStartedAt);
    const runtime = await createRuntime({
      pageIds: ["ui-note-page", "ui-note-markdown-page"],
      eventIds: [
        "event-ui-note-started",
        "event-ui-note-stopped",
        "event-ui-note-segment-created",
        "event-ui-note-added",
        "event-ui-note-updated",
      ],
    });
    const user = userEvent.setup({
      advanceTimers: (milliseconds) => vi.advanceTimersByTime(milliseconds),
    });
    const page = createPage(runtime, "Timeline note UI page");
    const stopped = await createStoppedSegment(runtime, page, 75_000);
    const Timeline = getTimerPageTimelineComponent(runtime);

    render(createElement(Timeline, { page }));

    const timeline = screen.getByRole("region", { name: /time segments/i });

    expect(within(timeline).getByText(/75s/u)).toBeVisible();
    expect(
      within(timeline).getByRole("button", { name: /add note/i }),
    ).toBeEnabled();

    await user.click(
      within(timeline).getByRole("button", { name: /add note/i }),
    );

    const noteEditor = await within(timeline).findByRole("textbox", {
      name: /note/i,
    });

    await user.type(noteEditor, "Initial UI note <script>alert(1)</script>");
    await user.click(
      within(timeline).getByRole("button", { name: /save note/i }),
    );

    await waitFor(() =>
      expect(timerNoteEvents(runtime)).toHaveLength(1),
    );

    const firstNoteEvent = expectTimeSegmentNoteEvent(
      timerNoteEvents(runtime)[0],
      {
        notePageId: "ui-note-markdown-page",
        notedAt: "2026-05-24T01:01:15.000Z",
        pageId: page.id,
        segmentId: stopped.segment.segmentId,
      },
    );

    expect(runtime.pages.list({ includeArchived: true })).toHaveLength(2);
    expect(pageText(runtime.pages.get(firstNoteEvent.notePageId))).toContain(
      "Initial UI note <script>alert(1)</script>",
    );
    await waitFor(() =>
      expect(timeline).toHaveTextContent(
        "Initial UI note <script>alert(1)</script>",
      ),
    );
    expect(within(timeline).getByText(/Initial UI note/u)).toBeVisible();
    expectNoDangerousDom();

    vi.advanceTimersByTime(30_000);

    await user.click(
      within(timeline).getByRole("button", { name: /edit note/i }),
    );

    const editEditor = await within(timeline).findByRole("textbox", {
      name: /note/i,
    });

    await user.clear(editEditor);
    await user.type(editEditor, "Updated UI note stays on one Markdown page.");
    await user.click(
      within(timeline).getByRole("button", { name: /save note/i }),
    );

    await waitFor(() =>
      expect(timerNoteEvents(runtime)).toHaveLength(2),
    );

    const secondNoteEvent = expectTimeSegmentNoteEvent(
      timerNoteEvents(runtime)[1],
      {
        notePageId: firstNoteEvent.notePageId,
        notedAt: "2026-05-24T01:01:45.000Z",
        pageId: page.id,
        segmentId: stopped.segment.segmentId,
      },
    );

    expect(secondNoteEvent.notePageId).toBe(firstNoteEvent.notePageId);
    expect(runtime.pages.list({ includeArchived: true })).toHaveLength(2);
    expect(pageText(runtime.pages.get(secondNoteEvent.notePageId))).toContain(
      "Updated UI note stays on one Markdown page.",
    );
    expect(pageText(runtime.pages.get(secondNoteEvent.notePageId))).not
      .toContain("Initial UI note");
    await waitFor(() =>
      expect(
        within(timeline).getByText("Updated UI note stays on one Markdown page."),
      ).toBeVisible(),
    );
    expect(timeline).not.toHaveTextContent(
      "Initial UI note <script>alert(1)</script>",
    );
    expectNoDangerousDom();
  });

  it("ignores wrong-owner and malformed note-link events for otherwise valid timeline segments", async () => {
    useFakeClock(timerStartedAt);
    const runtime = await createRuntime({
      pageIds: [
        "note-link-filter-page",
        "wrong-owner-linked-note-page",
        "malformed-linked-note-page",
        "valid-linked-note-page",
      ],
      eventIds: [
        "event-note-link-started",
        "event-note-link-stopped",
        "event-note-link-segment-created",
        "event-note-link-wrong-owner",
        "event-note-link-malformed",
        "event-note-link-valid",
      ],
    });
    const page = createPage(runtime, "Note-link filtering page");
    const stopped = await createStoppedSegment(runtime, page, 40_000);
    const wrongOwnerNote = createPageWithText(
      runtime,
      "Wrong owner linked note",
      "Wrong-owner linked note text.",
    );
    const malformedNote = createPageWithText(
      runtime,
      "Malformed linked note",
      "Malformed linked note text.",
    );
    const validNote = createPageWithText(
      runtime,
      "Valid linked note",
      "Valid linked note text.",
    );

    appendTimerNoteEvent(runtime, {
      notePageId: wrongOwnerNote.id,
      pageId: page.id,
      segmentId: stopped.segment.segmentId,
      sourcePluginId: "task",
    });
    runtime.events.append({
      pageId: page.id,
      namespace: timerNamespace,
      type: "time_segment_note_added",
      sourcePluginId: timerPluginId,
      payload: {
        notePageId: malformedNote.id,
        notedAt: "2026-05-24T01:00:40.000Z",
        segmentId: stopped.segment.segmentId,
        untrusted: true,
      },
    });
    appendTimerNoteEvent(runtime, {
      notePageId: validNote.id,
      pageId: page.id,
      segmentId: stopped.segment.segmentId,
      sourcePluginId: timerPluginId,
    });

    const Timeline = getTimerPageTimelineComponent(runtime);

    render(createElement(Timeline, { page }));

    const timeline = screen.getByRole("region", { name: /time segments/i });

    expect(within(timeline).getByText("Valid linked note text.")).toBeVisible();
    expect(within(timeline).queryByText("Wrong-owner linked note text."))
      .not.toBeInTheDocument();
    expect(within(timeline).queryByText("Malformed linked note text."))
      .not.toBeInTheDocument();
    expectNoDangerousDom();
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

  return createAppRuntime({
    createNativeBridge: () => createNoopNativeBridge(),
    ...(createPageId === undefined && createEventId === undefined
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

function createPage(runtime: AppRuntime, title: string): MarkdownPage {
  return runtime.pages.create({
    title,
    body: emptyDocument(),
  });
}

function createPageWithText(
  runtime: AppRuntime,
  title: string,
  text: string,
): MarkdownPage {
  return runtime.pages.create({
    title,
    body: documentWithText(`${title.toLowerCase().split(" ").join("-")}-body`, text),
  });
}

async function createStoppedSegment(
  runtime: AppRuntime,
  page: MarkdownPage,
  durationMs: number,
): Promise<{
  activeTimer: TimerDtoRecord;
  segment: TimeSegmentDtoRecord;
  segmentEvent: AppEvent;
}> {
  const startResult = await executeTimerCommand(runtime, "timer.start", {
    pageId: page.id,
  });
  const activeTimer = expectResultActiveTimer(startResult, page);

  vi.advanceTimersByTime(durationMs);

  const stopResult = await executeTimerCommand(runtime, "timer.stop", {});
  const stoppedTimer = expectStoppedTimerResult(stopResult, {
    page,
    segmentId: activeTimer.segmentId,
  });
  const segment = expectCreatedSegmentResult(stopResult, {
    durationSeconds: Math.floor(durationMs / 1_000),
    endAt: expectStoppedAt(stoppedTimer),
    pageId: page.id,
    segmentId: activeTimer.segmentId,
    startAt: activeTimer.startedAt,
  });
  const segmentEvent = listTimerEvents(runtime)[2];

  expectTimeSegmentCreatedEvent(segmentEvent, segment);

  return { activeTimer, segment, segmentEvent };
}

function executeTimerCommand(
  runtime: AppRuntime,
  commandId: TimerCommandId,
  input?: unknown,
): Promise<unknown> {
  return runtime.commands.execute(commandId, input);
}

function expectResultActiveTimer(
  result: unknown,
  page: MarkdownPage,
): TimerDtoRecord {
  const resultRecord = readRecord(result, "timer command result");

  return expectTimerDto(resultRecord.activeTimer, {
    page,
    status: "running",
  });
}

function expectStoppedTimerResult(
  result: unknown,
  expected: {
    page: MarkdownPage;
    segmentId: string;
  },
): TimerDtoRecord {
  const resultRecord = readRecord(result, "timer stop result");

  return expectTimerDto(resultRecord.stoppedTimer, {
    page: expected.page,
    segmentId: expected.segmentId,
    status: "stopped",
  });
}

function expectTimerDto(
  value: unknown,
  expected: {
    page: MarkdownPage;
    segmentId?: string;
    status: "running" | "paused" | "stopped";
  },
): TimerDtoRecord {
  const timer = readRecord(value, "timer DTO");

  expect(Object.keys(timer).sort()).toStrictEqual([
    "elapsedSeconds",
    "pageId",
    "pageTitle",
    "segmentId",
    "startedAt",
    "status",
    ...(expected.status === "stopped" ? ["stoppedAt"] : []),
  ].sort());
  expect(timer.pageId).toBe(expected.page.id);
  expect(timer.pageTitle).toBe(expected.page.title);
  expect(timer.segmentId).toEqual(expect.any(String));
  expect(timer.startedAt).toEqual(expect.any(String));
  expect(timer.elapsedSeconds).toEqual(expect.any(Number));
  expect(timer.status).toBe(expected.status);

  if (expected.segmentId !== undefined) {
    expect(timer.segmentId).toBe(expected.segmentId);
  }

  if (expected.status === "stopped") {
    expect(timer.stoppedAt).toEqual(expect.any(String));
  }

  return timer as TimerDtoRecord;
}

function expectCreatedSegmentResult(
  result: unknown,
  expected: ExpectedTimeSegmentDto,
): TimeSegmentDtoRecord {
  const resultRecord = readRecord(result, "timer command result");

  return expectSegmentRecord(
    resultRecord.createdSegment,
    expected,
    "createdSegment DTO",
  );
}

function expectTimeSegmentCreatedEvent(
  event: AppEvent | undefined,
  expected: ExpectedTimeSegmentDto,
): TimeSegmentDtoRecord {
  expect(event).toMatchObject({
    pageId: expected.pageId,
    namespace: timerNamespace,
    type: "time_segment_created",
    sourcePluginId: timerPluginId,
  });

  const payload = expectSegmentRecord(
    expectEventPayload(event, "time segment event payload"),
    expected,
    "timer.time_segment_created payload",
  );

  expect(event?.pageId).toBe(payload.pageId);

  return payload;
}

function expectSegmentRecord(
  value: unknown,
  expected: ExpectedTimeSegmentDto,
  label: string,
): TimeSegmentDtoRecord {
  const segment = readRecord(value, label);
  const expectedKeys = [
    "durationSeconds",
    "endAt",
    "pageId",
    "segmentId",
    "source",
    "startAt",
    ...(expected.notePageId === undefined ? [] : ["notePageId"]),
  ];

  expect(Object.keys(segment).sort()).toStrictEqual(expectedKeys.sort());
  expect(segment.segmentId).toBe(expected.segmentId);
  expect(segment.pageId).toBe(expected.pageId);
  expect(segment.startAt).toBe(expected.startAt);
  expect(segment.endAt).toBe(expected.endAt);
  expect(segment.durationSeconds).toBe(expected.durationSeconds);
  expect(segment.source).toBe("timer");

  if (expected.notePageId === undefined) {
    expect(segment).not.toHaveProperty("notePageId");
  } else {
    expect(segment.notePageId).toBe(expected.notePageId);
  }

  return segment as TimeSegmentDtoRecord;
}

function expectStoppedAt(timer: TimerDtoRecord): string {
  expect(timer.stoppedAt).toEqual(expect.any(String));

  return timer.stoppedAt as string;
}

function expectTimeSegmentNoteEvent(
  event: AppEvent | undefined,
  expected: {
    notePageId: string;
    notedAt: string;
    pageId: string;
    segmentId: string;
  },
): { notePageId: string } {
  expect(event).toMatchObject({
    pageId: expected.pageId,
    namespace: timerNamespace,
    type: "time_segment_note_added",
    sourcePluginId: timerPluginId,
  });

  const payload = readRecord(
    event?.payload,
    "timer.time_segment_note_added payload",
  );

  expect(Object.keys(payload).sort()).toStrictEqual([
    "notePageId",
    "notedAt",
    "segmentId",
  ]);
  expect(payload.segmentId).toBe(expected.segmentId);
  expect(payload.notePageId).toBe(expected.notePageId);
  expect(payload.notedAt).toBe(expected.notedAt);

  return { notePageId: payload.notePageId as string };
}

function expectAddNoteResult(
  result: unknown,
  expectedNotePageId: string,
): void {
  const resultRecord = readRecord(result, "timer.add-note result");

  expect(Object.keys(resultRecord)).toStrictEqual(["notePageId"]);
  expect(resultRecord).toStrictEqual({ notePageId: expectedNotePageId });
}

function expectTimerEvents(
  runtime: AppRuntime,
  expectedTypes: readonly string[],
): AppEvent[] {
  const events = listTimerEvents(runtime);

  expect(events.map((event) => event.namespace)).toStrictEqual(
    expectedTypes.map(() => timerNamespace),
  );
  expect(events.map((event) => event.type)).toStrictEqual(expectedTypes);
  expect(events.map((event) => event.sourcePluginId)).toStrictEqual(
    expectedTypes.map(() => timerPluginId),
  );

  for (const event of events) {
    expect(event.type).not.toMatch(/\./u);
  }

  return events;
}

function listTimerEvents(runtime: AppRuntime): AppEvent[] {
  return runtime.events.list({ namespace: timerNamespace });
}

function timerNoteEvents(runtime: AppRuntime): AppEvent[] {
  return listTimerEvents(runtime).filter(
    (event) => event.type === "time_segment_note_added",
  );
}

function expectEventPayload(
  event: AppEvent | undefined,
  label: string,
): Record<string, unknown> {
  expect(event).toBeDefined();

  return readRecord(event?.payload, label);
}

function getTimerPageTimelineComponent(
  runtime: AppRuntime,
): ComponentType<TimerPageTimelineProps> {
  const contribution = runtime.registries.slots
    .list({
      pluginId: timerPluginId,
      slot: pageTimelineSlot,
    })
    .find((slot) => slot.id === timerPageTimelineSlotId);

  if (contribution === undefined) {
    throw new Error("Timer Plugin must register timer.page-timeline.segments.");
  }

  return (contribution as SlotContribution<TimerPageTimelineProps>)
    .component as ComponentType<TimerPageTimelineProps>;
}

function appendTimerSegmentEvent(
  runtime: AppRuntime,
  input: ExpectedTimeSegmentDto & {
    sourcePluginId: string;
  },
): void {
  runtime.events.append({
    pageId: input.pageId,
    namespace: timerNamespace,
    type: "time_segment_created",
    sourcePluginId: input.sourcePluginId,
    payload: {
      durationSeconds: input.durationSeconds,
      endAt: input.endAt,
      pageId: input.pageId,
      segmentId: input.segmentId,
      source: "timer",
      startAt: input.startAt,
    },
  });
}

function appendTimerNoteEvent(
  runtime: AppRuntime,
  input: {
    notePageId: string;
    pageId: string;
    segmentId: string;
    sourcePluginId: string;
  },
): void {
  runtime.events.append({
    pageId: input.pageId,
    namespace: timerNamespace,
    type: "time_segment_note_added",
    sourcePluginId: input.sourcePluginId,
    payload: {
      notePageId: input.notePageId,
      notedAt: new Date(Date.now()).toISOString(),
      segmentId: input.segmentId,
    },
  });
}

function pageText(page: MarkdownPage): string {
  const lines: string[] = [];

  function collect(node: { content?: unknown; text?: unknown }): void {
    if (typeof node.text === "string") {
      lines.push(node.text);
    }

    if (Array.isArray(node.content)) {
      for (const child of node.content) {
        if (typeof child === "object" && child !== null) {
          collect(child as { content?: unknown; text?: unknown });
        }
      }
    }
  }

  collect(page.body);

  return lines.join("\n");
}

function emptyDocument(): StructuredMarkdownDocument {
  return {
    type: "doc",
    content: [],
  };
}

function documentWithText(
  blockId: string,
  text: string,
): StructuredMarkdownDocument {
  return {
    type: "doc",
    content: [
      {
        blockId,
        type: "markdown.line",
        text,
      },
    ],
  };
}

function readRecord(value: unknown, label: string): Record<string, unknown> {
  expect(isRecord(value), `${label} must be a record`).toBe(true);

  return value as Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function useFakeClock(isoInstant: string): void {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(isoInstant));
}

class TimerNotePayload {
  segmentId: string;
  markdown: string;

  constructor(segmentId: string, markdown: string) {
    this.segmentId = segmentId;
    this.markdown = markdown;
  }
}

function createAccessorNotePayload(
  segmentId: string,
  markdown: string,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  Object.defineProperty(payload, "segmentId", {
    enumerable: true,
    get() {
      return segmentId;
    },
  });
  Object.defineProperty(payload, "markdown", {
    enumerable: true,
    value: markdown,
  });

  return payload;
}

function createSymbolExtraNotePayload(
  segmentId: string,
  markdown: string,
): Record<string, unknown> {
  const payload = { segmentId, markdown } as Record<PropertyKey, unknown>;

  Object.defineProperty(payload, Symbol("notePageId"), {
    enumerable: true,
    value: "caller-note-page",
  });

  return payload as Record<string, unknown>;
}

function createNonEnumerableExtraNotePayload(
  segmentId: string,
  markdown: string,
): Record<string, unknown> {
  const payload: Record<string, unknown> = { segmentId, markdown };

  Object.defineProperty(payload, "notePageId", {
    enumerable: false,
    value: "caller-note-page",
  });

  return payload;
}

function createPrototypeCarriedNotePayload(
  segmentId: string,
  markdown: string,
): Record<string, unknown> {
  const payload = Object.create({
    notePageId: "caller-note-page",
  }) as Record<string, unknown>;

  payload.segmentId = segmentId;
  payload.markdown = markdown;

  return payload;
}

function createNullPrototypeNotePayload(
  segmentId: string,
  markdown: string,
): Record<string, unknown> {
  const payload = Object.create(null) as Record<string, unknown>;

  Object.defineProperty(payload, "segmentId", {
    enumerable: true,
    value: segmentId,
  });
  Object.defineProperty(payload, "markdown", {
    enumerable: true,
    value: markdown,
  });

  return payload;
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
        throw new Error(`Unexpected timer note link href ${attribute.value}`);
      }
    }
  }
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
