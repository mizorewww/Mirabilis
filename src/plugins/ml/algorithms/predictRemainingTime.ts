import type { RemainingTimeFeatureContext } from "../features/buildRemainingTimeFeatures";

export const mlPredictionAlgorithmId = "ml.predict-remaining-time";
export const mlPredictionInputKind = "ml.remaining-time-prediction-input";
export const mlPredictionResultKind = "ml.remaining-time-prediction";
export const mlBaselineModelId = "ml.remaining-time-baseline.v1";

export type MlPredictionFeatures = {
  baselineTotalSeconds: number | null;
  childTasksCompleted: number;
  childTasksTotal: number;
  similarAverageSeconds: number | null;
  similarCompletedTasks: number;
  tagIds: string[];
  timerNoteCount: number;
  trackedSeconds: number;
};

export type MlRemainingTimePredictionResult = {
  algorithmId: typeof mlPredictionAlgorithmId;
  confidence: number;
  features: MlPredictionFeatures;
  generatedAt: string;
  kind: typeof mlPredictionResultKind;
  limitations: string[];
  maxSeconds: number;
  minSeconds: number;
  modelId: typeof mlBaselineModelId;
  pageId: string;
  pageTitle: string;
  reasons: string[];
};

const availableLimitations = [
  "Baseline heuristic only; no trained model is used.",
  "Uses caller-provided page, metadata, and event projections only.",
];
const unavailableLimitations = [
  "Not enough trusted evidence to predict remaining time.",
  "Add a task estimate, Timer history, child task completion, or similar completed tasks.",
  "Baseline heuristic only; no trained model is used.",
];

export function predictRemainingTime(
  context: RemainingTimeFeatureContext,
): MlRemainingTimePredictionResult {
  const { features } = context;
  const hasEvidence =
    features.baselineTotalSeconds !== null ||
    features.trackedSeconds > 0 ||
    features.childTasksTotal > 0 ||
    features.similarCompletedTasks > 0 ||
    features.timerNoteCount > 0;

  if (!hasEvidence) {
    return {
      algorithmId: mlPredictionAlgorithmId,
      confidence: 0.1,
      features,
      generatedAt: context.generatedAt,
      kind: mlPredictionResultKind,
      limitations: [...unavailableLimitations],
      maxSeconds: 0,
      minSeconds: 0,
      modelId: mlBaselineModelId,
      pageId: context.pageId,
      pageTitle: context.pageTitle,
      reasons: [],
    };
  }

  const baselineTotalSeconds =
    features.baselineTotalSeconds ??
    features.similarAverageSeconds ??
    Math.max(features.trackedSeconds * 2, 3_600);
  const trackedRemaining = Math.max(
    0,
    baselineTotalSeconds - features.trackedSeconds,
  );
  const childRemaining =
    features.childTasksTotal > 0
      ? baselineTotalSeconds *
        (1 - features.childTasksCompleted / features.childTasksTotal)
      : null;
  const remainingSeconds =
    childRemaining === null
      ? trackedRemaining
      : Math.min(trackedRemaining, childRemaining);
  const confidence = calculateConfidence(features);
  const spread = 1 - confidence;

  return {
    algorithmId: mlPredictionAlgorithmId,
    confidence,
    features: {
      ...features,
      baselineTotalSeconds,
    },
    generatedAt: context.generatedAt,
    kind: mlPredictionResultKind,
    limitations: [...availableLimitations],
    maxSeconds: Math.round(remainingSeconds * (1 + spread)),
    minSeconds: Math.round(remainingSeconds * (1 - spread)),
    modelId: mlBaselineModelId,
    pageId: context.pageId,
    pageTitle: context.pageTitle,
    reasons: buildReasons(context),
  };
}

function calculateConfidence(features: MlPredictionFeatures): number {
  let confidence = 0.35;

  if (features.baselineTotalSeconds !== null) {
    confidence += 0.25;
  }

  if (features.trackedSeconds > 0) {
    confidence += 0.15;
  }

  if (features.childTasksTotal > 0) {
    confidence += 0.1;
  }

  if (features.similarCompletedTasks > 0) {
    confidence += 0.1;
  }

  return Math.min(0.9, Number(confidence.toFixed(2)));
}

function buildReasons(context: RemainingTimeFeatureContext): string[] {
  const { features } = context;
  const reasons: string[] = [];

  if (context.hasTaskEstimate && features.baselineTotalSeconds !== null) {
    reasons.push(`Task estimate is ${formatDuration(features.baselineTotalSeconds)}.`);
  }

  if (features.trackedSeconds > 0) {
    reasons.push(
      `Tracked Timer work totals ${formatDuration(features.trackedSeconds)}.`,
    );
  }

  if (features.childTasksTotal > 0) {
    reasons.push(
      `Child task completion is ${features.childTasksCompleted} of ${features.childTasksTotal}.`,
    );
  }

  if (features.similarAverageSeconds !== null) {
    reasons.push(
      `Similar completed tagged tasks average ${formatDuration(features.similarAverageSeconds)}.`,
    );
  }

  if (features.timerNoteCount > 0) {
    reasons.push(
      `${formatCount(features.timerNoteCount)} Timer ${features.timerNoteCount === 1 ? "note provides" : "notes provide"} recent work context.`,
    );
  }

  return reasons;
}

function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return `${hours}h ${remainingMinutes}m`;
}

function formatCount(count: number): string {
  if (count === 1) {
    return "One";
  }

  if (count === 2) {
    return "Two";
  }

  return String(count);
}
