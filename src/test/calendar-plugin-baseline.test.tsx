import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { render, screen, within } from "@testing-library/react";
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

type CreateRuntimeOptions = {
  pageIds?: readonly string[];
  eventIds?: readonly string[];
};

type CalendarCommandId =
  | "calendar.open-time-segment"
  | "timer.start"
  | "timer.stop";

type CalendarViewId = "calendar.day" | "calendar.week";

type CalendarTimeSegmentsData = {
  kind: "calendar.time-segments";
  segments: readonly CalendarTimeSegmentInput[];
};

type CalendarTimeSegmentInput = {
  durationSeconds: number;
  endAt: string;
  pageId: string;
  pageTitle: string;
  segmentId: string;
  source: "timer";
  startAt: string;
  provenance: {
    eventPageId: string;
    namespace: "timer";
    sourcePluginId: "timer";
    type: "time_segment_created";
  };
  detail?: string;
  note?: string;
};

type CalendarViewProps = {
  commands: Pick<AppRuntime["commands"], "execute">;
  data: CalendarTimeSegmentsData;
  date?: string;
  timeZone: "UTC";
  weekStart?: string;
};

type RuntimeSnapshot = {
  events: AppEvent[];
  metadata: ReturnType<AppRuntime["metadata"]["list"]>;
  pages: MarkdownPage[];
};

type TimerSegmentDtoRecord = Record<string, unknown> & {
  durationSeconds: number;
  endAt: string;
  pageId: string;
  segmentId: string;
  source: "timer";
  startAt: string;
};

const calendarPluginId = "calendar";
const calendarViewIds = ["calendar.day", "calendar.week"] as const;
const calendarOpenSegmentCommandId = "calendar.open-time-segment";
const staleCalendarIds = [
  "calendar.month",
  "calendar.open_time_segment",
  "calendar.create_manual_segment",
  "calendar.create-manual-segment",
  "calendar.edit_time_block",
  "calendar.edit-time-block",
] as const;
const timerPluginId = "timer";
const timerNamespace = "timer";
const mondayWeekStart = "2026-05-18";
const selectedDay = "2026-05-20";
const utcTimeZone = "UTC";
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
];
const calendarProductionEntrypoints = [
  "src/bootstrap/built-in-plugins.ts",
  "src/plugins/calendar",
];

describe("Calendar Plugin baseline", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("registers only the canonical Calendar built-in views and open-detail command", async () => {
    const runtime = await createRuntime();
    const builtInPluginIds = BUILT_IN_PLUGINS.map(
      (plugin) => plugin.manifest.id,
    );
    const calendarViews = runtime.registries.views.list({
      pluginId: calendarPluginId,
    });
    const registeredCalendarViewIds = calendarViews.map((view) => view.id).sort();
    const calendarCommandIds = runtime.registries.commands
      .list({ pluginId: calendarPluginId })
      .map((command) => command.id)
      .sort();

    expect.soft(builtInPluginIds).toContain(calendarPluginId);
    expect.soft(registeredCalendarViewIds).toStrictEqual(
      [...calendarViewIds].sort(),
    );
    expect.soft(calendarCommandIds).toStrictEqual([calendarOpenSegmentCommandId]);

    for (const viewId of calendarViewIds) {
      expect.soft(calendarViews.find((view) => view.id === viewId)).toMatchObject({
        id: viewId,
        pluginId: calendarPluginId,
        accepts: {
          kind: "calendar.time-segments",
        },
        component: expect.anything(),
      });
    }

    for (const staleId of staleCalendarIds) {
      expect(registeredCalendarViewIds).not.toContain(staleId);
      expect(calendarCommandIds).not.toContain(staleId);
    }
  });

  it("renders normalized Timer segments as inert accessible day blocks with UTC ranges", async () => {
    const runtime = await createRuntime();
    const unsafeTitle = "Focus <img src=x onerror=alert(1)>";
    const unsafeNote = "<script>alert(1)</script>";
    const unsafeDetail = "[open](javascript:alert(1))";
    const segment = createCalendarSegment({
      detail: unsafeDetail,
      endAt: "2026-05-20T10:47:00.000Z",
      note: unsafeNote,
      pageId: "page-unsafe-day",
      pageTitle: unsafeTitle,
      segmentId: "segment-unsafe-day",
      startAt: "2026-05-20T10:00:00.000Z",
    });

    renderCalendarView(runtime, "calendar.day", {
      data: { kind: "calendar.time-segments", segments: [segment] },
      date: selectedDay,
    });

    const day = screen.getByRole("region", { name: "Calendar day" });
    const block = within(day).getByRole("button", {
      name: /10:00.*10:47.*Focus <img src=x onerror=alert\(1\)>/u,
    });

    expect(block).toBeVisible();
    expect(block).toHaveTextContent(unsafeTitle);
    expect(block).toHaveTextContent(/10:00\s*(?:-|to)\s*10:47\s*UTC/iu);
    expect(within(day).queryByText(unsafeNote)).not.toBeInTheDocument();
    expect(within(day).queryByText(unsafeDetail)).not.toBeInTheDocument();
    expectNoDangerousDom();
  });

  it("renders week segments grouped and ordered by selected UTC week while ignoring out-of-week data", async () => {
    const runtime = await createRuntime();
    const mondayLater = createCalendarSegment({
      endAt: "2026-05-18T10:30:00.000Z",
      pageId: "page-monday-later",
      pageTitle: "Monday build",
      segmentId: "segment-monday-later",
      startAt: "2026-05-18T10:00:00.000Z",
    });
    const mondayEarlier = createCalendarSegment({
      endAt: "2026-05-18T09:15:00.000Z",
      pageId: "page-monday-earlier",
      pageTitle: "Monday planning",
      segmentId: "segment-monday-earlier",
      startAt: "2026-05-18T09:00:00.000Z",
    });
    const wednesday = createCalendarSegment({
      endAt: "2026-05-20T15:45:00.000Z",
      pageId: "page-wednesday",
      pageTitle: "Wednesday review",
      segmentId: "segment-wednesday",
      startAt: "2026-05-20T15:00:00.000Z",
    });
    const sunday = createCalendarSegment({
      endAt: "2026-05-24T22:30:00.000Z",
      pageId: "page-sunday",
      pageTitle: "Sunday closeout",
      segmentId: "segment-sunday",
      startAt: "2026-05-24T22:00:00.000Z",
    });
    const beforeWeek = createCalendarSegment({
      endAt: "2026-05-17T23:45:00.000Z",
      pageId: "page-before-week",
      pageTitle: "Previous Sunday",
      segmentId: "segment-before-week",
      startAt: "2026-05-17T23:15:00.000Z",
    });
    const afterWeek = createCalendarSegment({
      endAt: "2026-05-25T00:30:00.000Z",
      pageId: "page-after-week",
      pageTitle: "Next Monday",
      segmentId: "segment-after-week",
      startAt: "2026-05-25T00:00:00.000Z",
    });

    renderCalendarView(runtime, "calendar.week", {
      data: {
        kind: "calendar.time-segments",
        segments: [
          sunday,
          afterWeek,
          wednesday,
          mondayLater,
          beforeWeek,
          mondayEarlier,
        ],
      },
      weekStart: mondayWeekStart,
    });

    const week = screen.getByRole("region", { name: "Calendar week" });
    const blocks = within(week).getAllByRole("button");

    expect(blocks).toHaveLength(4);
    expect(blocks[0]).toHaveTextContent(/09:00.*09:15.*Monday planning/u);
    expect(blocks[1]).toHaveTextContent(/10:00.*10:30.*Monday build/u);
    expect(blocks[2]).toHaveTextContent(/15:00.*15:45.*Wednesday review/u);
    expect(blocks[3]).toHaveTextContent(/22:00.*22:30.*Sunday closeout/u);
    expect(week).toHaveTextContent(
      /Monday[\s\S]*Monday planning[\s\S]*Monday build[\s\S]*Wednesday[\s\S]*Wednesday review[\s\S]*Sunday[\s\S]*Sunday closeout/u,
    );
    expect(within(week).queryByText("Previous Sunday")).not.toBeInTheDocument();
    expect(within(week).queryByText("Next Monday")).not.toBeInTheDocument();
  });

  it("renders segments that overlap the selected UTC day even when they start the previous day", async () => {
    const runtime = await createRuntime();
    const previousDayOverlap = createCalendarSegment({
      endAt: "2026-05-20T00:30:00.000Z",
      pageId: "page-day-overlap",
      pageTitle: "Midnight carryover",
      segmentId: "segment-day-overlap",
      startAt: "2026-05-19T23:30:00.000Z",
    });

    renderCalendarView(runtime, "calendar.day", {
      data: {
        kind: "calendar.time-segments",
        segments: [previousDayOverlap],
      },
      date: selectedDay,
    });

    const day = screen.getByRole("region", { name: "Calendar day" });

    expect(
      within(day).getByRole("button", {
        name: /23:30.*00:30.*Midnight carryover/u,
      }),
    ).toBeVisible();
  });

  it("renders segments that overlap the selected UTC week even when they start the previous week", async () => {
    const runtime = await createRuntime();
    const previousWeekOverlap = createCalendarSegment({
      endAt: "2026-05-18T00:30:00.000Z",
      pageId: "page-week-overlap",
      pageTitle: "Week boundary carryover",
      segmentId: "segment-week-overlap",
      startAt: "2026-05-17T23:30:00.000Z",
    });

    renderCalendarView(runtime, "calendar.week", {
      data: {
        kind: "calendar.time-segments",
        segments: [previousWeekOverlap],
      },
      weekStart: mondayWeekStart,
    });

    const week = screen.getByRole("region", { name: "Calendar week" });

    expect(
      within(week).getByRole("button", {
        name: /23:30.*00:30.*Week boundary carryover/u,
      }),
    ).toBeVisible();
  });

  it("ignores malformed or untrusted normalized segment inputs", async () => {
    const runtime = await createRuntime();
    const valid = createCalendarSegment({
      endAt: "2026-05-20T12:30:00.000Z",
      pageId: "page-valid",
      pageTitle: "Valid timer segment",
      segmentId: "segment-valid",
      startAt: "2026-05-20T12:00:00.000Z",
    });
    const invalidSegments = [
      withSegmentOverrides(valid, {
        pageTitle: "Wrong owner",
        provenance: {
          ...valid.provenance,
          sourcePluginId: "task",
        },
        segmentId: "segment-wrong-owner",
      }),
      withSegmentOverrides(valid, {
        pageTitle: "Wrong source",
        segmentId: "segment-wrong-source",
        source: "manual",
      }),
      withSegmentOverrides(valid, {
        pageTitle: "Wrong namespace",
        provenance: {
          ...valid.provenance,
          namespace: "task",
        },
        segmentId: "segment-wrong-namespace",
      }),
      withSegmentOverrides(valid, {
        pageTitle: "Wrong type",
        provenance: {
          ...valid.provenance,
          type: "stopped",
        },
        segmentId: "segment-wrong-type",
      }),
      omitRequiredSegmentField(valid, "pageId", {
        pageTitle: "Missing page",
        segmentId: "segment-missing-page",
      }),
      omitRequiredSegmentField(valid, "pageTitle", {
        segmentId: "segment-missing-title",
      }),
      withSegmentOverrides(valid, {
        pageTitle: "Page mismatch",
        provenance: {
          ...valid.provenance,
          eventPageId: "different-page",
        },
        segmentId: "segment-page-mismatch",
      }),
      withSegmentOverrides(valid, {
        pageId: "",
        pageTitle: "Blank page id",
        provenance: {
          ...valid.provenance,
          eventPageId: "",
        },
        segmentId: "segment-blank-page",
      }),
      withSegmentOverrides(valid, {
        pageTitle: "Blank segment id",
        segmentId: "",
      }),
      withSegmentOverrides(valid, {
        endAt: "2026-05-20T13:30:00.000Z",
        pageTitle: "Invalid start date",
        segmentId: "segment-invalid-start",
        startAt: "not-a-date",
      }),
      withSegmentOverrides(valid, {
        endAt: "not-a-date",
        pageTitle: "Invalid end date",
        segmentId: "segment-invalid-end",
      }),
      withSegmentOverrides(valid, {
        endAt: "2026-05-20T12:00:00.000Z",
        pageTitle: "Zero duration wall time",
        segmentId: "segment-zero-duration",
      }),
      withSegmentOverrides(valid, {
        durationSeconds: -1,
        endAt: "2026-05-20T12:29:59.000Z",
        pageTitle: "Negative duration",
        segmentId: "segment-negative-duration",
      }),
      withSegmentOverrides(valid, {
        durationSeconds: Number.POSITIVE_INFINITY,
        pageTitle: "Nonfinite duration",
        segmentId: "segment-nonfinite-duration",
      }),
      withExtraSegmentField(valid, "unexpected", "caller-controlled", {
        pageTitle: "Extra field",
        segmentId: "segment-extra-field",
      }),
      omitRequiredSegmentField(valid, "durationSeconds", {
        pageTitle: "Missing duration",
        segmentId: "segment-missing-duration",
      }),
    ];

    renderCalendarView(runtime, "calendar.day", {
      data: {
        kind: "calendar.time-segments",
        segments: [valid, ...toCalendarSegments(invalidSegments)],
      },
      date: selectedDay,
    });

    const day = screen.getByRole("region", { name: "Calendar day" });
    const blocks = within(day).getAllByRole("button");

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toHaveTextContent("Valid timer segment");

    for (const invalidTitle of [
      "Wrong owner",
      "Wrong source",
      "Wrong namespace",
      "Wrong type",
      "Missing page",
      "Missing title",
      "Page mismatch",
      "Blank page id",
      "Blank segment id",
      "Invalid start date",
      "Invalid end date",
      "Zero duration wall time",
      "Negative duration",
      "Nonfinite duration",
      "Extra field",
      "Missing duration",
    ]) {
      expect(within(day).queryByText(invalidTitle)).not.toBeInTheDocument();
    }
  });

  it("ignores non-enumerable required segment and provenance fields instead of rendering hidden DTO data", async () => {
    const runtime = await createRuntime();
    const valid = createCalendarSegment({
      endAt: "2026-05-20T12:30:00.000Z",
      pageId: "page-visible-non-enumerable-guard",
      pageTitle: "Visible strict DTO segment",
      segmentId: "segment-visible-non-enumerable-guard",
      startAt: "2026-05-20T12:00:00.000Z",
    });
    const hiddenRequiredSegments = (
      ["segmentId", "pageId", "startAt", "endAt"] as const
    ).map((field) =>
      withNonEnumerableSegmentField(
        createCalendarSegment({
          endAt: "2026-05-20T13:30:00.000Z",
          pageId: `page-hidden-${field}`,
          pageTitle: `Hidden ${field} segment`,
          segmentId: `segment-hidden-${field}`,
          startAt: "2026-05-20T13:00:00.000Z",
        }),
        field,
      ),
    );
    const hiddenProvenanceSegments = (
      ["eventPageId", "namespace", "sourcePluginId", "type"] as const
    ).map((field) =>
      withNonEnumerableProvenanceField(
        createCalendarSegment({
          endAt: "2026-05-20T14:30:00.000Z",
          pageId: `page-hidden-provenance-${field}`,
          pageTitle: `Hidden provenance ${field} segment`,
          segmentId: `segment-hidden-provenance-${field}`,
          startAt: "2026-05-20T14:00:00.000Z",
        }),
        field,
      ),
    );

    renderCalendarView(runtime, "calendar.day", {
      data: {
        kind: "calendar.time-segments",
        segments: [
          valid,
          ...toCalendarSegments([
            ...hiddenRequiredSegments,
            ...hiddenProvenanceSegments,
          ]),
        ],
      },
      date: selectedDay,
    });

    const day = screen.getByRole("region", { name: "Calendar day" });
    const blocks = within(day).getAllByRole("button");

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toHaveTextContent("Visible strict DTO segment");

    for (const hiddenTitle of [
      "Hidden segmentId segment",
      "Hidden pageId segment",
      "Hidden startAt segment",
      "Hidden endAt segment",
      "Hidden provenance eventPageId segment",
      "Hidden provenance namespace segment",
      "Hidden provenance sourcePluginId segment",
      "Hidden provenance type segment",
    ]) {
      expect(within(day).queryByText(hiddenTitle)).not.toBeInTheDocument();
    }
  });

  it("does not render non-enumerable optional segment text as hidden detail data", async () => {
    const runtime = await createRuntime();
    const user = userEvent.setup();
    const hiddenNote = "Hidden non-enumerable note";
    const hiddenDetail = "Hidden non-enumerable detail";
    const hiddenNoteSegment = withNonEnumerableSegmentField(
      createCalendarSegment({
        endAt: "2026-05-20T13:30:00.000Z",
        note: hiddenNote,
        pageId: "page-hidden-note",
        pageTitle: "Hidden note segment",
        segmentId: "segment-hidden-note",
        startAt: "2026-05-20T13:00:00.000Z",
      }),
      "note",
    );
    const hiddenDetailSegment = withNonEnumerableSegmentField(
      createCalendarSegment({
        detail: hiddenDetail,
        endAt: "2026-05-20T14:30:00.000Z",
        pageId: "page-hidden-detail",
        pageTitle: "Hidden detail segment",
        segmentId: "segment-hidden-detail",
        startAt: "2026-05-20T14:00:00.000Z",
      }),
      "detail",
    );

    renderCalendarView(runtime, "calendar.day", {
      data: {
        kind: "calendar.time-segments",
        segments: toCalendarSegments([hiddenNoteSegment, hiddenDetailSegment]),
      },
      date: selectedDay,
    });

    const day = screen.getByRole("region", { name: "Calendar day" });

    await expectOptionalSegmentTextNotAccepted(
      user,
      day,
      "Hidden note segment",
      hiddenNote,
    );
    await expectOptionalSegmentTextNotAccepted(
      user,
      day,
      "Hidden detail segment",
      hiddenDetail,
    );
  });

  it("opens a segment detail region by executing the Calendar command through the registry", async () => {
    const runtime = await createRuntime();
    const user = userEvent.setup();
    const segment = createCalendarSegment({
      detail: "[detail](javascript:alert(1))",
      endAt: "2026-05-20T14:50:00.000Z",
      note: "<script>alert(1)</script>",
      pageId: "page-click-detail",
      pageTitle: "Click detail <img src=x onerror=alert(1)>",
      segmentId: "segment-click-detail",
      startAt: "2026-05-20T14:00:00.000Z",
    });
    const execute = vi.fn(runtime.commands.execute.bind(runtime.commands));

    renderCalendarView(runtime, "calendar.day", {
      commands: { execute },
      data: { kind: "calendar.time-segments", segments: [segment] },
      date: selectedDay,
    });

    await user.click(
      screen.getByRole("button", {
        name: /14:00.*14:50.*Click detail <img src=x onerror=alert\(1\)>/u,
      }),
    );

    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith(calendarOpenSegmentCommandId, {
      pageId: segment.pageId,
      segmentId: segment.segmentId,
    });

    const detail = await screen.findByRole("region", {
      name: /segment detail/i,
    });

    expect(detail).toHaveTextContent(segment.pageTitle);
    expect(detail).toHaveTextContent(/14:00\s*(?:-|to)\s*14:50\s*UTC/iu);
    expect(within(detail).getByText(segment.note ?? "")).toBeVisible();
    expect(within(detail).getByText(segment.detail ?? "")).toBeVisible();
    expectNoDangerousDom();
  });

  it("does not let rendered segment validity leak across Calendar runtime instances or survive unmount", async () => {
    const sourceRuntime = await createRuntime();
    const isolatedRuntime = await createRuntime();
    const segment = createCalendarSegment({
      endAt: "2026-05-20T15:30:00.000Z",
      pageId: "page-runtime-isolation",
      pageTitle: "Runtime isolated segment",
      segmentId: "segment-runtime-isolation",
      startAt: "2026-05-20T15:00:00.000Z",
    });
    const beforeIsolated = snapshotRuntimeState(isolatedRuntime);
    const { unmount } = renderCalendarView(sourceRuntime, "calendar.day", {
      data: { kind: "calendar.time-segments", segments: [segment] },
      date: selectedDay,
    });

    expect(
      screen.getByRole("button", {
        name: /15:00.*15:30.*Runtime isolated segment/u,
      }),
    ).toBeVisible();

    await expect(
      executeCalendarCommand(isolatedRuntime, calendarOpenSegmentCommandId, {
        pageId: segment.pageId,
        segmentId: segment.segmentId,
      }),
      "a separate runtime must not trust another runtime's rendered segment",
    ).rejects.toBeInstanceOf(Error);
    expect(snapshotRuntimeState(isolatedRuntime)).toStrictEqual(beforeIsolated);
    expect(
      screen.queryByRole("region", { name: /segment detail/i }),
    ).not.toBeInTheDocument();

    unmount();

    await expect(
      executeCalendarCommand(sourceRuntime, calendarOpenSegmentCommandId, {
        pageId: segment.pageId,
        segmentId: segment.segmentId,
      }),
      "unmount must clear the rendered segment from command validity",
    ).rejects.toBeInstanceOf(Error);
  });

  it("rejects unsafe calendar.open-time-segment payloads without opening detail or mutating stores", async () => {
    const runtime = await createRuntime();
    const validSegment = createCalendarSegment({
      endAt: "2026-05-20T16:30:00.000Z",
      pageId: "page-command-guard",
      pageTitle: "Command guard page",
      segmentId: "segment-command-guard",
      startAt: "2026-05-20T16:00:00.000Z",
    });
    const before = snapshotRuntimeState(runtime);
    const invalidPayloads: Array<{ input: unknown; label: string }> = [
      { input: undefined, label: "undefined payload" },
      { input: null, label: "null payload" },
      { input: {}, label: "empty payload" },
      { input: [], label: "array payload" },
      {
        input: { pageId: validSegment.pageId, segmentId: "missing-segment" },
        label: "unknown segment",
      },
      {
        input: {
          pageId: validSegment.pageId,
          segmentId: validSegment.segmentId,
          sourcePluginId: "task",
        },
        label: "wrong-owner field",
      },
      {
        input: {
          pageId: validSegment.pageId,
          segmentId: validSegment.segmentId,
          source: "timer",
        },
        label: "extra field",
      },
      {
        input: createAccessorOpenPayload(
          validSegment.segmentId,
          validSegment.pageId,
        ),
        label: "accessor payload",
      },
      {
        input: createSymbolExtraOpenPayload(
          validSegment.segmentId,
          validSegment.pageId,
        ),
        label: "symbol extra payload",
      },
      {
        input: createNonEnumerableExtraOpenPayload(
          validSegment.segmentId,
          validSegment.pageId,
        ),
        label: "non-enumerable extra payload",
      },
      {
        input: createNonEnumerableOpenFieldPayload(
          validSegment.segmentId,
          validSegment.pageId,
          "segmentId",
        ),
        label: "non-enumerable segmentId payload",
      },
      {
        input: createNonEnumerableOpenFieldPayload(
          validSegment.segmentId,
          validSegment.pageId,
          "pageId",
        ),
        label: "non-enumerable pageId payload",
      },
      {
        input: { pageId: validSegment.pageId, segmentId: "" },
        label: "blank segment id",
      },
      {
        input: { pageId: "", segmentId: validSegment.segmentId },
        label: "blank page id",
      },
      {
        input: { pageId: validSegment.pageId, segmentId: 42 },
        label: "non-string segment id",
      },
      {
        input: { pageId: 42, segmentId: validSegment.segmentId },
        label: "non-string page id",
      },
      {
        input: createPrototypeCarriedOpenPayload(
          validSegment.segmentId,
          validSegment.pageId,
        ),
        label: "prototype-carried payload",
      },
    ];

    renderCalendarView(runtime, "calendar.day", {
      data: { kind: "calendar.time-segments", segments: [validSegment] },
      date: selectedDay,
    });

    for (const { input, label } of invalidPayloads) {
      await expect(
        executeCalendarCommand(runtime, calendarOpenSegmentCommandId, input),
        label,
      ).rejects.toBeInstanceOf(Error);
      expect(snapshotRuntimeState(runtime), label).toStrictEqual(before);
      expect(
        screen.queryByRole("region", { name: /segment detail/i }),
        label,
      ).not.toBeInTheDocument();
    }
  });

  it("keeps Calendar isolated from Timer internals, raw runtime surfaces, native APIs, HTML sinks, and package/native diffs", async () => {
    const calendarSources = await readCalendarProductionSources();

    expect(calendarSources.map(({ filePath }) => filePath).sort()).toEqual(
      expect.arrayContaining([
        "src/bootstrap/built-in-plugins.ts",
        "src/plugins/calendar/index.ts",
        "src/plugins/calendar/plugin.ts",
      ]),
    );

    for (const { filePath, source } of calendarSources.filter(({ filePath }) =>
      filePath.startsWith("src/plugins/calendar/"),
    )) {
      expect(source, `${filePath}: Timer internals import`).not.toMatch(
        /from\s+["'][^"']*(?:plugins\/timer|\/timer|\.\.\/timer|\.\/timer)["']/u,
      );
      expect(source, `${filePath}: useRuntime import/use`).not.toMatch(
        /\buseRuntime\b|runtime-context/u,
      );
      expect(source, `${filePath}: NativeBridge or Tauri API`).not.toMatch(
        /@tauri-apps|\bNativeBridge\b|createTauriNativeBridge|\btauri\b/iu,
      );
      expect(source, `${filePath}: raw stores/registries/pluginHost`).not.toMatch(
        /\b(?:createCoreStores|createCoreRegistries|stores|registries|pluginHost|PluginHost)\b/u,
      );
      expect(source, `${filePath}: markdown renderer import/use`).not.toMatch(
        /renderMarkdown|markdownToHtml|MarkdownPageEditor|collectEditorExtensions/u,
      );
      expect(source, `${filePath}: HTML injection sink`).not.toMatch(
        /dangerouslySetInnerHTML|\.innerHTML\b/u,
      );
    }

    expect(
      await disallowedNativeSurfaceChanges(
        await listNativeSurfaceChangesFromMaster(),
      ),
    ).toStrictEqual([]);
  });

  it("renders a real Timer segment after the test harness normalizes the public Timer event", async () => {
    useFakeClock("2026-05-20T10:00:00.000Z");

    const runtime = await createRuntime({
      eventIds: [
        "event-calendar-integration-started",
        "event-calendar-integration-stopped",
        "event-calendar-integration-segment",
      ],
      pageIds: ["page-calendar-integration"],
    });
    const user = userEvent.setup({
      advanceTimers: (milliseconds) => vi.advanceTimersByTime(milliseconds),
    });
    const page = createPage(runtime, "Integrated Timer segment");

    await executeCalendarCommand(runtime, "timer.start", { pageId: page.id });
    vi.advanceTimersByTime(45 * 60 * 1_000);
    await executeCalendarCommand(runtime, "timer.stop", {});

    const timerSegmentEvent = listTimerEvents(runtime).find(
      (event) => event.type === "time_segment_created",
    );
    const normalizedSegment = normalizeTimerEventForCalendar(
      timerSegmentEvent,
      page,
    );
    const { unmount } = renderCalendarView(runtime, "calendar.day", {
      data: {
        kind: "calendar.time-segments",
        segments: [normalizedSegment],
      },
      date: selectedDay,
    });

    await user.click(
      screen.getByRole("button", {
        name: /10:00.*10:45.*Integrated Timer segment/u,
      }),
    );

    expect(
      await screen.findByRole("region", { name: /segment detail/i }),
    ).toHaveTextContent("Integrated Timer segment");

    unmount();

    renderCalendarView(runtime, "calendar.week", {
      data: {
        kind: "calendar.time-segments",
        segments: [normalizedSegment],
      },
      weekStart: mondayWeekStart,
    });

    const week = screen.getByRole("region", { name: "Calendar week" });

    expect(
      within(week).getByRole("button", {
        name: /10:00.*10:45.*Integrated Timer segment/u,
      }),
    ).toBeVisible();
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

function renderCalendarView(
  runtime: AppRuntime,
  viewId: CalendarViewId,
  props: Omit<CalendarViewProps, "commands" | "timeZone"> &
    Partial<Pick<CalendarViewProps, "commands" | "timeZone">>,
): ReturnType<typeof render> {
  const View = getCalendarViewComponent(runtime, viewId);

  return render(
    createElement(View, {
      commands: props.commands ?? runtime.commands,
      data: props.data,
      date: props.date,
      timeZone: props.timeZone ?? utcTimeZone,
      weekStart: props.weekStart,
    }),
  );
}

function getCalendarViewComponent(
  runtime: AppRuntime,
  viewId: CalendarViewId,
): ComponentType<CalendarViewProps> {
  const view = runtime.registries.views
    .list({ pluginId: calendarPluginId })
    .find((registeredView) => registeredView.id === viewId);

  if (view === undefined) {
    throw new Error(`Calendar Plugin must register ${viewId}.`);
  }

  expect(view.accepts).toStrictEqual({
    kind: "calendar.time-segments",
  });

  return (view as ViewDefinition<CalendarViewProps>).component;
}

function createCalendarSegment(
  input: {
    endAt: string;
    pageId: string;
    pageTitle: string;
    segmentId: string;
    startAt: string;
    detail?: string;
    note?: string;
  },
): CalendarTimeSegmentInput {
  const durationSeconds = Math.floor(
    (Date.parse(input.endAt) - Date.parse(input.startAt)) / 1_000,
  );

  return {
    durationSeconds,
    endAt: input.endAt,
    pageId: input.pageId,
    pageTitle: input.pageTitle,
    segmentId: input.segmentId,
    source: "timer",
    startAt: input.startAt,
    provenance: {
      eventPageId: input.pageId,
      namespace: timerNamespace,
      sourcePluginId: timerPluginId,
      type: "time_segment_created",
    },
    ...(input.detail === undefined ? {} : { detail: input.detail }),
    ...(input.note === undefined ? {} : { note: input.note }),
  };
}

function withSegmentOverrides(
  segment: CalendarTimeSegmentInput,
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...segment,
    ...overrides,
  };
}

function withExtraSegmentField(
  segment: CalendarTimeSegmentInput,
  key: string,
  value: unknown,
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...segment,
    ...overrides,
    [key]: value,
  };
}

function omitRequiredSegmentField(
  segment: CalendarTimeSegmentInput,
  field: keyof CalendarTimeSegmentInput,
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  const clone: Record<string, unknown> = { ...segment, ...overrides };

  delete clone[field];

  return clone;
}

function withNonEnumerableSegmentField(
  segment: CalendarTimeSegmentInput,
  field: keyof CalendarTimeSegmentInput,
): Record<string, unknown> {
  const clone: Record<string, unknown> = { ...segment };

  makeNonEnumerableOwnValue(clone, field);

  return clone;
}

function withNonEnumerableProvenanceField(
  segment: CalendarTimeSegmentInput,
  field: keyof CalendarTimeSegmentInput["provenance"],
): Record<string, unknown> {
  const provenance: Record<string, unknown> = { ...segment.provenance };
  const clone: Record<string, unknown> = {
    ...segment,
    provenance,
  };

  makeNonEnumerableOwnValue(provenance, field);

  return clone;
}

function toCalendarSegments(
  segments: readonly Record<string, unknown>[],
): readonly CalendarTimeSegmentInput[] {
  return segments as unknown as readonly CalendarTimeSegmentInput[];
}

function normalizeTimerEventForCalendar(
  event: AppEvent | undefined,
  page: MarkdownPage,
): CalendarTimeSegmentInput {
  expect(event).toMatchObject({
    pageId: page.id,
    namespace: timerNamespace,
    type: "time_segment_created",
    sourcePluginId: timerPluginId,
  });

  const segment = expectTimerSegmentDto(event?.payload);

  return {
    durationSeconds: segment.durationSeconds,
    endAt: segment.endAt,
    pageId: segment.pageId,
    pageTitle: page.title,
    segmentId: segment.segmentId,
    source: "timer",
    startAt: segment.startAt,
    provenance: {
      eventPageId: event?.pageId ?? "",
      namespace: timerNamespace,
      sourcePluginId: timerPluginId,
      type: "time_segment_created",
    },
  };
}

function expectTimerSegmentDto(value: unknown): TimerSegmentDtoRecord {
  const segment = readRecord(value, "timer time_segment_created payload");

  expect(Object.keys(segment).sort()).toStrictEqual([
    "durationSeconds",
    "endAt",
    "pageId",
    "segmentId",
    "source",
    "startAt",
  ]);
  expect(segment.durationSeconds).toEqual(expect.any(Number));
  expect(segment.endAt).toEqual(expect.any(String));
  expect(segment.pageId).toEqual(expect.any(String));
  expect(segment.segmentId).toEqual(expect.any(String));
  expect(segment.source).toBe("timer");
  expect(segment.startAt).toEqual(expect.any(String));

  return segment as TimerSegmentDtoRecord;
}

function executeCalendarCommand(
  runtime: AppRuntime,
  commandId: CalendarCommandId,
  input?: unknown,
): Promise<unknown> {
  return runtime.commands.execute(commandId, input);
}

function createPage(runtime: AppRuntime, title: string): MarkdownPage {
  return runtime.pages.create({
    title,
    body: emptyDocument(),
  });
}

function emptyDocument(): StructuredMarkdownDocument {
  return {
    type: "doc",
    content: [],
  };
}

function listTimerEvents(runtime: AppRuntime): AppEvent[] {
  return runtime.events.list({ namespace: timerNamespace });
}

function snapshotRuntimeState(runtime: AppRuntime): RuntimeSnapshot {
  return {
    events: runtime.events.list(),
    metadata: runtime.metadata.list(),
    pages: runtime.pages.list({ includeArchived: true }),
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

function createAccessorOpenPayload(
  segmentId: string,
  pageId: string,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  Object.defineProperty(payload, "segmentId", {
    enumerable: true,
    get() {
      return segmentId;
    },
  });
  Object.defineProperty(payload, "pageId", {
    enumerable: true,
    value: pageId,
  });

  return payload;
}

function createSymbolExtraOpenPayload(
  segmentId: string,
  pageId: string,
): Record<string, unknown> {
  const payload = { pageId, segmentId } as Record<PropertyKey, unknown>;

  Object.defineProperty(payload, Symbol("sourcePluginId"), {
    enumerable: true,
    value: timerPluginId,
  });

  return payload as Record<string, unknown>;
}

function createNonEnumerableExtraOpenPayload(
  segmentId: string,
  pageId: string,
): Record<string, unknown> {
  const payload: Record<string, unknown> = { pageId, segmentId };

  Object.defineProperty(payload, "sourcePluginId", {
    enumerable: false,
    value: timerPluginId,
  });

  return payload;
}

function createNonEnumerableOpenFieldPayload(
  segmentId: string,
  pageId: string,
  field: "pageId" | "segmentId",
): Record<string, unknown> {
  const payload: Record<string, unknown> = { pageId, segmentId };

  makeNonEnumerableOwnValue(payload, field);

  return payload;
}

function createPrototypeCarriedOpenPayload(
  segmentId: string,
  pageId: string,
): Record<string, unknown> {
  const payload = Object.create({
    sourcePluginId: timerPluginId,
  }) as Record<string, unknown>;

  payload.pageId = pageId;
  payload.segmentId = segmentId;

  return payload;
}

async function expectOptionalSegmentTextNotAccepted(
  user: ReturnType<typeof userEvent.setup>,
  region: HTMLElement,
  title: string,
  hiddenText: string,
): Promise<void> {
  const button = within(region).queryByRole("button", {
    name: new RegExp(title, "u"),
  });

  if (button === null) {
    expect(within(region).queryByText(title)).not.toBeInTheDocument();
    expect(screen.queryByText(hiddenText)).not.toBeInTheDocument();

    return;
  }

  await user.click(button);

  const detail = await screen.findByRole("region", {
    name: /segment detail/i,
  });

  expect(within(detail).queryByText(hiddenText)).not.toBeInTheDocument();
}

function makeNonEnumerableOwnValue(
  record: Record<PropertyKey, unknown>,
  key: PropertyKey,
): void {
  Object.defineProperty(record, key, {
    configurable: true,
    enumerable: false,
    value: record[key],
    writable: true,
  });
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
        throw new Error(`Unexpected Calendar link href ${attribute.value}`);
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

async function readCalendarProductionSources(): Promise<
  Array<{ filePath: string; source: string }>
> {
  const files = await runGitLines([
    "ls-files",
    "--",
    ...calendarProductionEntrypoints,
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
