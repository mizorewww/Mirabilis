import type {
  AppEvent,
  MarkdownPage,
  MetadataRecord,
} from "../../core";

type ProjectionStatus =
  | {
      kind: "complete" | "empty";
    }
  | {
      kind: "partial";
      limit: number;
      omittedRows: number;
      reasons: string[];
    }
  | {
      kind: "unavailable";
      reasons: string[];
    };

type ProjectionInput = {
  currentPageId: string;
  events: readonly AppEvent[];
  generatedAt: string;
  metadata: readonly MetadataRecord[];
  pages: readonly MarkdownPage[];
};

type AiProjectionInput = ProjectionInput & {
  prediction?: unknown;
};

type PageSummary = {
  id: string;
  parentPageId?: string;
  title: string;
};

type PageWithBody = PageSummary & {
  bodyMarkdown: string;
};

type MetadataProjection = {
  key: string;
  namespace: string;
  pageId: string;
  sourcePluginId: string;
  value: unknown;
  valueType: string;
};

type TimerEventProjection = {
  createdAt: string;
  namespace: "timer";
  pageId: string;
  payload: Record<string, unknown>;
  sourcePluginId: "timer";
  type: "time_segment_created" | "time_segment_note_added";
};

type BoundedRows<Row> = {
  rows: Row[];
  totalRows: number;
};

const mlPredictionAlgorithmId = "ml.predict-remaining-time";
const mlPredictionInputKind = "ml.remaining-time-prediction-input";
const mlPredictionResultKind = "ml.remaining-time-prediction";
const mlBaselineModelId = "ml.remaining-time-baseline.v1";
const mlProjectionLimit = 1_000;
const aiProjectionLimit = 100;
const aiCurrentPageTextLimit = 50_000;
const timerPluginId = "timer";
const timerSegmentType = "time_segment_created";
const timerNoteType = "time_segment_note_added";
const allowedMetadataKeys = new Map([
  ["tag", new Set(["tags"])],
  ["task", new Set(["estimateSeconds", "status"])],
]);
const allowedMetadataValueTypes = new Set([
  "boolean",
  "date",
  "json",
  "null",
  "number",
  "string",
]);
const timerSegmentPayloadKeys = new Set([
  "durationSeconds",
  "endAt",
  "pageId",
  "segmentId",
  "source",
  "startAt",
]);
const timerNotePayloadKeys = new Set(["notePageId", "notedAt", "segmentId"]);
const mlPredictionKeys = new Set([
  "algorithmId",
  "confidence",
  "features",
  "generatedAt",
  "kind",
  "limitations",
  "maxSeconds",
  "minSeconds",
  "modelId",
  "pageId",
  "pageTitle",
  "reasons",
]);
const mlPredictionFeatureKeys = new Set([
  "baselineTotalSeconds",
  "childTasksCompleted",
  "childTasksTotal",
  "similarAverageSeconds",
  "similarCompletedTasks",
  "tagIds",
  "timerNoteCount",
  "trackedSeconds",
]);
const unsafeProjectionKeyNames = new Set([
  "api" + "key",
  "auth" + "orization",
  "credential",
  "key" + "chain",
  "password",
  "provider",
  "provider" + "id",
  "provider" + "settings",
  "raw" + "error" + "path",
  "sec" + "ret",
  "token",
]);
const unsafeProjectionTextTerms = [
  "api" + "key",
  "auth" + "orization",
  "bear" + "er",
  "credential",
  "key" + "chain",
  "password",
  "provider" + "id",
  "provider" + "settings",
  "raw" + "error" + "path",
  "sec" + "ret",
  "token",
] as const;
const pathLikeTextPattern =
  /(?:^|[\s:=])(?:\/(?:home|Users|tmp|var|etc|opt|private|mnt|Volumes)\/|[A-Za-z]:[\\/]|\.{1,2}[\\/])/u;
const missingData = Symbol("missing-data");

export function buildMlContextProjection(input: ProjectionInput) {
  const seed = readProjectionSeed(input);
  const source = readProjectionInput(input);

  if (source === undefined) {
    return createUnavailableMlProjection(seed);
  }

  const context = readCurrentPageContext(source);

  if (context === undefined) {
    return createUnavailableMlProjection(source);
  }

  const pagesBound = boundRows(context.pages, mlProjectionLimit);
  const projectedPageIds = new Set(pagesBound.rows.map((page) => page.id));
  const metadataBound = boundRows(
    collectMetadata(source.metadata, projectedPageIds),
    mlProjectionLimit,
  );
  const eventsBound = boundRows(
    collectTimerEvents(source.events, projectedPageIds),
    mlProjectionLimit,
  );

  return {
    data: {
      algorithmId: mlPredictionAlgorithmId,
      input: {
        events: eventsBound.rows,
        generatedAt: source.generatedAt,
        kind: mlPredictionInputKind,
        metadata: metadataBound.rows,
        pageId: context.currentPage.id,
        pages: pagesBound.rows.map(toMlPageProjection),
      },
    },
    status: createBoundedStatus(
      [
        { bound: pagesBound, reason: "ml.context-limit" },
        { bound: metadataBound, reason: "ml.context-limit" },
        { bound: eventsBound, reason: "ml.context-limit" },
      ],
      "ml.context-limit",
    ),
  };
}

export function buildAiContextProjection(input: AiProjectionInput) {
  const source = readAiProjectionInput(input);

  if (source === undefined) {
    return createUnavailableAiProjection();
  }

  const context = readCurrentPageContext(source);

  if (context === undefined) {
    return createUnavailableAiProjection();
  }

  const currentPageIds = new Set([context.currentPage.id]);
  const currentMetadata = collectMetadata(source.metadata, currentPageIds);
  const metadataBound = boundRows(currentMetadata, aiProjectionLimit);
  const childrenBound = boundRows(context.children, aiProjectionLimit);
  const page = {
    bodyMarkdown: context.currentPage.bodyMarkdown.slice(
      0,
      aiCurrentPageTextLimit,
    ),
    id: context.currentPage.id,
    title: context.currentPage.title,
  };
  const advisoryCommands: Record<string, unknown> = {
    "ai.generate-subtasks": {
      existingChildren: childrenBound.rows.map((child) => ({
        bodyMarkdown: "",
        id: child.id,
        title: child.title,
      })),
      kind: "ai.generate-subtasks-input",
      page,
    },
    "ai.suggest-due-date": {
      kind: "ai.suggest-due-date-input",
      metadata: metadataBound.rows,
      now: source.generatedAt,
      page,
    },
    "ai.suggest-tags": {
      existingTags: collectExistingTags(metadataBound.rows),
      kind: "ai.suggest-tags-input",
      page,
    },
  };
  const prediction = readCurrentPagePrediction(
    source.prediction,
    context.currentPage.id,
  );

  if (prediction !== undefined) {
    advisoryCommands["ai.explain-prediction"] = {
      kind: "ai.explain-prediction-input",
      page,
      prediction,
    };
  }

  return {
    data: {
      advisoryCommands,
      page,
    },
    status: createBoundedStatus(
      [
        { bound: childrenBound, reason: "ai.context-limit" },
        { bound: metadataBound, reason: "ai.context-limit" },
        {
          bound: {
            rows:
              context.currentPage.bodyMarkdown.length > aiCurrentPageTextLimit
                ? [page]
                : [],
            totalRows:
              context.currentPage.bodyMarkdown.length > aiCurrentPageTextLimit
                ? 2
                : 0,
          },
          reason: "ai.context-limit",
        },
      ],
      "ai.context-limit",
    ),
  };
}

function createUnavailableMlProjection(seed: {
  currentPageId: string;
  generatedAt: string;
}) {
  return {
    data: {
      algorithmId: mlPredictionAlgorithmId,
      input: {
        events: [],
        generatedAt: seed.generatedAt,
        kind: mlPredictionInputKind,
        metadata: [],
        pageId: seed.currentPageId,
        pages: [],
      },
    },
    status: {
      kind: "unavailable",
      reasons: ["ml.context-unavailable"],
    },
  };
}

function createUnavailableAiProjection() {
  return {
    data: {
      advisoryCommands: {},
      page: {},
    },
    status: {
      kind: "unavailable",
      reasons: ["ai.context-unavailable"],
    },
  };
}

function readProjectionSeed(input: ProjectionInput): {
  currentPageId: string;
  generatedAt: string;
} {
  return {
    currentPageId: readTopLevelString(input, "currentPageId") ?? "",
    generatedAt: readTopLevelString(input, "generatedAt") ?? "",
  };
}

function readProjectionInput(input: ProjectionInput): ProjectionInput | undefined {
  const seed = readProjectionSeed(input);
  const events = readTopLevelProperty(input, "events");
  const metadata = readTopLevelProperty(input, "metadata");
  const pages = readTopLevelProperty(input, "pages");

  if (
    seed.currentPageId.trim().length === 0 ||
    seed.generatedAt.trim().length === 0 ||
    !Array.isArray(events) ||
    !Array.isArray(metadata) ||
    !Array.isArray(pages)
  ) {
    return undefined;
  }

  return {
    currentPageId: seed.currentPageId,
    events: events as readonly AppEvent[],
    generatedAt: seed.generatedAt,
    metadata: metadata as readonly MetadataRecord[],
    pages: pages as readonly MarkdownPage[],
  };
}

function readAiProjectionInput(
  input: AiProjectionInput,
): AiProjectionInput | undefined {
  const source = readProjectionInput(input);

  if (source === undefined) {
    return undefined;
  }

  const prediction = readTopLevelProperty(input, "prediction");

  return {
    ...source,
    ...(prediction === missingData ? {} : { prediction }),
  };
}

function readCurrentPageContext(input: ProjectionInput):
  | {
      children: PageSummary[];
      currentPage: PageWithBody;
      pages: PageSummary[];
    }
  | undefined {
  const activePages = copyArrayLike(input.pages).flatMap((pageInput) => {
    const page = readPageSummary(pageInput);

    return page === null ? [] : [page];
  });
  const currentPage = activePages.find((page) => page.id === input.currentPageId);

  if (currentPage === undefined) {
    return undefined;
  }

  const bodyMarkdown = readPageBodyMarkdown(
    readDataProperty(currentPage.raw, "body"),
  );

  if (bodyMarkdown === undefined) {
    return undefined;
  }

  const children = activePages.filter(
    (page) => page.parentPageId === currentPage.id,
  );

  return {
    children: children.map(toPageSummary),
    currentPage: {
      bodyMarkdown,
      id: currentPage.id,
      title: currentPage.title,
    },
    pages: [
      {
        id: currentPage.id,
        title: currentPage.title,
      },
      ...children.map(toPageSummary),
    ],
  };
}

function toPageSummary(page: PageSummary & { raw: Record<string, unknown> }): PageSummary {
  return {
    id: page.id,
    ...(page.parentPageId === undefined
      ? {}
      : { parentPageId: page.parentPageId }),
    title: page.title,
  };
}

function readPageSummary(
  input: unknown,
): (PageSummary & { raw: Record<string, unknown> }) | null {
  if (!isPlainRecord(input) || hasOwnSymbols(input)) {
    return null;
  }

  const id = readDataString(input, "id");
  const title = readDataString(input, "title");
  const parentPageId = readOptionalDataString(input, "parentPageId");
  const archivedAt = readOptionalDataString(input, "archivedAt");

  if (
    id === null ||
    title === null ||
    parentPageId === null ||
    archivedAt === null ||
    archivedAt !== undefined ||
    id.trim().length === 0 ||
    title.trim().length === 0
  ) {
    return null;
  }

  return {
    id,
    ...(parentPageId === undefined ? {} : { parentPageId }),
    raw: input,
    title,
  };
}

function readPageBodyMarkdown(input: unknown): string | undefined {
  if (!isPlainRecord(input) || readDataString(input, "type") !== "doc") {
    return undefined;
  }

  const blocks = copyArrayLike(readDataProperty(input, "content"));
  const lines: string[] = [];

  for (const block of blocks) {
    if (!isPlainRecord(block) || hasOwnSymbols(block)) {
      return undefined;
    }

    const text = readOptionalDataString(block, "text");

    if (text === null) {
      return undefined;
    }

    lines.push(text ?? "");
  }

  return lines.join("\n");
}

function toMlPageProjection(page: PageSummary): Record<string, unknown> {
  return {
    id: page.id,
    ...(page.parentPageId === undefined
      ? {}
      : { parentPageId: page.parentPageId }),
    title: page.title,
  };
}

function collectMetadata(
  input: readonly MetadataRecord[],
  pageIds: ReadonlySet<string>,
): MetadataProjection[] {
  const rows: MetadataProjection[] = [];
  const records = copyArrayLike(input);

  for (const recordInput of records) {
    const row = readMetadataProjection(recordInput, pageIds);

    if (row !== null) {
      rows.push(row);
    }
  }

  return rows;
}

function readMetadataProjection(
  input: unknown,
  pageIds: ReadonlySet<string>,
): MetadataProjection | null {
  if (!isPlainRecord(input) || hasOwnSymbols(input)) {
    return null;
  }

  const pageId = readDataString(input, "pageId");
  const namespace = readDataString(input, "namespace");
  const key = readDataString(input, "key");
  const sourcePluginId = readDataString(input, "sourcePluginId");
  const valueType = readDataString(input, "valueType");
  const allowedKeys = namespace === null ? undefined : allowedMetadataKeys.get(namespace);

  if (
    pageId === null ||
    namespace === null ||
    key === null ||
    sourcePluginId === null ||
    valueType === null ||
    sourcePluginId !== namespace ||
    allowedKeys === undefined ||
    !allowedKeys.has(key) ||
    !pageIds.has(pageId) ||
    !allowedMetadataValueTypes.has(valueType)
  ) {
    return null;
  }

  const value = snapshotJsonValue(readDataProperty(input, "value"));

  if (
    value === missingData ||
    !isAllowedMetadataValue(namespace, key, valueType, value) ||
    containsUnsafeProjectionValue(value)
  ) {
    return null;
  }

  return {
    key,
    namespace,
    pageId,
    sourcePluginId,
    value,
    valueType,
  };
}

function isAllowedMetadataValue(
  namespace: string,
  key: string,
  valueType: string,
  value: unknown,
): boolean {
  if (namespace === "tag" && key === "tags") {
    return (
      valueType === "json" &&
      Array.isArray(value) &&
      value.every((item) => typeof item === "string")
    );
  }

  if (namespace === "task" && key === "estimateSeconds") {
    return valueType === "number" && typeof value === "number" && Number.isFinite(value);
  }

  if (namespace === "task" && key === "status") {
    return valueType === "string" && typeof value === "string";
  }

  return false;
}

function containsUnsafeProjectionValue(input: unknown): boolean {
  if (typeof input === "string") {
    return isUnsafeProjectionText(input);
  }

  if (Array.isArray(input)) {
    return input.some(containsUnsafeProjectionValue);
  }

  if (!isPlainRecord(input)) {
    return false;
  }

  for (const [key, value] of Object.entries(input)) {
    if (
      isUnsafeProjectionKey(key) ||
      containsUnsafeProjectionValue(value)
    ) {
      return true;
    }
  }

  return false;
}

function isUnsafeProjectionKey(key: string): boolean {
  return unsafeProjectionKeyNames.has(key.replace(/[^A-Za-z0-9]/gu, "").toLowerCase());
}

function isUnsafeProjectionText(value: string): boolean {
  const normalized = value.replace(/[^A-Za-z0-9]/gu, "").toLowerCase();

  return (
    unsafeProjectionTextTerms.some((term) => normalized.includes(term)) ||
    pathLikeTextPattern.test(value)
  );
}

function collectTimerEvents(
  input: readonly AppEvent[],
  pageIds: ReadonlySet<string>,
): TimerEventProjection[] {
  const rows: TimerEventProjection[] = [];
  const events = copyArrayLike(input);

  for (const eventInput of events) {
    const row = readTimerEventProjection(eventInput, pageIds);

    if (row !== null) {
      rows.push(row);
    }
  }

  return rows;
}

function readTimerEventProjection(
  input: unknown,
  pageIds: ReadonlySet<string>,
): TimerEventProjection | null {
  if (!isPlainRecord(input) || hasOwnSymbols(input)) {
    return null;
  }

  if (
    readDataString(input, "namespace") !== timerPluginId ||
    readDataString(input, "sourcePluginId") !== timerPluginId
  ) {
    return null;
  }

  const pageId = readDataString(input, "pageId");
  const type = readDataString(input, "type");
  const createdAt = readDataString(input, "createdAt");

  if (
    pageId === null ||
    createdAt === null ||
    !pageIds.has(pageId) ||
    (type !== timerSegmentType && type !== timerNoteType)
  ) {
    return null;
  }

  if (type === timerSegmentType) {
    const payload = readExactRecord(
      readDataProperty(input, "payload"),
      timerSegmentPayloadKeys,
    );

    if (payload === null) {
      return null;
    }

    const payloadPageId = readDataString(payload, "pageId");
    const durationSeconds = readDataNumber(payload, "durationSeconds");
    const endAt = readDataString(payload, "endAt");
    const segmentId = readDataString(payload, "segmentId");
    const source = readDataString(payload, "source");
    const startAt = readDataString(payload, "startAt");

    if (
      payloadPageId !== pageId ||
      durationSeconds === null ||
      endAt === null ||
      segmentId === null ||
      source !== timerPluginId ||
      startAt === null
    ) {
      return null;
    }

    return {
      createdAt,
      namespace: timerPluginId,
      pageId,
      payload: {
        durationSeconds,
        endAt,
        pageId,
        segmentId,
        source,
        startAt,
      },
      sourcePluginId: timerPluginId,
      type,
    };
  }

  const payload = readExactRecord(
    readDataProperty(input, "payload"),
    timerNotePayloadKeys,
  );

  if (payload === null) {
    return null;
  }

  const notePageId = readDataString(payload, "notePageId");
  const notedAt = readDataString(payload, "notedAt");
  const segmentId = readDataString(payload, "segmentId");

  if (notePageId === null || notedAt === null || segmentId === null) {
    return null;
  }

  return {
    createdAt,
    namespace: timerPluginId,
    pageId,
    payload: {
      notePageId,
      notedAt,
      segmentId,
    },
    sourcePluginId: timerPluginId,
    type,
  };
}

function collectExistingTags(metadata: readonly MetadataProjection[]): string[] {
  const tags: string[] = [];

  for (const record of metadata) {
    if (
      record.namespace !== "tag" ||
      record.key !== "tags" ||
      !Array.isArray(record.value)
    ) {
      continue;
    }

    for (const value of record.value) {
      if (
        typeof value === "string" &&
        value.trim().length > 0 &&
        !tags.includes(value)
      ) {
        tags.push(value);
      }
    }
  }

  return tags;
}

function readCurrentPagePrediction(
  input: unknown,
  currentPageId: string,
): unknown | undefined {
  return readExactMlPredictionForPage(input, currentPageId);
}

export function readExactMlPredictionForPage(
  input: unknown,
  currentPageId: string,
): unknown | undefined {
  const snapshot = snapshotJsonValue(input);

  if (
    snapshot === missingData ||
    !isPlainRecord(snapshot) ||
    hasOwnSymbols(snapshot)
  ) {
    return undefined;
  }

  const record = readExactRecord(snapshot, mlPredictionKeys);

  if (record === null) {
    return undefined;
  }

  const features = readExactRecord(
    readDataProperty(record, "features"),
    mlPredictionFeatureKeys,
  );
  const limitations = readStringArray(readDataProperty(record, "limitations"));
  const reasons = readStringArray(readDataProperty(record, "reasons"));

  if (
    readDataString(record, "kind") !== mlPredictionResultKind ||
    readDataString(record, "algorithmId") !== mlPredictionAlgorithmId ||
    readDataString(record, "modelId") !== mlBaselineModelId ||
    readDataString(record, "pageId") !== currentPageId ||
    readDataString(record, "pageTitle") === null ||
    readDataString(record, "generatedAt") === null ||
    readDataNumber(record, "confidence") === null ||
    readDataNumber(record, "minSeconds") === null ||
    readDataNumber(record, "maxSeconds") === null ||
    features === null ||
    limitations === undefined ||
    reasons === undefined
  ) {
    return undefined;
  }

  const similarAverageSeconds = readDataProperty(
    features,
    "similarAverageSeconds",
  );
  const tagIds = readStringArray(readDataProperty(features, "tagIds"));

  if (
    readDataNumber(features, "baselineTotalSeconds") === null ||
    readDataNumber(features, "childTasksCompleted") === null ||
    readDataNumber(features, "childTasksTotal") === null ||
    !(
      similarAverageSeconds === null ||
      (typeof similarAverageSeconds === "number" &&
        Number.isFinite(similarAverageSeconds))
    ) ||
    readDataNumber(features, "similarCompletedTasks") === null ||
    tagIds === undefined ||
    readDataNumber(features, "timerNoteCount") === null ||
    readDataNumber(features, "trackedSeconds") === null
  ) {
    return undefined;
  }

  return snapshot;
}

function boundRows<Row>(
  rows: readonly Row[],
  limit: number,
): BoundedRows<Row> {
  return {
    rows: rows.slice(0, limit),
    totalRows: rows.length,
  };
}

function createBoundedStatus(
  candidates: readonly {
    bound: BoundedRows<unknown>;
    reason: string;
  }[],
  fallbackReason: string,
): ProjectionStatus {
  const overflows = candidates
    .map(({ bound, reason }) => ({
      omittedRows: Math.max(0, bound.totalRows - bound.rows.length),
      reason,
    }))
    .filter((overflow) => overflow.omittedRows > 0);

  if (overflows.length > 0) {
    return {
      kind: "partial",
      limit:
        candidates.find(
          ({ bound }) => bound.totalRows > bound.rows.length,
        )?.bound.rows.length ?? 0,
      omittedRows: overflows.reduce(
        (total, overflow) => total + overflow.omittedRows,
        0,
      ),
      reasons: [...new Set(overflows.map((overflow) => overflow.reason))],
    };
  }

  return {
    kind: candidates.some(({ bound }) => bound.rows.length > 0)
      ? "complete"
      : fallbackReason.startsWith("ai.")
        ? "complete"
        : "empty",
  };
}

function copyArrayLike(input: unknown): unknown[] {
  return copyExactArrayValues(input) ?? [];
}

function readExactRecord(
  input: unknown,
  keys: ReadonlySet<string>,
): Record<string, unknown> | null {
  if (!isPlainRecord(input) || hasOwnSymbols(input)) {
    return null;
  }

  const ownKeys = safeOwnKeys(input);

  if (
    ownKeys === undefined ||
    ownKeys.length !== keys.size ||
    ownKeys.some((key) => typeof key !== "string" || !keys.has(key))
  ) {
    return null;
  }

  for (const key of keys) {
    const descriptor = safeGetOwnPropertyDescriptor(input, key);

    if (
      descriptor === undefined ||
      descriptor === missingData ||
      !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, "value")
    ) {
      return null;
    }
  }

  return input;
}

function readDataProperty(
  input: Record<string, unknown>,
  key: string,
): unknown {
  const descriptor = safeGetOwnPropertyDescriptor(input, key);

  if (
    descriptor === undefined ||
    descriptor === missingData ||
    !descriptor.enumerable ||
    !Object.prototype.hasOwnProperty.call(descriptor, "value")
  ) {
    return missingData;
  }

  return descriptor.value;
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
): string | null | undefined {
  const descriptor = safeGetOwnPropertyDescriptor(input, key);

  if (descriptor === undefined) {
    return undefined;
  }

  if (
    descriptor === missingData ||
    !descriptor.enumerable ||
    !Object.prototype.hasOwnProperty.call(descriptor, "value")
  ) {
    return null;
  }

  return typeof descriptor.value === "string" ? descriptor.value : null;
}

function readDataNumber(
  input: Record<string, unknown>,
  key: string,
): number | null {
  const value = readDataProperty(input, key);

  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readTopLevelProperty(input: unknown, key: string): unknown {
  if (typeof input !== "object" || input === null) {
    return missingData;
  }

  try {
    return (input as Record<string, unknown>)[key];
  } catch {
    return missingData;
  }
}

function readTopLevelString(input: unknown, key: string): string | undefined {
  const value = readTopLevelProperty(input, key);

  return typeof value === "string" ? value : undefined;
}

function snapshotJsonValue(input: unknown): unknown {
  if (
    input === null ||
    typeof input === "boolean" ||
    typeof input === "string" ||
    (typeof input === "number" && Number.isFinite(input))
  ) {
    return input;
  }

  if (Array.isArray(input)) {
    const entries = copyExactArrayValues(input);

    if (entries === undefined) {
      return missingData;
    }

    const values: unknown[] = [];

    for (const value of entries) {
      const snapshot = snapshotJsonValue(value);

      if (snapshot === missingData) {
        return missingData;
      }

      values.push(snapshot);
    }

    return values;
  }

  if (!isPlainRecord(input) || hasOwnSymbols(input)) {
    return missingData;
  }

  const output: Record<string, unknown> = {};
  const names = safeOwnPropertyNames(input);

  if (names === undefined) {
    return missingData;
  }

  for (const key of names) {
    const descriptor = safeGetOwnPropertyDescriptor(input, key);

    if (
      descriptor === undefined ||
      descriptor === missingData ||
      !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, "value")
    ) {
      return missingData;
    }

    const value = snapshotJsonValue(descriptor.value);

    if (value === missingData) {
      return missingData;
    }

    output[key] = value;
  }

  return output;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    safeGetPrototypeOf(value) === Object.prototype
  );
}

function readStringArray(input: unknown): string[] | undefined {
  const values = copyExactArrayValues(input);

  if (values === undefined) {
    return undefined;
  }

  return values.every((value): value is string => typeof value === "string")
    ? values
    : undefined;
}

function copyExactArrayValues(input: unknown): unknown[] | undefined {
  if (!Array.isArray(input) || safeGetPrototypeOf(input) !== Array.prototype) {
    return undefined;
  }

  if (hasOwnSymbols(input)) {
    return undefined;
  }

  const lengthDescriptor = safeGetOwnPropertyDescriptor(input, "length");

  if (
    lengthDescriptor === undefined ||
    lengthDescriptor === missingData ||
    !Object.prototype.hasOwnProperty.call(lengthDescriptor, "value") ||
    !Number.isSafeInteger(lengthDescriptor.value) ||
    lengthDescriptor.value < 0
  ) {
    return undefined;
  }

  const ownKeys = safeOwnKeys(input);

  if (ownKeys === undefined) {
    return undefined;
  }

  const allowedKeys = new Set<PropertyKey>(["length"]);
  const values: unknown[] = [];

  for (let index = 0; index < lengthDescriptor.value; index += 1) {
    const key = String(index);
    const descriptor = safeGetOwnPropertyDescriptor(input, key);

    if (
      descriptor === undefined ||
      descriptor === missingData ||
      !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, "value")
    ) {
      return undefined;
    }

    allowedKeys.add(key);
    values.push(descriptor.value);
  }

  if (ownKeys.some((key) => !allowedKeys.has(key))) {
    return undefined;
  }

  return values;
}

function hasOwnSymbols(input: object): boolean {
  try {
    return Object.getOwnPropertySymbols(input).length > 0;
  } catch {
    return true;
  }
}

function safeGetPrototypeOf(input: object): object | null | typeof missingData {
  try {
    return Object.getPrototypeOf(input);
  } catch {
    return missingData;
  }
}

function safeGetOwnPropertyDescriptor(
  input: object,
  key: PropertyKey,
): PropertyDescriptor | undefined | typeof missingData {
  try {
    return Object.getOwnPropertyDescriptor(input, key);
  } catch {
    return missingData;
  }
}

function safeOwnKeys(input: object): readonly PropertyKey[] | undefined {
  try {
    return Reflect.ownKeys(input);
  } catch {
    return undefined;
  }
}

function safeOwnPropertyNames(input: object): string[] | undefined {
  try {
    return Object.getOwnPropertyNames(input);
  } catch {
    return undefined;
  }
}
