import { createElement, type ReactElement } from "react";

export type AiSuggestionPanelProps = {
  data?: unknown;
  error?: unknown;
  isLoading?: boolean;
};

export function AiSuggestionPanel({
  isLoading,
}: AiSuggestionPanelProps): ReactElement {
  return createElement(
    "section",
    {
      "aria-label": "AI suggestions",
      role: "region",
    },
    createElement(
      "p",
      {
        "aria-busy": isLoading === true ? "true" : undefined,
        "aria-label":
          isLoading === true
            ? "AI suggestions loading"
            : "AI suggestions unavailable",
        role: "status",
      },
      isLoading === true ? "Loading AI suggestions" : "AI suggestions unavailable",
    ),
  );
}
