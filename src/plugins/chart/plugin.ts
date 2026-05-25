import { createElement, type ReactElement } from "react";

import type { AppPlugin } from "../../core";

export type ChartCategorySeries = {
  categories: readonly ChartCategoryItem[];
  kind: "chart.category-series";
  title: string;
  unit: ChartUnit;
};

export type ChartCategoryItem = {
  id?: string;
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
type SeriesRow = {
  key: string;
  label: string;
  values: readonly SeriesRowValue[];
};
type SeriesRowValue = {
  key: string;
  text: string;
};
type SeriesTableColumn = {
  key: string;
  label: string;
};

const pluginId = "chart";
const categorySeriesKind = "chart.category-series";
const comparisonSeriesKind = "chart.comparison-series";
const timeSeriesKind = "chart.time-series";
const categorySeriesKeys = new Set(["categories", "kind", "title", "unit"]);
const categoryItemKeys = new Set(["label", "value"]);
const categoryItemOptionalKeys = new Set(["id"]);
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
const maxChartItems = 200;
const maxTrustedNumericMagnitude = 1_000_000_000;
const maxTrustedLabelLength = 200;

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
        "aria-atomic": "true",
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
        "aria-atomic": "true",
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
  const columns = seriesColumns(series);
  const rows = seriesRows(series);

  return createElement(
    "table",
    {
      "aria-label": series.title,
    },
    [
      createElement(
        "thead",
        {
          key: "head",
        },
        createElement(
          "tr",
          null,
          columns.map((column) =>
            createElement(
              "th",
              {
                key: column.key,
                scope: "col",
              },
              column.label,
            ),
          ),
        ),
      ),
      createElement(
        "tbody",
        {
          key: "body",
        },
        rows.map((row) =>
          createElement(
            "tr",
            {
              key: row.key,
            },
            [
              createElement(
                "th",
                {
                  key: "label",
                  scope: "row",
                },
                row.label,
              ),
              ...row.values.map((value) =>
                createElement(
                  "td",
                  {
                    key: value.key,
                  },
                  value.text,
                ),
              ),
            ],
          ),
        ),
      ),
    ],
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
    seriesRows(series).map((row) =>
      createElement(
        "li",
        {
          key: row.key,
        },
        [row.label, ...row.values.map((value) => value.text)].join(" "),
      ),
    ),
  );
}

function seriesRows(
  series: ChartCategorySeries | ChartComparisonSeries | ChartTimeSeries,
): SeriesRow[] {
  switch (series.kind) {
    case categorySeriesKind:
      return series.categories.map((item, index) => ({
        key: item.id ?? `${item.label}\u0000${index}`,
        label: item.label,
        values: [
          {
            key: "value",
            text: formatValue(item.value, series.unit),
          },
        ],
      }));
    case timeSeriesKind:
      return series.points.map((point, index) => ({
        key: `${point.date}\u0000${point.label ?? ""}\u0000${index}`,
        label: point.date,
        values: [
          ...(point.label === undefined
            ? []
            : [
                {
                  key: "label",
                  text: point.label,
                },
              ]),
          {
            key: "value",
            text: formatValue(point.value, series.unit),
          },
        ],
      }));
    case comparisonSeriesKind:
      return series.comparisons.map((item, index) => ({
        key: `${item.label}\u0000${index}`,
        label: item.label,
        values: [
          {
            key: "expected",
            text: formatValue(item.expectedSeconds, series.unit),
          },
          {
            key: "actual",
            text: formatValue(item.actualSeconds, series.unit),
          },
          {
            key: "delta",
            text: formatValue(item.deltaSeconds, series.unit),
          },
          {
            key: "error",
            text: `${formatNumber(item.errorPercent)} percent`,
          },
        ],
      }));
  }
}

function seriesColumns(
  series: ChartCategorySeries | ChartComparisonSeries | ChartTimeSeries,
): SeriesTableColumn[] {
  switch (series.kind) {
    case categorySeriesKind:
      return [
        { key: "label", label: "Label" },
        { key: "value", label: "Value" },
      ];
    case timeSeriesKind:
      return [
        { key: "date", label: "Date" },
        { key: "label", label: "Label" },
        { key: "value", label: "Value" },
      ];
    case comparisonSeriesKind:
      return [
        { key: "label", label: "Label" },
        { key: "expected", label: "Expected" },
        { key: "actual", label: "Actual" },
        { key: "delta", label: "Delta" },
        { key: "error", label: "Error" },
      ];
  }
}

function readCategorySeries(input: unknown): ChartCategorySeries | null {
  const payload = readExactRecordOrNull(input, categorySeriesKeys);

  if (
    payload === null ||
    payload.kind !== categorySeriesKind ||
    !isTrustedLabel(payload.title) ||
    !isUnit(payload.unit)
  ) {
    return null;
  }

  const categoryInputs = readBoundedArray(payload.categories);

  if (categoryInputs === null) {
    return null;
  }

  const categories: ChartCategoryItem[] = [];

  for (let index = 0; index < categoryInputs.length; index += 1) {
    const item = readCategoryItem(categoryInputs[index]);

    if (item !== null) {
      categories.push(item);
    }
  }

  return {
    categories,
    kind: categorySeriesKind,
    title: payload.title,
    unit: payload.unit,
  };
}

function readCategoryItem(input: unknown): ChartCategoryItem | null {
  const payload = readExactRecordOrNull(
    input,
    categoryItemKeys,
    categoryItemOptionalKeys,
  );

  if (
    payload === null ||
    !isTrustedLabel(payload.label) ||
    !isTrustedNumber(payload.value)
  ) {
    return null;
  }

  const id = readOptionalLabel(payload.id);

  if (id === null) {
    return null;
  }

  return {
    ...(id === undefined ? {} : { id }),
    label: payload.label,
    value: payload.value,
  };
}

function readTimeSeries(input: unknown): ChartTimeSeries | null {
  const payload = readExactRecordOrNull(input, timeSeriesKeys);

  if (
    payload === null ||
    payload.kind !== timeSeriesKind ||
    !isTrustedLabel(payload.title) ||
    !isUnit(payload.unit)
  ) {
    return null;
  }

  const points = readBoundedArray(payload.points);

  if (points === null) {
    return null;
  }

  const trustedPoints: ChartTimePoint[] = [];

  for (let index = 0; index < points.length; index += 1) {
    const point = readTimePoint(points[index]);

    if (point !== null) {
      trustedPoints.push(point);
    }
  }

  return {
    kind: timeSeriesKind,
    points: trustedPoints,
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
    !isTrustedNumber(payload.value)
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
    !isTrustedLabel(payload.title) ||
    payload.unit !== "seconds"
  ) {
    return null;
  }

  const comparisons = readBoundedArray(payload.comparisons);

  if (comparisons === null) {
    return null;
  }

  const trustedComparisons: ChartComparisonItem[] = [];

  for (let index = 0; index < comparisons.length; index += 1) {
    const item = readComparisonItem(comparisons[index]);

    if (item !== null) {
      trustedComparisons.push(item);
    }
  }

  return {
    comparisons: trustedComparisons,
    kind: comparisonSeriesKind,
    title: payload.title,
    unit: "seconds",
  };
}

function readComparisonItem(input: unknown): ChartComparisonItem | null {
  const payload = readExactRecordOrNull(input, comparisonItemKeys);

  if (
    payload === null ||
    !isTrustedLabel(payload.label) ||
    !isTrustedNumber(payload.actualSeconds) ||
    !isTrustedNumber(payload.deltaSeconds) ||
    !isTrustedNumber(payload.errorPercent) ||
    !isTrustedNumber(payload.expectedSeconds)
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

  return isTrustedLabel(input) ? input : null;
}

function readBoundedArray(input: unknown): readonly unknown[] | null {
  const values = copyInertPlainArray(input);

  return values !== null && values.length <= maxChartItems ? values : null;
}

function copyInertPlainArray(input: unknown): unknown[] | null {
  if (
    !Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Array.prototype
  ) {
    return null;
  }

  const lengthDescriptor = Object.getOwnPropertyDescriptor(input, "length");

  if (
    lengthDescriptor === undefined ||
    !Object.prototype.hasOwnProperty.call(lengthDescriptor, "value") ||
    !Number.isSafeInteger(lengthDescriptor.value) ||
    lengthDescriptor.value < 0
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

  const values: unknown[] = [];

  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(input, String(index));

    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, "value")
    ) {
      return null;
    }

    values.push(descriptor.value);
  }

  return values;
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

function isTrustedLabel(input: unknown): input is string {
  return (
    typeof input === "string" &&
    input.trim().length > 0 &&
    input.length <= maxTrustedLabelLength
  );
}

function isTrustedNumber(input: unknown): input is number {
  return (
    typeof input === "number" &&
    Number.isFinite(input) &&
    Math.abs(input) <= maxTrustedNumericMagnitude
  );
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
