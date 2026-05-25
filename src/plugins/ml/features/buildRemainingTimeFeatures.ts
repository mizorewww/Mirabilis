import {
  mlPredictionInputKind,
  type MlPredictionFeatures,
} from "../algorithms/predictRemainingTime";

export type MlRemainingTimePredictionInput = {
  events: EventProjection[];
  generatedAt: string;
  kind: typeof mlPredictionInputKind;
  metadata: MetadataProjection[];
  pageId: string;
  pages: PageProjection[];
};

export type RemainingTimeFeatureContext = {
  features: MlPredictionFeatures;
  generatedAt: string;
  hasTaskEstimate: boolean;
  pageId: string;
  pageTitle: string;
};

type EventProjection = {
  createdAt: string;
  namespace: string;
  pageId?: string;
  payload: Record<string, unknown>;
  sourcePluginId: string;
  type: string;
};

type MetadataProjection = {
  key: string;
  namespace: string;
  pageId: string;
  sourcePluginId: string;
  value: unknown;
  valueType: MetadataValueType;
};

type MetadataValueType =
  | "boolean"
  | "date"
  | "json"
  | "null"
  | "number"
  | "string";

type PageProjection = {
  archived?: boolean;
  id: string;
  parentPageId?: string;
  title: string;
};

type TimerSegment = {
  durationSeconds: number;
  pageId: string;
};

const maxMlProjectionItems = 1_000;
const maxMlTextLength = 1_000;
const maxTrustedNumericMagnitude = 1_000_000_000;
const taskPluginId = "task";
const taskNamespace = "task";
const tagPluginId = "tag";
const tagNamespace = "tag";
const timerPluginId = "timer";
const timerNamespace = "timer";
const timerSegmentCreatedType = "time_segment_created";
const timerNoteAddedType = "time_segment_note_added";
const inputKeys = new Set([
  "events",
  "generatedAt",
  "kind",
  "metadata",
  "pageId",
  "pages",
]);
const pageKeys = new Set(["id", "title"]);
const pageOptionalKeys = new Set(["archived", "parentPageId"]);
const metadataKeys = new Set([
  "key",
  "namespace",
  "pageId",
  "sourcePluginId",
  "value",
  "valueType",
]);
const eventKeys = new Set([
  "createdAt",
  "namespace",
  "payload",
  "sourcePluginId",
  "type",
]);
const eventOptionalKeys = new Set(["pageId"]);
const segmentPayloadKeys = new Set([
  "durationSeconds",
  "endAt",
  "pageId",
  "segmentId",
  "source",
  "startAt",
]);
const notePayloadKeys = new Set(["notePageId", "notedAt", "segmentId"]);
const metadataValueTypes = new Set<MetadataValueType>([
  "boolean",
  "date",
  "json",
  "null",
  "number",
  "string",
]);
const doneStatuses = new Set(["done", "completed"]);

export function readRemainingTimePredictionInput(
  input: unknown,
): MlRemainingTimePredictionInput {
  const payload = readExactRecord(
    input,
    inputKeys,
    "ml.remaining-time-prediction-input",
  );
  const pageId = readNonBlankString(payload.pageId, "prediction pageId");
  const generatedAt = readInstantString(
    payload.generatedAt,
    "prediction generatedAt",
  );

  if (payload.kind !== mlPredictionInputKind) {
    throw new Error("ML prediction input requires matching kind");
  }

  return {
    events: readProjectionArray(
      payload.events,
      "ML prediction events",
      readEventProjection,
    ),
    generatedAt,
    kind: mlPredictionInputKind,
    metadata: readProjectionArray(
      payload.metadata,
      "ML prediction metadata",
      readMetadataProjection,
    ),
    pageId,
    pages: readProjectionArray(
      payload.pages,
      "ML prediction pages",
      readPageProjection,
    ),
  };
}

export function buildRemainingTimeFeatures(
  input: MlRemainingTimePredictionInput,
): RemainingTimeFeatureContext {
  const currentPage = input.pages.find((page) => page.id === input.pageId);

  if (currentPage === undefined || currentPage.archived === true) {
    throw new Error("ML prediction input requires a current page projection");
  }

  const tagIdsByPage = new Map<string, string[]>();
  const statusByPage = new Map<string, string>();
  let taskEstimateSeconds: number | null = null;

  for (const record of input.metadata) {
    if (isTrustedTaskMetadata(record)) {
      if (record.key === "estimateSeconds") {
        const estimateSeconds = readTrustedEstimateSeconds(record);

        if (record.pageId === input.pageId && taskEstimateSeconds === null) {
          taskEstimateSeconds = estimateSeconds;
        }
      } else if (record.key === "status") {
        statusByPage.set(record.pageId, readTrustedStatus(record));
      }
    } else if (isTrustedTagMetadata(record) && record.key === "tags") {
      tagIdsByPage.set(record.pageId, readTrustedTagIds(record));
    }
  }

  const trackedSecondsByPage = new Map<string, number>();
  let timerNoteCount = 0;

  for (const event of input.events) {
    if (!isTrustedTimerEvent(event)) {
      continue;
    }

    if (event.type === timerSegmentCreatedType) {
      const segment = readTimerSegment(event);
      const currentTotal = trackedSecondsByPage.get(segment.pageId) ?? 0;
      const nextTotal = currentTotal + segment.durationSeconds;

      if (!isTrustedNumericMagnitude(nextTotal)) {
        throw new Error("ML prediction Timer totals must be bounded");
      }

      trackedSecondsByPage.set(segment.pageId, nextTotal);
    } else if (event.type === timerNoteAddedType && event.pageId === input.pageId) {
      readTimerNote(event);
      timerNoteCount += 1;
    }
  }

  const childPages = input.pages.filter(
    (page) => page.parentPageId === input.pageId && page.archived !== true,
  );
  const childTasksCompleted = childPages.filter((page) =>
    doneStatuses.has(statusByPage.get(page.id) ?? ""),
  ).length;
  const tagIds = tagIdsByPage.get(input.pageId) ?? [];
  const similarTrackedSeconds = input.pages.flatMap((page) => {
    if (
      page.id === input.pageId ||
      page.parentPageId === input.pageId ||
      page.archived === true ||
      !doneStatuses.has(statusByPage.get(page.id) ?? "") ||
      !sharesTag(tagIds, tagIdsByPage.get(page.id) ?? [])
    ) {
      return [];
    }

    const trackedSeconds = trackedSecondsByPage.get(page.id) ?? 0;

    return trackedSeconds > 0 ? [trackedSeconds] : [];
  });
  const similarAverageSeconds =
    similarTrackedSeconds.length === 0
      ? null
      : Math.round(
          similarTrackedSeconds.reduce((sum, value) => sum + value, 0) /
            similarTrackedSeconds.length,
        );

  return {
    features: {
      baselineTotalSeconds: taskEstimateSeconds ?? similarAverageSeconds,
      childTasksCompleted,
      childTasksTotal: childPages.length,
      similarAverageSeconds,
      similarCompletedTasks: similarTrackedSeconds.length,
      tagIds,
      timerNoteCount,
      trackedSeconds: trackedSecondsByPage.get(input.pageId) ?? 0,
    },
    generatedAt: input.generatedAt,
    hasTaskEstimate: taskEstimateSeconds !== null,
    pageId: input.pageId,
    pageTitle: currentPage.title,
  };
}

function readPageProjection(input: unknown): PageProjection {
  const payload = readExactRecord(
    input,
    pageKeys,
    "ML prediction page projection",
    pageOptionalKeys,
  );
  const page: PageProjection = {
    id: readNonBlankString(payload.id, "page id"),
    title: readBoundedText(payload.title, "page title"),
  };

  if (payload.archived !== undefined) {
    if (typeof payload.archived !== "boolean") {
      throw new Error("page archived flag must be boolean");
    }

    page.archived = payload.archived;
  }

  if (payload.parentPageId !== undefined) {
    page.parentPageId = readNonBlankString(
      payload.parentPageId,
      "page parentPageId",
    );
  }

  return page;
}

function readMetadataProjection(input: unknown): MetadataProjection {
  const payload = readExactRecord(
    input,
    metadataKeys,
    "ML prediction metadata projection",
  );
  const valueType = readMetadataValueType(payload.valueType);

  return {
    key: readNonBlankString(payload.key, "metadata key"),
    namespace: readNonBlankString(payload.namespace, "metadata namespace"),
    pageId: readNonBlankString(payload.pageId, "metadata pageId"),
    sourcePluginId: readNonBlankString(
      payload.sourcePluginId,
      "metadata sourcePluginId",
    ),
    value: readMetadataValue(payload.value, valueType),
    valueType,
  };
}

function readEventProjection(input: unknown): EventProjection {
  const payload = readExactRecord(
    input,
    eventKeys,
    "ML prediction event projection",
    eventOptionalKeys,
  );
  const event: EventProjection = {
    createdAt: readInstantString(payload.createdAt, "event createdAt"),
    namespace: readNonBlankString(payload.namespace, "event namespace"),
    payload: readPlainRecord(payload.payload, "event payload"),
    sourcePluginId: readNonBlankString(
      payload.sourcePluginId,
      "event sourcePluginId",
    ),
    type: readNonBlankString(payload.type, "event type"),
  };

  if (payload.pageId !== undefined) {
    event.pageId = readNonBlankString(payload.pageId, "event pageId");
  }

  return event;
}

function readTrustedEstimateSeconds(record: MetadataProjection): number {
  if (
    record.valueType !== "number" ||
    typeof record.value !== "number" ||
    record.value <= 0 ||
    !isTrustedNumericMagnitude(record.value)
  ) {
    throw new Error("ML prediction task estimate must be positive seconds");
  }

  return record.value;
}

function readTrustedStatus(record: MetadataProjection): string {
  if (record.valueType !== "string" || typeof record.value !== "string") {
    throw new Error("ML prediction task status must be text");
  }

  return record.value;
}

function readTrustedTagIds(record: MetadataProjection): string[] {
  if (record.valueType !== "json") {
    throw new Error("ML prediction tags must be JSON");
  }

  const values = copyInertPlainArray(record.value, "tag values", maxMlProjectionItems);
  const tagIds: string[] = [];

  for (const value of values) {
    const tagId = readNonBlankString(value, "tag id");

    if (!tagIds.includes(tagId)) {
      tagIds.push(tagId);
    }
  }

  return tagIds;
}

function readTimerSegment(event: EventProjection): TimerSegment {
  const payload = readExactRecord(
    event.payload,
    segmentPayloadKeys,
    "Timer segment payload",
  );
  const pageId = readNonBlankString(payload.pageId, "Timer segment pageId");
  const durationSeconds = payload.durationSeconds;
  const startAt = readInstantString(payload.startAt, "Timer segment startAt");
  const endAt = readInstantString(payload.endAt, "Timer segment endAt");

  if (
    event.pageId !== pageId ||
    payload.source !== timerPluginId ||
    typeof durationSeconds !== "number" ||
    durationSeconds <= 0 ||
    !isTrustedNumericMagnitude(durationSeconds) ||
    Date.parse(endAt) <= Date.parse(startAt)
  ) {
    throw new Error("ML prediction Timer segment must be trusted");
  }

  readNonBlankString(payload.segmentId, "Timer segment id");

  return {
    durationSeconds,
    pageId,
  };
}

function readTimerNote(event: EventProjection): void {
  const payload = readExactRecord(
    event.payload,
    notePayloadKeys,
    "Timer note payload",
  );

  readNonBlankString(payload.notePageId, "Timer note pageId");
  readInstantString(payload.notedAt, "Timer note timestamp");
  readNonBlankString(payload.segmentId, "Timer note segmentId");
}

function readProjectionArray<T>(
  input: unknown,
  label: string,
  reader: (item: unknown) => T,
): T[] {
  return copyInertPlainArray(input, label, maxMlProjectionItems).map(reader);
}

function readExactRecord(
  input: unknown,
  requiredKeys: ReadonlySet<string>,
  label: string,
  optionalKeys: ReadonlySet<string> = new Set(),
): Record<string, unknown> {
  const payload = readExactRecordOrNull(input, requiredKeys, optionalKeys);

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

function readPlainRecord(input: unknown, label: string): Record<string, unknown> {
  if (
    typeof input !== "object" ||
    input === null ||
    Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Object.prototype
  ) {
    throw new Error(`${label} must be exact plain data`);
  }

  const ownKeys = Reflect.ownKeys(input);

  if (ownKeys.length > 20) {
    throw new Error(`${label} exceeds maximum field count`);
  }

  const output: Record<string, unknown> = {};

  for (const key of ownKeys) {
    if (typeof key !== "string") {
      throw new Error(`${label} contains untrusted fields`);
    }

    const descriptor = Object.getOwnPropertyDescriptor(input, key);

    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, "value")
    ) {
      throw new Error(`${label} must be exact plain data`);
    }

    output[key] = descriptor.value;
  }

  return output;
}

function copyInertPlainArray(
  input: unknown,
  label: string,
  maxItems: number,
): unknown[] {
  if (
    !Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Array.prototype
  ) {
    throw new Error(`${label} must be an inert plain array`);
  }

  const lengthDescriptor = Object.getOwnPropertyDescriptor(input, "length");

  if (
    lengthDescriptor === undefined ||
    !Object.prototype.hasOwnProperty.call(lengthDescriptor, "value") ||
    !Number.isSafeInteger(lengthDescriptor.value) ||
    lengthDescriptor.value < 0 ||
    lengthDescriptor.value > maxItems
  ) {
    throw new Error(`${label} must be a bounded inert plain array`);
  }

  const length = lengthDescriptor.value;

  for (const key of Reflect.ownKeys(input)) {
    if (key === "length") {
      continue;
    }

    if (typeof key !== "string" || readArrayIndex(key, length) === null) {
      throw new Error(`${label} must be an inert plain array`);
    }
  }

  const values: unknown[] = [];

  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(input, String(index));

    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, "value")
    ) {
      throw new Error(`${label} must be an inert plain array`);
    }

    values.push(descriptor.value);
  }

  return values;
}

function readArrayIndex(key: string, length: number): number | null {
  if (!/^(?:0|[1-9]\d*)$/u.test(key)) {
    return null;
  }

  const index = Number(key);

  return Number.isSafeInteger(index) && index >= 0 && index < length
    ? index
    : null;
}

function readMetadataValue(input: unknown, valueType: MetadataValueType): unknown {
  switch (valueType) {
    case "boolean":
      if (typeof input === "boolean") {
        return input;
      }
      break;
    case "date":
    case "string":
      if (typeof input === "string" && input.length <= maxMlTextLength) {
        return input;
      }
      break;
    case "json":
      return copyJsonValue(input, 0);
    case "null":
      if (input === null) {
        return null;
      }
      break;
    case "number":
      if (typeof input === "number" && isTrustedNumericMagnitude(input)) {
        return input;
      }
      break;
  }

  throw new Error("metadata value does not match valueType");
}

function copyJsonValue(input: unknown, depth: number): unknown {
  if (depth > 6) {
    throw new Error("JSON metadata exceeds maximum depth");
  }

  if (input === null || typeof input === "boolean") {
    return input;
  }

  if (typeof input === "string") {
    return readBoundedText(input, "JSON text");
  }

  if (typeof input === "number") {
    if (!isTrustedNumericMagnitude(input)) {
      throw new Error("JSON number must be bounded");
    }

    return input;
  }

  if (Array.isArray(input)) {
    return copyInertPlainArray(input, "JSON array", maxMlProjectionItems).map(
      (value) => copyJsonValue(value, depth + 1),
    );
  }

  const record = readPlainRecord(input, "JSON object");
  const output: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(record)) {
    if (key.length > maxMlTextLength) {
      throw new Error("JSON object key must be bounded");
    }

    output[key] = copyJsonValue(value, depth + 1);
  }

  return output;
}

function readMetadataValueType(input: unknown): MetadataValueType {
  if (metadataValueTypes.has(input as MetadataValueType)) {
    return input as MetadataValueType;
  }

  throw new Error("metadata valueType is unsupported");
}

function readNonBlankString(input: unknown, label: string): string {
  const value = readBoundedText(input, label);

  if (value.trim().length === 0) {
    throw new Error(`${label} must be nonblank text`);
  }

  return value;
}

function readBoundedText(input: unknown, label: string): string {
  if (typeof input !== "string" || input.length > maxMlTextLength) {
    throw new Error(`${label} must be bounded text`);
  }

  return input;
}

function readInstantString(input: unknown, label: string): string {
  const value = readNonBlankString(input, label);

  if (!Number.isFinite(Date.parse(value))) {
    throw new Error(`${label} must be a valid instant`);
  }

  return value;
}

function isTrustedTaskMetadata(record: MetadataProjection): boolean {
  return (
    record.namespace === taskNamespace &&
    record.sourcePluginId === taskPluginId
  );
}

function isTrustedTagMetadata(record: MetadataProjection): boolean {
  return (
    record.namespace === tagNamespace &&
    record.sourcePluginId === tagPluginId
  );
}

function isTrustedTimerEvent(event: EventProjection): boolean {
  return (
    event.namespace === timerNamespace &&
    event.sourcePluginId === timerPluginId
  );
}

function sharesTag(left: readonly string[], right: readonly string[]): boolean {
  return left.some((tagId) => right.includes(tagId));
}

function isTrustedNumericMagnitude(input: number): boolean {
  return (
    Number.isFinite(input) &&
    Math.abs(input) <= maxTrustedNumericMagnitude
  );
}
