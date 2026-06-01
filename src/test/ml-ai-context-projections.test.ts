import { describe, expect, it } from "vitest";

import type {
  AppEvent,
  MarkdownPage,
  MetadataRecord,
  StructuredMarkdownDocument,
} from "../core";
import {
  buildAiContextProjection,
  buildMlContextProjection,
} from "../shell/projections/ml-ai-context";

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

type MlContextProjection = {
  data: {
    algorithmId: typeof mlPredictionAlgorithmId;
    input: {
      events: Array<Record<string, unknown>>;
      generatedAt: string;
      kind: typeof mlPredictionInputKind;
      metadata: Array<Record<string, unknown>>;
      pageId: string;
      pages: Array<Record<string, unknown>>;
    };
  };
  status: ProjectionStatus;
};

type AiContextProjection = {
  data: {
    advisoryCommands: {
      "ai.explain-prediction"?: Record<string, unknown>;
      "ai.generate-subtasks": Record<string, unknown>;
      "ai.suggest-due-date": Record<string, unknown>;
      "ai.suggest-tags": Record<string, unknown>;
    };
    page: Record<string, unknown>;
  };
  status: ProjectionStatus;
};

const currentPageId = "page-current";
const currentPageTitle = "Ship TASK-043 <script>private()</script>";
const currentGeneratedAt = "2026-06-01T13:58:00.000Z";
const mlPredictionAlgorithmId = "ml.predict-remaining-time";
const mlPredictionInputKind = "ml.remaining-time-prediction-input";
const mlPredictionResultKind = "ml.remaining-time-prediction";
const mlBaselineModelId = "ml.remaining-time-baseline.v1";
const maxMlProjectionItems = 1_000;
const maxAiProjectionItems = 100;
const maxAiCurrentPageTextLength = 50_000;

describe("TASK-043 ML and AI current-page projection builders", () => {
  it("builds exact ML and AI current-page DTOs without raw records or unrelated page bodies", () => {
    const currentPage = createPage(currentPageId, currentPageTitle, [
      "Current page body used by advisory AI.",
      "CURRENT_PAGE_ONLY_TOKEN",
    ]);
    const childPage = createPage("page-child", "Current child task", [
      "CHILD_BODY_SHOULD_NOT_LEAK",
    ], currentPageId);
    const unrelatedPage = createPage("page-unrelated", "Unrelated workspace", [
      "UNRELATED_WORKSPACE_BODY_TOKEN",
    ]);
    const source = createProjectionSource({
      events: [
        createTimerSegmentEvent("event-current-timer", currentPage.id, "segment-current"),
        createTimerNoteEvent("event-current-note", currentPage.id, "segment-current"),
        createTimerSegmentEvent("event-child-timer", childPage.id, "segment-child"),
        createTimerSegmentEvent(
          "event-unrelated-timer",
          unrelatedPage.id,
          "segment-unrelated",
        ),
      ],
      metadata: [
        createMetadata("metadata-estimate", currentPage.id, "task", "estimateSeconds", 3_600, "number"),
        createMetadata("metadata-status", childPage.id, "task", "status", "done", "string"),
        createMetadata("metadata-tags", currentPage.id, "tag", "tags", ["deep-work", "plugin"], "json"),
        createMetadata("metadata-secret", currentPage.id, "ai", "apiKey", "sk-test-secret", "string"),
      ],
      pages: [currentPage, childPage, unrelatedPage],
    });
    const mlProjection = buildMl(source);
    const aiProjection = buildAi(source, {
      prediction: createPredictionResult(currentPage.id, currentPage.title),
    });

    expect(mlProjection).toStrictEqual({
      data: {
        algorithmId: mlPredictionAlgorithmId,
        input: {
          events: [
            {
              createdAt: "2026-06-01T08:00:00.000Z",
              namespace: "timer",
              pageId: currentPage.id,
              payload: {
                durationSeconds: 1_800,
                endAt: "2026-06-01T08:30:00.000Z",
                pageId: currentPage.id,
                segmentId: "segment-current",
                source: "timer",
                startAt: "2026-06-01T08:00:00.000Z",
              },
              sourcePluginId: "timer",
              type: "time_segment_created",
            },
            {
              createdAt: "2026-06-01T08:45:00.000Z",
              namespace: "timer",
              pageId: currentPage.id,
              payload: {
                notePageId: "note-segment-current",
                notedAt: "2026-06-01T08:45:00.000Z",
                segmentId: "segment-current",
              },
              sourcePluginId: "timer",
              type: "time_segment_note_added",
            },
            {
              createdAt: "2026-06-01T08:00:00.000Z",
              namespace: "timer",
              pageId: childPage.id,
              payload: {
                durationSeconds: 1_800,
                endAt: "2026-06-01T08:30:00.000Z",
                pageId: childPage.id,
                segmentId: "segment-child",
                source: "timer",
                startAt: "2026-06-01T08:00:00.000Z",
              },
              sourcePluginId: "timer",
              type: "time_segment_created",
            },
          ],
          generatedAt: currentGeneratedAt,
          kind: mlPredictionInputKind,
          metadata: [
            {
              key: "estimateSeconds",
              namespace: "task",
              pageId: currentPage.id,
              sourcePluginId: "task",
              value: 3_600,
              valueType: "number",
            },
            {
              key: "status",
              namespace: "task",
              pageId: childPage.id,
              sourcePluginId: "task",
              value: "done",
              valueType: "string",
            },
            {
              key: "tags",
              namespace: "tag",
              pageId: currentPage.id,
              sourcePluginId: "tag",
              value: ["deep-work", "plugin"],
              valueType: "json",
            },
          ],
          pageId: currentPage.id,
          pages: [
            {
              id: currentPage.id,
              title: currentPage.title,
            },
            {
              id: childPage.id,
              parentPageId: currentPage.id,
              title: childPage.title,
            },
          ],
        },
      },
      status: { kind: "complete" },
    });
    expect(aiProjection.data).toStrictEqual({
      advisoryCommands: {
        "ai.explain-prediction": {
          kind: "ai.explain-prediction-input",
          page: {
            bodyMarkdown: "Current page body used by advisory AI.\nCURRENT_PAGE_ONLY_TOKEN",
            id: currentPage.id,
            title: currentPage.title,
          },
          prediction: createPredictionResult(currentPage.id, currentPage.title),
        },
        "ai.generate-subtasks": {
          existingChildren: [
            {
              bodyMarkdown: "",
              id: childPage.id,
              title: childPage.title,
            },
          ],
          kind: "ai.generate-subtasks-input",
          page: {
            bodyMarkdown: "Current page body used by advisory AI.\nCURRENT_PAGE_ONLY_TOKEN",
            id: currentPage.id,
            title: currentPage.title,
          },
        },
        "ai.suggest-due-date": {
          kind: "ai.suggest-due-date-input",
          metadata: [
            {
              key: "estimateSeconds",
              namespace: "task",
              pageId: currentPage.id,
              sourcePluginId: "task",
              value: 3_600,
              valueType: "number",
            },
            {
              key: "tags",
              namespace: "tag",
              pageId: currentPage.id,
              sourcePluginId: "tag",
              value: ["deep-work", "plugin"],
              valueType: "json",
            },
          ],
          now: currentGeneratedAt,
          page: {
            bodyMarkdown: "Current page body used by advisory AI.\nCURRENT_PAGE_ONLY_TOKEN",
            id: currentPage.id,
            title: currentPage.title,
          },
        },
        "ai.suggest-tags": {
          existingTags: ["deep-work", "plugin"],
          kind: "ai.suggest-tags-input",
          page: {
            bodyMarkdown: "Current page body used by advisory AI.\nCURRENT_PAGE_ONLY_TOKEN",
            id: currentPage.id,
            title: currentPage.title,
          },
        },
      },
      page: {
        bodyMarkdown: "Current page body used by advisory AI.\nCURRENT_PAGE_ONLY_TOKEN",
        id: currentPage.id,
        title: currentPage.title,
      },
    });
    expectSerializedProjectionToExclude([mlProjection, aiProjection], [
      "UNRELATED_WORKSPACE_BODY_TOKEN",
      "CHILD_BODY_SHOULD_NOT_LEAK",
      "event-current-timer",
      "event-child-timer",
      "metadata-estimate",
      "metadata-secret",
      "sk-test-secret",
      "apiKey",
      "providerId",
      "openai",
      "stores",
      "registries",
      "pluginHost",
    ]);
  });

  it("fails closed for missing, archived, or malformed current pages", () => {
    const activePage = createPage(currentPageId, currentPageTitle, ["Visible"]);
    const archivedPage = {
      ...activePage,
      archivedAt: "2026-06-01T10:00:00.000Z",
    };
    const malformedPage = {
      ...activePage,
      title: "",
    };

    for (const [label, pages] of [
      ["missing current page", []],
      ["archived current page", [archivedPage]],
      ["malformed current page", [malformedPage]],
    ] as const) {
      expect(buildMl(createProjectionSource({ pages })), label).toMatchObject({
        data: {
          algorithmId: mlPredictionAlgorithmId,
          input: {
            events: [],
            metadata: [],
            pageId: currentPageId,
            pages: [],
          },
        },
        status: {
          kind: "unavailable",
        },
      });
      expect(buildAi(createProjectionSource({ pages })), label).toMatchObject({
        data: {
          advisoryCommands: {},
        },
        status: {
          kind: "unavailable",
        },
      });
    }
  });

  it("caps ML arrays at 1000 and AI arrays at 100 with deterministic partial status", () => {
    const currentPage = createPage(currentPageId, currentPageTitle, ["Current"]);
    const pages = [
      currentPage,
      ...Array.from({ length: 1_005 }, (_value, index) =>
        createPage(
          `page-child-${String(index).padStart(4, "0")}`,
          `Child ${String(index).padStart(4, "0")}`,
          [],
          currentPage.id,
        ),
      ),
    ];
    const metadata = Array.from({ length: 1_005 }, (_value, index) =>
      createMetadata(
        `metadata-cap-${index}`,
        index % 2 === 0 ? currentPage.id : `page-child-${String(index).padStart(4, "0")}`,
        "tag",
        "tags",
        [`tag-${String(index).padStart(4, "0")}`],
        "json",
      ),
    );
    const events = Array.from({ length: 1_005 }, (_value, index) =>
      createTimerSegmentEvent(
        `event-cap-${index}`,
        index % 2 === 0 ? currentPage.id : `page-child-${String(index).padStart(4, "0")}`,
        `segment-cap-${String(index).padStart(4, "0")}`,
      ),
    );
    const source = createProjectionSource({ events, metadata, pages });
    const mlProjection = buildMl(source);
    const aiProjection = buildAi(source);

    expect(mlProjection.data.input.pages).toHaveLength(maxMlProjectionItems);
    expect(mlProjection.data.input.metadata).toHaveLength(maxMlProjectionItems);
    expect(mlProjection.data.input.events).toHaveLength(maxMlProjectionItems);
    expect(mlProjection.data.input.pages.at(-1)).toEqual(
      expect.objectContaining({ id: "page-child-0998" }),
    );
    expect(mlProjection.status).toStrictEqual({
      kind: "partial",
      limit: maxMlProjectionItems,
      omittedRows: expect.any(Number),
      reasons: expect.arrayContaining(["ml.context-limit"]),
    });
    expect(aiProjection.data.advisoryCommands["ai.generate-subtasks"]).toMatchObject({
      existingChildren: expect.any(Array),
    });
    expect(
      aiProjection.data.advisoryCommands["ai.generate-subtasks"]?.existingChildren,
    ).toHaveLength(maxAiProjectionItems);
    expect(aiProjection.status).toStrictEqual({
      kind: "partial",
      limit: maxAiProjectionItems,
      omittedRows: expect.any(Number),
      reasons: expect.arrayContaining(["ai.context-limit"]),
    });
    expectSerializedProjectionToExclude([mlProjection, aiProjection], [
      "page-child-0999",
      "segment-cap-1000",
      "tag-1000",
    ]);
  });

  it("filters wrong-owner data and rejects hostile accessor, prototype, symbol, and secret-shaped fields", () => {
    const currentPage = createPage(currentPageId, currentPageTitle, ["Visible"]);
    const accessorEvent = createTimerSegmentEvent(
      "event-accessor",
      currentPage.id,
      "segment-accessor",
    );

    Object.defineProperty(accessorEvent.payload as object, "segmentId", {
      enumerable: true,
      get() {
        throw new Error("ACCESSOR_SHOULD_NOT_RUN");
      },
    });

    const prototypeMetadata = Object.create({
      key: "tags",
      namespace: "tag",
      pageId: currentPage.id,
      sourcePluginId: "tag",
      value: ["PROTOTYPE_LEAK"],
      valueType: "json",
    }) as MetadataRecord;
    const symbolMetadata = {
      ...createMetadata(
        "metadata-symbol",
        currentPage.id,
        "tag",
        "tags",
        ["SYMBOL_LEAK"],
        "json",
      ),
      [Symbol("secret")]: "SYMBOL_SECRET",
    } as MetadataRecord;
    const wrongOwnerMetadata = createMetadata(
      "metadata-wrong-owner",
      currentPage.id,
      "tag",
      "tags",
      ["WRONG_OWNER_LEAK"],
      "json",
      "ai",
    );
    const wrongOwnerEvent = createTimerSegmentEvent(
      "event-wrong-owner",
      currentPage.id,
      "WRONG_OWNER_SEGMENT",
      "ai",
    );
    const source = createProjectionSource({
      events: [accessorEvent, wrongOwnerEvent],
      metadata: [
        prototypeMetadata,
        symbolMetadata,
        wrongOwnerMetadata,
        createMetadata(
          "metadata-provider",
          currentPage.id,
          "ai",
          "providerSettings",
          { apiKey: "sk-secret", providerId: "openai" },
          "json",
          "ai",
        ),
      ],
      pages: [currentPage],
    });
    const mlProjection = buildMl(source);
    const aiProjection = buildAi(source);

    expect(mlProjection.data.input.events).toStrictEqual([]);
    expect(mlProjection.data.input.metadata).toStrictEqual([]);
    expect(aiProjection.data.advisoryCommands["ai.suggest-tags"]).toMatchObject({
      existingTags: [],
    });
    expectSerializedProjectionToExclude([mlProjection, aiProjection], [
      "ACCESSOR_SHOULD_NOT_RUN",
      "PROTOTYPE_LEAK",
      "SYMBOL_LEAK",
      "SYMBOL_SECRET",
      "WRONG_OWNER_LEAK",
      "WRONG_OWNER_SEGMENT",
      "providerSettings",
      "sk-secret",
      "openai",
    ]);
  });

  it("bounds current-page text and excludes explain-prediction until a valid ML prediction exists", () => {
    const longBody = "A".repeat(maxAiCurrentPageTextLength + 250);
    const currentPage = createPage(currentPageId, currentPageTitle, [longBody]);
    const source = createProjectionSource({ pages: [currentPage] });
    const withoutPrediction = buildAi(source);
    const withMalformedPrediction = buildAi(source, {
      prediction: {
        ...createPredictionResult(currentPage.id, currentPage.title),
        kind: "ml.prediction-result-forged",
      },
    });
    const withPrediction = buildAi(source, {
      prediction: createPredictionResult(currentPage.id, currentPage.title),
    });

    expect(withoutPrediction.data.advisoryCommands).not.toHaveProperty(
      "ai.explain-prediction",
    );
    expect(withMalformedPrediction.data.advisoryCommands).not.toHaveProperty(
      "ai.explain-prediction",
    );
    expect(withPrediction.data.advisoryCommands).toHaveProperty(
      "ai.explain-prediction",
    );
    expect(withPrediction.data.page.bodyMarkdown).toBe(
      "A".repeat(maxAiCurrentPageTextLength),
    );
    expectSerializedProjectionToExclude(withPrediction, [
      "A".repeat(maxAiCurrentPageTextLength + 1),
    ]);
  });
});

function buildMl(source: ProjectionSource): MlContextProjection {
  return buildMlContextProjection({
    ...source,
    currentPageId,
    generatedAt: currentGeneratedAt,
  }) as MlContextProjection;
}

function buildAi(
  source: ProjectionSource,
  options: { prediction?: unknown } = {},
): AiContextProjection {
  return buildAiContextProjection({
    ...source,
    currentPageId,
    generatedAt: currentGeneratedAt,
    prediction: options.prediction,
  }) as AiContextProjection;
}

type ProjectionSource = {
  events: readonly AppEvent[];
  metadata: readonly MetadataRecord[];
  pages: readonly MarkdownPage[];
};

function createProjectionSource(
  source: Partial<ProjectionSource> = {},
): ProjectionSource {
  return {
    events: source.events ?? [],
    metadata: source.metadata ?? [],
    pages: source.pages ?? [],
  };
}

function createPage(
  id: string,
  title: string,
  lines: readonly string[] = [],
  parentPageId?: string,
): MarkdownPage {
  return {
    body: structuredDocument(lines),
    createdAt: "2026-06-01T07:00:00.000Z",
    id,
    ...(parentPageId === undefined ? {} : { parentPageId }),
    title,
    updatedAt: "2026-06-01T07:00:00.000Z",
  };
}

function structuredDocument(lines: readonly string[]): StructuredMarkdownDocument {
  return {
    content: lines.map((text, index) => ({
      blockId: `block-${index}`,
      text,
      type: "markdown.line",
    })),
    type: "doc",
  };
}

function createMetadata(
  id: string,
  pageId: string,
  namespace: string,
  key: string,
  value: unknown,
  valueType: MetadataRecord["valueType"],
  sourcePluginId = namespace,
): MetadataRecord {
  return {
    createdAt: "2026-06-01T07:30:00.000Z",
    id,
    key,
    namespace,
    pageId,
    sourcePluginId,
    updatedAt: "2026-06-01T07:30:00.000Z",
    value,
    valueType,
  };
}

function createTimerSegmentEvent(
  id: string,
  pageId: string,
  segmentId: string,
  sourcePluginId = "timer",
): AppEvent {
  return {
    createdAt: "2026-06-01T08:00:00.000Z",
    id,
    namespace: "timer",
    pageId,
    payload: {
      durationSeconds: 1_800,
      endAt: "2026-06-01T08:30:00.000Z",
      pageId,
      segmentId,
      source: "timer",
      startAt: "2026-06-01T08:00:00.000Z",
    },
    sourcePluginId,
    type: "time_segment_created",
  };
}

function createTimerNoteEvent(
  id: string,
  pageId: string,
  segmentId: string,
): AppEvent {
  return {
    createdAt: "2026-06-01T08:45:00.000Z",
    id,
    namespace: "timer",
    pageId,
    payload: {
      notePageId: `note-${segmentId}`,
      notedAt: "2026-06-01T08:45:00.000Z",
      segmentId,
    },
    sourcePluginId: "timer",
    type: "time_segment_note_added",
  };
}

function createPredictionResult(pageId: string, pageTitle: string): Record<string, unknown> {
  return {
    algorithmId: mlPredictionAlgorithmId,
    confidence: 0.68,
    features: {
      baselineTotalSeconds: 3_600,
      childTasksCompleted: 1,
      childTasksTotal: 2,
      similarAverageSeconds: null,
      similarCompletedTasks: 0,
      tagIds: ["deep-work"],
      timerNoteCount: 1,
      trackedSeconds: 1_800,
    },
    generatedAt: currentGeneratedAt,
    kind: mlPredictionResultKind,
    limitations: ["Baseline heuristic only; no trained model is used."],
    maxSeconds: 7_200,
    minSeconds: 3_600,
    modelId: mlBaselineModelId,
    pageId,
    pageTitle,
    reasons: ["Current page has one trusted timer segment."],
  };
}

function expectSerializedProjectionToExclude(
  value: unknown,
  forbiddenTexts: readonly string[],
): void {
  const serialized = JSON.stringify(value);

  for (const forbiddenText of forbiddenTexts) {
    expect(serialized).not.toContain(forbiddenText);
  }
}
