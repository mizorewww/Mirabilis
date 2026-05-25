import type { AppPlugin } from "../../core";

export type ChartCategorySeries = {
  categories: readonly ChartCategoryItem[];
  kind: "chart.category-series";
  title: string;
  unit: "seconds" | "count" | "percent";
};

export type ChartCategoryItem = {
  id?: string;
  label: string;
  value: number;
};

export type ChartComparisonSeries = {
  comparisons: readonly ChartComparisonItem[];
  kind: "chart.comparison-series";
  title: string;
  unit: "seconds";
};

export type ChartComparisonItem = {
  actualSeconds: number;
  deltaSeconds: number;
  errorPercent: number;
  expectedSeconds: number;
  label: string;
};

export type ChartData = ChartCategorySeries | ChartComparisonSeries;

export type StatsAggregationInput =
  | EstimateVsActualInput
  | HabitCompletionInput
  | TaskSwitchCountInput
  | TimeByPageInput
  | TimeByTagInput
  | UnnotedSessionsInput;

export type StatsAggregationResult = ChartData;

export type StatsRunAggregationPayload = {
  aggregationId: StatsAggregationId;
  input: StatsAggregationInput;
};

type StatsAggregationId =
  | "stats.estimate-vs-actual"
  | "stats.habit-completion-rate"
  | "stats.sum-time-by-page"
  | "stats.sum-time-by-tag"
  | "stats.task-switch-count"
  | "stats.unnoted-sessions-count";

type TimerSegment = {
  durationSeconds: number;
  endAt: string;
  pageId: string;
  pageTitle: string;
  segmentId: string;
  source: "timer";
  startAt: string;
  startMs: number;
  tagIds: readonly string[];
  taskPageId?: string;
};

type TagMetadata = {
  id: string;
  label: string;
};

type TaskEstimate = {
  estimateSeconds: number;
  pageId: string;
};

type HabitEvent = {
  createdAtMs: number;
  date: string;
  habitPageId: string;
  type: "checked" | "unchecked";
};

type HabitSummary = {
  habitPageId: string;
  title: string;
};

type TimerNote = {
  pageId: string;
  segmentId: string;
};

type PageTotal = {
  label: string;
  pageId: string;
  value: number;
};

type TimeByTagInput = {
  kind: "stats.time-by-tag-input";
  segments: readonly unknown[];
  tags: readonly unknown[];
};

type TimeByPageInput = {
  kind: "stats.time-by-page-input";
  segments: readonly unknown[];
};

type EstimateVsActualInput = {
  estimates: readonly unknown[];
  kind: "stats.estimate-vs-actual-input";
  segments: readonly unknown[];
};

type HabitCompletionInput = {
  endDate: string;
  events: readonly unknown[];
  habits: readonly unknown[];
  kind: "stats.habit-completion-input";
  startDate: string;
};

type TaskSwitchCountInput = {
  kind: "stats.task-switch-count-input";
  segments: readonly unknown[];
};

type UnnotedSessionsInput = {
  kind: "stats.unnoted-sessions-input";
  notes: readonly unknown[];
  segments: readonly unknown[];
};

const pluginId = "stats";
const runAggregationCommandId = "stats.run-aggregation";
const timerPluginId = "timer";
const timerNamespace = "timer";
const timerSegmentCreatedType = "time_segment_created";
const timerNoteAddedType = "time_segment_note_added";
const tagPluginId = "tag";
const tagNamespace = "tag";
const taskPluginId = "task";
const taskNamespace = "task";
const habitPluginId = "habit";
const habitNamespace = "habit";
const maxStatsInputItems = 1_000;
const maxTrustedNumericMagnitude = 1_000_000_000;
const maxTrustedLabelLength = 200;
const aggregationInputKinds = {
  "stats.estimate-vs-actual": "stats.estimate-vs-actual-input",
  "stats.habit-completion-rate": "stats.habit-completion-input",
  "stats.sum-time-by-page": "stats.time-by-page-input",
  "stats.sum-time-by-tag": "stats.time-by-tag-input",
  "stats.task-switch-count": "stats.task-switch-count-input",
  "stats.unnoted-sessions-count": "stats.unnoted-sessions-input",
} as const satisfies Record<StatsAggregationId, string>;
const runAggregationKeys = new Set(["aggregationId", "input"]);
const timeByTagInputKeys = new Set(["kind", "segments", "tags"]);
const timeByPageInputKeys = new Set(["kind", "segments"]);
const estimateVsActualInputKeys = new Set(["estimates", "kind", "segments"]);
const habitCompletionInputKeys = new Set([
  "endDate",
  "events",
  "habits",
  "kind",
  "startDate",
]);
const taskSwitchInputKeys = new Set(["kind", "segments"]);
const unnotedSessionsInputKeys = new Set(["kind", "notes", "segments"]);
const segmentRequiredKeys = new Set([
  "durationSeconds",
  "endAt",
  "pageId",
  "pageTitle",
  "provenance",
  "segmentId",
  "source",
  "startAt",
]);
const segmentOptionalKeys = new Set(["tagIds", "taskPageId"]);
const provenanceKeys = new Set([
  "eventPageId",
  "namespace",
  "sourcePluginId",
  "type",
]);
const tagMetadataKeys = new Set([
  "id",
  "label",
  "namespace",
  "sourcePluginId",
  "type",
]);
const taskEstimateKeys = new Set([
  "estimateSeconds",
  "namespace",
  "pageId",
  "sourcePluginId",
  "type",
]);
const habitEventKeys = new Set([
  "createdAt",
  "namespace",
  "payload",
  "sourcePluginId",
  "type",
]);
const habitEventPayloadKeys = new Set(["date", "habitPageId"]);
const habitSummaryKeys = new Set(["habitPageId", "title"]);
const noteEventKeys = new Set([
  "namespace",
  "pageId",
  "payload",
  "sourcePluginId",
  "type",
]);
const noteEventPayloadKeys = new Set(["notePageId", "notedAt", "segmentId"]);

export const StatsPlugin: AppPlugin = {
  manifest: {
    id: pluginId,
    name: "Stats Plugin",
    version: "1.0.0",
    description: "Aggregate normalized reporting DTOs into chart data.",
    minAppVersion: "0.1.0",
    contributes: {
      algorithms: [
        {
          id: "stats.sum-time-by-tag",
          name: "Sum time by tag",
        },
        {
          id: "stats.sum-time-by-page",
          name: "Sum time by page",
        },
        {
          id: "stats.estimate-vs-actual",
          name: "Estimate vs actual",
        },
        {
          id: "stats.habit-completion-rate",
          name: "Habit completion rate",
        },
        {
          id: "stats.task-switch-count",
          name: "Task switch count",
        },
        {
          id: "stats.unnoted-sessions-count",
          name: "Unnoted sessions count",
        },
      ],
    },
  },
  register(ctx) {
    ctx.commands.register<unknown, StatsAggregationResult>({
      id: runAggregationCommandId,
      title: "Run aggregation",
      handler: runAggregation,
    });
  },
};

function runAggregation(input: unknown): StatsAggregationResult {
  const payload = readRunAggregationPayload(input);

  switch (payload.aggregationId) {
    case "stats.sum-time-by-tag":
      return aggregateTimeByTag(payload.input as TimeByTagInput);
    case "stats.sum-time-by-page":
      return aggregateTimeByPage(payload.input as TimeByPageInput);
    case "stats.estimate-vs-actual":
      return aggregateEstimateVsActual(payload.input as EstimateVsActualInput);
    case "stats.habit-completion-rate":
      return aggregateHabitCompletion(payload.input as HabitCompletionInput);
    case "stats.task-switch-count":
      return aggregateTaskSwitchCount(payload.input as TaskSwitchCountInput);
    case "stats.unnoted-sessions-count":
      return aggregateUnnotedSessions(payload.input as UnnotedSessionsInput);
  }
}

function readRunAggregationPayload(
  input: unknown,
): {
  aggregationId: StatsAggregationId;
  input: StatsAggregationInput;
} {
  const payload = readExactRecord(
    input,
    runAggregationKeys,
    `${runAggregationCommandId} input`,
  );
  const aggregationId = payload.aggregationId;

  if (!isAggregationId(aggregationId)) {
    throw new Error(`${runAggregationCommandId} requires a known aggregationId`);
  }

  return {
    aggregationId,
    input: readAggregationInput(aggregationId, payload.input),
  };
}

function readAggregationInput(
  aggregationId: StatsAggregationId,
  input: unknown,
): StatsAggregationInput {
  switch (aggregationId) {
    case "stats.sum-time-by-tag": {
      const payload = readExactRecord(
        input,
        timeByTagInputKeys,
        `${aggregationId} input`,
      );
      requireKind(payload.kind, aggregationInputKinds[aggregationId], aggregationId);
      return {
        kind: "stats.time-by-tag-input",
        segments: readArray(payload.segments, `${aggregationId} segments`),
        tags: readArray(payload.tags, `${aggregationId} tags`),
      };
    }
    case "stats.sum-time-by-page": {
      const payload = readExactRecord(
        input,
        timeByPageInputKeys,
        `${aggregationId} input`,
      );
      requireKind(payload.kind, aggregationInputKinds[aggregationId], aggregationId);
      return {
        kind: "stats.time-by-page-input",
        segments: readArray(payload.segments, `${aggregationId} segments`),
      };
    }
    case "stats.estimate-vs-actual": {
      const payload = readExactRecord(
        input,
        estimateVsActualInputKeys,
        `${aggregationId} input`,
      );
      requireKind(payload.kind, aggregationInputKinds[aggregationId], aggregationId);
      return {
        estimates: readArray(payload.estimates, `${aggregationId} estimates`),
        kind: "stats.estimate-vs-actual-input",
        segments: readArray(payload.segments, `${aggregationId} segments`),
      };
    }
    case "stats.habit-completion-rate": {
      const payload = readExactRecord(
        input,
        habitCompletionInputKeys,
        `${aggregationId} input`,
      );
      requireKind(payload.kind, aggregationInputKinds[aggregationId], aggregationId);
      const startDate = readDateOnlyString(payload.startDate);
      const endDate = readDateOnlyString(payload.endDate);

      if (startDate === null || endDate === null) {
        throw new Error(`${aggregationId} requires valid date range`);
      }

      return {
        endDate,
        events: readArray(payload.events, `${aggregationId} events`),
        habits: readArray(payload.habits, `${aggregationId} habits`),
        kind: "stats.habit-completion-input",
        startDate,
      };
    }
    case "stats.task-switch-count": {
      const payload = readExactRecord(
        input,
        taskSwitchInputKeys,
        `${aggregationId} input`,
      );
      requireKind(payload.kind, aggregationInputKinds[aggregationId], aggregationId);
      return {
        kind: "stats.task-switch-count-input",
        segments: readArray(payload.segments, `${aggregationId} segments`),
      };
    }
    case "stats.unnoted-sessions-count": {
      const payload = readExactRecord(
        input,
        unnotedSessionsInputKeys,
        `${aggregationId} input`,
      );
      requireKind(payload.kind, aggregationInputKinds[aggregationId], aggregationId);
      return {
        kind: "stats.unnoted-sessions-input",
        notes: readArray(payload.notes, `${aggregationId} notes`),
        segments: readArray(payload.segments, `${aggregationId} segments`),
      };
    }
  }
}

function aggregateTimeByTag(input: TimeByTagInput): ChartCategorySeries {
  const tagsById = new Map(
    input.tags.flatMap((tagInput) => {
      const tag = readTagMetadata(tagInput);

      return tag === null ? [] : [[tag.id, tag.label] as const];
    }),
  );
  const totals = new Map<string, number>();

  for (const segmentInput of input.segments) {
    const segment = readTimerSegment(segmentInput);

    if (segment === null) {
      continue;
    }

    const labels = segment.tagIds.flatMap((tagId) => {
      const label = tagsById.get(tagId);

      return label === undefined ? [] : [label];
    });

    if (labels.length === 0) {
      addToTotal(totals, "No tag", segment.durationSeconds);
      continue;
    }

    for (const label of labels) {
      addToTotal(totals, label, segment.durationSeconds);
    }
  }

  return {
    categories: mapTotalsToCategories(totals),
    kind: "chart.category-series",
    title: "Time by tag",
    unit: "seconds",
  };
}

function aggregateTimeByPage(input: TimeByPageInput): ChartCategorySeries {
  const totals = new Map<string, PageTotal>();

  for (const segmentInput of input.segments) {
    const segment = readTimerSegment(segmentInput);

    if (segment !== null) {
      addToPageTotal(totals, segment);
    }
  }

  return {
    categories: mapPageTotalsToCategories(totals),
    kind: "chart.category-series",
    title: "Time by page",
    unit: "seconds",
  };
}

function aggregateEstimateVsActual(
  input: EstimateVsActualInput,
): ChartComparisonSeries {
  const estimates = new Map(
    input.estimates.flatMap((estimateInput) => {
      const estimate = readTaskEstimate(estimateInput);

      return estimate === null
        ? []
        : [[estimate.pageId, estimate.estimateSeconds] as const];
    }),
  );
  const actualSecondsByTask = new Map<string, number>();

  for (const segmentInput of input.segments) {
    const segment = readTimerSegment(segmentInput);

    if (segment?.taskPageId !== undefined && estimates.has(segment.taskPageId)) {
      addToTotal(
        actualSecondsByTask,
        segment.taskPageId,
        segment.durationSeconds,
      );
    }
  }

  const comparisons: ChartComparisonItem[] = [];

  for (const [taskPageId, actualSeconds] of actualSecondsByTask) {
    const expectedSeconds = estimates.get(taskPageId);

    if (expectedSeconds === undefined) {
      continue;
    }

    const deltaSeconds = actualSeconds - expectedSeconds;
    const errorPercent = (deltaSeconds / expectedSeconds) * 100;

    if (
      !isTrustedNumericMagnitude(deltaSeconds) ||
      !isTrustedNumericMagnitude(errorPercent)
    ) {
      continue;
    }

    comparisons.push({
      actualSeconds,
      deltaSeconds,
      errorPercent,
      expectedSeconds,
      label: taskPageId,
    });
  }

  return {
    comparisons,
    kind: "chart.comparison-series",
    title: "Estimate vs actual",
    unit: "seconds",
  };
}

function aggregateHabitCompletion(
  input: HabitCompletionInput,
): ChartCategorySeries {
  const startMs = parseDateOnly(input.startDate);
  const endMs = parseDateOnly(input.endDate);

  if (startMs === null || endMs === null || endMs < startMs) {
    return {
      categories: [],
      kind: "chart.category-series",
      title: "Habit completion",
      unit: "count",
    };
  }

  const habits = input.habits.flatMap((habitInput) => {
    const habit = readHabitSummary(habitInput);

    return habit === null ? [] : [habit];
  });
  const habitIds = new Set(habits.map((habit) => habit.habitPageId));
  const terminalEvents = new Map<string, HabitEvent>();

  for (const eventInput of input.events) {
    const event = readHabitEvent(eventInput);

    if (event === null || !habitIds.has(event.habitPageId)) {
      continue;
    }

    const eventDateMs = parseDateOnly(event.date);

    if (eventDateMs === null || eventDateMs < startMs || eventDateMs > endMs) {
      continue;
    }

    const key = `${event.habitPageId}\u0000${event.date}`;
    const previous = terminalEvents.get(key);

    if (previous === undefined || previous.createdAtMs <= event.createdAtMs) {
      terminalEvents.set(key, event);
    }
  }

  const completionsByHabit = new Map<string, number>();

  for (const event of terminalEvents.values()) {
    if (event.type === "checked") {
      addToTotal(completionsByHabit, event.habitPageId, 1);
    }
  }

  return {
    categories: habits.flatMap((habit) => {
      const value = completionsByHabit.get(habit.habitPageId) ?? 0;

      return value === 0 ? [] : [{ label: habit.title, value }];
    }),
    kind: "chart.category-series",
    title: "Habit completion",
    unit: "count",
  };
}

function aggregateTaskSwitchCount(
  input: TaskSwitchCountInput,
): ChartCategorySeries {
  const segments = input.segments
    .flatMap((segmentInput) => {
      const segment = readTimerSegment(segmentInput);

      return segment === null ? [] : [segment];
    })
    .sort(compareSegmentsByStart);
  let switchCount = 0;

  for (let index = 1; index < segments.length; index += 1) {
    if (segments[index - 1]?.pageId !== segments[index]?.pageId) {
      switchCount += 1;
    }
  }

  return {
    categories: [{ label: "Task switches", value: switchCount }],
    kind: "chart.category-series",
    title: "Task switching",
    unit: "count",
  };
}

function aggregateUnnotedSessions(
  input: UnnotedSessionsInput,
): ChartCategorySeries {
  const notedSegmentKeys = new Set(
    input.notes.flatMap((noteInput) => {
      const note = readTimerNote(noteInput);

      return note === null ? [] : [`${note.pageId}\u0000${note.segmentId}`];
    }),
  );
  const totals = new Map<string, PageTotal>();

  for (const segmentInput of input.segments) {
    const segment = readTimerSegment(segmentInput);

    if (
      segment !== null &&
      !notedSegmentKeys.has(`${segment.pageId}\u0000${segment.segmentId}`)
    ) {
      addToPageTotal(totals, segment, 1);
    }
  }

  return {
    categories: mapPageTotalsToCategories(totals),
    kind: "chart.category-series",
    title: "Unnoted sessions",
    unit: "count",
  };
}

function readTimerSegment(input: unknown): TimerSegment | null {
  const payload = readExactRecordOrNull(
    input,
    segmentRequiredKeys,
    segmentOptionalKeys,
  );

  if (payload === null) {
    return null;
  }

  const provenance = readExactRecordOrNull(payload.provenance, provenanceKeys);
  const durationSeconds = payload.durationSeconds;
  const endAt = payload.endAt;
  const pageId = payload.pageId;
  const pageTitle = payload.pageTitle;
  const segmentId = payload.segmentId;
  const source = payload.source;
  const startAt = payload.startAt;

  if (
    provenance === null ||
    typeof durationSeconds !== "number" ||
    !isTrustedNumericMagnitude(durationSeconds) ||
    durationSeconds <= 0 ||
    !isTrustedString(endAt) ||
    !isTrustedString(pageId) ||
    !isTrustedString(pageTitle) ||
    !isTrustedString(segmentId) ||
    source !== timerPluginId ||
    !isTrustedString(startAt) ||
    provenance.eventPageId !== pageId ||
    provenance.namespace !== timerNamespace ||
    provenance.sourcePluginId !== timerPluginId ||
    provenance.type !== timerSegmentCreatedType
  ) {
    return null;
  }

  const startMs = parseInstant(startAt);
  const endMs = parseInstant(endAt);

  if (startMs === null || endMs === null || endMs <= startMs) {
    return null;
  }

  const tagIds = readOptionalStringArray(payload.tagIds);

  if (tagIds === null) {
    return null;
  }

  const taskPageId = readOptionalNonBlankString(payload.taskPageId);

  if (taskPageId === null) {
    return null;
  }

  return {
    durationSeconds,
    endAt,
    pageId,
    pageTitle,
    segmentId,
    source,
    startAt,
    startMs,
    tagIds,
    ...(taskPageId === undefined ? {} : { taskPageId }),
  };
}

function readTagMetadata(input: unknown): TagMetadata | null {
  const payload = readExactRecordOrNull(input, tagMetadataKeys);

  if (
    payload === null ||
    payload.namespace !== tagNamespace ||
    payload.sourcePluginId !== tagPluginId ||
    payload.type !== "tag" ||
    !isTrustedString(payload.id) ||
    !isTrustedString(payload.label)
  ) {
    return null;
  }

  return {
    id: payload.id,
    label: payload.label,
  };
}

function readTaskEstimate(input: unknown): TaskEstimate | null {
  const payload = readExactRecordOrNull(input, taskEstimateKeys);

  if (
    payload === null ||
    payload.namespace !== taskNamespace ||
    payload.sourcePluginId !== taskPluginId ||
    payload.type !== "estimate" ||
    !isTrustedString(payload.pageId) ||
    typeof payload.estimateSeconds !== "number" ||
    !isTrustedNumericMagnitude(payload.estimateSeconds) ||
    payload.estimateSeconds <= 0
  ) {
    return null;
  }

  return {
    estimateSeconds: payload.estimateSeconds,
    pageId: payload.pageId,
  };
}

function readHabitEvent(input: unknown): HabitEvent | null {
  const payload = readExactRecordOrNull(input, habitEventKeys);
  const eventPayload =
    payload === null
      ? null
      : readExactRecordOrNull(payload.payload, habitEventPayloadKeys);

  if (
    payload === null ||
    eventPayload === null ||
    payload.namespace !== habitNamespace ||
    payload.sourcePluginId !== habitPluginId ||
    (payload.type !== "checked" && payload.type !== "unchecked") ||
    !isTrustedString(payload.createdAt) ||
    typeof eventPayload.date !== "string" ||
    !isTrustedString(eventPayload.habitPageId)
  ) {
    return null;
  }

  const createdAtMs = parseInstant(payload.createdAt);
  const date = readDateOnlyString(eventPayload.date);

  if (createdAtMs === null || date === null) {
    return null;
  }

  return {
    createdAtMs,
    date,
    habitPageId: eventPayload.habitPageId,
    type: payload.type,
  };
}

function readHabitSummary(input: unknown): HabitSummary | null {
  const payload = readExactRecordOrNull(input, habitSummaryKeys);

  if (
    payload === null ||
    !isTrustedString(payload.habitPageId) ||
    !isTrustedString(payload.title)
  ) {
    return null;
  }

  return {
    habitPageId: payload.habitPageId,
    title: payload.title,
  };
}

function readTimerNote(input: unknown): TimerNote | null {
  const payload = readExactRecordOrNull(input, noteEventKeys);
  const notePayload =
    payload === null
      ? null
      : readExactRecordOrNull(payload.payload, noteEventPayloadKeys);

  if (
    payload === null ||
    notePayload === null ||
    payload.namespace !== timerNamespace ||
    payload.sourcePluginId !== timerPluginId ||
    payload.type !== timerNoteAddedType ||
    !isTrustedString(payload.pageId) ||
    !isTrustedString(notePayload.notePageId) ||
    !isTrustedString(notePayload.notedAt) ||
    !isTrustedString(notePayload.segmentId) ||
    parseInstant(notePayload.notedAt) === null
  ) {
    return null;
  }

  return {
    pageId: payload.pageId,
    segmentId: notePayload.segmentId,
  };
}

function readExactRecord(
  input: unknown,
  requiredKeys: ReadonlySet<string>,
  label: string,
): Record<string, unknown> {
  const payload = readExactRecordOrNull(input, requiredKeys);

  if (payload === null) {
    throw new Error(`${label} must be exact plain data`);
  }

  return payload;
}

function readExactRecordOrNull(
  input: unknown,
  requiredKeys: ReadonlySet<string>,
  optionalKeys: ReadonlySet<string> = new Set(),
): Record<string, unknown> | null {
  if (
    typeof input !== "object" ||
    input === null ||
    Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Object.prototype
  ) {
    return null;
  }

  const ownKeys = Reflect.ownKeys(input);

  if (
    ownKeys.length < requiredKeys.size ||
    ownKeys.length > requiredKeys.size + optionalKeys.size
  ) {
    return null;
  }

  for (const key of ownKeys) {
    if (
      typeof key !== "string" ||
      (!requiredKeys.has(key) && !optionalKeys.has(key))
    ) {
      return null;
    }

    const descriptor = Object.getOwnPropertyDescriptor(input, key);

    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, "value")
    ) {
      return null;
    }
  }

  for (const key of requiredKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);

    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, "value")
    ) {
      return null;
    }
  }

  return input as Record<string, unknown>;
}

function readArray(input: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(input)) {
    throw new Error(`${label} must be an array`);
  }

  if (input.length > maxStatsInputItems) {
    throw new Error(`${label} exceeds maximum item count`);
  }

  return input;
}

function readOptionalStringArray(input: unknown): readonly string[] | null {
  if (input === undefined) {
    return [];
  }

  if (!Array.isArray(input) || input.length > maxStatsInputItems) {
    return null;
  }

  const values: string[] = [];

  for (const value of input) {
    if (!isTrustedString(value)) {
      return null;
    }

    values.push(value);
  }

  return values;
}

function readOptionalNonBlankString(
  input: unknown,
): string | null | undefined {
  if (input === undefined) {
    return undefined;
  }

  return isTrustedString(input) ? input : null;
}

function isAggregationId(input: unknown): input is StatsAggregationId {
  return (
    typeof input === "string" &&
    Object.prototype.hasOwnProperty.call(aggregationInputKinds, input)
  );
}

function requireKind(input: unknown, expected: string, label: string): void {
  if (input !== expected) {
    throw new Error(`${label} requires matching input kind`);
  }
}

function parseInstant(input: string): number | null {
  const timestamp = Date.parse(input);

  return Number.isFinite(timestamp) ? timestamp : null;
}

function parseDateOnly(input: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(input)) {
    return null;
  }

  const timestamp = Date.parse(`${input}T00:00:00.000Z`);

  if (!Number.isFinite(timestamp)) {
    return null;
  }

  return new Date(timestamp).toISOString().slice(0, 10) === input
    ? timestamp
    : null;
}

function readDateOnlyString(input: unknown): string | null {
  return typeof input === "string" && parseDateOnly(input) !== null
    ? input
    : null;
}

function addToTotal(totals: Map<string, number>, label: string, value: number): void {
  const nextValue = (totals.get(label) ?? 0) + value;

  if (isTrustedNumericMagnitude(nextValue)) {
    totals.set(label, nextValue);
  }
}

function mapTotalsToCategories(totals: ReadonlyMap<string, number>): ChartCategoryItem[] {
  return [...totals].flatMap(([label, value]) =>
    isTrustedString(label) && isTrustedNumericMagnitude(value)
      ? [{ label, value }]
      : [],
  );
}

function addToPageTotal(
  totals: Map<string, PageTotal>,
  segment: TimerSegment,
  value = segment.durationSeconds,
): void {
  const current = totals.get(segment.pageId);
  const nextValue = (current?.value ?? 0) + value;

  if (!isTrustedNumericMagnitude(nextValue)) {
    return;
  }

  totals.set(segment.pageId, {
    label: current?.label ?? segment.pageTitle,
    pageId: segment.pageId,
    value: nextValue,
  });
}

function mapPageTotalsToCategories(
  totals: ReadonlyMap<string, PageTotal>,
): ChartCategoryItem[] {
  const labelCounts = new Map<string, number>();

  for (const total of totals.values()) {
    labelCounts.set(total.label, (labelCounts.get(total.label) ?? 0) + 1);
  }

  return [...totals.values()].flatMap((total) => {
    if (
      !isTrustedString(total.label) ||
      !isTrustedString(total.pageId) ||
      !isTrustedNumericMagnitude(total.value)
    ) {
      return [];
    }

    return [
      {
        ...(labelCounts.get(total.label) === 1 ? {} : { id: total.pageId }),
        label: total.label,
        value: total.value,
      },
    ];
  });
}

function compareSegmentsByStart(left: TimerSegment, right: TimerSegment): number {
  return (
    left.startMs - right.startMs ||
    left.segmentId.localeCompare(right.segmentId)
  );
}

function isTrustedString(input: unknown): input is string {
  return (
    typeof input === "string" &&
    input.trim().length > 0 &&
    input.length <= maxTrustedLabelLength
  );
}

function isTrustedNumericMagnitude(input: number): boolean {
  return (
    Number.isFinite(input) &&
    Math.abs(input) <= maxTrustedNumericMagnitude
  );
}
