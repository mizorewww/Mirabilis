import { describe, expect, it } from "vitest";

import type {
  AppEvent,
  MarkdownPage,
  MetadataRecord,
  StructuredMarkdownDocument,
} from "../core";
import {
  buildCalendarTimeSegmentsProjection,
  buildReportsStatsInputProjection,
} from "../shell/projections/calendar-reporting";

type CalendarProjectionResult = {
  data: {
    kind: "calendar.time-segments";
    segments: CalendarTimeSegmentProjectionRow[];
  };
  status: ProjectionStatus;
};

type CalendarTimeSegmentProjectionRow = {
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
};

type ReportsProjectionResult = {
  aggregationId: string;
  chartViewId: "chart.bar" | "chart.line" | "chart.pie";
  input: Record<string, unknown>;
  status: ProjectionStatus;
};

type ProjectionStatus =
  | {
      kind: "complete" | "empty";
    }
  | {
      kind: "partial";
      limit?: number;
      omittedRows?: number;
      reasons: string[];
    }
  | {
      kind: "unavailable";
      reasons: string[];
    };

type ProjectionSource = {
  events: readonly AppEvent[];
  metadata: readonly MetadataRecord[];
  pages: readonly MarkdownPage[];
};

type SegmentEventInput = {
  id: string;
  pageId: string;
  segmentId: string;
  startAt: string;
  endAt: string;
  durationSeconds: number;
  namespace?: string;
  payloadPageId?: string;
  source?: string;
  sourcePluginId?: string;
  type?: string;
};

const calendarRange = {
  rangeEndAt: "2026-05-22T00:00:00.000Z",
  rangeStartAt: "2026-05-20T00:00:00.000Z",
};
const weekRange = {
  rangeEndAt: "2026-05-25T00:00:00.000Z",
  rangeStartAt: "2026-05-18T00:00:00.000Z",
};
const reportsDateRange = {
  endDate: "2026-05-22",
  startDate: "2026-05-20",
};

describe("TASK-042 calendar and reporting projection builders", () => {
  it("projects trusted Timer time_segment_created events into exact Calendar DTO rows", () => {
    const focusPage = createPage("page-focus", "Focus Page");
    const supportPage = createPage("page-support", "Support Page");
    const events = [
      createTimerSegmentEvent({
        durationSeconds: 1_800,
        endAt: "2026-05-20T09:30:00.000Z",
        id: "timer-event-focus",
        pageId: focusPage.id,
        segmentId: "segment-focus",
        startAt: "2026-05-20T09:00:00.000Z",
      }),
      createTimerSegmentEvent({
        durationSeconds: 900,
        endAt: "2026-05-20T11:15:00.000Z",
        id: "timer-event-support",
        pageId: supportPage.id,
        segmentId: "segment-support",
        startAt: "2026-05-20T11:00:00.000Z",
      }),
    ];

    const projection = buildCalendar(events, [supportPage, focusPage]);

    expect(projection).toStrictEqual({
      data: {
        kind: "calendar.time-segments",
        segments: [
          {
            durationSeconds: 1_800,
            endAt: "2026-05-20T09:30:00.000Z",
            pageId: focusPage.id,
            pageTitle: focusPage.title,
            segmentId: "segment-focus",
            source: "timer",
            startAt: "2026-05-20T09:00:00.000Z",
            provenance: {
              eventPageId: focusPage.id,
              namespace: "timer",
              sourcePluginId: "timer",
              type: "time_segment_created",
            },
          },
          {
            durationSeconds: 900,
            endAt: "2026-05-20T11:15:00.000Z",
            pageId: supportPage.id,
            pageTitle: supportPage.title,
            segmentId: "segment-support",
            source: "timer",
            startAt: "2026-05-20T11:00:00.000Z",
            provenance: {
              eventPageId: supportPage.id,
              namespace: "timer",
              sourcePluginId: "timer",
              type: "time_segment_created",
            },
          },
        ],
      },
      status: {
        kind: "complete",
      },
    });
    expectSerializedProjectionToExclude(projection, [
      "timer-event-focus",
      "timer-event-support",
      "PRIVATE_BODY_TOKEN",
    ]);
  });

  it("includes day and week carryover rows by interval overlap without clipping source times", () => {
    const page = createPage("page-overlap", "Carryover Page");
    const beforeDay = createTimerSegmentEvent({
      durationSeconds: 1_200,
      endAt: "2026-05-20T00:10:00.000Z",
      id: "event-before-day",
      pageId: page.id,
      segmentId: "segment-before-day",
      startAt: "2026-05-19T23:50:00.000Z",
    });
    const afterDay = createTimerSegmentEvent({
      durationSeconds: 1_800,
      endAt: "2026-05-22T00:15:00.000Z",
      id: "event-after-day",
      pageId: page.id,
      segmentId: "segment-after-day",
      startAt: "2026-05-21T23:45:00.000Z",
    });
    const beforeWeek = createTimerSegmentEvent({
      durationSeconds: 1_200,
      endAt: "2026-05-18T00:05:00.000Z",
      id: "event-before-week",
      pageId: page.id,
      segmentId: "segment-before-week",
      startAt: "2026-05-17T23:45:00.000Z",
    });
    const afterWeek = createTimerSegmentEvent({
      durationSeconds: 900,
      endAt: "2026-05-25T00:05:00.000Z",
      id: "event-after-week",
      pageId: page.id,
      segmentId: "segment-after-week",
      startAt: "2026-05-24T23:50:00.000Z",
    });
    const outside = createTimerSegmentEvent({
      durationSeconds: 900,
      endAt: "2026-05-25T00:30:00.000Z",
      id: "event-outside-week",
      pageId: page.id,
      segmentId: "segment-outside-week",
      startAt: "2026-05-25T00:15:00.000Z",
    });

    expect(
      buildCalendar([beforeDay, afterDay, outside], [page], calendarRange).data
        .segments,
    ).toEqual([
      expect.objectContaining({
        endAt: beforeDay.payload.endAt,
        segmentId: "segment-before-day",
        startAt: beforeDay.payload.startAt,
      }),
      expect.objectContaining({
        endAt: afterDay.payload.endAt,
        segmentId: "segment-after-day",
        startAt: afterDay.payload.startAt,
      }),
    ]);
    expect(
      buildCalendar([beforeWeek, afterWeek, outside], [page], weekRange).data
        .segments,
    ).toEqual([
      expect.objectContaining({ segmentId: "segment-before-week" }),
      expect.objectContaining({ segmentId: "segment-after-week" }),
    ]);
  });

  it("ignores wrong-owner, mismatched, missing-page, archived-page, and invalid Timer rows", () => {
    const visiblePage = createPage("page-visible", "Visible Page");
    const archivedPage = {
      ...createPage("page-archived", "Archived Page"),
      archivedAt: "2026-05-20T12:00:00.000Z",
    };
    const validEvent = createTimerSegmentEvent({
      durationSeconds: 600,
      endAt: "2026-05-20T10:10:00.000Z",
      id: "event-valid",
      pageId: visiblePage.id,
      segmentId: "segment-valid",
      startAt: "2026-05-20T10:00:00.000Z",
    });
    const invalidEvents = [
      createTimerSegmentEvent({
        durationSeconds: 600,
        endAt: "2026-05-20T10:10:00.000Z",
        id: "event-wrong-namespace",
        namespace: "calendar",
        pageId: visiblePage.id,
        segmentId: "segment-wrong-namespace",
        startAt: "2026-05-20T10:00:00.000Z",
      }),
      createTimerSegmentEvent({
        durationSeconds: 600,
        endAt: "2026-05-20T10:10:00.000Z",
        id: "event-wrong-source",
        pageId: visiblePage.id,
        segmentId: "segment-wrong-source",
        sourcePluginId: "calendar",
        startAt: "2026-05-20T10:00:00.000Z",
      }),
      createTimerSegmentEvent({
        durationSeconds: 600,
        endAt: "2026-05-20T10:10:00.000Z",
        id: "event-wrong-type",
        pageId: visiblePage.id,
        segmentId: "segment-wrong-type",
        startAt: "2026-05-20T10:00:00.000Z",
        type: "started",
      }),
      createTimerSegmentEvent({
        durationSeconds: 600,
        endAt: "2026-05-20T10:10:00.000Z",
        id: "event-page-mismatch",
        pageId: visiblePage.id,
        payloadPageId: "page-other",
        segmentId: "segment-page-mismatch",
        startAt: "2026-05-20T10:00:00.000Z",
      }),
      createTimerSegmentEvent({
        durationSeconds: 600,
        endAt: "2026-05-20T10:10:00.000Z",
        id: "event-missing-page",
        pageId: "page-missing",
        segmentId: "segment-missing-page",
        startAt: "2026-05-20T10:00:00.000Z",
      }),
      createTimerSegmentEvent({
        durationSeconds: 600,
        endAt: "2026-05-20T10:10:00.000Z",
        id: "event-archived-page",
        pageId: archivedPage.id,
        segmentId: "segment-archived-page",
        startAt: "2026-05-20T10:00:00.000Z",
      }),
      createTimerSegmentEvent({
        durationSeconds: 600,
        endAt: "2026-05-20T10:10:00.000Z",
        id: "event-invalid-start",
        pageId: visiblePage.id,
        segmentId: "segment-invalid-start",
        startAt: "not-a-date",
      }),
      createTimerSegmentEvent({
        durationSeconds: 600,
        endAt: "2026-05-20T09:59:00.000Z",
        id: "event-end-before-start",
        pageId: visiblePage.id,
        segmentId: "segment-end-before-start",
        startAt: "2026-05-20T10:00:00.000Z",
      }),
      createTimerSegmentEvent({
        durationSeconds: 0,
        endAt: "2026-05-20T10:10:00.000Z",
        id: "event-zero-duration",
        pageId: visiblePage.id,
        segmentId: "segment-zero-duration",
        startAt: "2026-05-20T10:00:00.000Z",
      }),
      createTimerSegmentEvent({
        durationSeconds: Number.POSITIVE_INFINITY,
        endAt: "2026-05-20T10:10:00.000Z",
        id: "event-infinite-duration",
        pageId: visiblePage.id,
        segmentId: "segment-infinite-duration",
        startAt: "2026-05-20T10:00:00.000Z",
      }),
    ];

    const projection = buildCalendar(
      [validEvent, ...invalidEvents],
      [visiblePage, archivedPage],
    );

    expect(projection.data.segments).toStrictEqual([
      expect.objectContaining({
        pageId: visiblePage.id,
        segmentId: "segment-valid",
      }),
    ]);
    expectSerializedProjectionToExclude(projection, [
      "Archived Page",
      "segment-missing-page",
      "segment-page-mismatch",
      "segment-zero-duration",
      "segment-infinite-duration",
    ]);
  });

  it("fails closed for malformed, accessor, symbol, prototype, non-enumerable, and custom-array input", () => {
    const visiblePage = createPage("page-safe", "Safe Page");
    const validEvent = createTimerSegmentEvent({
      durationSeconds: 300,
      endAt: "2026-05-20T12:05:00.000Z",
      id: "event-safe",
      pageId: visiblePage.id,
      segmentId: "segment-safe",
      startAt: "2026-05-20T12:00:00.000Z",
    });
    const accessorPayload = {
      ...validEvent,
      id: "event-accessor",
      payload: createAccessorSegmentPayload("ACCESSOR_LEAK_MARKER"),
    };
    const symbolPayload = {
      ...validEvent,
      id: "event-symbol",
      payload: createPayloadWithSymbolKey({
        ...validEvent.payload,
        segmentId: "SYMBOL_LEAK_MARKER",
      }),
    };
    const prototypePayload = {
      ...validEvent,
      id: "event-prototype",
      payload: Object.create({
        ...validEvent.payload,
        segmentId: "PROTOTYPE_LEAK_MARKER",
      }) as Record<string, unknown>,
    };
    const nonEnumerablePayload = {
      ...validEvent,
      id: "event-non-enumerable",
      payload: createPayloadWithNonEnumerableField(
        {
          ...validEvent.payload,
          segmentId: "NON_ENUMERABLE_LEAK_MARKER",
        },
        "segmentId",
      ),
    };
    const customEvents = [
      validEvent,
      accessorPayload,
      symbolPayload,
      prototypePayload,
      nonEnumerablePayload,
      null,
      [],
    ] as unknown[];

    Object.defineProperty(customEvents, "map", {
      enumerable: false,
      value() {
        throw new Error("custom array method must not be trusted");
      },
    });

    const projection = buildCalendar(
      customEvents as readonly AppEvent[],
      [visiblePage],
    );

    expect(projection.data.segments).toStrictEqual([
      expect.objectContaining({ segmentId: "segment-safe" }),
    ]);
    expectSerializedProjectionToExclude(projection, [
      "ACCESSOR_LEAK_MARKER",
      "SYMBOL_LEAK_MARKER",
      "PROTOTYPE_LEAK_MARKER",
      "NON_ENUMERABLE_LEAK_MARKER",
      "custom array method",
    ]);
  });

  it("caps Calendar projections at 1000 deterministic rows and reports partial data", () => {
    const page = createPage("page-cap", "Cap Page");
    const events = Array.from({ length: 1_002 }, (_value, index) =>
      createTimerSegmentEvent({
        durationSeconds: 60,
        endAt: minuteInstant(index + 1),
        id: `event-cap-${index}`,
        pageId: page.id,
        segmentId: `segment-cap-${String(index).padStart(4, "0")}`,
        startAt: minuteInstant(index),
      }),
    ).reverse();

    const projection = buildCalendar(events, [page], {
      rangeEndAt: "2026-05-21T00:00:00.000Z",
      rangeStartAt: "2026-05-20T00:00:00.000Z",
    });

    expect(projection.data.segments).toHaveLength(1_000);
    expect(projection.data.segments[0]?.segmentId).toBe("segment-cap-0000");
    expect(
      projection.data.segments[projection.data.segments.length - 1]?.segmentId,
    ).toBe(
      "segment-cap-0999",
    );
    expect(projection.status).toStrictEqual({
      kind: "partial",
      limit: 1_000,
      omittedRows: 2,
      reasons: ["calendar.segment-limit"],
    });
    expectSerializedProjectionToExclude(projection, [
      "segment-cap-1000",
      "segment-cap-1001",
    ]);
  });

  it("defaults Reports to stats.sum-time-by-page with trusted timer segments and no raw leakage", () => {
    const focusPage = createPage("page-focus", "Focus Page", [
      "PRIVATE_BODY_TOKEN",
    ]);
    const supportPage = createPage("page-support", "Support Page");
    const source = createProjectionSource({
      events: [
        createTimerSegmentEvent({
          durationSeconds: 1_800,
          endAt: "2026-05-20T09:30:00.000Z",
          id: "timer-event-focus-private",
          pageId: focusPage.id,
          segmentId: "segment-focus",
          startAt: "2026-05-20T09:00:00.000Z",
        }),
        createTimerSegmentEvent({
          durationSeconds: 600,
          endAt: "2026-05-20T10:10:00.000Z",
          id: "timer-event-support-private",
          pageId: supportPage.id,
          segmentId: "segment-support",
          startAt: "2026-05-20T10:00:00.000Z",
        }),
      ],
      pages: [focusPage, supportPage],
    });

    const projection = buildReports(undefined, source);

    expect(projection.aggregationId).toBe("stats.sum-time-by-page");
    expect(projection.chartViewId).toBe("chart.bar");
    expect(projection.input).toStrictEqual({
      kind: "stats.time-by-page-input",
      segments: [
        expect.objectContaining({
          durationSeconds: 1_800,
          pageId: focusPage.id,
          pageTitle: focusPage.title,
          segmentId: "segment-focus",
          source: "timer",
          provenance: {
            eventPageId: focusPage.id,
            namespace: "timer",
            sourcePluginId: "timer",
            type: "time_segment_created",
          },
        }),
        expect.objectContaining({
          durationSeconds: 600,
          pageId: supportPage.id,
          pageTitle: supportPage.title,
          segmentId: "segment-support",
        }),
      ],
    });
    expect(projection.status).toStrictEqual({ kind: "complete" });
    expectSerializedProjectionToExclude(projection, [
      "PRIVATE_BODY_TOKEN",
      "timer-event-focus-private",
      "timer-event-support-private",
      "metadata-private",
    ]);
  });

  it("builds tag, note, habit, and optional task-estimate Stats inputs only from public descriptors", () => {
    const focusPage = createPage("page-focus", "Focus Tagged");
    const habitPage = createPage("page-habit", "Write Daily");
    const archivedHabitPage = {
      ...createPage("page-archived-habit", "Archived Habit"),
      archivedAt: "2026-05-21T00:00:00.000Z",
    };
    const segment = createTimerSegmentEvent({
      durationSeconds: 1_200,
      endAt: "2026-05-20T08:20:00.000Z",
      id: "event-tagged-segment",
      pageId: focusPage.id,
      segmentId: "segment-tagged",
      startAt: "2026-05-20T08:00:00.000Z",
    });
    const source = createProjectionSource({
      events: [
        segment,
        createTimerNoteEvent({
          id: "event-note-public",
          notePageId: "note-page",
          pageId: focusPage.id,
          segmentId: "segment-tagged",
        }),
        createHabitEvent({
          date: "2026-05-20",
          habitPageId: habitPage.id,
          id: "event-habit-checked",
          type: "checked",
        }),
        createHabitEvent({
          date: "2026-05-21",
          habitPageId: habitPage.id,
          id: "event-habit-unchecked",
          type: "unchecked",
        }),
        createHabitEvent({
          date: "2026-05-20",
          habitPageId: archivedHabitPage.id,
          id: "event-habit-archived",
          type: "checked",
        }),
      ],
      metadata: [
        createMetadata({
          id: "metadata-private-tag",
          key: "tags",
          namespace: "tag",
          pageId: focusPage.id,
          sourcePluginId: "tag",
          value: ["deep-work", "client"],
          valueType: "json",
        }),
        createMetadata({
          id: "metadata-private-habit",
          key: "enabled",
          namespace: "habit",
          pageId: habitPage.id,
          sourcePluginId: "habit",
          value: true,
          valueType: "boolean",
        }),
        createMetadata({
          id: "metadata-archived-habit",
          key: "enabled",
          namespace: "habit",
          pageId: archivedHabitPage.id,
          sourcePluginId: "habit",
          value: true,
          valueType: "boolean",
        }),
        createMetadata({
          id: "metadata-private-task-body-estimate",
          key: "due",
          namespace: "task",
          pageId: focusPage.id,
          sourcePluginId: "task",
          value: "2026-05-21",
          valueType: "date",
        }),
      ],
      pages: [focusPage, habitPage, archivedHabitPage],
    });

    expect(buildReports("stats.sum-time-by-tag", source).input).toStrictEqual({
      kind: "stats.time-by-tag-input",
      segments: [
        expect.objectContaining({
          pageId: focusPage.id,
          segmentId: "segment-tagged",
          tagIds: ["deep-work", "client"],
        }),
      ],
      tags: [
        {
          id: "deep-work",
          label: "deep-work",
          namespace: "tag",
          sourcePluginId: "tag",
          type: "tag",
        },
        {
          id: "client",
          label: "client",
          namespace: "tag",
          sourcePluginId: "tag",
          type: "tag",
        },
      ],
    });
    expect(
      buildReports("stats.unnoted-sessions-count", source).input,
    ).toStrictEqual({
      kind: "stats.unnoted-sessions-input",
      notes: [
        {
          namespace: "timer",
          pageId: focusPage.id,
          payload: {
            notePageId: "note-page",
            notedAt: "2026-05-20T08:30:00.000Z",
            segmentId: "segment-tagged",
          },
          sourcePluginId: "timer",
          type: "time_segment_note_added",
        },
      ],
      segments: [expect.objectContaining({ segmentId: "segment-tagged" })],
    });
    expect(
      buildReports("stats.habit-completion-rate", source).input,
    ).toStrictEqual({
      endDate: reportsDateRange.endDate,
      events: [
        expect.objectContaining({
          payload: {
            date: "2026-05-20",
            habitPageId: habitPage.id,
          },
          type: "checked",
        }),
        expect.objectContaining({
          payload: {
            date: "2026-05-21",
            habitPageId: habitPage.id,
          },
          type: "unchecked",
        }),
      ],
      habits: [{ habitPageId: habitPage.id, title: habitPage.title }],
      kind: "stats.habit-completion-input",
      startDate: reportsDateRange.startDate,
    });

    const estimateProjection = buildReports("stats.estimate-vs-actual", source);

    expect(estimateProjection.input).toStrictEqual({
      estimates: [],
      kind: "stats.estimate-vs-actual-input",
      segments: [expect.objectContaining({ segmentId: "segment-tagged" })],
    });
    expect(estimateProjection.status).toStrictEqual({
      kind: "partial",
      reasons: ["task-estimates-unavailable"],
    });
    expectSerializedProjectionToExclude(estimateProjection, [
      "metadata-private-tag",
      "metadata-private-task-body-estimate",
      "Archived Habit",
      "event-habit-archived",
    ]);
  });

  it("ignores archived/missing pages and non-finite or unbounded numeric values in Reports inputs", () => {
    const visiblePage = createPage("page-visible", "Visible");
    const archivedPage = {
      ...createPage("page-archived", "Archived"),
      archivedAt: "2026-05-20T00:00:00.000Z",
    };
    const source = createProjectionSource({
      events: [
        createTimerSegmentEvent({
          durationSeconds: 60,
          endAt: "2026-05-20T09:01:00.000Z",
          id: "event-visible",
          pageId: visiblePage.id,
          segmentId: "segment-visible",
          startAt: "2026-05-20T09:00:00.000Z",
        }),
        createTimerSegmentEvent({
          durationSeconds: 120,
          endAt: "2026-05-20T09:02:00.000Z",
          id: "event-archived",
          pageId: archivedPage.id,
          segmentId: "segment-archived",
          startAt: "2026-05-20T09:00:00.000Z",
        }),
        createTimerSegmentEvent({
          durationSeconds: Number.NaN,
          endAt: "2026-05-20T09:02:00.000Z",
          id: "event-nan",
          pageId: visiblePage.id,
          segmentId: "segment-nan",
          startAt: "2026-05-20T09:00:00.000Z",
        }),
        createTimerSegmentEvent({
          durationSeconds: 1_000_000_001,
          endAt: "2026-05-20T09:02:00.000Z",
          id: "event-too-large",
          pageId: visiblePage.id,
          segmentId: "segment-too-large",
          startAt: "2026-05-20T09:00:00.000Z",
        }),
        createTimerSegmentEvent({
          durationSeconds: 60,
          endAt: "2026-05-20T09:01:00.000Z",
          id: "event-missing",
          pageId: "page-missing",
          segmentId: "segment-missing",
          startAt: "2026-05-20T09:00:00.000Z",
        }),
      ],
      pages: [visiblePage, archivedPage],
    });

    const projection = buildReports("stats.sum-time-by-page", source);

    expect(projection.input).toStrictEqual({
      kind: "stats.time-by-page-input",
      segments: [expect.objectContaining({ segmentId: "segment-visible" })],
    });
    expectSerializedProjectionToExclude(projection, [
      "Archived",
      "segment-archived",
      "segment-nan",
      "segment-too-large",
      "segment-missing",
    ]);
  });
});

function buildCalendar(
  events: readonly AppEvent[],
  pages: readonly MarkdownPage[],
  range: {
    rangeEndAt: string;
    rangeStartAt: string;
  } = calendarRange,
): CalendarProjectionResult {
  return buildCalendarTimeSegmentsProjection({
    events,
    metadata: [],
    pages,
    ...range,
  }) as CalendarProjectionResult;
}

function buildReports(
  aggregationId: string | undefined,
  source: ProjectionSource,
): ReportsProjectionResult {
  return buildReportsStatsInputProjection({
    ...source,
    aggregationId,
    ...reportsDateRange,
  }) as ReportsProjectionResult;
}

function createProjectionSource(
  input: Partial<ProjectionSource>,
): ProjectionSource {
  return {
    events: input.events ?? [],
    metadata: input.metadata ?? [],
    pages: input.pages ?? [],
  };
}

function createPage(
  id: string,
  title: string,
  bodyText: readonly string[] = [],
): MarkdownPage {
  return {
    body: createStructuredDocument(bodyText),
    createdAt: "2026-05-20T00:00:00.000Z",
    id,
    title,
    updatedAt: "2026-05-20T00:00:00.000Z",
  };
}

function createStructuredDocument(
  bodyText: readonly string[],
): StructuredMarkdownDocument {
  return {
    content: bodyText.map((text, index) => ({
      blockId: `block-${index}`,
      text,
      type: "markdown.line",
    })),
    type: "doc",
  };
}

function createTimerSegmentEvent(input: SegmentEventInput): AppEvent & {
  payload: {
    durationSeconds: number;
    endAt: string;
    pageId: string;
    segmentId: string;
    source: string;
    startAt: string;
  };
} {
  return {
    createdAt: input.startAt,
    id: input.id,
    namespace: input.namespace ?? "timer",
    pageId: input.pageId,
    payload: {
      durationSeconds: input.durationSeconds,
      endAt: input.endAt,
      pageId: input.payloadPageId ?? input.pageId,
      segmentId: input.segmentId,
      source: input.source ?? "timer",
      startAt: input.startAt,
    },
    sourcePluginId: input.sourcePluginId ?? "timer",
    type: input.type ?? "time_segment_created",
  };
}

function createTimerNoteEvent(input: {
  id: string;
  notePageId: string;
  pageId: string;
  segmentId: string;
}): AppEvent {
  return {
    createdAt: "2026-05-20T08:30:00.000Z",
    id: input.id,
    namespace: "timer",
    pageId: input.pageId,
    payload: {
      notePageId: input.notePageId,
      notedAt: "2026-05-20T08:30:00.000Z",
      segmentId: input.segmentId,
    },
    sourcePluginId: "timer",
    type: "time_segment_note_added",
  };
}

function createHabitEvent(input: {
  date: string;
  habitPageId: string;
  id: string;
  type: "checked" | "unchecked";
}): AppEvent {
  return {
    createdAt: `${input.date}T12:00:00.000Z`,
    id: input.id,
    namespace: "habit",
    payload: {
      date: input.date,
      habitPageId: input.habitPageId,
    },
    sourcePluginId: "habit",
    type: input.type,
  };
}

function createMetadata(input: {
  id: string;
  key: string;
  namespace: string;
  pageId: string;
  sourcePluginId: string;
  value: unknown;
  valueType: MetadataRecord["valueType"];
}): MetadataRecord {
  return {
    createdAt: "2026-05-20T00:00:00.000Z",
    updatedAt: "2026-05-20T00:00:00.000Z",
    ...input,
  };
}

function createAccessorSegmentPayload(marker: string): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    durationSeconds: 300,
    endAt: "2026-05-20T12:05:00.000Z",
    pageId: "page-safe",
    segmentId: "segment-accessor",
    source: "timer",
    startAt: "2026-05-20T12:00:00.000Z",
  };

  Object.defineProperty(payload, "segmentId", {
    enumerable: true,
    get() {
      return marker;
    },
  });

  return payload;
}

function createPayloadWithSymbolKey(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  Object.defineProperty(payload, Symbol("timer-extra"), {
    enumerable: true,
    value: "symbol-extra",
  });

  return payload;
}

function createPayloadWithNonEnumerableField(
  payload: Record<string, unknown>,
  field: string,
): Record<string, unknown> {
  Object.defineProperty(payload, field, {
    configurable: true,
    enumerable: false,
    value: payload[field],
    writable: true,
  });

  return payload;
}

function minuteInstant(minuteOffset: number): string {
  return new Date(
    Date.parse("2026-05-20T00:00:00.000Z") + minuteOffset * 60_000,
  ).toISOString();
}

function expectSerializedProjectionToExclude(
  projection: unknown,
  forbiddenMarkers: readonly string[],
): void {
  const serialized = JSON.stringify(projection);

  for (const marker of forbiddenMarkers) {
    expect(serialized).not.toContain(marker);
  }
}
