import type { AppPlugin, MetadataJsonValue, PluginContext } from "../../core";

import {
  mlBaselineModelId,
  mlPredictionAlgorithmId,
  mlPredictionResultKind,
  predictRemainingTime,
  type MlRemainingTimePredictionResult,
} from "./algorithms/predictRemainingTime";
import {
  buildRemainingTimeFeatures,
  readRemainingTimePredictionInput,
  type MlRemainingTimePredictionInput,
} from "./features/buildRemainingTimeFeatures";
import {
  PredictionPanel,
  type PredictionPanelViewProps,
} from "./views/PredictionPanel";

export type MlRunPredictionPayload = {
  algorithmId: typeof mlPredictionAlgorithmId;
  input: MlRemainingTimePredictionInput;
};

const pluginId = "ml";
const runPredictionCommandId = "ml.run-prediction";
const predictionPanelViewId = "ml.prediction-panel";
const predictionPanelSlotId = "ml.page-sidebar.prediction-panel";
const predictionPanelSlot = "page.sidebar.panel";
const predictedRemainingTimeMetadataKey = "predictedRemainingTime";
const predictionConfidenceMetadataKey = "predictionConfidence";
const predictionGeneratedEventType = "prediction-generated";
const runPredictionPayloadKeys = new Set(["algorithmId", "input"]);

export const MlPlugin: AppPlugin = {
  manifest: {
    id: pluginId,
    name: "Machine Learning Plugin",
    version: "1.0.0",
    description: "Run deterministic baseline predictions from caller-provided projections.",
    minAppVersion: "0.1.0",
    contributes: {
      algorithms: [
        {
          id: mlPredictionAlgorithmId,
          name: "Predict remaining time",
        },
      ],
      eventTypes: [
        {
          id: "ml.prediction-generated",
          namespace: pluginId,
          type: predictionGeneratedEventType,
        },
      ],
      metadataFields: [
        {
          id: "ml.predictedRemainingTime",
          key: predictedRemainingTimeMetadataKey,
          namespace: pluginId,
          valueType: "json",
        },
        {
          id: "ml.predictionConfidence",
          key: predictionConfidenceMetadataKey,
          namespace: pluginId,
          valueType: "number",
        },
      ],
      slots: [
        {
          id: predictionPanelSlotId,
          slot: predictionPanelSlot,
        },
      ],
      views: [
        {
          accepts: {
            kind: mlPredictionResultKind,
          },
          id: predictionPanelViewId,
          title: "Prediction panel",
          type: predictionPanelViewId,
        },
      ],
    },
  },
  register(ctx) {
    ctx.commands.register<unknown, MlRemainingTimePredictionResult>({
      id: runPredictionCommandId,
      title: "Run prediction",
      handler: runPrediction,
    });

    ctx.views.register<PredictionPanelViewProps>({
      accepts: {
        kind: mlPredictionResultKind,
      },
      component: PredictionPanel,
      id: predictionPanelViewId,
      title: "Prediction panel",
      type: predictionPanelViewId,
    });

    ctx.slots.register<PredictionPanelViewProps>({
      component: PredictionPanel,
      id: predictionPanelSlotId,
      slot: predictionPanelSlot,
    });
  },
};

function runPrediction(
  input: unknown,
  ctx: PluginContext,
): MlRemainingTimePredictionResult {
  const payload = readRunPredictionPayload(input);
  const result = predictRemainingTime(buildRemainingTimeFeatures(payload.input));

  writePredictionResult(ctx, result);

  return result;
}

function readRunPredictionPayload(input: unknown): MlRunPredictionPayload {
  const payload = readExactRecord(
    input,
    runPredictionPayloadKeys,
    `${runPredictionCommandId} input`,
  );

  if (payload.algorithmId !== mlPredictionAlgorithmId) {
    throw new Error(`${runPredictionCommandId} requires matching algorithmId`);
  }

  return {
    algorithmId: mlPredictionAlgorithmId,
    input: readRemainingTimePredictionInput(payload.input),
  };
}

function writePredictionResult(
  ctx: PluginContext,
  result: MlRemainingTimePredictionResult,
): void {
  const metadataValue = {
    algorithmId: result.algorithmId,
    confidence: result.confidence,
    generatedAt: result.generatedAt,
    kind: result.kind,
    maxSeconds: result.maxSeconds,
    minSeconds: result.minSeconds,
    modelId: mlBaselineModelId,
    pageId: result.pageId,
  } satisfies MetadataJsonValue;
  const eventPayload = {
    algorithmId: result.algorithmId,
    confidence: result.confidence,
    generatedAt: result.generatedAt,
    maxSeconds: result.maxSeconds,
    minSeconds: result.minSeconds,
    modelId: mlBaselineModelId,
    pageId: result.pageId,
  } satisfies MetadataJsonValue;

  ctx.metadata.set({
    key: predictedRemainingTimeMetadataKey,
    namespace: pluginId,
    pageId: result.pageId,
    value: metadataValue,
    valueType: "json",
  });
  ctx.metadata.set({
    key: predictionConfidenceMetadataKey,
    namespace: pluginId,
    pageId: result.pageId,
    value: result.confidence,
    valueType: "number",
  });
  ctx.events.append({
    namespace: pluginId,
    pageId: result.pageId,
    payload: eventPayload,
    type: predictionGeneratedEventType,
  });
}

function readExactRecord(
  input: unknown,
  requiredKeys: ReadonlySet<string>,
  label: string,
): Record<string, unknown> {
  if (
    typeof input !== "object" ||
    input === null ||
    Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Object.prototype
  ) {
    throw new Error(`${label} must be exact plain data`);
  }

  const ownKeys = Reflect.ownKeys(input);

  if (ownKeys.length !== requiredKeys.size) {
    throw new Error(`${label} contains untrusted fields`);
  }

  for (const key of ownKeys) {
    if (typeof key !== "string" || !requiredKeys.has(key)) {
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
  }

  for (const key of requiredKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);

    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, "value")
    ) {
      throw new Error(`${label} is missing ${key}`);
    }
  }

  return input as Record<string, unknown>;
}
