import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { render, screen, within } from "@testing-library/react";
import { createElement, type ComponentType } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

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

type StatsAggregationId = (typeof statsAggregationIds)[number];

type StatsRunAggregationPayload = {
  aggregationId: StatsAggregationId;
  input: StatsAggregationInput;
};

type StatsAggregationInput =
  | TimeByTagAggregationInput
  | TimeByPageAggregationInput
  | EstimateVsActualAggregationInput
  | HabitCompletionAggregationInput
  | TaskSwitchCountAggregationInput
  | UnnotedSessionsAggregationInput;

type TimerSegmentFixture = {
  durationSeconds: number;
  endAt: string;
  pageId: string;
  pageTitle: string;
  segmentId: string;
  source: "timer";
  startAt: string;
  tagIds?: readonly string[];
  taskPageId?: string;
  provenance: {
    eventPageId: string;
    namespace: string;
    sourcePluginId: string;
    type: string;
  };
};

type TagMetadataFixture = {
  id: string;
  label: string;
  namespace: string;
  sourcePluginId: string;
  type: string;
};

type TaskEstimateFixture = {
  estimateSeconds: number;
  namespace: string;
  pageId: string;
  sourcePluginId: string;
  type: string;
};

type HabitCompletionEventFixture = {
  createdAt: string;
  namespace: string;
  payload: {
    date: string;
    habitPageId: string;
  };
  sourcePluginId: string;
  type: string;
};

type TimerNoteEventFixture = {
  namespace: string;
  payload: {
    notePageId: string;
    pageId: string;
    segmentId: string;
  };
  sourcePluginId: string;
  type: string;
};

type TimeByTagAggregationInput = {
  kind: "stats.time-by-tag-input";
  segments: readonly TimerSegmentFixture[];
  tags: readonly TagMetadataFixture[];
};

type TimeByPageAggregationInput = {
  kind: "stats.time-by-page-input";
  segments: readonly TimerSegmentFixture[];
};

type EstimateVsActualAggregationInput = {
  estimates: readonly TaskEstimateFixture[];
  kind: "stats.estimate-vs-actual-input";
  segments: readonly TimerSegmentFixture[];
};

type HabitCompletionAggregationInput = {
  endDate: string;
  events: readonly HabitCompletionEventFixture[];
  habits: readonly { habitPageId: string; title: string }[];
  kind: "stats.habit-completion-input";
  startDate: string;
};

type TaskSwitchCountAggregationInput = {
  kind: "stats.task-switch-count-input";
  segments: readonly TimerSegmentFixture[];
};

type UnnotedSessionsAggregationInput = {
  kind: "stats.unnoted-sessions-input";
  notes: readonly TimerNoteEventFixture[];
  segments: readonly TimerSegmentFixture[];
};

type ChartCategorySeries = {
  categories: readonly ChartCategoryItem[];
  kind: "chart.category-series";
  title: string;
  unit: "seconds" | "count" | "percent";
};

type ChartCategoryItem = {
  label: string;
  value: number;
};

type ChartTimeSeries = {
  kind: "chart.time-series";
  points: readonly ChartTimePoint[];
  title: string;
  unit: "seconds" | "count" | "percent";
};

type ChartTimePoint = {
  date: string;
  label?: string;
  value: number;
};

type ChartComparisonSeries = {
  comparisons: readonly ChartComparisonItem[];
  kind: "chart.comparison-series";
  title: string;
  unit: "seconds";
};

type ChartComparisonItem = {
  actualSeconds: number;
  deltaSeconds: number;
  errorPercent: number;
  expectedSeconds: number;
  label: string;
};

type ChartData =
  | ChartCategorySeries
  | ChartComparisonSeries
  | ChartTimeSeries;

type ChartViewId = (typeof chartViewIds)[number];

type ChartViewProps = {
  data?: ChartData;
  isLoading?: boolean;
};

const statsPluginId = "stats";
const chartPluginId = "chart";
const statsRunAggregationCommandId = "stats.run-aggregation";
const statsAggregationIds = [
  "stats.sum-time-by-tag",
  "stats.sum-time-by-page",
  "stats.estimate-vs-actual",
  "stats.habit-completion-rate",
  "stats.task-switch-count",
  "stats.unnoted-sessions-count",
] as const;
const chartViewIds = ["chart.bar", "chart.line", "chart.pie"] as const;
const staleStatsOrChartIds = [
  "stats.open_review",
  "stats.open-review",
  "sum_time_by_tag",
  "sum_time_by_page",
  "estimate_vs_actual",
  "habit_completion_rate",
  "task_switch_count",
  "unnoted_sessions_count",
  "bar_chart",
  "line_chart",
  "pie_chart",
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
const statsChartProductionEntrypoints = [
  "src/bootstrap/built-in-plugins.ts",
  "src/plugins/stats",
  "src/plugins/chart",
] as const;

describe("Stats and Chart plugins", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("registers Stats and Chart as built-ins with only canonical runtime contributions", async () => {
    const runtime = await createRuntime();
    const builtInPluginIds = BUILT_IN_PLUGINS.map(
      (plugin) => plugin.manifest.id,
    );
    const statsPlugin = BUILT_IN_PLUGINS.find(
      (plugin) => plugin.manifest.id === statsPluginId,
    );
    const chartPlugin = BUILT_IN_PLUGINS.find(
      (plugin) => plugin.manifest.id === chartPluginId,
    );
    const statsCommandIds = runtime.registries.commands
      .list({ pluginId: statsPluginId })
      .map((command) => command.id)
      .sort();
    const chartViews = runtime.registries.views.list({
      pluginId: chartPluginId,
    });
    const chartViewIdsForRuntime = chartViews.map((view) => view.id).sort();
    const statsAlgorithmIds =
      statsPlugin?.manifest.contributes?.algorithms
        ?.map((algorithm) => algorithm.id)
        .sort() ?? [];
    const chartManifestViewIds =
      chartPlugin?.manifest.contributes?.views
        ?.map((view) => view.id)
        .sort() ?? [];

    expect.soft(builtInPluginIds).toEqual(
      expect.arrayContaining([statsPluginId, chartPluginId]),
    );
    expect.soft(statsAlgorithmIds).toStrictEqual(
      [...statsAggregationIds].sort(),
    );
    expect.soft(statsCommandIds).toStrictEqual([statsRunAggregationCommandId]);
    expect.soft(chartViewIdsForRuntime).toStrictEqual([...chartViewIds].sort());
    expect.soft(chartManifestViewIds).toStrictEqual([...chartViewIds].sort());

    for (const aggregationId of statsAggregationIds) {
      expect.soft(statsPlugin?.manifest.contributes?.algorithms).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: aggregationId,
            name: expect.any(String),
          }),
        ]),
      );
    }

    expect(chartViews.find((view) => view.id === "chart.bar")).toMatchObject({
      accepts: {
        kinds: ["chart.category-series", "chart.comparison-series"],
      },
      id: "chart.bar",
      pluginId: chartPluginId,
      title: "Bar chart",
      type: "chart.bar",
    });
    expect(chartViews.find((view) => view.id === "chart.line")).toMatchObject({
      accepts: {
        kind: "chart.time-series",
      },
      id: "chart.line",
      pluginId: chartPluginId,
      title: "Line chart",
      type: "chart.line",
    });
    expect(chartViews.find((view) => view.id === "chart.pie")).toMatchObject({
      accepts: {
        kind: "chart.category-series",
      },
      id: "chart.pie",
      pluginId: chartPluginId,
      title: "Pie chart",
      type: "chart.pie",
    });

    for (const staleId of staleStatsOrChartIds) {
      expect(statsAlgorithmIds).not.toContain(staleId);
      expect(statsCommandIds).not.toContain(staleId);
      expect(chartViewIdsForRuntime).not.toContain(staleId);
      expect(chartManifestViewIds).not.toContain(staleId);
    }

    expect(runtime.registries.views.list({ pluginId: statsPluginId }))
      .toStrictEqual([]);
    expect(runtime.filters.list({ sourcePluginId: statsPluginId }))
      .toStrictEqual([]);
  });

  it("fails closed for malformed stats.run-aggregation payloads without mutating Core stores", async () => {
    const runtime = await createRuntime({
      eventIds: ["event-stats-validation-baseline"],
      metadataIds: ["metadata-stats-validation-baseline"],
      pageIds: ["page-stats-validation-baseline"],
    });
    const page = createPage(runtime, "Validation baseline");

    runtime.metadata.set({
      key: "status",
      namespace: "task",
      pageId: page.id,
      sourcePluginId: "task",
      value: "todo",
      valueType: "string",
    });
    runtime.events.append({
      namespace: "timer",
      pageId: page.id,
      payload: {
        durationSeconds: 60,
        endAt: "2026-05-20T09:01:00.000Z",
        pageId: page.id,
        segmentId: "segment-validation-baseline",
        source: "timer",
        startAt: "2026-05-20T09:00:00.000Z",
      },
      sourcePluginId: "timer",
      type: "time_segment_created",
    });
    runtime.filters.save({
      id: "stats-validation-baseline-filter",
      name: "Validation baseline",
      query: { where: [] },
      sourcePluginId: "task",
      viewType: "page.list",
    });

    const validPayload = createRunAggregationPayload(
      "stats.sum-time-by-page",
      createTimeByPageInput([
        createTimerSegment({
          durationSeconds: 60,
          pageId: page.id,
          pageTitle: page.title,
          segmentId: "segment-validation-valid",
        }),
      ]),
    );
    const invalidPayloads = createInvalidRunAggregationPayloads(validPayload);

    for (const { input, label } of invalidPayloads) {
      const before = snapshotRuntimeState(runtime);

      await expect(
        runStatsAggregation(runtime, input),
        label,
      ).rejects.toBeInstanceOf(Error);
      expect(snapshotRuntimeState(runtime), label).toStrictEqual(before);
    }
  });

  it("aggregates Timer duration by trusted Tag metadata and uses No tag for untagged valid segments", async () => {
    const runtime = await createRuntime();
    const validTagged = createTimerSegment({
      durationSeconds: 1_800,
      pageId: "page-tagged",
      pageTitle: "Tagged work",
      segmentId: "segment-tagged",
      tagIds: ["tag-deep-work", "tag-review"],
    });
    const validUntagged = createTimerSegment({
      durationSeconds: 900,
      pageId: "page-untagged",
      pageTitle: "Loose work",
      segmentId: "segment-untagged",
      tagIds: [],
    });
    const wrongOwner = createTimerSegment({
      durationSeconds: 3_600,
      pageId: "page-forged-owner",
      pageTitle: "Forged owner",
      segmentId: "segment-forged-owner",
      tagIds: ["tag-forged"],
      sourcePluginId: "task",
    });
    const malformedDuration = {
      ...createTimerSegment({
        durationSeconds: 300,
        pageId: "page-invalid-duration",
        pageTitle: "Invalid duration",
        segmentId: "segment-invalid-duration",
        tagIds: ["tag-deep-work"],
      }),
      durationSeconds: Number.NaN,
    };
    const unsafeTag = {
      id: "tag-unsafe",
      label: "Unsafe tag",
      namespace: "tag",
      sourcePluginId: "task",
      type: "tag",
    } as const satisfies TagMetadataFixture;
    const input = createTimeByTagInput(
      [validTagged, validUntagged, wrongOwner, malformedDuration],
      [
        createTagMetadata("tag-deep-work", "Deep Work"),
        createTagMetadata("tag-review", "Review"),
        unsafeTag,
      ],
    );
    const before = snapshotRuntimeState(runtime);

    await expect(
      runStatsAggregation(
        runtime,
        createRunAggregationPayload("stats.sum-time-by-tag", input),
      ),
    ).resolves.toStrictEqual({
      categories: [
        { label: "Deep Work", value: 1_800 },
        { label: "Review", value: 1_800 },
        { label: "No tag", value: 900 },
      ],
      kind: "chart.category-series",
      title: "Time by tag",
      unit: "seconds",
    } satisfies ChartCategorySeries);
    expect(snapshotRuntimeState(runtime)).toStrictEqual(before);
  });

  it("aggregates valid Timer duration by trusted page title while ignoring malformed or forged segment DTOs", async () => {
    const runtime = await createRuntime();
    const input = createTimeByPageInput([
      createTimerSegment({
        durationSeconds: 1_200,
        pageId: "page-alpha",
        pageTitle: "Alpha",
        segmentId: "segment-alpha-1",
      }),
      createTimerSegment({
        durationSeconds: 600,
        pageId: "page-alpha",
        pageTitle: "Alpha",
        segmentId: "segment-alpha-2",
      }),
      createTimerSegment({
        durationSeconds: 900,
        pageId: "page-beta",
        pageTitle: "Beta",
        segmentId: "segment-beta",
      }),
      createTimerSegment({
        durationSeconds: 900,
        pageId: "page-wrong-namespace",
        pageTitle: "Wrong namespace",
        segmentId: "segment-wrong-namespace",
        namespace: "task",
      }),
      {
        ...createTimerSegment({
          durationSeconds: 300,
          pageId: "page-infinite",
          pageTitle: "Infinite",
          segmentId: "segment-infinite",
        }),
        durationSeconds: Number.POSITIVE_INFINITY,
      },
      withNonEnumerableSegmentField(
        createTimerSegment({
          durationSeconds: 300,
          pageId: "page-hidden-title",
          pageTitle: "Hidden title",
          segmentId: "segment-hidden-title",
        }),
        "pageTitle",
      ),
      createAccessorTimerSegment("Accessor title"),
      createPrototypeCarriedTimerSegment("Prototype title"),
    ]);

    await expect(
      runStatsAggregation(
        runtime,
        createRunAggregationPayload("stats.sum-time-by-page", input),
      ),
    ).resolves.toStrictEqual({
      categories: [
        { label: "Alpha", value: 1_800 },
        { label: "Beta", value: 900 },
      ],
      kind: "chart.category-series",
      title: "Time by page",
      unit: "seconds",
    } satisfies ChartCategorySeries);
  });

  it("compares trusted task estimates with actual Timer seconds and returns deterministic delta/error fields", async () => {
    const runtime = await createRuntime();
    const input = createEstimateVsActualInput(
      [
        createTimerSegment({
          durationSeconds: 1_200,
          pageId: "page-plan",
          pageTitle: "Planning",
          segmentId: "segment-plan-1",
          taskPageId: "task-plan",
        }),
        createTimerSegment({
          durationSeconds: 600,
          pageId: "page-plan",
          pageTitle: "Planning",
          segmentId: "segment-plan-2",
          taskPageId: "task-plan",
        }),
        createTimerSegment({
          durationSeconds: 900,
          pageId: "page-build",
          pageTitle: "Build",
          segmentId: "segment-build",
          taskPageId: "task-build",
        }),
        createTimerSegment({
          durationSeconds: 3_000,
          pageId: "page-forged-estimate",
          pageTitle: "Forged estimate page",
          segmentId: "segment-forged-estimate",
          taskPageId: "task-forged-estimate",
        }),
      ],
      [
        createTaskEstimate("task-plan", 1_500),
        createTaskEstimate("task-build", 1_800),
        createTaskEstimate("task-forged-estimate", 1_000, {
          sourcePluginId: "timer",
        }),
        createTaskEstimate("task-unsafe", Number.POSITIVE_INFINITY),
      ],
    );

    await expect(
      runStatsAggregation(
        runtime,
        createRunAggregationPayload("stats.estimate-vs-actual", input),
      ),
    ).resolves.toStrictEqual({
      comparisons: [
        {
          actualSeconds: 1_800,
          deltaSeconds: 300,
          errorPercent: 20,
          expectedSeconds: 1_500,
          label: "task-plan",
        },
        {
          actualSeconds: 900,
          deltaSeconds: -900,
          errorPercent: -50,
          expectedSeconds: 1_800,
          label: "task-build",
        },
      ],
      kind: "chart.comparison-series",
      title: "Estimate vs actual",
      unit: "seconds",
    } satisfies ChartComparisonSeries);
  });

  it("aggregates Habit completion with terminal event semantics over an inclusive date range", async () => {
    const runtime = await createRuntime();
    const input = createHabitCompletionInput({
      endDate: "2026-05-22",
      events: [
        createHabitEvent({
          createdAt: "2026-05-20T08:00:00.000Z",
          date: "2026-05-20",
          habitPageId: "habit-review",
          type: "checked",
        }),
        createHabitEvent({
          createdAt: "2026-05-20T10:00:00.000Z",
          date: "2026-05-20",
          habitPageId: "habit-review",
          type: "unchecked",
        }),
        createHabitEvent({
          createdAt: "2026-05-20T11:00:00.000Z",
          date: "2026-05-20",
          habitPageId: "habit-review",
          type: "checked",
        }),
        createHabitEvent({
          createdAt: "2026-05-21T09:00:00.000Z",
          date: "2026-05-21",
          habitPageId: "habit-review",
          type: "checked",
        }),
        createHabitEvent({
          createdAt: "2026-05-21T10:00:00.000Z",
          date: "2026-05-21",
          habitPageId: "habit-review",
          type: "unchecked",
        }),
        createHabitEvent({
          createdAt: "2026-05-22T12:00:00.000Z",
          date: "2026-05-22",
          habitPageId: "habit-write",
          type: "checked",
        }),
        createHabitEvent({
          createdAt: "2026-05-23T12:00:00.000Z",
          date: "2026-05-23",
          habitPageId: "habit-review",
          type: "checked",
        }),
        createHabitEvent({
          createdAt: "2026-05-20T07:00:00.000Z",
          date: "2026-05-20",
          habitPageId: "habit-forged",
          sourcePluginId: "task",
          type: "checked",
        }),
        createHabitEvent({
          createdAt: "invalid-date",
          date: "2026-05-20",
          habitPageId: "habit-invalid",
          type: "checked",
        }),
      ],
      habits: [
        { habitPageId: "habit-review", title: "Daily review" },
        { habitPageId: "habit-write", title: "Write notes" },
      ],
      startDate: "2026-05-20",
    });

    await expect(
      runStatsAggregation(
        runtime,
        createRunAggregationPayload("stats.habit-completion-rate", input),
      ),
    ).resolves.toStrictEqual({
      categories: [
        { label: "Daily review", value: 1 },
        { label: "Write notes", value: 1 },
      ],
      kind: "chart.category-series",
      title: "Habit completion",
      unit: "count",
    } satisfies ChartCategorySeries);
  });

  it("counts adjacent task switches across sorted valid Timer segments only", async () => {
    const runtime = await createRuntime();
    const input = createTaskSwitchCountInput([
      createTimerSegment({
        durationSeconds: 600,
        pageId: "page-b",
        pageTitle: "Build",
        segmentId: "segment-2",
        startAt: "2026-05-20T10:15:00.000Z",
      }),
      createTimerSegment({
        durationSeconds: 600,
        pageId: "page-a",
        pageTitle: "Plan",
        segmentId: "segment-1",
        startAt: "2026-05-20T10:00:00.000Z",
      }),
      createTimerSegment({
        durationSeconds: 600,
        pageId: "page-b",
        pageTitle: "Build",
        segmentId: "segment-3",
        startAt: "2026-05-20T10:30:00.000Z",
      }),
      createTimerSegment({
        durationSeconds: 600,
        pageId: "page-c",
        pageTitle: "Review",
        segmentId: "segment-4",
        startAt: "2026-05-20T11:00:00.000Z",
      }),
      createTimerSegment({
        durationSeconds: 600,
        pageId: "page-forged",
        pageTitle: "Forged",
        segmentId: "segment-forged",
        sourcePluginId: "task",
        startAt: "2026-05-20T10:45:00.000Z",
      }),
      {
        ...createTimerSegment({
          durationSeconds: 600,
          pageId: "page-invalid-date",
          pageTitle: "Invalid date",
          segmentId: "segment-invalid-date",
        }),
        startAt: "not-a-date",
      },
    ]);

    await expect(
      runStatsAggregation(
        runtime,
        createRunAggregationPayload("stats.task-switch-count", input),
      ),
    ).resolves.toStrictEqual({
      categories: [{ label: "Task switches", value: 2 }],
      kind: "chart.category-series",
      title: "Task switching",
      unit: "count",
    } satisfies ChartCategorySeries);
  });

  it("counts valid unnoted Timer sessions by page using matching Timer note events", async () => {
    const runtime = await createRuntime();
    const noted = createTimerSegment({
      durationSeconds: 600,
      pageId: "page-alpha",
      pageTitle: "Alpha",
      segmentId: "segment-noted",
    });
    const unnotedAlpha = createTimerSegment({
      durationSeconds: 300,
      pageId: "page-alpha",
      pageTitle: "Alpha",
      segmentId: "segment-unnoted-alpha",
    });
    const unnotedBeta = createTimerSegment({
      durationSeconds: 900,
      pageId: "page-beta",
      pageTitle: "Beta",
      segmentId: "segment-unnoted-beta",
    });
    const input = createUnnotedSessionsInput(
      [
        noted,
        unnotedAlpha,
        unnotedBeta,
        createTimerSegment({
          durationSeconds: 600,
          pageId: "page-forged",
          pageTitle: "Forged",
          segmentId: "segment-forged",
          sourcePluginId: "task",
        }),
      ],
      [
        createTimerNoteEvent({
          notePageId: "note-page",
          pageId: noted.pageId,
          segmentId: noted.segmentId,
        }),
        createTimerNoteEvent({
          notePageId: "wrong-owner-note",
          pageId: unnotedAlpha.pageId,
          segmentId: unnotedAlpha.segmentId,
          sourcePluginId: "task",
        }),
        createTimerNoteEvent({
          notePageId: "wrong-type-note",
          pageId: unnotedBeta.pageId,
          segmentId: unnotedBeta.segmentId,
          type: "time_segment_created",
        }),
      ],
    );

    await expect(
      runStatsAggregation(
        runtime,
        createRunAggregationPayload("stats.unnoted-sessions-count", input),
      ),
    ).resolves.toStrictEqual({
      categories: [
        { label: "Alpha", value: 1 },
        { label: "Beta", value: 1 },
      ],
      kind: "chart.category-series",
      title: "Unnoted sessions",
      unit: "count",
    } satisfies ChartCategorySeries);
  });

  it("renders Bar, Line, and Pie chart data as accessible inert React markup with loading and empty states", async () => {
    const runtime = await createRuntime();
    const unsafeLabel = "Deep <img src=x onerror=alert(1)>";
    const categoryData = createCategorySeries({
      categories: [
        { label: unsafeLabel, value: 1_800 },
        { label: "Review", value: 900 },
      ],
      title: "Time by tag",
      unit: "seconds",
    });
    const timeSeries = createTimeSeries({
      points: [
        { date: "2026-05-20", label: "Wednesday", value: 2 },
        { date: "2026-05-21", label: "Thursday", value: 3 },
      ],
      title: "Habit completions by day",
      unit: "count",
    });
    const comparisonSeries = createComparisonSeries({
      comparisons: [
        {
          actualSeconds: 1_800,
          deltaSeconds: 300,
          errorPercent: 20,
          expectedSeconds: 1_500,
          label: "Planning",
        },
      ],
      title: "Estimate vs actual",
    });

    renderChartView(runtime, "chart.bar", { data: categoryData });
    renderChartView(runtime, "chart.line", { data: timeSeries });
    renderChartView(runtime, "chart.pie", { data: categoryData });
    renderChartView(runtime, "chart.bar", { data: comparisonSeries });
    renderChartView(runtime, "chart.bar", { isLoading: true });
    renderChartView(runtime, "chart.pie", {
      data: createCategorySeries({ categories: [], title: "Empty", unit: "count" }),
    });

    const barCharts = screen.getAllByRole("region", { name: "Bar chart" });
    const lineChart = screen.getByRole("region", { name: "Line chart" });
    const pieChart = screen.getByRole("region", { name: "Pie chart" });
    const loadingStatus = screen.getByRole("status", { name: /chart loading/i });
    const emptyStatus = screen.getByRole("status", { name: /chart empty/i });

    expect(within(barCharts[0]).getByRole("table", { name: "Time by tag" }))
      .toBeVisible();
    expect(within(barCharts[0]).getByText(unsafeLabel)).toBeVisible();
    expect(within(barCharts[0]).getByText("1800 seconds")).toBeVisible();
    expect(within(lineChart).getByRole("list", { name: "Habit completions by day" }))
      .toBeVisible();
    expect(within(lineChart).getByText(/2026-05-20.*Wednesday.*2 count/u))
      .toBeVisible();
    expect(within(pieChart).getByRole("list", { name: "Time by tag" }))
      .toBeVisible();
    expect(within(barCharts[1]).getByRole("table", { name: "Estimate vs actual" }))
      .toBeVisible();
    expect(within(barCharts[1]).getByText("300 seconds")).toBeVisible();
    expect(loadingStatus).toHaveTextContent(/loading chart/i);
    expect(loadingStatus).toHaveAttribute("aria-busy", "true");
    expect(emptyStatus).toHaveTextContent("No chart data");
    expectNoDangerousDom();
  });

  it("passes Stats output DTOs directly into Chart views without exposing Stats internals or runtime stores to Chart", async () => {
    const runtime = await createRuntime();
    const before = snapshotRuntimeState(runtime);
    const statsOutput = await runStatsAggregation(
      runtime,
      createRunAggregationPayload(
        "stats.sum-time-by-tag",
        createTimeByTagInput(
          [
            createTimerSegment({
              durationSeconds: 1_200,
              pageId: "page-integration",
              pageTitle: "Integration page",
              segmentId: "segment-integration",
              tagIds: ["tag-focus"],
            }),
          ],
          [createTagMetadata("tag-focus", "Focus")],
        ),
      ),
    );

    renderChartView(runtime, "chart.bar", {
      data: statsOutput as ChartCategorySeries,
    });

    const chart = screen.getByRole("region", { name: "Bar chart" });

    expect(within(chart).getByText("Focus")).toBeVisible();
    expect(within(chart).getByText("1200 seconds")).toBeVisible();
    expect(snapshotRuntimeState(runtime)).toStrictEqual(before);
  });

  it("keeps Stats and Chart production isolated from Core business behavior, raw runtime/native surfaces, HTML sinks, and package/native diffs", async () => {
    const coreSources = await readProductionSources(["src/core"]);
    const productionSources = await readProductionSources(
      statsChartProductionEntrypoints,
    );
    const productionFilePaths = productionSources
      .map(({ filePath }) => filePath)
      .sort();

    for (const { filePath, source } of coreSources) {
      expect(source, `${filePath}: Core stats/chart business terms`).not.toMatch(
        /\b(?:stats?|chart|sum-time-by-tag|sum-time-by-page|estimate-vs-actual|habit-completion|task-switch|unnoted-sessions)\b/iu,
      );
    }

    expect(productionFilePaths).toEqual(
      expect.arrayContaining([
        "src/bootstrap/built-in-plugins.ts",
        "src/plugins/stats/index.ts",
        "src/plugins/chart/index.ts",
      ]),
    );
    expect(
      productionFilePaths.some((filePath) =>
        /^src\/plugins\/stats\/plugin\.tsx?$/u.test(filePath),
      ),
      "Stats plugin entrypoint",
    ).toBe(true);
    expect(
      productionFilePaths.some((filePath) =>
        /^src\/plugins\/chart\/plugin\.tsx?$/u.test(filePath),
      ),
      "Chart plugin entrypoint",
    ).toBe(true);

    for (const { filePath, source } of productionSources.filter(({ filePath }) =>
      /^src\/plugins\/(?:stats|chart)\//u.test(filePath),
    )) {
      expect(source, `${filePath}: raw runtime/native import`).not.toMatch(
        /@tauri-apps|\bNativeBridge\b|createTauriNativeBridge|\bPluginHost\b|\buseRuntime\b|runtime-context|from\s+["'][^"']*(?:core\/(?:stores|registries|runtime|native)|plugin-host|bootstrap)["']/u,
      );
      expect(source, `${filePath}: raw store or registry access`).not.toMatch(
        /\b(?:createCoreStores|createCoreRegistries|stores|registries|pluginHost|PluginHost)\b/u,
      );
      expect(source, `${filePath}: markdown or HTML injection sink`).not.toMatch(
        /dangerouslySetInnerHTML|\.innerHTML\b|renderMarkdown|markdownToHtml|marked|sanitizeHtml/iu,
      );
    }

    for (const { filePath, source } of productionSources.filter(({ filePath }) =>
      filePath.startsWith("src/plugins/stats/"),
    )) {
      expect(source, `${filePath}: private plugin facade read`).not.toMatch(
        /\b(?:ctx|runtime)?\.?(?:pages|metadata|events|filters)\s*\.\s*(?:get|list|save|set|append|delete|update|create|archive)\b/u,
      );
      expect(source, `${filePath}: direct Timer/Habit/Task/Tag internals`).not.toMatch(
        /plugins\/(?:timer|habit|task|tag)|from\s+["'][^"']*(?:\/timer|\/habit|\/task|\/tag)["']/u,
      );
    }

    for (const { filePath, source } of productionSources.filter(({ filePath }) =>
      filePath.startsWith("src/plugins/chart/"),
    )) {
      expect(source, `${filePath}: Stats internals`).not.toMatch(
        /plugins\/stats|from\s+["'][^"']*(?:\/stats|\.\/stats)["']/u,
      );
      expect(source, `${filePath}: Chart store reads`).not.toMatch(
        /\b(?:ctx|runtime)?\.?(?:pages|metadata|events|filters|commands)\s*\.\s*(?:get|list|execute)\b/u,
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

function runStatsAggregation(
  runtime: AppRuntime,
  input: unknown,
): Promise<unknown> {
  return runtime.commands.execute(statsRunAggregationCommandId, input);
}

function createRunAggregationPayload(
  aggregationId: StatsAggregationId,
  input: StatsAggregationInput,
): StatsRunAggregationPayload {
  return {
    aggregationId,
    input,
  };
}

function createInvalidRunAggregationPayloads(
  validPayload: StatsRunAggregationPayload,
): Array<{ input: unknown; label: string }> {
  return [
    { input: undefined, label: "undefined payload" },
    { input: null, label: "null payload" },
    { input: {}, label: "empty payload" },
    { input: [], label: "array payload" },
    {
      input: { input: validPayload.input },
      label: "missing aggregationId",
    },
    {
      input: { aggregationId: validPayload.aggregationId },
      label: "missing input",
    },
    {
      input: {
        aggregationId: validPayload.aggregationId,
        input: validPayload.input,
        sourcePluginId: statsPluginId,
      },
      label: "extra caller-owned field",
    },
    {
      input: {
        aggregationId: "sum_time_by_page",
        input: validPayload.input,
      },
      label: "snake_case aggregation id",
    },
    {
      input: {
        aggregationId: "stats.sum-time-by-parent-page",
        input: validPayload.input,
      },
      label: "unknown aggregation id",
    },
    {
      input: {
        aggregationId: "stats.sum-time-by-page",
        input: createTimeByTagInput([], []),
      },
      label: "wrong input kind",
    },
    {
      input: createAccessorRunAggregationPayload(validPayload),
      label: "accessor payload",
    },
    {
      input: createSymbolExtraPayload(validPayload),
      label: "symbol extra",
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
  ];
}

function createTimeByTagInput(
  segments: readonly (TimerSegmentFixture | Record<string, unknown>)[],
  tags: readonly TagMetadataFixture[] = [],
): TimeByTagAggregationInput {
  return {
    kind: "stats.time-by-tag-input",
    segments: segments as readonly TimerSegmentFixture[],
    tags,
  };
}

function createTimeByPageInput(
  segments: readonly (TimerSegmentFixture | Record<string, unknown>)[],
): TimeByPageAggregationInput {
  return {
    kind: "stats.time-by-page-input",
    segments: segments as readonly TimerSegmentFixture[],
  };
}

function createEstimateVsActualInput(
  segments: readonly TimerSegmentFixture[],
  estimates: readonly TaskEstimateFixture[],
): EstimateVsActualAggregationInput {
  return {
    estimates,
    kind: "stats.estimate-vs-actual-input",
    segments,
  };
}

function createHabitCompletionInput(input: {
  endDate: string;
  events: readonly HabitCompletionEventFixture[];
  habits: readonly { habitPageId: string; title: string }[];
  startDate: string;
}): HabitCompletionAggregationInput {
  return {
    ...input,
    kind: "stats.habit-completion-input",
  };
}

function createTaskSwitchCountInput(
  segments: readonly TimerSegmentFixture[],
): TaskSwitchCountAggregationInput {
  return {
    kind: "stats.task-switch-count-input",
    segments,
  };
}

function createUnnotedSessionsInput(
  segments: readonly TimerSegmentFixture[],
  notes: readonly TimerNoteEventFixture[],
): UnnotedSessionsAggregationInput {
  return {
    kind: "stats.unnoted-sessions-input",
    notes,
    segments,
  };
}

function createTimerSegment(input: {
  durationSeconds: number;
  pageId: string;
  pageTitle: string;
  segmentId: string;
  endAt?: string;
  namespace?: string;
  sourcePluginId?: string;
  startAt?: string;
  tagIds?: readonly string[];
  taskPageId?: string;
  type?: string;
}): TimerSegmentFixture {
  const startAt = input.startAt ?? "2026-05-20T09:00:00.000Z";

  return {
    durationSeconds: input.durationSeconds,
    endAt: input.endAt ?? addSeconds(startAt, input.durationSeconds),
    pageId: input.pageId,
    pageTitle: input.pageTitle,
    segmentId: input.segmentId,
    source: "timer",
    startAt,
    ...(input.tagIds === undefined ? {} : { tagIds: input.tagIds }),
    ...(input.taskPageId === undefined ? {} : { taskPageId: input.taskPageId }),
    provenance: {
      eventPageId: input.pageId,
      namespace: input.namespace ?? "timer",
      sourcePluginId: input.sourcePluginId ?? "timer",
      type: input.type ?? "time_segment_created",
    },
  };
}

function createTagMetadata(id: string, label: string): TagMetadataFixture {
  return {
    id,
    label,
    namespace: "tag",
    sourcePluginId: "tag",
    type: "tag",
  };
}

function createTaskEstimate(
  pageId: string,
  estimateSeconds: number,
  overrides: Partial<TaskEstimateFixture> = {},
): TaskEstimateFixture {
  return {
    estimateSeconds,
    namespace: "task",
    pageId,
    sourcePluginId: "task",
    type: "estimate",
    ...overrides,
  };
}

function createHabitEvent(input: {
  createdAt: string;
  date: string;
  habitPageId: string;
  sourcePluginId?: string;
  type: "checked" | "unchecked";
}): HabitCompletionEventFixture {
  return {
    createdAt: input.createdAt,
    namespace: "habit",
    payload: {
      date: input.date,
      habitPageId: input.habitPageId,
    },
    sourcePluginId: input.sourcePluginId ?? "habit",
    type: input.type,
  };
}

function createTimerNoteEvent(input: {
  notePageId: string;
  pageId: string;
  segmentId: string;
  sourcePluginId?: string;
  type?: string;
}): TimerNoteEventFixture {
  return {
    namespace: "timer",
    payload: {
      notePageId: input.notePageId,
      pageId: input.pageId,
      segmentId: input.segmentId,
    },
    sourcePluginId: input.sourcePluginId ?? "timer",
    type: input.type ?? "time_segment_note_added",
  };
}

function withNonEnumerableSegmentField(
  segment: TimerSegmentFixture,
  field: keyof TimerSegmentFixture,
): Record<string, unknown> {
  const clone: Record<string, unknown> = { ...segment };

  makeNonEnumerableOwnValue(clone, field);

  return clone;
}

function createAccessorTimerSegment(pageTitle: string): Record<string, unknown> {
  const segment = createTimerSegment({
    durationSeconds: 300,
    pageId: "page-accessor",
    pageTitle,
    segmentId: "segment-accessor",
  }) as Record<string, unknown>;

  Object.defineProperty(segment, "pageTitle", {
    enumerable: true,
    get() {
      return pageTitle;
    },
  });

  return segment;
}

function createPrototypeCarriedTimerSegment(
  pageTitle: string,
): Record<string, unknown> {
  const segment = Object.create({
    provenance: {
      eventPageId: "page-prototype",
      namespace: "timer",
      sourcePluginId: "timer",
      type: "time_segment_created",
    },
  }) as Record<string, unknown>;

  Object.assign(
    segment,
    createTimerSegment({
      durationSeconds: 300,
      pageId: "page-prototype",
      pageTitle,
      segmentId: "segment-prototype",
    }),
  );
  delete segment.provenance;

  return segment;
}

function createCategorySeries(input: {
  categories: readonly ChartCategoryItem[];
  title: string;
  unit: ChartCategorySeries["unit"];
}): ChartCategorySeries {
  return {
    categories: input.categories,
    kind: "chart.category-series",
    title: input.title,
    unit: input.unit,
  };
}

function createTimeSeries(input: {
  points: readonly ChartTimePoint[];
  title: string;
  unit: ChartTimeSeries["unit"];
}): ChartTimeSeries {
  return {
    kind: "chart.time-series",
    points: input.points,
    title: input.title,
    unit: input.unit,
  };
}

function createComparisonSeries(input: {
  comparisons: readonly ChartComparisonItem[];
  title: string;
}): ChartComparisonSeries {
  return {
    comparisons: input.comparisons,
    kind: "chart.comparison-series",
    title: input.title,
    unit: "seconds",
  };
}

function renderChartView(
  runtime: AppRuntime,
  viewId: ChartViewId,
  props: ChartViewProps,
): ReturnType<typeof render> {
  const View = getChartViewComponent(runtime, viewId);

  return render(createElement(View, props));
}

function getChartViewComponent(
  runtime: AppRuntime,
  viewId: ChartViewId,
): ComponentType<ChartViewProps> {
  const view = runtime.registries.views
    .list({ pluginId: chartPluginId })
    .find((registeredView) => registeredView.id === viewId);

  if (view === undefined) {
    throw new Error(`Chart Plugin must register ${viewId}.`);
  }

  return (view as ViewDefinition<ChartViewProps>).component;
}

function createAccessorRunAggregationPayload(
  payload: StatsRunAggregationPayload,
): Record<string, unknown> {
  const accessorPayload: Record<string, unknown> = {};

  Object.defineProperty(accessorPayload, "aggregationId", {
    enumerable: true,
    get() {
      return payload.aggregationId;
    },
  });
  Object.defineProperty(accessorPayload, "input", {
    enumerable: true,
    value: payload.input,
  });

  return accessorPayload;
}

function createSymbolExtraPayload(
  base: Record<string, unknown>,
): Record<string, unknown> {
  const payload = { ...base } as Record<PropertyKey, unknown>;

  Object.defineProperty(payload, Symbol("sourcePluginId"), {
    enumerable: true,
    value: statsPluginId,
  });

  return payload as Record<string, unknown>;
}

function createNonEnumerableExtraPayload(
  base: Record<string, unknown>,
): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...base };

  Object.defineProperty(payload, "sourcePluginId", {
    enumerable: false,
    value: statsPluginId,
  });

  return payload;
}

function createNonEnumerableFieldPayload(
  base: Record<string, unknown>,
  field: string,
): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...base };

  makeNonEnumerableOwnValue(payload, field);

  return payload;
}

function createPrototypeCarriedPayload(
  base: Record<string, unknown>,
): Record<string, unknown> {
  const payload = Object.create({
    sourcePluginId: statsPluginId,
  }) as Record<string, unknown>;

  Object.assign(payload, base);

  return payload;
}

function snapshotRuntimeState(runtime: AppRuntime): RuntimeSnapshot {
  return {
    events: runtime.events.list(),
    filters: runtime.filters.list(),
    metadata: runtime.metadata.list(),
    pages: runtime.pages.list({ includeArchived: true }),
  };
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

function makeNonEnumerableOwnValue(
  record: Record<PropertyKey, unknown>,
  key: PropertyKey,
): void {
  Object.defineProperty(record, key, {
    configurable: true,
    enumerable: false,
    value: record[key],
    writable: true,
  });
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
        throw new Error(`Unexpected Chart link href ${attribute.value}`);
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
      async exportMarkdown() {
        return undefined;
      },
      async importMarkdown() {
        return "";
      },
    },
    notifications: {
      async notify() {
        return undefined;
      },
    },
    shortcuts: {
      async register() {
        return undefined;
      },
      async unregister() {
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
