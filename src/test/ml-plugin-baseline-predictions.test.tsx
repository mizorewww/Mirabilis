import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { render, screen, within } from "@testing-library/react";
import { createElement, type ComponentType } from "react";
import { describe, expect, it } from "vitest";

import { BUILT_IN_PLUGINS, createAppRuntime, type AppRuntime } from "../bootstrap";
import {
  createCoreStores,
  type AppEvent,
  type CoreStores,
  type DbQuery,
  type FilterDefinition,
  type MarkdownPage,
  type MetadataRecord,
  type NativeBridge,
  type StructuredMarkdownDocument,
  type ViewDefinition,
} from "../core";

type NativeBridgeTransactionResult<Response> =
  Response extends readonly unknown[]
    ? number extends Response["length"]
      ? Array<Response>
      : Response
    : Array<Response>;

type CreateRuntimeOptions = {
  eventIds?: readonly string[];
  metadataIds?: readonly string[];
  pageIds?: readonly string[];
};

type RuntimeSnapshot = {
  events: AppEvent[];
  filters: FilterDefinition[];
  metadata: MetadataRecord[];
  pages: MarkdownPage[];
};

type ExecutionSentinel = {
  readonly count: number;
  trip: () => never;
};

type MetadataProjection = {
  key: string;
  namespace: string;
  pageId: string;
  sourcePluginId: string;
  value: unknown;
  valueType: "boolean" | "date" | "json" | "null" | "number" | "string";
};

type PageProjection = {
  id: string;
  title: string;
  archived?: boolean;
  parentPageId?: string;
};

type EventProjection = {
  createdAt: string;
  namespace: string;
  payload: Record<string, unknown>;
  sourcePluginId: string;
  type: string;
  pageId?: string;
};

type MlRemainingTimePredictionInput = {
  events: readonly EventProjection[];
  generatedAt: string;
  kind: typeof mlPredictionInputKind;
  metadata: readonly MetadataProjection[];
  pageId: string;
  pages: readonly PageProjection[];
};

type MlRunPredictionPayload = {
  algorithmId: typeof mlPredictionAlgorithmId;
  input: MlRemainingTimePredictionInput;
};

type MlPredictionFeatures = {
  baselineTotalSeconds: number | null;
  childTasksCompleted: number;
  childTasksTotal: number;
  similarAverageSeconds: number | null;
  similarCompletedTasks: number;
  tagIds: readonly string[];
  timerNoteCount: number;
  trackedSeconds: number;
};

type MlRemainingTimePredictionResult = {
  algorithmId: typeof mlPredictionAlgorithmId;
  confidence: number;
  features: MlPredictionFeatures;
  generatedAt: string;
  kind: typeof mlPredictionResultKind;
  limitations: readonly string[];
  maxSeconds: number;
  minSeconds: number;
  modelId: typeof mlBaselineModelId;
  pageId: string;
  pageTitle: string;
  reasons: readonly string[];
};

type PredictionPanelViewProps = {
  data?: MlRemainingTimePredictionResult;
  isLoading?: boolean;
};

const mlPluginId = "ml";
const mlPredictionAlgorithmId = "ml.predict-remaining-time";
const mlRunPredictionCommandId = "ml.run-prediction";
const mlPredictionInputKind = "ml.remaining-time-prediction-input";
const mlPredictionResultKind = "ml.remaining-time-prediction";
const mlBaselineModelId = "ml.remaining-time-baseline.v1";
const mlPredictionPanelViewId = "ml.prediction-panel";
const mlPredictionPanelSlotId = "ml.page-sidebar.prediction-panel";
const mlPredictionPanelSlotTarget = "page.sidebar.panel";
const mlPredictedRemainingTimeMetadataId = "ml.predictedRemainingTime";
const mlPredictionConfidenceMetadataId = "ml.predictionConfidence";
const mlPredictionGeneratedEventId = "ml.prediction-generated";
const currentPageId = "page-ml-baseline";
const currentPageTitle =
  "Implement <script>alert(1)</script> ML baseline";
const generatedAt = "2026-05-25T04:30:00.000Z";
const maxMlProjectionItems = 1_000;
const maxMlTextLength = 1_000;
const staleMlIds = [
  "ml.predict_remaining_time",
  "ml.predict_task_remaining_time",
  "ml.prediction_panel",
  "ml.run_prediction",
  "ml.refresh_models",
  "ml.predicted_remaining_time",
  "ml.prediction_confidence",
  "ml.prediction_generated",
] as const;
const expectedAvailableLimitations = [
  "Baseline heuristic only; no trained model is used.",
  "Uses caller-provided page, metadata, and event projections only.",
] as const;
const expectedUnavailableLimitations = [
  "Not enough trusted evidence to predict remaining time.",
  "Add a task estimate, Timer history, child task completion, or similar completed tasks.",
  "Baseline heuristic only; no trained model is used.",
] as const;
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
] as const;
const mlProductionEntrypoints = [
  "src/bootstrap/built-in-plugins.ts",
  "src/plugins/ml",
] as const;

describe("ML Plugin baseline predictions", () => {
  it("registers ML as a built-in with canonical inert algorithm, metadata, event, view, slot, and runtime command ids only", async () => {
    const runtime = await createRuntime();
    const builtInPluginIds = BUILT_IN_PLUGINS.map(
      (plugin) => plugin.manifest.id,
    );
    const mlPlugin = BUILT_IN_PLUGINS.find(
      (plugin) => plugin.manifest.id === mlPluginId,
    );
    const algorithmIds =
      mlPlugin?.manifest.contributes?.algorithms
        ?.map((algorithm) => algorithm.id)
        .sort() ?? [];
    const metadataFieldIds =
      mlPlugin?.manifest.contributes?.metadataFields
        ?.map((field) => field.id)
        .sort() ?? [];
    const eventTypeIds =
      mlPlugin?.manifest.contributes?.eventTypes
        ?.map((eventType) => eventType.id)
        .sort() ?? [];
    const manifestViewIds =
      mlPlugin?.manifest.contributes?.views?.map((view) => view.id).sort() ??
      [];
    const manifestSlotIds =
      mlPlugin?.manifest.contributes?.slots?.map((slot) => slot.id).sort() ??
      [];
    const runtimeCommandIds = runtime.registries.commands
      .list({ pluginId: mlPluginId })
      .map((command) => command.id)
      .sort();
    const runtimeViews = runtime.registries.views.list({
      pluginId: mlPluginId,
    });
    const runtimeViewIds = runtimeViews.map((view) => view.id).sort();
    const runtimeSlots = runtime.registries.slots.list({
      pluginId: mlPluginId,
    });
    const runtimeSlotIds = runtimeSlots.map((slot) => slot.id).sort();

    expect.soft(builtInPluginIds).toEqual(
      expect.arrayContaining([mlPluginId]),
    );
    expect.soft(Object.keys(runtime.registries).sort()).not.toContain(
      "algorithms",
    );
    expect.soft(Object.keys(runtime).sort()).not.toContain("algorithms");
    expect.soft(algorithmIds).toStrictEqual([mlPredictionAlgorithmId]);
    expect.soft(runtimeCommandIds).toStrictEqual([mlRunPredictionCommandId]);
    expect.soft(metadataFieldIds).toStrictEqual([
      mlPredictedRemainingTimeMetadataId,
      mlPredictionConfidenceMetadataId,
    ]);
    expect.soft(eventTypeIds).toStrictEqual([mlPredictionGeneratedEventId]);
    expect.soft(manifestViewIds).toStrictEqual([mlPredictionPanelViewId]);
    expect.soft(manifestSlotIds).toStrictEqual([mlPredictionPanelSlotId]);
    expect.soft(runtimeViewIds).toStrictEqual([mlPredictionPanelViewId]);
    expect.soft(runtimeSlotIds).toStrictEqual([mlPredictionPanelSlotId]);
    expect.soft(mlPlugin?.manifest.contributes?.algorithms).toEqual([
      expect.objectContaining({
        id: mlPredictionAlgorithmId,
        name: "Predict remaining time",
      }),
    ]);
    expect.soft(mlPlugin?.manifest.contributes?.metadataFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: mlPredictedRemainingTimeMetadataId,
          key: "predictedRemainingTime",
          namespace: mlPluginId,
          valueType: "json",
        }),
        expect.objectContaining({
          id: mlPredictionConfidenceMetadataId,
          key: "predictionConfidence",
          namespace: mlPluginId,
          valueType: "number",
        }),
      ]),
    );
    expect.soft(mlPlugin?.manifest.contributes?.eventTypes).toEqual([
      expect.objectContaining({
        id: mlPredictionGeneratedEventId,
        namespace: mlPluginId,
        type: "prediction-generated",
      }),
    ]);
    expect.soft(runtimeViews.find((view) => view.id === mlPredictionPanelViewId))
      .toMatchObject({
        accepts: { kind: mlPredictionResultKind },
        id: mlPredictionPanelViewId,
        pluginId: mlPluginId,
        title: "Prediction panel",
        type: mlPredictionPanelViewId,
      });
    expect.soft(
      runtimeSlots.find((slot) => slot.id === mlPredictionPanelSlotId),
    ).toMatchObject({
      id: mlPredictionPanelSlotId,
      pluginId: mlPluginId,
      slot: mlPredictionPanelSlotTarget,
    });

    for (const staleId of staleMlIds) {
      expect(algorithmIds, `${staleId}: algorithm`).not.toContain(staleId);
      expect(runtimeCommandIds, `${staleId}: command`).not.toContain(staleId);
      expect(metadataFieldIds, `${staleId}: metadata field`).not.toContain(
        staleId,
      );
      expect(eventTypeIds, `${staleId}: event type`).not.toContain(staleId);
      expect(manifestViewIds, `${staleId}: manifest view`).not.toContain(
        staleId,
      );
      expect(runtimeViewIds, `${staleId}: runtime view`).not.toContain(staleId);
      expect(manifestSlotIds, `${staleId}: manifest slot`).not.toContain(
        staleId,
      );
      expect(runtimeSlotIds, `${staleId}: runtime slot`).not.toContain(staleId);
    }
  });

  it("runs ml.run-prediction through the command registry, returns the deterministic baseline DTO, and writes only ML-owned metadata and events", async () => {
    const runtime = await createRuntime({
      eventIds: [
        "event-task-baseline",
        "event-ml-prediction-generated",
      ],
      metadataIds: [
        "metadata-task-baseline",
        "metadata-ml-predicted-remaining-time",
        "metadata-ml-prediction-confidence",
      ],
      pageIds: [currentPageId],
    });
    const page = createPage(runtime, currentPageTitle);

    runtime.metadata.set({
      key: "status",
      namespace: "task",
      pageId: page.id,
      sourcePluginId: "task",
      value: "in_progress",
      valueType: "string",
    });
    runtime.events.append({
      namespace: "timer",
      pageId: page.id,
      payload: {
        durationSeconds: 300,
        endAt: "2026-05-25T04:05:00.000Z",
        pageId: page.id,
        segmentId: "segment-existing",
        startAt: "2026-05-25T04:00:00.000Z",
      },
      sourcePluginId: "timer",
      type: "time_segment_created",
    });

    const before = snapshotNonMlRuntimeState(runtime);
    const payload = createDeterministicPredictionPayload({
      pageId: page.id,
      pageTitle: page.title,
    });
    const result = await executeMlPrediction(runtime, payload);

    expect(result).toStrictEqual(
      expectedDeterministicPredictionResult({
        pageId: page.id,
        pageTitle: page.title,
      }),
    );
    expect(snapshotNonMlRuntimeState(runtime)).toStrictEqual(before);
    expect(runtime.metadata.list({ namespace: mlPluginId })).toEqual([
      expect.objectContaining({
        key: "predictedRemainingTime",
        namespace: mlPluginId,
        pageId: page.id,
        sourcePluginId: mlPluginId,
        value: {
          algorithmId: mlPredictionAlgorithmId,
          confidence: 0.9,
          generatedAt,
          kind: mlPredictionResultKind,
          maxSeconds: 6_336,
          minSeconds: 5_184,
          modelId: mlBaselineModelId,
          pageId: page.id,
        },
        valueType: "json",
      }),
      expect.objectContaining({
        key: "predictionConfidence",
        namespace: mlPluginId,
        pageId: page.id,
        sourcePluginId: mlPluginId,
        value: 0.9,
        valueType: "number",
      }),
    ]);
    expect(runtime.events.list({ namespace: mlPluginId })).toEqual([
      expect.objectContaining({
        namespace: mlPluginId,
        pageId: page.id,
        payload: {
          algorithmId: mlPredictionAlgorithmId,
          confidence: 0.9,
          generatedAt,
          maxSeconds: 6_336,
          minSeconds: 5_184,
          modelId: mlBaselineModelId,
          pageId: page.id,
        },
        sourcePluginId: mlPluginId,
        type: "prediction-generated",
      }),
    ]);
  });

  it("uses trusted estimate, Timer tracking, Timer notes, child completion, tags, and similar completed history while ignoring forged provenance", async () => {
    const runtime = await createRuntime();
    const payload = createDeterministicPredictionPayload();
    const result = await executeMlPrediction(runtime, payload);

    expect(result).toStrictEqual(expectedDeterministicPredictionResult());
    expect(JSON.stringify(result)).not.toContain("Forged");
    expect(result.features).toStrictEqual({
      baselineTotalSeconds: 14_400,
      childTasksCompleted: 3,
      childTasksTotal: 5,
      similarAverageSeconds: 18_000,
      similarCompletedTasks: 2,
      tagIds: ["architecture", "plugin"],
      timerNoteCount: 2,
      trackedSeconds: 7_200,
    } satisfies MlPredictionFeatures);
    expect(result.reasons).toStrictEqual([
      "Task estimate is 4h 0m.",
      "Tracked Timer work totals 2h 0m.",
      "Child task completion is 3 of 5.",
      "Similar completed tagged tasks average 5h 0m.",
      "Two Timer notes provide recent work context.",
    ]);
  });

  it("returns a deterministic unavailable low-confidence result with limitations when trusted evidence is insufficient", async () => {
    const runtime = await createRuntime();
    const result = await executeMlPrediction(
      runtime,
      createInsufficientPredictionPayload(),
    );

    expect(result).toStrictEqual(expectedInsufficientPredictionResult());
  });

  it("rejects hostile or unbounded ml.run-prediction payloads and stale command aliases without mutating stores", async () => {
    const runtime = await createRuntime();
    const validPayload = createDeterministicPredictionPayload();
    const invalidPayloads = createInvalidPredictionPayloads(validPayload);

    await expect(
      runtime.commands.execute("ml.run_prediction", validPayload),
      "stale command alias",
    ).rejects.toBeInstanceOf(Error);

    for (const { input, label, sentinel } of invalidPayloads) {
      const before = snapshotRuntimeState(runtime);

      await expect(runMlPrediction(runtime, input), label).rejects.toBeInstanceOf(
        Error,
      );
      expect(snapshotRuntimeState(runtime), label).toStrictEqual(before);

      if (sentinel !== undefined) {
        expect(sentinel.count, label).toBe(0);
      }
    }
  });

  it("renders the registered prediction panel view with accessible states and inert result text", async () => {
    const runtime = await createRuntime();
    const PredictionPanel = getPredictionPanelViewComponent(runtime);
    const { unmount } = render(
      createElement(PredictionPanel, {
        data: createUnsafeRenderablePredictionResult(),
      }),
    );

    const region = screen.getByRole("region", { name: "Prediction panel" });

    expect(
      within(region).getByText(currentPageTitle),
    ).toBeVisible();
    expect(
      within(region).getByText(/1h 26m\s*(?:-|to)\s*1h 46m/i),
    ).toBeVisible();
    expect(within(region).getByText("90% confidence")).toBeVisible();
    expect(
      within(region).getByText(
        "Baseline heuristic only; no trained model is used.",
      ),
    ).toBeVisible();

    const reasons = within(region).getByRole("list", {
      name: "Prediction reasons",
    });
    const reasonItems = within(reasons).getAllByRole("listitem");

    expect(reasonItems).toHaveLength(6);
    expect(reasonItems[5]).toHaveTextContent(
      "Review <img src=x onerror=alert(1)> notes before trusting javascript: URLs.",
    );
    expectNoDangerousDom();

    unmount();

    const { unmount: unmountLoading } = render(
      createElement(PredictionPanel, { isLoading: true }),
    );
    const loadingRegion = screen.getByRole("region", {
      name: "Prediction panel",
    });
    const loadingStatus = within(loadingRegion).getByRole("status", {
      name: "Prediction loading",
    });

    expect(loadingStatus).toHaveTextContent("Loading prediction");
    expect(loadingStatus).toHaveAttribute("aria-busy", "true");

    unmountLoading();

    render(
      createElement(PredictionPanel, {
        data: expectedInsufficientPredictionResult(),
      }),
    );

    const insufficientRegion = screen.getByRole("region", {
      name: "Prediction panel",
    });
    const insufficientStatus = within(insufficientRegion).getByRole("status", {
      name: "Prediction unavailable",
    });

    expect(insufficientStatus).toHaveTextContent("Insufficient data");
    expect(
      within(insufficientRegion).getByText(
        "Not enough trusted evidence to predict remaining time.",
      ),
    ).toBeVisible();
  });

  it("keeps ML production isolated from Core business behavior, sibling internals, raw runtime/native surfaces, HTML sinks, and package/native diffs", async () => {
    const coreSources = await readProductionSources(["src/core"]);
    const productionSources = await readProductionSources(
      mlProductionEntrypoints,
    );
    const productionFilePaths = productionSources
      .map(({ filePath }) => filePath)
      .sort();

    for (const { filePath, source } of coreSources) {
      expect(source, `${filePath}: Core ML business terms`).not.toMatch(
        /\b(?:machine learning|remaining-time|remaining time|prediction|predict|modelId|confidence|predictedRemainingTime|predictionConfidence|best-work-time|estimate-bias|cluster-similar|rank-today)\b/iu,
      );
    }

    expect(productionFilePaths).toEqual(
      expect.arrayContaining([
        "src/bootstrap/built-in-plugins.ts",
        "src/plugins/ml/index.ts",
      ]),
    );
    expect(
      productionFilePaths.some((filePath) =>
        /^src\/plugins\/ml\/plugin\.tsx?$/u.test(filePath),
      ),
      "ML plugin entrypoint",
    ).toBe(true);

    for (const { filePath, source } of productionSources.filter(({ filePath }) =>
      filePath.startsWith("src/plugins/ml/"),
    )) {
      expect(source, `${filePath}: raw runtime/native import`).not.toMatch(
        /@tauri-apps|\bNativeBridge\b|createTauriNativeBridge|\bPluginHost\b|\buseRuntime\b|runtime-context|from\s+["'][^"']*(?:core\/(?:stores|registries|runtime|native)|plugin-host|bootstrap)["']/u,
      );
      expect(source, `${filePath}: raw core factory import`).not.toMatch(
        /import\s+(?:type\s+)?\{[^}]*\b(?:createCoreStores|createCoreRegistries|createCoreServices)\b[^}]*\}\s+from\s+["']\.\.\/\.\.\/core["']/su,
      );
      expect(source, `${filePath}: sibling plugin internals`).not.toMatch(
        /from\s+["'][^"']*(?:plugins\/(?:ai|calendar|chart|habit|heatmap|quick-capture|search|stats|tag|task|timer)|\.\.\/(?:ai|calendar|chart|habit|heatmap|quick-capture|search|stats|tag|task|timer)(?:\/|["']))/u,
      );
      expect(source, `${filePath}: raw private plugin read`).not.toMatch(
        /\bctx\.(?:events|filters|metadata|pages)\s*\.\s*(?:get|list)\b/u,
      );
      expect(source, `${filePath}: filesystem, network, storage, or worker use`)
        .not.toMatch(
          /from\s+["'](?:node:)?(?:fs|path|child_process|worker_threads|http|https|net|tls|dns)["']|@tauri-apps\/plugin-(?:fs|shell|opener|sql|http)|\b(?:fetch|XMLHttpRequest|WebSocket|Worker|SharedWorker|localStorage|sessionStorage|indexedDB)\b/u,
        );
      expect(source, `${filePath}: HTML or code execution sink`).not.toMatch(
        /dangerouslySetInnerHTML|\.innerHTML\b|\bDOMParser\b|renderMarkdown|markdownToHtml|marked|sanitizeHtml|\beval\s*\(|new\s+Function\b/iu,
      );
    }

    expect(await listNativeSurfaceChangesFromMaster()).toStrictEqual([]);
  });
});

async function createRuntime(
  options: CreateRuntimeOptions = {},
): Promise<AppRuntime> {
  const createPageId =
    options.pageIds === undefined
      ? undefined
      : createSequenceFactory(options.pageIds);
  const createMetadataId =
    options.metadataIds === undefined
      ? undefined
      : createSequenceFactory(options.metadataIds);
  const createEventId =
    options.eventIds === undefined
      ? undefined
      : createSequenceFactory(options.eventIds);

  return createAppRuntime({
    createNativeBridge: () => createNoopNativeBridge(),
    ...(createPageId === undefined &&
    createMetadataId === undefined &&
    createEventId === undefined
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
              ...(createMetadataId === undefined
                ? {}
                : {
                    metadata: {
                      createId: createMetadataId,
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
    body: emptyDocument(),
    title,
  });
}

function emptyDocument(): StructuredMarkdownDocument {
  return {
    content: [],
    type: "doc",
  };
}

function runMlPrediction(
  runtime: AppRuntime,
  payload: unknown,
): Promise<unknown> {
  return runtime.commands.execute(mlRunPredictionCommandId, payload);
}

async function executeMlPrediction(
  runtime: AppRuntime,
  payload: MlRunPredictionPayload,
): Promise<MlRemainingTimePredictionResult> {
  const result = await runMlPrediction(runtime, payload);

  return readMlPredictionResult(result);
}

function readMlPredictionResult(
  result: unknown,
): MlRemainingTimePredictionResult {
  const record = requireRecord(result, "ML prediction result");

  expect(Object.keys(record).sort()).toStrictEqual([
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
  expect(record.kind).toBe(mlPredictionResultKind);
  expect(record.algorithmId).toBe(mlPredictionAlgorithmId);
  expect(record.modelId).toBe(mlBaselineModelId);
  expect(record.pageId).toEqual(expect.any(String));
  expect(record.pageTitle).toEqual(expect.any(String));
  expect(record.generatedAt).toEqual(expect.any(String));
  expect(record.minSeconds).toEqual(expect.any(Number));
  expect(record.maxSeconds).toEqual(expect.any(Number));
  expect(record.confidence).toEqual(expect.any(Number));
  expect(record.reasons).toEqual(expect.any(Array));
  expect(record.limitations).toEqual(expect.any(Array));

  const features = requireRecord(record.features, "ML prediction features");

  expect(Object.keys(features).sort()).toStrictEqual([
    "baselineTotalSeconds",
    "childTasksCompleted",
    "childTasksTotal",
    "similarAverageSeconds",
    "similarCompletedTasks",
    "tagIds",
    "timerNoteCount",
    "trackedSeconds",
  ]);
  expect(features.tagIds).toEqual(expect.any(Array));

  return {
    algorithmId: mlPredictionAlgorithmId,
    confidence: record.confidence as number,
    features: {
      baselineTotalSeconds: features.baselineTotalSeconds as number | null,
      childTasksCompleted: features.childTasksCompleted as number,
      childTasksTotal: features.childTasksTotal as number,
      similarAverageSeconds: features.similarAverageSeconds as number | null,
      similarCompletedTasks: features.similarCompletedTasks as number,
      tagIds: features.tagIds as string[],
      timerNoteCount: features.timerNoteCount as number,
      trackedSeconds: features.trackedSeconds as number,
    },
    generatedAt: record.generatedAt as string,
    kind: mlPredictionResultKind,
    limitations: record.limitations as string[],
    maxSeconds: record.maxSeconds as number,
    minSeconds: record.minSeconds as number,
    modelId: mlBaselineModelId,
    pageId: record.pageId as string,
    pageTitle: record.pageTitle as string,
    reasons: record.reasons as string[],
  };
}

function createDeterministicPredictionPayload(
  overrides: {
    pageId?: string;
    pageTitle?: string;
  } = {},
): MlRunPredictionPayload {
  const pageId = overrides.pageId ?? currentPageId;
  const pageTitle = overrides.pageTitle ?? currentPageTitle;
  const childPages = [
    createPageProjection("page-child-research", "Research notes", pageId),
    createPageProjection("page-child-prototype", "Prototype", pageId),
    createPageProjection("page-child-review", "Review", pageId),
    createPageProjection("page-child-docs", "Docs", pageId),
    createPageProjection("page-child-polish", "Polish", pageId),
  ];
  const similarA = createPageProjection(
    "page-similar-architecture",
    "Architecture baseline",
  );
  const similarB = createPageProjection(
    "page-similar-plugin",
    "Plugin shell",
  );

  return {
    algorithmId: mlPredictionAlgorithmId,
    input: {
      events: [
        createTimerSegmentEvent(pageId, "segment-current-a", 3_600, {
          startAt: "2026-05-25T02:00:00.000Z",
        }),
        createTimerSegmentEvent(pageId, "segment-current-b", 3_600, {
          startAt: "2026-05-25T03:00:00.000Z",
        }),
        createTimerNoteEvent(pageId, "segment-current-a", "note-a"),
        createTimerNoteEvent(pageId, "segment-current-b", "note-b"),
        createTimerSegmentEvent(similarA.id, "segment-similar-a", 16_200, {
          startAt: "2026-05-19T09:00:00.000Z",
        }),
        createTimerSegmentEvent(similarB.id, "segment-similar-b", 19_800, {
          startAt: "2026-05-18T09:00:00.000Z",
        }),
        createTimerSegmentEvent(pageId, "segment-forged-owner", 100_000, {
          sourcePluginId: "task",
        }),
        createTimerSegmentEvent(pageId, "segment-forged-namespace", 50_000, {
          namespace: "task",
        }),
      ],
      generatedAt,
      kind: mlPredictionInputKind,
      metadata: [
        createTaskEstimateMetadata(pageId, 14_400),
        createTagMetadata(pageId, ["architecture", "plugin"]),
        createTaskStatusMetadata(childPages[0].id, "done"),
        createTaskStatusMetadata(childPages[1].id, "done"),
        createTaskStatusMetadata(childPages[2].id, "done"),
        createTaskStatusMetadata(childPages[3].id, "todo"),
        createTaskStatusMetadata(childPages[4].id, "in_progress"),
        createTagMetadata(similarA.id, ["architecture"]),
        createTagMetadata(similarB.id, ["architecture", "plugin"]),
        createTaskStatusMetadata(similarA.id, "done"),
        createTaskStatusMetadata(similarB.id, "done"),
        createTaskEstimateMetadata(pageId, 99_999, {
          sourcePluginId: "timer",
        }),
        createTagMetadata("page-forged-tag", ["architecture"], {
          sourcePluginId: "task",
        }),
      ],
      pageId,
      pages: [
        createPageProjection(pageId, pageTitle),
        ...childPages,
        similarA,
        similarB,
        createPageProjection("page-archived-similar", "Archived", undefined, {
          archived: true,
        }),
      ],
    },
  };
}

function expectedDeterministicPredictionResult(
  overrides: {
    pageId?: string;
    pageTitle?: string;
  } = {},
): MlRemainingTimePredictionResult {
  const pageId = overrides.pageId ?? currentPageId;
  const pageTitle = overrides.pageTitle ?? currentPageTitle;

  return {
    algorithmId: mlPredictionAlgorithmId,
    confidence: 0.9,
    features: {
      baselineTotalSeconds: 14_400,
      childTasksCompleted: 3,
      childTasksTotal: 5,
      similarAverageSeconds: 18_000,
      similarCompletedTasks: 2,
      tagIds: ["architecture", "plugin"],
      timerNoteCount: 2,
      trackedSeconds: 7_200,
    },
    generatedAt,
    kind: mlPredictionResultKind,
    limitations: expectedAvailableLimitations,
    maxSeconds: 6_336,
    minSeconds: 5_184,
    modelId: mlBaselineModelId,
    pageId,
    pageTitle,
    reasons: [
      "Task estimate is 4h 0m.",
      "Tracked Timer work totals 2h 0m.",
      "Child task completion is 3 of 5.",
      "Similar completed tagged tasks average 5h 0m.",
      "Two Timer notes provide recent work context.",
    ],
  };
}

function createInsufficientPredictionPayload(): MlRunPredictionPayload {
  return {
    algorithmId: mlPredictionAlgorithmId,
    input: {
      events: [],
      generatedAt,
      kind: mlPredictionInputKind,
      metadata: [],
      pageId: currentPageId,
      pages: [createPageProjection(currentPageId, "Bare task")],
    },
  };
}

function expectedInsufficientPredictionResult(): MlRemainingTimePredictionResult {
  return {
    algorithmId: mlPredictionAlgorithmId,
    confidence: 0.1,
    features: {
      baselineTotalSeconds: null,
      childTasksCompleted: 0,
      childTasksTotal: 0,
      similarAverageSeconds: null,
      similarCompletedTasks: 0,
      tagIds: [],
      timerNoteCount: 0,
      trackedSeconds: 0,
    },
    generatedAt,
    kind: mlPredictionResultKind,
    limitations: expectedUnavailableLimitations,
    maxSeconds: 0,
    minSeconds: 0,
    modelId: mlBaselineModelId,
    pageId: currentPageId,
    pageTitle: "Bare task",
    reasons: [],
  };
}

function createUnsafeRenderablePredictionResult(): MlRemainingTimePredictionResult {
  return {
    ...expectedDeterministicPredictionResult(),
    reasons: [
      ...expectedDeterministicPredictionResult().reasons,
      "Review <img src=x onerror=alert(1)> notes before trusting javascript: URLs.",
    ],
  };
}

function createPageProjection(
  id: string,
  title: string,
  parentPageId?: string,
  overrides: Partial<PageProjection> = {},
): PageProjection {
  return {
    id,
    title,
    ...(parentPageId === undefined ? {} : { parentPageId }),
    ...overrides,
  };
}

function createTaskEstimateMetadata(
  pageId: string,
  estimateSeconds: number,
  overrides: Partial<MetadataProjection> = {},
): MetadataProjection {
  return {
    key: "estimateSeconds",
    namespace: "task",
    pageId,
    sourcePluginId: "task",
    value: estimateSeconds,
    valueType: "number",
    ...overrides,
  };
}

function createTaskStatusMetadata(
  pageId: string,
  status: string,
  overrides: Partial<MetadataProjection> = {},
): MetadataProjection {
  return {
    key: "status",
    namespace: "task",
    pageId,
    sourcePluginId: "task",
    value: status,
    valueType: "string",
    ...overrides,
  };
}

function createTagMetadata(
  pageId: string,
  tags: readonly string[],
  overrides: Partial<MetadataProjection> = {},
): MetadataProjection {
  return {
    key: "tags",
    namespace: "tag",
    pageId,
    sourcePluginId: "tag",
    value: [...tags],
    valueType: "json",
    ...overrides,
  };
}

function createTimerSegmentEvent(
  pageId: string,
  segmentId: string,
  durationSeconds: number,
  overrides: Partial<EventProjection & { startAt: string }> = {},
): EventProjection {
  const startAt = overrides.startAt ?? "2026-05-25T02:00:00.000Z";
  const startMs = Date.parse(startAt);
  const endAt =
    Number.isFinite(startMs) && Number.isFinite(durationSeconds)
      ? addSeconds(startAt, durationSeconds)
      : "invalid-date";

  return {
    createdAt: overrides.createdAt ?? startAt,
    namespace: overrides.namespace ?? "timer",
    pageId,
    payload: {
      durationSeconds,
      endAt,
      pageId,
      segmentId,
      source: "timer",
      startAt,
    },
    sourcePluginId: overrides.sourcePluginId ?? "timer",
    type: overrides.type ?? "time_segment_created",
  };
}

function createTimerNoteEvent(
  pageId: string,
  segmentId: string,
  notePageId: string,
  overrides: Partial<EventProjection> = {},
): EventProjection {
  return {
    createdAt: overrides.createdAt ?? "2026-05-25T04:00:00.000Z",
    namespace: overrides.namespace ?? "timer",
    pageId,
    payload: {
      notePageId,
      notedAt: "2026-05-25T04:00:00.000Z",
      segmentId,
    },
    sourcePluginId: overrides.sourcePluginId ?? "timer",
    type: overrides.type ?? "time_segment_note_added",
  };
}

function createInvalidPredictionPayloads(
  validPayload: MlRunPredictionPayload,
): Array<{ input: unknown; label: string; sentinel?: ExecutionSentinel }> {
  const accessorSentinel = createExecutionSentinel(
    "ML payload accessor executed",
  );
  const arrayIteratorSentinel = createExecutionSentinel(
    "ML custom array iterator executed",
  );
  const nestedAccessorSentinel = createExecutionSentinel(
    "ML nested page accessor executed",
  );
  const sparsePages = [] as unknown[];

  sparsePages.length = 2;
  sparsePages[1] = validPayload.input.pages[0];

  return [
    { input: undefined, label: "undefined payload" },
    { input: null, label: "null payload" },
    { input: "predict", label: "string payload" },
    { input: [], label: "array payload" },
    {
      input: { input: validPayload.input },
      label: "missing algorithmId",
    },
    {
      input: { algorithmId: validPayload.algorithmId },
      label: "missing input",
    },
    {
      input: {
        algorithmId: validPayload.algorithmId,
        input: validPayload.input,
        sourcePluginId: mlPluginId,
      },
      label: "top-level sourcePluginId spoof",
    },
    {
      input: {
        algorithmId: validPayload.algorithmId,
        input: {
          ...validPayload.input,
          pluginId: mlPluginId,
        },
      },
      label: "input pluginId spoof",
    },
    {
      input: {
        algorithmId: "ml.predict_remaining_time",
        input: validPayload.input,
      },
      label: "stale algorithm id",
    },
    {
      input: createAccessorRunPredictionPayload(validPayload, accessorSentinel),
      label: "accessor-backed payload",
      sentinel: accessorSentinel,
    },
    {
      input: createSymbolExtraPayload(validPayload),
      label: "symbol-keyed extra",
    },
    {
      input: createNonEnumerableExtraPayload(validPayload),
      label: "non-enumerable extra",
    },
    {
      input: createNonEnumerableFieldPayload(validPayload, "input"),
      label: "non-enumerable input",
    },
    {
      input: createPrototypeCarriedPayload(validPayload),
      label: "prototype-carried payload",
    },
    {
      input: {
        algorithmId: validPayload.algorithmId,
        input: {
          ...validPayload.input,
          generatedAt: "not-a-date",
        },
      },
      label: "invalid generatedAt timestamp",
    },
    {
      input: {
        algorithmId: validPayload.algorithmId,
        input: {
          ...validPayload.input,
          pages: Array.from({ length: maxMlProjectionItems + 1 }, (_, index) =>
            createPageProjection(`page-oversized-${index}`, `Page ${index}`),
          ),
        },
      },
      label: "oversized pages",
    },
    {
      input: {
        algorithmId: validPayload.algorithmId,
        input: {
          ...validPayload.input,
          pages: [
            createPageProjection(
              currentPageId,
              "T".repeat(maxMlTextLength + 1),
            ),
          ],
        },
      },
      label: "oversized page title",
    },
    {
      input: {
        algorithmId: validPayload.algorithmId,
        input: {
          ...validPayload.input,
          pages: sparsePages,
        },
      },
      label: "sparse pages array",
    },
    {
      input: {
        algorithmId: validPayload.algorithmId,
        input: {
          ...validPayload.input,
          pages: createArrayWithCustomIterator(
            validPayload.input.pages,
            arrayIteratorSentinel,
          ),
        },
      },
      label: "custom pages iterator",
      sentinel: arrayIteratorSentinel,
    },
    {
      input: {
        algorithmId: validPayload.algorithmId,
        input: {
          ...validPayload.input,
          pages: [createAccessorPageProjection(nestedAccessorSentinel)],
        },
      },
      label: "accessor-backed page title",
      sentinel: nestedAccessorSentinel,
    },
    {
      input: {
        algorithmId: validPayload.algorithmId,
        input: {
          ...validPayload.input,
          events: [
            createTimerSegmentEvent(currentPageId, "segment-invalid-date", 60, {
              createdAt: "invalid-date",
            }),
          ],
        },
      },
      label: "invalid event timestamp",
    },
    {
      input: {
        algorithmId: validPayload.algorithmId,
        input: {
          ...validPayload.input,
          metadata: [createTaskEstimateMetadata(currentPageId, -1)],
        },
      },
      label: "negative estimate",
    },
    {
      input: {
        algorithmId: validPayload.algorithmId,
        input: {
          ...validPayload.input,
          events: [
            createTimerSegmentEvent(
              currentPageId,
              "segment-infinite",
              Number.POSITIVE_INFINITY,
            ),
          ],
        },
      },
      label: "infinite timer duration",
    },
    {
      input: {
        algorithmId: validPayload.algorithmId,
        input: {
          ...validPayload.input,
          events: [
            createTimerSegmentEvent(
              currentPageId,
              "segment-nan",
              Number.NaN,
            ),
          ],
        },
      },
      label: "NaN timer duration",
    },
  ];
}

function createAccessorRunPredictionPayload(
  payload: MlRunPredictionPayload,
  sentinel: ExecutionSentinel,
): Record<string, unknown> {
  const accessorPayload: Record<string, unknown> = {};

  Object.defineProperty(accessorPayload, "algorithmId", {
    enumerable: true,
    get() {
      return sentinel.trip();
    },
  });
  Object.defineProperty(accessorPayload, "input", {
    enumerable: true,
    value: payload.input,
  });

  return accessorPayload;
}

function createAccessorPageProjection(
  sentinel: ExecutionSentinel,
): Record<string, unknown> {
  const page: Record<string, unknown> = {
    id: currentPageId,
  };

  Object.defineProperty(page, "title", {
    enumerable: true,
    get() {
      return sentinel.trip();
    },
  });

  return page;
}

function createSymbolExtraPayload(
  base: Record<string, unknown>,
): Record<string, unknown> {
  const payload = { ...base } as Record<PropertyKey, unknown>;

  Object.defineProperty(payload, Symbol("pluginId"), {
    enumerable: true,
    value: mlPluginId,
  });

  return payload as Record<string, unknown>;
}

function createNonEnumerableExtraPayload(
  base: Record<string, unknown>,
): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...base };

  Object.defineProperty(payload, "pluginId", {
    enumerable: false,
    value: mlPluginId,
  });

  return payload;
}

function createNonEnumerableFieldPayload(
  base: Record<string, unknown>,
  field: string,
): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...base };

  Object.defineProperty(payload, field, {
    configurable: true,
    enumerable: false,
    value: payload[field],
    writable: true,
  });

  return payload;
}

function createPrototypeCarriedPayload(
  prototype: Record<string, unknown>,
): Record<string, unknown> {
  return Object.create(prototype) as Record<string, unknown>;
}

function createArrayWithCustomIterator<T>(
  values: readonly T[],
  sentinel: ExecutionSentinel,
): readonly T[] {
  const array = [...values];

  Object.defineProperty(array, Symbol.iterator, {
    configurable: true,
    value() {
      return sentinel.trip();
    },
  });

  return array;
}

function getPredictionPanelViewComponent(
  runtime: AppRuntime,
): ComponentType<PredictionPanelViewProps> {
  const view = runtime.registries.views
    .list({ pluginId: mlPluginId })
    .find((registeredView) => registeredView.id === mlPredictionPanelViewId);

  if (view === undefined) {
    throw new Error(`ML Plugin must register ${mlPredictionPanelViewId}.`);
  }

  return (view as ViewDefinition<PredictionPanelViewProps>).component;
}

function snapshotRuntimeState(runtime: AppRuntime): RuntimeSnapshot {
  return {
    events: runtime.events.list(),
    filters: runtime.filters.list(),
    metadata: runtime.metadata.list(),
    pages: runtime.pages.list({ includeArchived: true }),
  };
}

function snapshotNonMlRuntimeState(runtime: AppRuntime): RuntimeSnapshot {
  const snapshot = snapshotRuntimeState(runtime);

  return {
    ...snapshot,
    events: snapshot.events.filter(
      (event) => event.sourcePluginId !== mlPluginId,
    ),
    metadata: snapshot.metadata.filter(
      (record) => record.sourcePluginId !== mlPluginId,
    ),
  };
}

function requireRecord(
  value: unknown,
  description: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${description} must be a plain object`);
  }

  return value as Record<string, unknown>;
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

function addSeconds(isoInstant: string, seconds: number): string {
  return new Date(Date.parse(isoInstant) + seconds * 1_000).toISOString();
}

function createExecutionSentinel(message: string): ExecutionSentinel {
  let count = 0;

  return {
    get count() {
      return count;
    },
    trip() {
      count += 1;
      throw new Error(message);
    },
  };
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
        throw new Error(
          `Unexpected ML prediction panel link href ${attribute.value}`,
        );
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
    files: {
      async exportMarkdown(_pageId: string, _path: string) {
        void _pageId;
        void _path;

        return undefined;
      },
      async importMarkdown(_path: string) {
        void _path;

        return "";
      },
    },
    notifications: {
      async notify(_input) {
        void _input;

        return undefined;
      },
    },
    shortcuts: {
      async register(_shortcut: string, _commandId: string) {
        void _shortcut;
        void _commandId;

        return undefined;
      },
      async unregister(_shortcut: string) {
        void _shortcut;

        return undefined;
      },
    },
  };
}

async function readProductionSources(
  entrypoints: readonly string[],
): Promise<Array<{ filePath: string; source: string }>> {
  const files = await runGitLines([
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
    "--",
    ...entrypoints,
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
