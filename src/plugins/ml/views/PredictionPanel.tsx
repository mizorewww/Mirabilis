import { createElement, type ReactElement } from "react";

import type { MlRemainingTimePredictionResult } from "../algorithms/predictRemainingTime";

export type PredictionPanelViewProps = {
  data?: MlRemainingTimePredictionResult;
  isLoading?: boolean;
};

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
  data: MlRemainingTimePredictionResult | undefined,
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

  if (data === undefined || data.reasons.length === 0) {
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
        (data?.limitations ?? []).map((limitation) =>
          createElement("li", { key: limitation }, limitation),
        ),
      ),
    ];
  }

  return [
    createElement("p", { key: "title" }, data.pageTitle),
    createElement(
      "p",
      { key: "range" },
      `${formatDuration(data.minSeconds)} to ${formatDuration(data.maxSeconds)}`,
    ),
    createElement(
      "p",
      { key: "confidence" },
      `${Math.round(data.confidence * 100)}% confidence`,
    ),
    createElement(
      "ul",
      {
        "aria-label": "Prediction reasons",
        key: "reasons",
      },
      data.reasons.map((reason, index) =>
        createElement("li", { key: `${index}:${reason}` }, reason),
      ),
    ),
    createElement(
      "ul",
      {
        "aria-label": "Prediction limitations",
        key: "limitations",
      },
      data.limitations.map((limitation) =>
        createElement("li", { key: limitation }, limitation),
      ),
    ),
  ];
}

function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return `${hours}h ${remainingMinutes}m`;
}
