import {
  createElement,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from "react";

import type { AppPlugin } from "../../core";

export type CalendarTimeSegmentInput = {
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

export type CalendarTimeSegmentsData = {
  kind: "calendar.time-segments";
  segments: readonly CalendarTimeSegmentInput[];
};

export type CalendarViewProps = {
  commands: {
    execute(commandId: string, input?: unknown): Promise<unknown>;
  };
  data: CalendarTimeSegmentsData;
  date?: string;
  timeZone: "UTC";
  weekStart?: string;
};

type CalendarTimeSegment = {
  durationSeconds: number;
  endAt: string;
  endMs: number;
  pageId: string;
  pageTitle: string;
  segmentId: string;
  startAt: string;
  startMs: number;
  detail?: string;
  note?: string;
};

type CalendarOpenSegmentInput = {
  pageId: string;
  segmentId: string;
};

const calendarPluginId = "calendar";
const calendarDayViewId = "calendar.day";
const calendarWeekViewId = "calendar.week";
const openSegmentCommandId = "calendar.open-time-segment";
const timeSegmentsKind = "calendar.time-segments";
const utcTimeZone = "UTC";
const timerPluginId = "timer";
const timerNamespace = "timer";
const timerSegmentCreatedType = "time_segment_created";
const dayMs = 24 * 60 * 60 * 1_000;
const requiredSegmentKeys = new Set([
  "durationSeconds",
  "endAt",
  "pageId",
  "pageTitle",
  "segmentId",
  "source",
  "startAt",
  "provenance",
]);
const optionalSegmentKeys = new Set(["detail", "note"]);
const provenanceKeys = new Set([
  "eventPageId",
  "namespace",
  "sourcePluginId",
  "type",
]);
const openSegmentInputKeys = new Set(["pageId", "segmentId"]);
const dayNames = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;
const knownSegmentCounts = new Map<string, number>();

export const CalendarPlugin: AppPlugin = {
  manifest: {
    id: calendarPluginId,
    name: "Calendar Plugin",
    version: "1.0.0",
    description: "Render normalized time segments as day and week views.",
    minAppVersion: "0.1.0",
  },
  register(ctx) {
    ctx.views.register<CalendarViewProps>({
      id: calendarDayViewId,
      type: calendarDayViewId,
      title: "Calendar day",
      component: CalendarDayView,
      accepts: {
        kind: timeSegmentsKind,
      },
    });

    ctx.views.register<CalendarViewProps>({
      id: calendarWeekViewId,
      type: calendarWeekViewId,
      title: "Calendar week",
      component: CalendarWeekView,
      accepts: {
        kind: timeSegmentsKind,
      },
    });

    ctx.commands.register<unknown, CalendarOpenSegmentInput>({
      id: openSegmentCommandId,
      title: "Open time segment",
      handler: openTimeSegment,
    });
  },
};

function CalendarDayView({
  commands,
  data,
  date,
  timeZone,
}: CalendarViewProps): ReactElement {
  const [detail, setDetail] = useState<CalendarTimeSegment | null>(null);
  const segments = useCalendarSegments(data, timeZone);
  const selectedDay = parseUtcDateOnly(date ?? currentUtcDateOnly());
  const visibleSegments =
    selectedDay === null
      ? []
      : segments
          .filter((segment) => utcDateOnly(segment.startMs) === selectedDay.key)
          .sort(compareCalendarSegments);

  useKnownSegments(visibleSegments);

  return createElement(
    "section",
    {
      "aria-label": "Calendar day",
      role: "region",
    },
    ...visibleSegments.map((segment) =>
      renderSegmentButton(segment, commands, setDetail),
    ),
    detail === null ? null : renderSegmentDetail(detail),
  );
}

function CalendarWeekView({
  commands,
  data,
  timeZone,
  weekStart,
}: CalendarViewProps): ReactElement {
  const [detail, setDetail] = useState<CalendarTimeSegment | null>(null);
  const segments = useCalendarSegments(data, timeZone);
  const selectedWeekStart = parseUtcDateOnly(
    weekStart ?? currentUtcDateOnly(),
  );
  const weekEndMs =
    selectedWeekStart === null ? null : selectedWeekStart.ms + 7 * dayMs;
  const visibleSegments =
    selectedWeekStart === null || weekEndMs === null
      ? []
      : segments
          .filter(
            (segment) =>
              segment.startMs >= selectedWeekStart.ms &&
              segment.startMs < weekEndMs,
          )
          .sort(compareCalendarSegments);
  const groupedSegments = groupSegmentsByDay(visibleSegments);

  useKnownSegments(visibleSegments);

  return createElement(
    "section",
    {
      "aria-label": "Calendar week",
      role: "region",
    },
    ...groupedSegments.map((group) =>
      createElement(
        "section",
        {
          key: group.dayKey,
        },
        createElement("h2", null, formatDayName(group.dayMs)),
        ...group.segments.map((segment) =>
          renderSegmentButton(segment, commands, setDetail),
        ),
      ),
    ),
    detail === null ? null : renderSegmentDetail(detail),
  );
}

function openTimeSegment(input: unknown): CalendarOpenSegmentInput {
  const payload = readOpenSegmentInput(input);

  if (!knownSegmentCounts.has(segmentKey(payload))) {
    throw new Error("Calendar command requires a known time segment");
  }

  return payload;
}

function useCalendarSegments(
  data: CalendarTimeSegmentsData,
  timeZone: "UTC",
): CalendarTimeSegment[] {
  return useMemo(() => {
    if (timeZone !== utcTimeZone || !isCalendarTimeSegmentsData(data)) {
      return [];
    }

    return data.segments.flatMap((segment) => {
      const normalized = readCalendarSegment(segment);

      return normalized === null ? [] : [normalized];
    });
  }, [data, timeZone]);
}

function useKnownSegments(segments: readonly CalendarTimeSegment[]): void {
  useEffect(() => {
    const keys = segments.map((segment) => segmentKey(segment));

    for (const key of keys) {
      knownSegmentCounts.set(key, (knownSegmentCounts.get(key) ?? 0) + 1);
    }

    return () => {
      for (const key of keys) {
        const count = knownSegmentCounts.get(key);

        if (count === undefined || count <= 1) {
          knownSegmentCounts.delete(key);
        } else {
          knownSegmentCounts.set(key, count - 1);
        }
      }
    };
  }, [segments]);
}

function renderSegmentButton(
  segment: CalendarTimeSegment,
  commands: CalendarViewProps["commands"],
  setDetail: (segment: CalendarTimeSegment) => void,
): ReactElement {
  return createElement(
    "button",
    {
      key: segmentKey(segment),
      type: "button",
      onClick: () => {
        void openSegmentFromView(segment, commands, setDetail);
      },
    },
    createElement("span", null, formatTimeRange(segment)),
    " ",
    createElement("span", null, segment.pageTitle),
  );
}

async function openSegmentFromView(
  segment: CalendarTimeSegment,
  commands: CalendarViewProps["commands"],
  setDetail: (segment: CalendarTimeSegment) => void,
): Promise<void> {
  const key = segmentKey(segment);
  const previousCount = knownSegmentCounts.get(key) ?? 0;

  knownSegmentCounts.set(key, previousCount + 1);

  try {
    await commands.execute(openSegmentCommandId, {
      pageId: segment.pageId,
      segmentId: segment.segmentId,
    });
    setDetail(segment);
  } finally {
    const count = knownSegmentCounts.get(key);

    if (count === undefined || count <= previousCount + 1) {
      if (previousCount === 0) {
        knownSegmentCounts.delete(key);
      } else {
        knownSegmentCounts.set(key, previousCount);
      }
    } else {
      knownSegmentCounts.set(key, count - 1);
    }
  }
}

function renderSegmentDetail(segment: CalendarTimeSegment): ReactElement {
  return createElement(
    "section",
    {
      "aria-label": "Segment detail",
      role: "region",
    },
    createElement("h2", null, "Segment detail"),
    createElement("p", null, segment.pageTitle),
    createElement("p", null, formatTimeRange(segment)),
    segment.note === undefined ? null : createElement("p", null, segment.note),
    segment.detail === undefined
      ? null
      : createElement("p", null, segment.detail),
  );
}

function isCalendarTimeSegmentsData(
  data: CalendarTimeSegmentsData,
): data is CalendarTimeSegmentsData {
  return (
    isPlainObject(data) &&
    data.kind === timeSegmentsKind &&
    Array.isArray(data.segments)
  );
}

function readCalendarSegment(input: unknown): CalendarTimeSegment | null {
  const payload = readExactRecordWithOptional(
    input,
    requiredSegmentKeys,
    optionalSegmentKeys,
  );

  if (payload === null) {
    return null;
  }

  const segmentId = readNonBlankString(payload.segmentId);
  const pageId = readNonBlankString(payload.pageId);
  const pageTitle = readString(payload.pageTitle);
  const startAt = readString(payload.startAt);
  const endAt = readString(payload.endAt);
  const durationSeconds = readPositiveFiniteNumber(payload.durationSeconds);
  const provenance = readProvenance(payload.provenance);
  const detail =
    payload.detail === undefined ? undefined : readString(payload.detail);
  const note = payload.note === undefined ? undefined : readString(payload.note);
  const startMs = Date.parse(startAt ?? "");
  const endMs = Date.parse(endAt ?? "");

  if (
    segmentId === null ||
    pageId === null ||
    pageTitle === null ||
    startAt === null ||
    endAt === null ||
    durationSeconds === null ||
    provenance === null ||
    (payload.detail !== undefined && detail === null) ||
    (payload.note !== undefined && note === null) ||
    payload.source !== timerPluginId ||
    provenance.eventPageId !== pageId ||
    !Number.isFinite(startMs) ||
    !Number.isFinite(endMs) ||
    endMs <= startMs
  ) {
    return null;
  }

  return {
    durationSeconds,
    endAt,
    endMs,
    pageId,
    pageTitle,
    segmentId,
    startAt,
    startMs,
    ...(payload.detail === undefined ? {} : { detail: detail as string }),
    ...(payload.note === undefined ? {} : { note: note as string }),
  };
}

function readProvenance(input: unknown):
  | {
      eventPageId: string;
      namespace: "timer";
      sourcePluginId: "timer";
      type: "time_segment_created";
    }
  | null {
  const payload = readExactRecord(input, provenanceKeys);

  if (payload === null) {
    return null;
  }

  const eventPageId = readNonBlankString(payload.eventPageId);

  if (
    eventPageId === null ||
    payload.namespace !== timerNamespace ||
    payload.sourcePluginId !== timerPluginId ||
    payload.type !== timerSegmentCreatedType
  ) {
    return null;
  }

  return {
    eventPageId,
    namespace: timerNamespace,
    sourcePluginId: timerPluginId,
    type: timerSegmentCreatedType,
  };
}

function readOpenSegmentInput(input: unknown): CalendarOpenSegmentInput {
  const payload = readExactRecord(input, openSegmentInputKeys);

  if (payload === null) {
    throw new Error("Calendar command requires an exact payload");
  }

  const segmentId = readNonBlankString(payload.segmentId);
  const pageId = readNonBlankString(payload.pageId);

  if (segmentId === null || pageId === null) {
    throw new Error("Calendar command requires segmentId and pageId");
  }

  return {
    pageId,
    segmentId,
  };
}

function readExactRecord(
  input: unknown,
  allowedKeys: ReadonlySet<string>,
): Record<string, unknown> | null {
  return readExactRecordWithOptional(input, allowedKeys, new Set());
}

function readExactRecordWithOptional(
  input: unknown,
  requiredKeys: ReadonlySet<string>,
  optionalKeys: ReadonlySet<string>,
): Record<string, unknown> | null {
  if (!isPlainObject(input)) {
    return null;
  }

  if (Object.getOwnPropertySymbols(input).length > 0) {
    return null;
  }

  const names = Object.getOwnPropertyNames(input);
  const allowedKeys = new Set([...requiredKeys, ...optionalKeys]);

  for (const name of names) {
    if (!allowedKeys.has(name)) {
      return null;
    }

    const descriptor = Object.getOwnPropertyDescriptor(input, name);

    if (descriptor === undefined || !("value" in descriptor)) {
      return null;
    }
  }

  for (const key of requiredKeys) {
    if (!Object.prototype.hasOwnProperty.call(input, key)) {
      return null;
    }
  }

  return input;
}

function readNonBlankString(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  return value;
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readPositiveFiniteNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function parseUtcDateOnly(value: string): { key: string; ms: number } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    return null;
  }

  const ms = Date.parse(`${value}T00:00:00.000Z`);

  if (!Number.isFinite(ms) || utcDateOnly(ms) !== value) {
    return null;
  }

  return {
    key: value,
    ms,
  };
}

function currentUtcDateOnly(): string {
  return utcDateOnly(Date.now());
}

function utcDateOnly(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function formatTimeRange(segment: CalendarTimeSegment): string {
  return `${formatUtcTime(segment.startMs)} - ${formatUtcTime(
    segment.endMs,
  )} UTC`;
}

function formatUtcTime(ms: number): string {
  const date = new Date(ms);
  const hours = `${date.getUTCHours()}`.padStart(2, "0");
  const minutes = `${date.getUTCMinutes()}`.padStart(2, "0");

  return `${hours}:${minutes}`;
}

function groupSegmentsByDay(
  segments: readonly CalendarTimeSegment[],
): Array<{
  dayKey: string;
  dayMs: number;
  segments: CalendarTimeSegment[];
}> {
  const groups = new Map<
    string,
    { dayKey: string; dayMs: number; segments: CalendarTimeSegment[] }
  >();

  for (const segment of segments) {
    const dayKey = utcDateOnly(segment.startMs);
    const existing = groups.get(dayKey);

    if (existing === undefined) {
      const parsed = parseUtcDateOnly(dayKey);

      if (parsed !== null) {
        groups.set(dayKey, {
          dayKey,
          dayMs: parsed.ms,
          segments: [segment],
        });
      }
    } else {
      existing.segments.push(segment);
    }
  }

  return [...groups.values()].sort((left, right) => left.dayMs - right.dayMs);
}

function formatDayName(ms: number): string {
  return dayNames[new Date(ms).getUTCDay()];
}

function compareCalendarSegments(
  left: CalendarTimeSegment,
  right: CalendarTimeSegment,
): number {
  return (
    left.startMs - right.startMs ||
    left.endMs - right.endMs ||
    left.pageTitle.localeCompare(right.pageTitle) ||
    left.segmentId.localeCompare(right.segmentId)
  );
}

function segmentKey(input: { pageId: string; segmentId: string }): string {
  return `${input.segmentId}\u0000${input.pageId}`;
}
