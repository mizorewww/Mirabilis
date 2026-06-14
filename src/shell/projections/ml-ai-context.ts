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
const missingData = Symbol("missing-data");

export function buildMlContextProjection(input: ProjectionInput) {
  const context = readCurrentPageContext(input);

  if (context === undefined) {
    return {
      data: {
        algorithmId: mlPredictionAlgorithmId,
        input: {
          events: [],
          generatedAt: input.generatedAt,
          kind: mlPredictionInputKind,
          metadata: [],
          pageId: input.currentPageId,
          pages: [],
        },
      },
      status: {
        kind: "unavailable",
        reasons: ["ml.context-unavailable"],
      },
    };
  }

  const pagesBound = boundRows(context.pages, mlProjectionLimit);
  const projectedPageIds = new Set(pagesBound.rows.map((page) => page.id));
  const metadataBound = boundRows(
    collectMetadata(input.metadata, projectedPageIds, mlProjectionLimit),
    mlProjectionLimit,
  );
  const eventsBound = boundRows(
    collectTimerEvents(input.events, projectedPageIds, mlProjectionLimit),
    mlProjectionLimit,
  );

  return {
    data: {
      algorithmId: mlPredictionAlgorithmId,
      input: {
        events: eventsBound.rows,
        generatedAt: input.generatedAt,
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
  const context = readCurrentPageContext(input);

  if (context === undefined) {
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

  const currentPageIds = new Set([context.currentPage.id]);
  const currentMetadata = collectMetadata(input.metadata, currentPageIds);
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
      now: input.generatedAt,
      page,
    },
    "ai.suggest-tags": {
      existingTags: collectExistingTags(metadataBound.rows),
      kind: "ai.suggest-tags-input",
      page,
    },
  };
  const prediction = readCurrentPagePrediction(
    input.prediction,
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
  if (!isPlainRecord(input) || Object.getOwnPropertySymbols(input).length > 0) {
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
    if (!isPlainRecord(block) || Object.getOwnPropertySymbols(block).length > 0) {
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
  sourceLimit?: number,
): MetadataProjection[] {
  const rows: MetadataProjection[] = [];
  const records =
    sourceLimit === undefined
      ? copyArrayLike(input)
      : copyArrayLike(input).slice(0, sourceLimit);

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
  if (!isPlainRecord(input) || Object.getOwnPropertySymbols(input).length > 0) {
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

  if (value === missingData) {
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

function collectTimerEvents(
  input: readonly AppEvent[],
  pageIds: ReadonlySet<string>,
  sourceLimit?: number,
): TimerEventProjection[] {
  const rows: TimerEventProjection[] = [];
  const events =
    sourceLimit === undefined
      ? copyArrayLike(input)
      : copyArrayLike(input).slice(0, sourceLimit);

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
  if (!isPlainRecord(input) || Object.getOwnPropertySymbols(input).length > 0) {
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
  const snapshot = snapshotJsonValue(input);

  if (
    snapshot === missingData ||
    !isPlainRecord(snapshot) ||
    readDataString(snapshot, "kind") !== mlPredictionResultKind ||
    readDataString(snapshot, "pageId") !== currentPageId
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
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) {
    return [];
  }

  const lengthDescriptor = Object.getOwnPropertyDescriptor(input, "length");

  if (
    lengthDescriptor === undefined ||
    !Object.prototype.hasOwnProperty.call(lengthDescriptor, "value") ||
    !Number.isSafeInteger(lengthDescriptor.value) ||
    lengthDescriptor.value < 0
  ) {
    return [];
  }

  const values: unknown[] = [];

  for (let index = 0; index < lengthDescriptor.value; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(input, String(index));

    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, "value")
    ) {
      return [];
    }

    values.push(descriptor.value);
  }

  return values;
}

function readExactRecord(
  input: unknown,
  keys: ReadonlySet<string>,
): Record<string, unknown> | null {
  if (!isPlainRecord(input) || Object.getOwnPropertySymbols(input).length > 0) {
    return null;
  }

  const ownKeys = Reflect.ownKeys(input);

  if (
    ownKeys.length !== keys.size ||
    ownKeys.some((key) => typeof key !== "string" || !keys.has(key))
  ) {
    return null;
  }

  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);

    if (
      descriptor === undefined ||
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
  const descriptor = Object.getOwnPropertyDescriptor(input, key);

  if (
    descriptor === undefined ||
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
  const descriptor = Object.getOwnPropertyDescriptor(input, key);

  if (descriptor === undefined) {
    return undefined;
  }

  if (
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
    return copyArrayLike(input).map(snapshotJsonValue);
  }

  if (!isPlainRecord(input) || Object.getOwnPropertySymbols(input).length > 0) {
    return missingData;
  }

  const output: Record<string, unknown> = {};

  for (const key of Object.getOwnPropertyNames(input)) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);

    if (
      descriptor === undefined ||
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
    Object.getPrototypeOf(value) === Object.prototype
  );
}
