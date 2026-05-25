import { createElement, type ReactElement } from "react";

import type { AppPlugin } from "../../core";

export type ChartCategorySeries = {
  categories: readonly ChartCategoryItem[];
  kind: "chart.category-series";
  title: string;
  unit: ChartUnit;
};

export type ChartCategoryItem = {
  label: string;
  value: number;
};

export type ChartTimeSeries = {
  kind: "chart.time-series";
  points: readonly ChartTimePoint[];
  title: string;
  unit: ChartUnit;
};

export type ChartTimePoint = {
  date: string;
  label?: string;
  value: number;
};

export type ChartComparisonSeries = {
  comparisons: readonly ChartComparisonItem[];
  kind: "chart.comparison-series";
  title: string;
  unit: "seconds";
};

export type ChartComparisonItem = {
  actualSeconds: number;
  deltaSeconds: number;
  errorPercent: number;
  expectedSeconds: number;
  label: string;
};

export type ChartData =
  | ChartCategorySeries
  | ChartComparisonSeries
  | ChartTimeSeries;

export type ChartViewProps = {
  data?: ChartData;
  isLoading?: boolean;
};

type ChartUnit = "seconds" | "count" | "percent";

const pluginId = "chart";
const categorySeriesKind = "chart.category-series";
const comparisonSeriesKind = "chart.comparison-series";
const timeSeriesKind = "chart.time-series";
const categorySeriesKeys = new Set(["categories", "kind", "title", "unit"]);
const categoryItemKeys = new Set(["label", "value"]);
const timeSeriesKeys = new Set(["kind", "points", "title", "unit"]);
const timePointRequiredKeys = new Set(["date", "value"]);
const timePointOptionalKeys = new Set(["label"]);
const comparisonSeriesKeys = new Set([
  "comparisons",
  "kind",
  "title",
  "unit",
]);
const comparisonItemKeys = new Set([
  "actualSeconds",
  "deltaSeconds",
  "errorPercent",
  "expectedSeconds",
  "label",
]);

export const ChartPlugin: AppPlugin = {
  manifest: {
    id: pluginId,
    name: "Chart Plugin",
    version: "1.0.0",
    description: "Render normalized chart DTOs as accessible markup.",
    minAppVersion: "0.1.0",
    contributes: {
      views: [
        {
          accepts: {
            kinds: [categorySeriesKind, comparisonSeriesKind],
          },
          id: "chart.bar",
          title: "Bar chart",
          type: "chart.bar",
        },
        {
          accepts: {
            kind: timeSeriesKind,
          },
          id: "chart.line",
          title: "Line chart",
          type: "chart.line",
        },
        {
          accepts: {
            kind: categorySeriesKind,
          },
          id: "chart.pie",
          title: "Pie chart",
          type: "chart.pie",
        },
      ],
    },
  },
  register(ctx) {
    ctx.views.register<ChartViewProps>({
      accepts: {
        kinds: [categorySeriesKind, comparisonSeriesKind],
      },
      component: BarChartView,
      id: "chart.bar",
      title: "Bar chart",
      type: "chart.bar",
    });
    ctx.views.register<ChartViewProps>({
      accepts: {
        kind: timeSeriesKind,
      },
      component: LineChartView,
      id: "chart.line",
      title: "Line chart",
      type: "chart.line",
    });
    ctx.views.register<ChartViewProps>({
      accepts: {
        kind: categorySeriesKind,
      },
      component: PieChartView,
      id: "chart.pie",
      title: "Pie chart",
      type: "chart.pie",
    });
  },
};

function BarChartView({ data, isLoading }: ChartViewProps): ReactElement {
  const categorySeries = readCategorySeries(data);
  const comparisonSeries = readComparisonSeries(data);

  return renderChartRegion(
    "Bar chart",
    isLoading,
    categorySeries === null && comparisonSeries === null
      ? null
      : comparisonSeries ?? categorySeries,
  );
}

function LineChartView({ data, isLoading }: ChartViewProps): ReactElement {
  return renderChartRegion("Line chart", isLoading, readTimeSeries(data));
}

function PieChartView({ data, isLoading }: ChartViewProps): ReactElement {
  const series = readCategorySeries(data);
  const isEmpty = isLoading !== true && (series === null || isSeriesEmpty(series));

  return createElement(
    "section",
    {
      "aria-label": isEmpty ? "Chart empty" : "Pie chart",
      role: "region",
    },
    renderChartBody(isLoading, series, "list"),
  );
}

function renderChartRegion(
  label: "Bar chart" | "Line chart",
  isLoading: boolean | undefined,
  series: ChartCategorySeries | ChartComparisonSeries | ChartTimeSeries | null,
): ReactElement {
  return createElement(
    "section",
    {
      "aria-label": label,
      role: "region",
    },
    renderChartBody(isLoading, series, label === "Bar chart" ? "table" : "list"),
  );
}

function renderChartBody(
  isLoading: boolean | undefined,
  series: ChartCategorySeries | ChartComparisonSeries | ChartTimeSeries | null,
  preferredShape: "list" | "table",
): ReactElement {
  if (isLoading === true) {
    return createElement(
      "p",
      {
        "aria-busy": "true",
        "aria-label": "Chart loading",
        role: "status",
      },
      "Loading chart",
    );
  }

  if (series === null || isSeriesEmpty(series)) {
    return createElement(
      "p",
      {
        "aria-label": "Chart empty",
        role: "status",
      },
      "No chart data",
    );
  }

  if (preferredShape === "table") {
    return renderSeriesTable(series);
  }

  return renderSeriesList(series);
}

function renderSeriesTable(
  series: ChartCategorySeries | ChartComparisonSeries | ChartTimeSeries,
): ReactElement {
  return createElement(
    "table",
    {
      "aria-label": series.title,
    },
    createElement(
      "tbody",
      null,
      ...seriesRows(series).map((row) =>
        createElement(
          "tr",
          {
            key: row.key,
          },
          createElement(
            "th",
            {
              scope: "row",
            },
            row.label,
          ),
          ...row.values.map((value) =>
            createElement(
              "td",
              {
                key: value,
              },
              value,
            ),
          ),
        ),
      ),
    ),
  );
}

function renderSeriesList(
  series: ChartCategorySeries | ChartComparisonSeries | ChartTimeSeries,
): ReactElement {
  return createElement(
    "ul",
    {
      "aria-label": series.title,
    },
    ...seriesRows(series).map((row) =>
      createElement(
        "li",
        {
          key: row.key,
        },
        [row.label, ...row.values].join(" "),
      ),
    ),
  );
}

function seriesRows(
  series: ChartCategorySeries | ChartComparisonSeries | ChartTimeSeries,
): Array<{ key: string; label: string; values: string[] }> {
  switch (series.kind) {
    case categorySeriesKind:
      return series.categories.map((item) => ({
        key: item.label,
        label: item.label,
        values: [formatValue(item.value, series.unit)],
      }));
    case timeSeriesKind:
      return series.points.map((point) => ({
        key: `${point.date}\u0000${point.label ?? ""}`,
        label: point.date,
        values: [
          ...(point.label === undefined ? [] : [point.label]),
          formatValue(point.value, series.unit),
        ],
      }));
    case comparisonSeriesKind:
      return series.comparisons.map((item) => ({
        key: item.label,
        label: item.label,
        values: [
          formatValue(item.expectedSeconds, series.unit),
          formatValue(item.actualSeconds, series.unit),
          formatValue(item.deltaSeconds, series.unit),
          `${formatNumber(item.errorPercent)} percent`,
        ],
      }));
  }
}

function readCategorySeries(input: unknown): ChartCategorySeries | null {
  const payload = readExactRecordOrNull(input, categorySeriesKeys);

  if (
    payload === null ||
    payload.kind !== categorySeriesKind ||
    typeof payload.title !== "string" ||
    payload.title.trim().length === 0 ||
    !isUnit(payload.unit) ||
    !Array.isArray(payload.categories)
  ) {
    return null;
  }

  return {
    categories: payload.categories.flatMap((itemInput) => {
      const item = readCategoryItem(itemInput);

      return item === null ? [] : [item];
    }),
    kind: categorySeriesKind,
    title: payload.title,
    unit: payload.unit,
  };
}

function readCategoryItem(input: unknown): ChartCategoryItem | null {
  const payload = readExactRecordOrNull(input, categoryItemKeys);

  if (
    payload === null ||
    typeof payload.label !== "string" ||
    payload.label.trim().length === 0 ||
    typeof payload.value !== "number" ||
    !Number.isFinite(payload.value)
  ) {
    return null;
  }

  return {
    label: payload.label,
    value: payload.value,
  };
}

function readTimeSeries(input: unknown): ChartTimeSeries | null {
  const payload = readExactRecordOrNull(input, timeSeriesKeys);

  if (
    payload === null ||
    payload.kind !== timeSeriesKind ||
    typeof payload.title !== "string" ||
    payload.title.trim().length === 0 ||
    !isUnit(payload.unit) ||
    !Array.isArray(payload.points)
  ) {
    return null;
  }

  return {
    kind: timeSeriesKind,
    points: payload.points.flatMap((pointInput) => {
      const point = readTimePoint(pointInput);

      return point === null ? [] : [point];
    }),
    title: payload.title,
    unit: payload.unit,
  };
}

function readTimePoint(input: unknown): ChartTimePoint | null {
  const payload = readExactRecordOrNull(
    input,
    timePointRequiredKeys,
    timePointOptionalKeys,
  );

  if (
    payload === null ||
    typeof payload.date !== "string" ||
    parseDateOnly(payload.date) === null ||
    typeof payload.value !== "number" ||
    !Number.isFinite(payload.value)
  ) {
    return null;
  }

  const label = readOptionalLabel(payload.label);

  if (label === null) {
    return null;
  }

  return {
    date: payload.date,
    ...(label === undefined ? {} : { label }),
    value: payload.value,
  };
}

function readComparisonSeries(input: unknown): ChartComparisonSeries | null {
  const payload = readExactRecordOrNull(input, comparisonSeriesKeys);

  if (
    payload === null ||
    payload.kind !== comparisonSeriesKind ||
    typeof payload.title !== "string" ||
    payload.title.trim().length === 0 ||
    payload.unit !== "seconds" ||
    !Array.isArray(payload.comparisons)
  ) {
    return null;
  }

  return {
    comparisons: payload.comparisons.flatMap((itemInput) => {
      const item = readComparisonItem(itemInput);

      return item === null ? [] : [item];
    }),
    kind: comparisonSeriesKind,
    title: payload.title,
    unit: "seconds",
  };
}

function readComparisonItem(input: unknown): ChartComparisonItem | null {
  const payload = readExactRecordOrNull(input, comparisonItemKeys);

  if (
    payload === null ||
    typeof payload.label !== "string" ||
    payload.label.trim().length === 0 ||
    typeof payload.actualSeconds !== "number" ||
    !Number.isFinite(payload.actualSeconds) ||
    typeof payload.deltaSeconds !== "number" ||
    !Number.isFinite(payload.deltaSeconds) ||
    typeof payload.errorPercent !== "number" ||
    !Number.isFinite(payload.errorPercent) ||
    typeof payload.expectedSeconds !== "number" ||
    !Number.isFinite(payload.expectedSeconds)
  ) {
    return null;
  }

  return {
    actualSeconds: payload.actualSeconds,
    deltaSeconds: payload.deltaSeconds,
    errorPercent: payload.errorPercent,
    expectedSeconds: payload.expectedSeconds,
    label: payload.label,
  };
}

function readExactRecordOrNull(
  input: unknown,
  requiredKeys: ReadonlySet<string>,
  optionalKeys: ReadonlySet<string> = new Set(),
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

  if (
    ownKeys.length < requiredKeys.size ||
    ownKeys.length > requiredKeys.size + optionalKeys.size
  ) {
    return null;
  }

  for (const key of ownKeys) {
    if (
      typeof key !== "string" ||
      (!requiredKeys.has(key) && !optionalKeys.has(key))
    ) {
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

  for (const key of requiredKeys) {
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

function isUnit(input: unknown): input is ChartUnit {
  return input === "seconds" || input === "count" || input === "percent";
}

function readOptionalLabel(input: unknown): string | null | undefined {
  if (input === undefined) {
    return undefined;
  }

  return typeof input === "string" && input.trim().length > 0 ? input : null;
}

function isSeriesEmpty(
  series: ChartCategorySeries | ChartComparisonSeries | ChartTimeSeries,
): boolean {
  switch (series.kind) {
    case categorySeriesKind:
      return series.categories.length === 0;
    case timeSeriesKind:
      return series.points.length === 0;
    case comparisonSeriesKind:
      return series.comparisons.length === 0;
  }
}

function formatValue(value: number, unit: ChartUnit): string {
  return `${formatNumber(value)} ${unit}`;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? value.toFixed(0) : `${value}`;
}

function parseDateOnly(input: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(input)) {
    return null;
  }

  const timestamp = Date.parse(`${input}T00:00:00.000Z`);

  if (!Number.isFinite(timestamp)) {
    return null;
  }

  return new Date(timestamp).toISOString().slice(0, 10) === input
    ? timestamp
    : null;
}
