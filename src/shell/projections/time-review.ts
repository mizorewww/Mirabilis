import type { AppEvent, MarkdownPage, MetadataRecord } from "../../core";

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

type ProjectionInput = {
  events: readonly AppEvent[];
  metadata: readonly MetadataRecord[];
  pages: readonly MarkdownPage[];
};

export type CalendarTimeSegmentProjectionRow = {
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

export type CalendarTimeSegmentsProjection = {
  data: {
    kind: "calendar.time-segments";
    segments: CalendarTimeSegmentProjectionRow[];
  };
  status: ProjectionStatus;
};

export type ReportsStatsInputProjection = {
  aggregationId: ReportsAggregationId;
  chartViewId: "chart.bar" | "chart.line" | "chart.pie";
  input: Record<string, unknown>;
  status: ProjectionStatus;
};

export type ReportsAggregationId =
  | "stats.estimate-vs-actual"
  | "stats.habit-completion-rate"
  | "stats.sum-time-by-page"
  | "stats.sum-time-by-tag"
  | "stats.task-switch-count"
  | "stats.unnoted-sessions-count";

type CalendarProjectionInput = ProjectionInput & {
  rangeEndAt: string;
  rangeStartAt: string;
};

type ReportsProjectionInput = ProjectionInput & {
  aggregationId?: string;
  endDate: string;
  startDate: string;
};

type PageSummary = {
  id: string;
  title: string;
};

type TimerSegmentProjection = CalendarTimeSegmentProjectionRow & {
  endMs: number;
  startMs: number;
  tagIds?: string[];
  taskPageId?: string;
};

type TimerNoteProjection = {
  namespace: "timer";
  pageId: string;
  payload: {
    notePageId: string;
    notedAt: string;
    segmentId: string;
  };
  sourcePluginId: "timer";
  type: "time_segment_note_added";
};

type HabitEventProjection = {
  createdAt: string;
  namespace: "habit";
  payload: {
    date: string;
    habitPageId: string;
  };
  sourcePluginId: "habit";
  type: "checked" | "unchecked";
};

type TagProjection = {
  id: string;
  label: string;
  namespace: "tag";
  sourcePluginId: "tag";
  type: "tag";
};

const timerPluginId = "timer";
const timerNamespace = "timer";
const timerSegmentCreatedType = "time_segment_created";
const timerNoteAddedType = "time_segment_note_added";
const tagPluginId = "tag";
const tagNamespace = "tag";
const tagKey = "tags";
const habitPluginId = "habit";
const habitNamespace = "habit";
const habitEnabledKey = "enabled";
const defaultReportsAggregationId = "stats.sum-time-by-page";
const calendarSegmentsLimit = 1_000;
const statsRowsLimit = 1_000;
const maxTrustedNumericMagnitude = 1_000_000_000;
const maxTrustedStringLength = 200;
const timerSegmentPayloadKeys = new Set([
  "durationSeconds",
  "endAt",
  "pageId",
  "segmentId",
  "source",
  "startAt",
]);
const timerNotePayloadKeys = new Set(["notePageId", "notedAt", "segmentId"]);
const habitEventPayloadKeys = new Set(["date", "habitPageId"]);
const knownReportsAggregationIds = new Set<ReportsAggregationId>([
  "stats.estimate-vs-actual",
  "stats.habit-completion-rate",
  defaultReportsAggregationId,
  "stats.sum-time-by-tag",
  "stats.task-switch-count",
  "stats.unnoted-sessions-count",
]);

export function buildCalendarTimeSegmentsProjection(
  input: CalendarProjectionInput,
): CalendarTimeSegmentsProjection {
  const rangeStartMs = parseInstant(input.rangeStartAt);
  const rangeEndMs = parseInstant(input.rangeEndAt);

  if (
    rangeStartMs === null ||
    rangeEndMs === null ||
    rangeEndMs <= rangeStartMs
  ) {
    return {
      data: {
        kind: "calendar.time-segments",
        segments: [],
      },
      status: {
        kind: "unavailable",
        reasons: ["calendar.invalid-range"],
      },
    };
  }

  const activePages = collectActivePages(input.pages);
  const segments = collectTimerSegments(input.events, activePages)
    .filter((segment) => overlapsRange(segment, rangeStartMs, rangeEndMs))
    .sort(compareSegments);
  const boundedSegments = segments.slice(0, calendarSegmentsLimit);

  return {
    data: {
      kind: "calendar.time-segments",
      segments: boundedSegments.map(toCalendarSegmentRow),
    },
    status: createBoundedStatus(segments.length, calendarSegmentsLimit, {
      complete: "complete",
      empty: "empty",
      partialReason: "calendar.segment-limit",
    }),
  };
}

export function buildReportsStatsInputProjection(
  input: ReportsProjectionInput,
): ReportsStatsInputProjection {
  const aggregationId = readReportsAggregationId(input.aggregationId);
  const activePages = collectActivePages(input.pages);
  const tagIdsByPageId = collectTagIdsByPageId(input.metadata, activePages);
  const timerSegments = collectTimerSegments(input.events, activePages).sort(
    compareSegments,
  );
  const segments = timerSegments
    .slice(0, statsRowsLimit)
    .map((segment) =>
      toStatsSegmentRow(segment, tagIdsByPageId.get(segment.pageId) ?? []),
    );
  const overflowReasons =
    timerSegments.length > statsRowsLimit ? ["stats.input-limit"] : [];

  switch (aggregationId) {
    case "stats.sum-time-by-tag": {
      const tags = collectTagRows(tagIdsByPageId);

      return {
        aggregationId,
        chartViewId: "chart.bar",
        input: {
          kind: "stats.time-by-tag-input",
          segments,
          tags: tags.slice(0, statsRowsLimit),
        },
        status: createReportsStatus(
          segments.length,
          overflowReasons,
          tags.length > statsRowsLimit,
        ),
      };
    }
    case "stats.estimate-vs-actual":
      return {
        aggregationId,
        chartViewId: "chart.bar",
        input: {
          estimates: [],
          kind: "stats.estimate-vs-actual-input",
          segments,
        },
        status: {
          kind: "partial",
          reasons: ["task-estimates-unavailable"],
        },
      };
    case "stats.habit-completion-rate": {
      const habits = collectHabitSummaries(input.metadata, activePages);
      const habitIds = new Set(habits.map((habit) => habit.habitPageId));
      const events = collectHabitEvents(input.events, habitIds).slice(
        0,
        statsRowsLimit,
      );

      return {
        aggregationId,
        chartViewId: "chart.bar",
        input: {
          endDate: input.endDate,
          events,
          habits: habits.slice(0, statsRowsLimit),
          kind: "stats.habit-completion-input",
          startDate: input.startDate,
        },
        status: createReportsStatus(
          events.length + habits.length,
          overflowReasons,
          events.length > statsRowsLimit || habits.length > statsRowsLimit,
        ),
      };
    }
    case "stats.task-switch-count":
      return {
        aggregationId,
        chartViewId: "chart.bar",
        input: {
          kind: "stats.task-switch-count-input",
          segments,
        },
        status: createReportsStatus(segments.length, overflowReasons),
      };
    case "stats.unnoted-sessions-count": {
      const notes = collectTimerNotes(input.events, activePages).slice(
        0,
        statsRowsLimit,
      );

      return {
        aggregationId,
        chartViewId: "chart.bar",
        input: {
          kind: "stats.unnoted-sessions-input",
          notes,
          segments,
        },
        status: createReportsStatus(
          segments.length + notes.length,
          overflowReasons,
          notes.length > statsRowsLimit,
        ),
      };
    }
    case "stats.sum-time-by-page":
      return {
        aggregationId,
        chartViewId: "chart.bar",
        input: {
          kind: "stats.time-by-page-input",
          segments,
        },
        status: createReportsStatus(segments.length, overflowReasons),
      };
  }
}

function collectActivePages(
  pagesInput: readonly MarkdownPage[],
): ReadonlyMap<string, PageSummary> {
  const pages = copyArrayLike(pagesInput);
  const activePages = new Map<string, PageSummary>();

  for (const pageInput of pages) {
    const page = readPageSummary(pageInput);

    if (page !== null) {
      activePages.set(page.id, page);
    }
  }

  return activePages;
}

function readPageSummary(input: unknown): PageSummary | null {
  if (!isPlainObject(input)) {
    return null;
  }

  const id = readDataString(input, "id");
  const title = readDataString(input, "title");
  const archivedAt = readOptionalDataString(input, "archivedAt");

  if (
    id === null ||
    title === null ||
    archivedAt === null ||
    archivedAt !== undefined ||
    !isTrustedString(id) ||
    !isTrustedString(title)
  ) {
    return null;
  }

  return {
    id,
    title,
  };
}

function collectTimerSegments(
  eventsInput: readonly AppEvent[],
  activePages: ReadonlyMap<string, PageSummary>,
): TimerSegmentProjection[] {
  const events = copyArrayLike(eventsInput);
  const segments: TimerSegmentProjection[] = [];

  for (const eventInput of events) {
    const segment = readTimerSegment(eventInput, activePages);

    if (segment !== null) {
      segments.push(segment);
    }
  }

  return segments;
}

function readTimerSegment(
  input: unknown,
  activePages: ReadonlyMap<string, PageSummary>,
): TimerSegmentProjection | null {
  if (!isPlainObject(input)) {
    return null;
  }

  if (
    readDataString(input, "namespace") !== timerNamespace ||
    readDataString(input, "sourcePluginId") !== timerPluginId ||
    readDataString(input, "type") !== timerSegmentCreatedType
  ) {
    return null;
  }

  const eventPageId = readDataString(input, "pageId");
  const payload = readExactRecord(
    readDataProperty(input, "payload"),
    timerSegmentPayloadKeys,
  );

  if (eventPageId === null || payload === null) {
    return null;
  }

  const payloadPageId = readDataString(payload, "pageId");
  const page = payloadPageId === null ? undefined : activePages.get(payloadPageId);
  const durationSeconds = readDataNumber(payload, "durationSeconds");
  const endAt = readDataString(payload, "endAt");
  const segmentId = readDataString(payload, "segmentId");
  const source = readDataString(payload, "source");
  const startAt = readDataString(payload, "startAt");

  if (
    payloadPageId === null ||
    page === undefined ||
    eventPageId !== payloadPageId ||
    durationSeconds === null ||
    !isTrustedNumericMagnitude(durationSeconds) ||
    durationSeconds <= 0 ||
    endAt === null ||
    segmentId === null ||
    source !== timerPluginId ||
    startAt === null ||
    !isTrustedString(segmentId)
  ) {
    return null;
  }

  const startMs = parseInstant(startAt);
  const endMs = parseInstant(endAt);

  if (startMs === null || endMs === null || endMs <= startMs) {
    return null;
  }

  return {
    durationSeconds,
    endAt,
    endMs,
    pageId: page.id,
    pageTitle: page.title,
    provenance: {
      eventPageId: page.id,
      namespace: timerNamespace,
      sourcePluginId: timerPluginId,
      type: timerSegmentCreatedType,
    },
    segmentId,
    source: timerPluginId,
    startAt,
    startMs,
  };
}

function toCalendarSegmentRow(
  segment: TimerSegmentProjection,
): CalendarTimeSegmentProjectionRow {
  return {
    durationSeconds: segment.durationSeconds,
    endAt: segment.endAt,
    pageId: segment.pageId,
    pageTitle: segment.pageTitle,
    provenance: segment.provenance,
    segmentId: segment.segmentId,
    source: timerPluginId,
    startAt: segment.startAt,
  };
}

function toStatsSegmentRow(
  segment: TimerSegmentProjection,
  tagIds: readonly string[],
): Record<string, unknown> {
  return {
    durationSeconds: segment.durationSeconds,
    endAt: segment.endAt,
    pageId: segment.pageId,
    pageTitle: segment.pageTitle,
    provenance: segment.provenance,
    segmentId: segment.segmentId,
    source: timerPluginId,
    startAt: segment.startAt,
    ...(tagIds.length === 0 ? {} : { tagIds: [...tagIds] }),
    ...(segment.taskPageId === undefined
      ? {}
      : { taskPageId: segment.taskPageId }),
  };
}

function collectTagIdsByPageId(
  metadataInput: readonly MetadataRecord[],
  activePages: ReadonlyMap<string, PageSummary>,
): ReadonlyMap<string, string[]> {
  const records = copyArrayLike(metadataInput);
  const tagsByPageId = new Map<string, string[]>();

  for (const recordInput of records) {
    if (!isPlainObject(recordInput)) {
      continue;
    }

    const pageId = readDataString(recordInput, "pageId");

    if (
      pageId === null ||
      !activePages.has(pageId) ||
      readDataString(recordInput, "namespace") !== tagNamespace ||
      readDataString(recordInput, "key") !== tagKey ||
      readDataString(recordInput, "sourcePluginId") !== tagPluginId ||
      readDataString(recordInput, "valueType") !== "json"
    ) {
      continue;
    }

    const tagIds = readTagIdArray(readDataProperty(recordInput, "value"));

    if (tagIds.length > 0) {
      tagsByPageId.set(pageId, tagIds);
    }
  }

  return tagsByPageId;
}

function collectTagRows(
  tagIdsByPageId: ReadonlyMap<string, readonly string[]>,
): TagProjection[] {
  const tagIds = new Set<string>();

  for (const pageTagIds of tagIdsByPageId.values()) {
    for (const tagId of pageTagIds) {
      tagIds.add(tagId);
    }
  }

  return [...tagIds].map((tagId) => ({
    id: tagId,
    label: tagId,
    namespace: tagNamespace,
    sourcePluginId: tagPluginId,
    type: "tag",
  }));
}

function collectTimerNotes(
  eventsInput: readonly AppEvent[],
  activePages: ReadonlyMap<string, PageSummary>,
): TimerNoteProjection[] {
  const events = copyArrayLike(eventsInput);
  const notes: TimerNoteProjection[] = [];

  for (const eventInput of events) {
    const note = readTimerNote(eventInput, activePages);

    if (note !== null) {
      notes.push(note);
    }
  }

  return notes.sort((left, right) =>
    left.payload.notedAt.localeCompare(right.payload.notedAt) ||
    left.pageId.localeCompare(right.pageId) ||
    left.payload.segmentId.localeCompare(right.payload.segmentId),
  );
}

function readTimerNote(
  input: unknown,
  activePages: ReadonlyMap<string, PageSummary>,
): TimerNoteProjection | null {
  if (!isPlainObject(input)) {
    return null;
  }

  const pageId = readDataString(input, "pageId");
  const payload = readExactRecord(
    readDataProperty(input, "payload"),
    timerNotePayloadKeys,
  );

  if (
    pageId === null ||
    !activePages.has(pageId) ||
    readDataString(input, "namespace") !== timerNamespace ||
    readDataString(input, "sourcePluginId") !== timerPluginId ||
    readDataString(input, "type") !== timerNoteAddedType ||
    payload === null
  ) {
    return null;
  }

  const notePageId = readDataString(payload, "notePageId");
  const notedAt = readDataString(payload, "notedAt");
  const segmentId = readDataString(payload, "segmentId");

  if (
    notePageId === null ||
    notedAt === null ||
    parseInstant(notedAt) === null ||
    segmentId === null
  ) {
    return null;
  }

  return {
    namespace: timerNamespace,
    pageId,
    payload: {
      notePageId,
      notedAt,
      segmentId,
    },
    sourcePluginId: timerPluginId,
    type: timerNoteAddedType,
  };
}

function collectHabitSummaries(
  metadataInput: readonly MetadataRecord[],
  activePages: ReadonlyMap<string, PageSummary>,
): Array<{ habitPageId: string; title: string }> {
  const records = copyArrayLike(metadataInput);
  const habitIds = new Set<string>();

  for (const recordInput of records) {
    if (!isPlainObject(recordInput)) {
      continue;
    }

    const pageId = readDataString(recordInput, "pageId");

    if (
      pageId !== null &&
      activePages.has(pageId) &&
      readDataString(recordInput, "namespace") === habitNamespace &&
      readDataString(recordInput, "key") === habitEnabledKey &&
      readDataString(recordInput, "sourcePluginId") === habitPluginId &&
      readDataString(recordInput, "valueType") === "boolean" &&
      readDataProperty(recordInput, "value") === true
    ) {
      habitIds.add(pageId);
    }
  }

  return [...habitIds]
    .sort()
    .flatMap((habitPageId) => {
      const page = activePages.get(habitPageId);

      return page === undefined
        ? []
        : [
            {
              habitPageId,
              title: page.title,
            },
          ];
    });
}

function collectHabitEvents(
  eventsInput: readonly AppEvent[],
  habitIds: ReadonlySet<string>,
): HabitEventProjection[] {
  const events = copyArrayLike(eventsInput);
  const habitEvents: HabitEventProjection[] = [];

  for (const eventInput of events) {
    const event = readHabitEvent(eventInput, habitIds);

    if (event !== null) {
      habitEvents.push(event);
    }
  }

  return habitEvents.sort(
    (left, right) =>
      left.createdAt.localeCompare(right.createdAt) ||
      left.payload.habitPageId.localeCompare(right.payload.habitPageId) ||
      left.payload.date.localeCompare(right.payload.date) ||
      left.type.localeCompare(right.type),
  );
}

function readHabitEvent(
  input: unknown,
  habitIds: ReadonlySet<string>,
): HabitEventProjection | null {
  if (!isPlainObject(input)) {
    return null;
  }

  const payload = readExactRecord(
    readDataProperty(input, "payload"),
    habitEventPayloadKeys,
  );

  if (
    readDataString(input, "namespace") !== habitNamespace ||
    readDataString(input, "sourcePluginId") !== habitPluginId ||
    payload === null
  ) {
    return null;
  }

  const type = readDataString(input, "type");
  const createdAt = readDataString(input, "createdAt");
  const date = readDataString(payload, "date");
  const habitPageId = readDataString(payload, "habitPageId");

  if (
    (type !== "checked" && type !== "unchecked") ||
    createdAt === null ||
    parseInstant(createdAt) === null ||
    date === null ||
    parseDateOnly(date) === null ||
    habitPageId === null ||
    !habitIds.has(habitPageId)
  ) {
    return null;
  }

  return {
    createdAt,
    namespace: habitNamespace,
    payload: {
      date,
      habitPageId,
    },
    sourcePluginId: habitPluginId,
    type,
  };
}

function readTagIdArray(input: unknown): string[] {
  const values = copyArrayLike(input);
  const tagIds: string[] = [];

  for (const value of values) {
    if (
      typeof value === "string" &&
      value.trim().length > 0 &&
      isTrustedString(value) &&
      !tagIds.includes(value)
    ) {
      tagIds.push(value);
    }
  }

  return tagIds;
}

function readReportsAggregationId(input: string | undefined): ReportsAggregationId {
  return input !== undefined && knownReportsAggregationIds.has(input as ReportsAggregationId)
    ? (input as ReportsAggregationId)
    : defaultReportsAggregationId;
}

function createBoundedStatus(
  length: number,
  limit: number,
  labels: {
    complete: "complete";
    empty: "empty";
    partialReason: string;
  },
): ProjectionStatus {
  if (length === 0) {
    return {
      kind: labels.empty,
    };
  }

  if (length > limit) {
    return {
      kind: "partial",
      limit,
      omittedRows: length - limit,
      reasons: [labels.partialReason],
    };
  }

  return {
    kind: labels.complete,
  };
}

function createReportsStatus(
  rowCount: number,
  reasons: readonly string[],
  hasAdditionalOverflow = false,
): ProjectionStatus {
  const statusReasons = [...reasons];

  if (hasAdditionalOverflow && !statusReasons.includes("stats.input-limit")) {
    statusReasons.push("stats.input-limit");
  }

  if (statusReasons.length > 0) {
    return {
      kind: "partial",
      limit: statsRowsLimit,
      reasons: statusReasons,
    };
  }

  return rowCount === 0 ? { kind: "empty" } : { kind: "complete" };
}

function copyArrayLike(input: unknown): unknown[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const length = readArrayLength(input);

  if (length === null) {
    return [];
  }

  const values: unknown[] = [];

  for (let index = 0; index < length; index += 1) {
    const descriptor = getOwnProperty(input, String(index));

    if (!isReadableDataDescriptor(descriptor)) {
      continue;
    }

    values.push(descriptor.value);
  }

  return values;
}

function readExactRecord(
  input: unknown,
  requiredKeys: ReadonlySet<string>,
): Record<string, unknown> | null {
  if (!isPlainObject(input) || Object.getOwnPropertySymbols(input).length > 0) {
    return null;
  }

  const names = Object.getOwnPropertyNames(input);

  if (names.length !== requiredKeys.size) {
    return null;
  }

  for (const key of requiredKeys) {
    const descriptor = getOwnProperty(input, key);

    if (!isReadableDataDescriptor(descriptor)) {
      return null;
    }
  }

  for (const name of names) {
    if (!requiredKeys.has(name)) {
      return null;
    }
  }

  return input;
}

function readDataProperty(input: Record<string, unknown>, key: string): unknown {
  const descriptor = getOwnProperty(input, key);

  return isReadableDataDescriptor(descriptor) ? descriptor.value : undefined;
}

function readDataString(
  input: Record<string, unknown>,
  key: string,
): string | null {
  const value = readDataProperty(input, key);

  return typeof value === "string" ? value : null;
}

function readOptionalDataString(
  input: Record<string, unknown>,
  key: string,
): string | undefined | null {
  const descriptor = getOwnProperty(input, key);

  if (descriptor === undefined) {
    return undefined;
  }

  if (!isReadableDataDescriptor(descriptor)) {
    return null;
  }

  return typeof descriptor.value === "string" ? descriptor.value : null;
}

function readDataNumber(
  input: Record<string, unknown>,
  key: string,
): number | null {
  const value = readDataProperty(input, key);

  return typeof value === "number" ? value : null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function isReadableDataDescriptor(
  descriptor: PropertyDescriptor | undefined,
): descriptor is PropertyDescriptor & { value: unknown } {
  return (
    descriptor !== undefined &&
    descriptor.enumerable === true &&
    Object.prototype.hasOwnProperty.call(descriptor, "value")
  );
}

function getOwnProperty(
  input: object,
  key: string,
): PropertyDescriptor | undefined {
  try {
    return Object.getOwnPropertyDescriptor(input, key);
  } catch {
    return undefined;
  }
}

function readArrayLength(input: unknown[]): number | null {
  try {
    return Number.isSafeInteger(input.length) && input.length >= 0
      ? input.length
      : null;
  } catch {
    return null;
  }
}

function parseInstant(input: string): number | null {
  const ms = Date.parse(input);

  return Number.isFinite(ms) ? ms : null;
}

function parseDateOnly(input: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(input)) {
    return null;
  }

  const ms = Date.parse(`${input}T00:00:00.000Z`);

  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === input
    ? ms
    : null;
}

function isTrustedString(value: string): boolean {
  return value.length > 0 && value.length <= maxTrustedStringLength;
}

function isTrustedNumericMagnitude(value: number): boolean {
  return (
    Number.isFinite(value) && Math.abs(value) <= maxTrustedNumericMagnitude
  );
}

function overlapsRange(
  segment: TimerSegmentProjection,
  rangeStartMs: number,
  rangeEndMs: number,
): boolean {
  return segment.startMs < rangeEndMs && segment.endMs > rangeStartMs;
}

function compareSegments(
  left: TimerSegmentProjection,
  right: TimerSegmentProjection,
): number {
  return (
    left.startMs - right.startMs ||
    left.endMs - right.endMs ||
    left.pageTitle.localeCompare(right.pageTitle) ||
    left.segmentId.localeCompare(right.segmentId)
  );
}
