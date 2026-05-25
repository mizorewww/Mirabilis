import { createElement, type ReactElement } from "react";

export type AiReviewPanelProps = {
  data?: unknown;
  error?: unknown;
  isLoading?: boolean;
};

export function AiReviewPanel({
  isLoading,
}: AiReviewPanelProps): ReactElement {
  return createElement(
    "section",
    {
      "aria-label": "AI review",
      role: "region",
    },
    createElement(
      "p",
      {
        "aria-busy": isLoading === true ? "true" : undefined,
        "aria-label":
          isLoading === true ? "AI review loading" : "AI review unavailable",
        role: "status",
      },
      isLoading === true ? "Loading AI review" : "AI review unavailable",
    ),
  );
}
