import { createElement, type ReactElement } from "react";

import {
  mlBaselineModelId,
  mlPredictionAlgorithmId,
  mlPredictionResultKind,
  type MlRemainingTimePredictionResult,
} from "../algorithms/predictRemainingTime";

export type PredictionPanelViewProps = {
  data?: unknown;
  isLoading?: boolean;
};

const maxMlProjectionItems = 1_000;
const maxMlTextLength = 1_000;
const maxTrustedNumericMagnitude = 1_000_000_000;
const resultKeys = new Set([
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
const featureKeys = new Set([
  "baselineTotalSeconds",
  "childTasksCompleted",
  "childTasksTotal",
  "similarAverageSeconds",
  "similarCompletedTasks",
  "tagIds",
  "timerNoteCount",
  "trackedSeconds",
]);

export function PredictionPanel({
  data,
  isLoading,
}: PredictionPanelViewProps): ReactElement {
  return createElement(
    "section",
    {
      "aria-label": "Prediction panel",
      role: "region",
    },
    renderPredictionBody(data, isLoading),
  );
}

function renderPredictionBody(
  data: unknown,
  isLoading: boolean | undefined,
): ReactElement | ReactElement[] {
  if (isLoading === true) {
    return createElement(
      "p",
      {
        "aria-busy": "true",
        "aria-label": "Prediction loading",
        role: "status",
      },
      "Loading prediction",
    );
  }

  const prediction = readPredictionResultOrNull(data);

  if (prediction === null || prediction.reasons.length === 0) {
    return [
      createElement(
        "p",
        {
          "aria-label": "Prediction unavailable",
          key: "status",
          role: "status",
        },
        "Insufficient data",
      ),
      createElement(
        "ul",
        {
          "aria-label": "Prediction limitations",
          key: "limitations",
        },
        (prediction?.limitations ?? []).map((limitation, index) =>
          createElement("li", { key: `${index}:${limitation}` }, limitation),
        ),
      ),
    ];
  }

  return [
    createElement("p", { key: "title" }, prediction.pageTitle),
    createElement(
      "p",
      { key: "range" },
      `${formatDuration(prediction.minSeconds)} to ${formatDuration(prediction.maxSeconds)}`,
    ),
    createElement(
      "p",
      { key: "confidence" },
      `${Math.round(prediction.confidence * 100)}% confidence`,
    ),
    createElement(
      "ul",
      {
        "aria-label": "Prediction reasons",
        key: "reasons",
      },
      prediction.reasons.map((reason, index) =>
        createElement("li", { key: `${index}:${reason}` }, reason),
      ),
    ),
    createElement(
      "ul",
      {
        "aria-label": "Prediction limitations",
        key: "limitations",
      },
      prediction.limitations.map((limitation, index) =>
        createElement("li", { key: `${index}:${limitation}` }, limitation),
      ),
    ),
  ];
}

function readPredictionResultOrNull(
  input: unknown,
): MlRemainingTimePredictionResult | null {
  const payload = readExactRecordOrNull(input, resultKeys);

  if (
    payload === null ||
    payload.algorithmId !== mlPredictionAlgorithmId ||
    payload.kind !== mlPredictionResultKind ||
    payload.modelId !== mlBaselineModelId
  ) {
    return null;
  }

  const confidence = readBoundedNumber(payload.confidence, 0, 1);
  const features = readFeaturesOrNull(payload.features);
  const generatedAt = readInstantStringOrNull(payload.generatedAt);
  const maxSeconds = readBoundedNumber(
    payload.maxSeconds,
    0,
    maxTrustedNumericMagnitude,
  );
  const minSeconds = readBoundedNumber(
    payload.minSeconds,
    0,
    maxTrustedNumericMagnitude,
  );
  const pageId = readNonBlankStringOrNull(payload.pageId);
  const pageTitle = readBoundedTextOrNull(payload.pageTitle);
  const reasons = readStringArrayOrNull(payload.reasons);
  const limitations = readStringArrayOrNull(payload.limitations);

  if (
    confidence === null ||
    features === null ||
    generatedAt === null ||
    maxSeconds === null ||
    minSeconds === null ||
    minSeconds > maxSeconds ||
    pageId === null ||
    pageTitle === null ||
    reasons === null ||
    limitations === null
  ) {
    return null;
  }

  return {
    algorithmId: mlPredictionAlgorithmId,
    confidence,
    features,
    generatedAt,
    kind: mlPredictionResultKind,
    limitations,
    maxSeconds,
    minSeconds,
    modelId: mlBaselineModelId,
    pageId,
    pageTitle,
    reasons,
  };
}

function readFeaturesOrNull(input: unknown): MlRemainingTimePredictionResult["features"] | null {
  const payload = readExactRecordOrNull(input, featureKeys);

  if (payload === null) {
    return null;
  }

  const baselineTotalSeconds = readNullableBoundedNumber(
    payload.baselineTotalSeconds,
  );
  const childTasksCompleted = readNonNegativeInteger(
    payload.childTasksCompleted,
  );
  const childTasksTotal = readNonNegativeInteger(payload.childTasksTotal);
  const similarAverageSeconds = readNullableBoundedNumber(
    payload.similarAverageSeconds,
  );
  const similarCompletedTasks = readNonNegativeInteger(
    payload.similarCompletedTasks,
  );
  const tagIds = readStringArrayOrNull(payload.tagIds);
  const timerNoteCount = readNonNegativeInteger(payload.timerNoteCount);
  const trackedSeconds = readBoundedNumber(
    payload.trackedSeconds,
    0,
    maxTrustedNumericMagnitude,
  );

  if (
    baselineTotalSeconds === undefined ||
    childTasksCompleted === null ||
    childTasksTotal === null ||
    similarAverageSeconds === undefined ||
    similarCompletedTasks === null ||
    tagIds === null ||
    timerNoteCount === null ||
    trackedSeconds === null ||
    childTasksCompleted > childTasksTotal
  ) {
    return null;
  }

  return {
    baselineTotalSeconds,
    childTasksCompleted,
    childTasksTotal,
    similarAverageSeconds,
    similarCompletedTasks,
    tagIds,
    timerNoteCount,
    trackedSeconds,
  };
}

function readExactRecordOrNull(
  input: unknown,
  requiredKeys: ReadonlySet<string>,
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

  if (ownKeys.length !== requiredKeys.size) {
    return null;
  }

  for (const key of ownKeys) {
    if (typeof key !== "string" || !requiredKeys.has(key)) {
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

  return input as Record<string, unknown>;
}

function readStringArrayOrNull(input: unknown): string[] | null {
  if (
    !Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Array.prototype
  ) {
    return null;
  }

  const length = readPlainArrayLengthOrNull(input);

  if (length === null) {
    return null;
  }

  const values: string[] = [];

  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(input, String(index));

    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, "value")
    ) {
      return null;
    }

    const value = readBoundedTextOrNull(descriptor.value);

    if (value === null) {
      return null;
    }

    values.push(value);
  }

  return values;
}

function readPlainArrayLengthOrNull(input: unknown[]): number | null {
  const lengthDescriptor = Object.getOwnPropertyDescriptor(input, "length");

  if (
    lengthDescriptor === undefined ||
    !Object.prototype.hasOwnProperty.call(lengthDescriptor, "value") ||
    !Number.isSafeInteger(lengthDescriptor.value) ||
    lengthDescriptor.value < 0 ||
    lengthDescriptor.value > maxMlProjectionItems
  ) {
    return null;
  }

  const length = lengthDescriptor.value;

  for (const key of Reflect.ownKeys(input)) {
    if (key === "length") {
      continue;
    }

    if (typeof key !== "string" || readArrayIndex(key, length) === null) {
      return null;
    }
  }

  return length;
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

function readNullableBoundedNumber(input: unknown): number | null | undefined {
  if (input === null) {
    return null;
  }

  return readBoundedNumber(input, 0, maxTrustedNumericMagnitude) ?? undefined;
}

function readNonNegativeInteger(input: unknown): number | null {
  const value = readBoundedNumber(input, 0, maxTrustedNumericMagnitude);

  return value !== null && Number.isInteger(value) ? value : null;
}

function readBoundedNumber(
  input: unknown,
  min: number,
  max: number,
): number | null {
  return typeof input === "number" &&
    Number.isFinite(input) &&
    input >= min &&
    input <= max
    ? input
    : null;
}

function readNonBlankStringOrNull(input: unknown): string | null {
  const value = readBoundedTextOrNull(input);

  return value !== null && value.trim().length > 0 ? value : null;
}

function readBoundedTextOrNull(input: unknown): string | null {
  return typeof input === "string" && input.length <= maxMlTextLength
    ? input
    : null;
}

function readInstantStringOrNull(input: unknown): string | null {
  const value = readNonBlankStringOrNull(input);

  if (value === null) {
    return null;
  }

  const timestamp = Date.parse(value);

  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) &&
    Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString() === value
    ? value
    : null;
}

function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return `${hours}h ${remainingMinutes}m`;
}
