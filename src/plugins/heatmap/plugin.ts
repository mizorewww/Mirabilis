import { createElement, type ReactElement } from "react";

import type { AppPlugin } from "../../core";

export type HeatmapDateSeriesRow = {
  count: number;
  date: string;
  label: string;
  sourcePluginId: string;
  source: {
    namespace: string;
    sourcePluginId: string;
    type: string;
  };
};

export type HeatmapDateSeriesData = {
  kind: "heatmap.date-series";
  rows: readonly HeatmapDateSeriesRow[];
};

export type HeatmapViewProps = {
  data: HeatmapDateSeriesData;
};

type NormalizedDateSeriesRow = HeatmapDateSeriesRow & {
  sortKey: number;
};

const pluginId = "heatmap";
const viewId = "heatmap.calendar";
const viewType = "heatmap";
const dateSeriesKind = "heatmap.date-series";
const requiredRowKeys = new Set([
  "count",
  "date",
  "label",
  "sourcePluginId",
  "source",
]);
const requiredSourceKeys = new Set(["namespace", "sourcePluginId", "type"]);
const requiredDataKeys = new Set(["kind", "rows"]);

export const HeatmapPlugin: AppPlugin = {
  manifest: {
    id: pluginId,
    name: "Heatmap Plugin",
    version: "1.0.0",
    description: "Render normalized date-series data as a calendar heatmap.",
    minAppVersion: "0.1.0",
  },
  register(ctx) {
    ctx.views.register<HeatmapViewProps>({
      id: viewId,
      type: viewType,
      title: "Heatmap calendar",
      component: HeatmapView,
      accepts: {
        kind: dateSeriesKind,
      },
    });
  },
};

function HeatmapView({ data }: HeatmapViewProps): ReactElement {
  const rows = normalizeDateSeriesRows(data);

  return createElement(
    "section",
    {
      "aria-label": "Heatmap calendar",
      role: "region",
    },
    rows.length === 0
      ? createElement(
          "p",
          {
            role: "status",
          },
          "No heatmap data",
        )
      : createElement(
          "ul",
          {
            "aria-label": "Heatmap date series",
          },
          ...rows.map((row) =>
            createElement(
              "li",
              {
                key: `${row.date}\u0000${row.sourcePluginId}\u0000${row.label}`,
              },
              createElement(
                "button",
                {
                  type: "button",
                },
                createElement("span", null, row.date),
                " ",
                createElement(
                  "span",
                  null,
                  `${row.count} ${pluralizeCompletion(row.count)}`,
                ),
                " ",
                createElement("span", null, row.label),
              ),
            ),
          ),
        ),
  );
}

function normalizeDateSeriesRows(
  data: unknown,
): NormalizedDateSeriesRow[] {
  if (!isDateSeriesData(data)) {
    return [];
  }

  return data.rows
    .flatMap((row) => {
      const normalized = readDateSeriesRow(row);

      return normalized === null ? [] : [normalized];
    })
    .sort(compareDateSeriesRows);
}

function isDateSeriesData(data: unknown): data is HeatmapDateSeriesData {
  const payload = readExactDataRecord(data, requiredDataKeys);

  return (
    payload !== null &&
    payload.kind === dateSeriesKind &&
    Array.isArray(payload.rows)
  );
}

function readDateSeriesRow(input: unknown): NormalizedDateSeriesRow | null {
  const payload = readExactDataRecord(input, requiredRowKeys);

  if (payload === null) {
    return null;
  }

  const source = readSource(payload.source);
  const count = payload.count;
  const date = payload.date;
  const label = payload.label;
  const sourcePluginId = payload.sourcePluginId;

  if (
    source === null ||
    typeof count !== "number" ||
    !Number.isFinite(count) ||
    count <= 0 ||
    typeof date !== "string" ||
    typeof label !== "string" ||
    label.trim().length === 0 ||
    typeof sourcePluginId !== "string" ||
    sourcePluginId.trim().length === 0 ||
    source.sourcePluginId !== sourcePluginId
  ) {
    return null;
  }

  const parsedDate = parseDateOnly(date);

  if (parsedDate === null) {
    return null;
  }

  return {
    count,
    date,
    label,
    sourcePluginId,
    source,
    sortKey: parsedDate,
  };
}

function readSource(
  input: unknown,
): HeatmapDateSeriesRow["source"] | null {
  const payload = readExactDataRecord(input, requiredSourceKeys);

  if (payload === null) {
    return null;
  }

  const namespace = payload.namespace;
  const sourcePluginId = payload.sourcePluginId;
  const type = payload.type;

  if (
    typeof namespace !== "string" ||
    namespace.trim().length === 0 ||
    typeof sourcePluginId !== "string" ||
    sourcePluginId.trim().length === 0 ||
    typeof type !== "string" ||
    type.trim().length === 0
  ) {
    return null;
  }

  return {
    namespace,
    sourcePluginId,
    type,
  };
}

function readExactDataRecord(
  input: unknown,
  allowedKeys: ReadonlySet<string>,
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

  if (ownKeys.length !== allowedKeys.size) {
    return null;
  }

  for (const key of ownKeys) {
    if (typeof key !== "string" || !allowedKeys.has(key)) {
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

  for (const key of allowedKeys) {
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

function parseDateOnly(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    return null;
  }

  const timestamp = Date.parse(`${value}T00:00:00.000Z`);

  if (!Number.isFinite(timestamp)) {
    return null;
  }

  return new Date(timestamp).toISOString().slice(0, 10) === value
    ? timestamp
    : null;
}

function compareDateSeriesRows(
  left: NormalizedDateSeriesRow,
  right: NormalizedDateSeriesRow,
): number {
  return (
    left.sortKey - right.sortKey ||
    left.label.localeCompare(right.label) ||
    left.sourcePluginId.localeCompare(right.sourcePluginId)
  );
}

function pluralizeCompletion(count: number): string {
  return count === 1 ? "completion" : "completions";
}
