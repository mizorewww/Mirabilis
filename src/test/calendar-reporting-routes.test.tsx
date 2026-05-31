import { execFile } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import App from "../App";
import { createAppRuntime, type AppRuntime } from "../bootstrap";
import {
  createCoreStores,
  type AppEvent,
  type BlockNode,
  type CoreStores,
  type DbQuery,
  type MarkdownPage,
  type NativeBridge,
  type StructuredMarkdownDocument,
} from "../core";
import { disallowedNativeSurfaceChanges } from "./native-surface-guard";

type NativeBridgeTransactionResult<Response> =
  Response extends readonly unknown[]
    ? number extends Response["length"]
      ? Array<Response>
      : Response
    : Array<Response>;

type SourceLine = {
  blockId: string;
  text: string;
};

type CreateRuntimeOptions = {
  eventIds?: readonly string[];
  pageIds?: readonly string[];
};

type CalendarTimeSegmentRow = {
  durationSeconds: number;
  endAt: string;
  pageId: string;
  pageTitle: string;
  segmentId: string;
  source: "timer";
  startAt: string;
  provenance: {
    eventPageId: string;
    namespace: "timer";
    sourcePluginId: "timer";
    type: "time_segment_created";
  };
};

type CalendarViewProps = Record<string, unknown> & {
  commands?: {
    execute(commandId: string, input?: unknown): Promise<unknown>;
  };
  data?: {
    kind?: string;
    segments?: readonly CalendarTimeSegmentRow[];
  };
};

type ChartCategorySeries = {
  categories: readonly { label: string; value: number }[];
  kind: "chart.category-series";
  title: string;
  unit: "seconds" | "count" | "percent";
};

type ChartComparisonSeries = {
  comparisons: readonly {
    actualSeconds: number;
    deltaSeconds: number;
    errorPercent: number;
    expectedSeconds: number;
    label: string;
  }[];
  kind: "chart.comparison-series";
  title: string;
  unit: "seconds";
};

type ChartData = ChartCategorySeries | ChartComparisonSeries;

type ChartViewProps = Record<string, unknown> & {
  data?: ChartData;
  isLoading?: boolean;
};

type Deferred<Value> = {
  promise: Promise<Value>;
  reject(reason: unknown): void;
  resolve(value: Value): void;
};

type ExecuteSpy = {
  mock: {
    calls: unknown[][];
  };
};

type SourceFile = {
  filePath: string;
  source: string;
};

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const execFileAsync = promisify(execFile);
const fixedNow = new Date("2026-05-20T12:00:00.000Z");
const homeTitle = "Home";
const calendarPluginId = "calendar";
const calendarDayViewId = "calendar.day";
const calendarWeekViewId = "calendar.week";
const calendarOpenSegmentCommandId = "calendar.open-time-segment";
const timerPluginId = "timer";
const statsPluginId = "stats";
const chartPluginId = "chart";
const statsRunAggregationCommandId = "stats.run-aggregation";
const defaultReportsAggregationId = "stats.sum-time-by-page";
const tagReportsAggregationId = "stats.sum-time-by-tag";
const estimateReportsAggregationId = "stats.estimate-vs-actual";
const chartBarViewId = "chart.bar";
const chartBarViewType = "chart.bar";
const appShellEntrypoints = [
  "src/App.tsx",
  "src/main.tsx",
  "src/shell",
  "src/providers",
] as const;
const task042SurfaceEntrypoints = [
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
  "CHANGELOG.md",
] as const;
const sourceExtensions = new Set([".ts", ".tsx"]);

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(fixedNow);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("TASK-042 Calendar route", () => {
  it("activates the Calendar sidebar route and mounts calendar.day through ViewHost", async () => {
    const runtime = await createRuntime({
      eventIds: ["event-focus"],
      pageIds: ["home-page", "focus-page"],
    });
    const capturedProps: CalendarViewProps[] = [];
    const user = userEvent.setup({
      advanceTimers: (delay) => vi.advanceTimersByTime(delay),
    });

    createRuntimePage(runtime, homeTitle, []);
    const focusPage = createRuntimePage(runtime, "Focus Page", [
      {
        blockId: "focus-private-body",
        text: "PRIVATE_BODY_TOKEN",
      },
    ]);

    appendTimerSegment(runtime, focusPage, {
      durationSeconds: 1_800,
      endAt: "2026-05-20T09:30:00.000Z",
      segmentId: "segment-focus",
      startAt: "2026-05-20T09:00:00.000Z",
    });
    replaceCalendarView(runtime, calendarDayViewId, "calendar.day", capturedProps);
    renderReadyApp(runtime);

    const calendarRoute = await findWorkspaceRouteButton(/^Calendar\b/i);

    await user.click(calendarRoute);

    expect(calendarRoute).toHaveAttribute("aria-current", "page");
    expect(
      await screen.findByRole("main", { name: /calendar/i }),
    ).toBeVisible();

    const day = await screen.findByRole("region", { name: /^Calendar day$/i });

    expect(day).toBeVisible();
    expect(within(day).getByText("Focus Page")).toBeVisible();
    expect(capturedProps).not.toHaveLength(0);
    expect(capturedProps.at(-1)?.data).toMatchObject({
      kind: "calendar.time-segments",
      segments: [
        expect.objectContaining({
          pageId: focusPage.id,
          pageTitle: focusPage.title,
          segmentId: "segment-focus",
        }),
      ],
    });
    expectNoRouteLeak(["PRIVATE_BODY_TOKEN", "event-focus"]);
  });

  it("switches Calendar between day and week views with accessible controls", async () => {
    const runtime = await createRuntime({
      eventIds: ["event-week"],
      pageIds: ["home-page", "week-page"],
    });
    const capturedDayProps: CalendarViewProps[] = [];
    const capturedWeekProps: CalendarViewProps[] = [];
    const user = userEvent.setup({
      advanceTimers: (delay) => vi.advanceTimersByTime(delay),
    });

    createRuntimePage(runtime, homeTitle, []);
    const weekPage = createRuntimePage(runtime, "Week Carryover", []);

    appendTimerSegment(runtime, weekPage, {
      durationSeconds: 1_200,
      endAt: "2026-05-20T00:10:00.000Z",
      segmentId: "segment-week-carryover",
      startAt: "2026-05-19T23:50:00.000Z",
    });
    replaceCalendarView(
      runtime,
      calendarDayViewId,
      "calendar.day",
      capturedDayProps,
    );
    replaceCalendarView(
      runtime,
      calendarWeekViewId,
      "calendar.week",
      capturedWeekProps,
    );
    renderReadyApp(runtime);

    await user.click(await findWorkspaceRouteButton(/^Calendar\b/i));

    expect(
      await screen.findByRole("region", { name: /^Calendar day$/i }),
    ).toBeVisible();

    const weekControl = await screen.findByRole("button", { name: /^Week$/i });

    await user.click(weekControl);

    const week = await screen.findByRole("region", {
      name: /^Calendar week$/i,
    });

    expect(week).toBeVisible();
    expect(within(week).getByText("Week Carryover")).toBeVisible();
    expect(capturedDayProps).not.toHaveLength(0);
    expect(capturedWeekProps).not.toHaveLength(0);
    expect(capturedWeekProps.at(-1)?.data).toMatchObject({
      kind: "calendar.time-segments",
      segments: [
        expect.objectContaining({ segmentId: "segment-week-carryover" }),
      ],
    });
  });

  it("opens segment detail through a narrow Calendar command bridge with an exact payload", async () => {
    const runtime = await createRuntime({
      eventIds: ["event-detail"],
      pageIds: ["home-page", "detail-page"],
    });
    const user = userEvent.setup({
      advanceTimers: (delay) => vi.advanceTimersByTime(delay),
    });
    const execute = vi.spyOn(runtime.commands, "execute");

    createRuntimePage(runtime, homeTitle, []);
    const detailPage = createRuntimePage(runtime, "Detail Segment Page", []);

    appendTimerSegment(runtime, detailPage, {
      durationSeconds: 1_800,
      endAt: "2026-05-20T09:30:00.000Z",
      segmentId: "segment-detail",
      startAt: "2026-05-20T09:00:00.000Z",
    });
    renderReadyApp(runtime);

    await user.click(await findWorkspaceRouteButton(/^Calendar\b/i));

    const day = await screen.findByRole("region", { name: /^Calendar day$/i });
    const segment = await within(day).findByRole("button", {
      name: /09:00.*09:30.*Detail Segment Page/i,
    });

    await user.click(segment);

    expect(execute).toHaveBeenCalledWith(calendarOpenSegmentCommandId, {
      pageId: detailPage.id,
      segmentId: "segment-detail",
    });
    expect(commandWasExecuted(execute, "timer.stop")).toBe(false);

    const detail = await screen.findByRole("region", {
      name: /segment detail/i,
    });

    expect(detail).toBeVisible();
    expect(detail).toHaveTextContent("Detail Segment Page");
  });

  it("rejects generic raw command execution from hosted Calendar views", async () => {
    const runtime = await createRuntime({
      eventIds: ["event-bridge"],
      pageIds: ["home-page", "bridge-page"],
    });
    const user = userEvent.setup({
      advanceTimers: (delay) => vi.advanceTimersByTime(delay),
    });
    const execute = vi.spyOn(runtime.commands, "execute");

    createRuntimePage(runtime, homeTitle, []);
    const bridgePage = createRuntimePage(runtime, "Bridge Page", []);

    appendTimerSegment(runtime, bridgePage, {
      durationSeconds: 900,
      endAt: "2026-05-20T10:15:00.000Z",
      segmentId: "segment-bridge",
      startAt: "2026-05-20T10:00:00.000Z",
    });
    replaceCalendarViewWithCommandProbe(runtime);
    renderReadyApp(runtime);

    await user.click(await findWorkspaceRouteButton(/^Calendar\b/i));

    const day = await screen.findByRole("region", { name: /^Calendar day$/i });

    await user.click(
      within(day).getByRole("button", {
        name: /^Open exact Calendar segment$/i,
      }),
    );

    expect(execute).toHaveBeenCalledWith(calendarOpenSegmentCommandId, {
      pageId: bridgePage.id,
      segmentId: "segment-bridge",
    });

    await user.click(
      within(day).getByRole("button", {
        name: /^Try raw command facade$/i,
      }),
    );

    expect(
      await within(day).findByRole("status", { name: /calendar bridge/i }),
    ).toHaveTextContent(/rejected/i);
    expect(commandWasExecuted(execute, "timer.stop")).toBe(false);
  });

  it("shows empty, partial-data, missing-view, and missing-command Calendar states without leaking raw data", async () => {
    await expectCalendarState({
      createRuntimeOptions: { pageIds: ["home-page"] },
      expectedText: /no time segments|empty/i,
      label: "empty calendar data",
    });
    await expectCalendarState({
      createRuntimeOptions: {
        eventIds: createIds("event-overflow", 1_002),
        pageIds: ["home-page", "overflow-page"],
      },
      expectedText: /partial|1000|1,000/i,
      label: "partial calendar data",
      seed(runtime) {
        createRuntimePage(runtime, homeTitle, []);
        const page = createRuntimePage(runtime, "Overflow Page", [
          { blockId: "overflow-secret", text: "PRIVATE_BODY_TOKEN" },
        ]);

        for (let index = 0; index < 1_002; index += 1) {
          appendTimerSegment(runtime, page, {
            durationSeconds: 60,
            endAt: minuteInstant(index + 1),
            segmentId: `segment-overflow-${String(index).padStart(4, "0")}`,
            startAt: minuteInstant(index),
          });
        }
      },
    });
    await expectCalendarState({
      createRuntimeOptions: { pageIds: ["home-page"] },
      expectedText: /unavailable|could not load|missing/i,
      label: "missing Calendar view",
      mutateRuntime(runtime) {
        runtime.registries.views.unregister(calendarDayViewId);
      },
    });
    await expectCalendarState({
      createRuntimeOptions: { pageIds: ["home-page"] },
      expectedText: /unavailable|could not load|missing/i,
      label: "missing Calendar command",
      mutateRuntime(runtime) {
        runtime.commands.unregister(calendarOpenSegmentCommandId);
      },
    });
  });
});

describe("TASK-042 Reports route", () => {
  it("activates Reports, defaults to stats.sum-time-by-page, and renders returned Chart DTO through ViewHost", async () => {
    const runtime = await createRuntime({
      eventIds: ["event-report"],
      pageIds: ["home-page", "report-page"],
    });
    const capturedChartProps: ChartViewProps[] = [];
    const user = userEvent.setup({
      advanceTimers: (delay) => vi.advanceTimersByTime(delay),
    });
    const statsHandler = vi.fn(async (payload: unknown) =>
      createCategorySeries("Reported time by page", [
        { label: "Report Page", value: 1_800 },
      ]),
    );
    const execute = vi.spyOn(runtime.commands, "execute");

    createRuntimePage(runtime, homeTitle, []);
    const reportPage = createRuntimePage(runtime, "Report Page", [
      { blockId: "report-private", text: "PRIVATE_BODY_TOKEN" },
    ]);

    appendTimerSegment(runtime, reportPage, {
      durationSeconds: 1_800,
      endAt: "2026-05-20T09:30:00.000Z",
      segmentId: "segment-report",
      startAt: "2026-05-20T09:00:00.000Z",
    });
    replaceStatsCommand(runtime, statsHandler);
    replaceChartBarView(runtime, capturedChartProps);
    renderReadyApp(runtime);

    const reportsRoute = await findWorkspaceRouteButton(/^Reports\b/i);

    await user.click(reportsRoute);

    expect(reportsRoute).toHaveAttribute("aria-current", "page");
    expect(screen.queryByText(/^Stats projection placeholder$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Chart view placeholder$/i)).not.toBeInTheDocument();

    const chart = await screen.findByRole("region", { name: /^Bar chart$/i });

    expect(chart).toHaveTextContent("Reported time by page");
    expect(capturedChartProps.at(-1)?.data).toStrictEqual(
      createCategorySeries("Reported time by page", [
        { label: "Report Page", value: 1_800 },
      ]),
    );
    expect(statsHandler).toHaveBeenCalledWith({
      aggregationId: defaultReportsAggregationId,
      input: {
        kind: "stats.time-by-page-input",
        segments: [
          expect.objectContaining({
            pageId: reportPage.id,
            pageTitle: reportPage.title,
            segmentId: "segment-report",
          }),
        ],
      },
    });
    expect(execute).toHaveBeenCalledWith(statsRunAggregationCommandId, {
      aggregationId: defaultReportsAggregationId,
      input: expect.objectContaining({
        kind: "stats.time-by-page-input",
      }),
    });
    expectNoRouteLeak(["PRIVATE_BODY_TOKEN", "event-report"]);
  });

  it("switches aggregations through an accessible control and ignores stale async results", async () => {
    const runtime = await createRuntime({
      eventIds: ["event-stale"],
      pageIds: ["home-page", "stale-page"],
    });
    const capturedChartProps: ChartViewProps[] = [];
    const defaultDeferred = createDeferred<ChartData>();
    const tagDeferred = createDeferred<ChartData>();
    const user = userEvent.setup({
      advanceTimers: (delay) => vi.advanceTimersByTime(delay),
    });

    createRuntimePage(runtime, homeTitle, []);
    const stalePage = createRuntimePage(runtime, "Stale Page", []);

    appendTimerSegment(runtime, stalePage, {
      durationSeconds: 900,
      endAt: "2026-05-20T13:15:00.000Z",
      segmentId: "segment-stale",
      startAt: "2026-05-20T13:00:00.000Z",
    });
    replaceStatsCommand(runtime, (payload) => {
      const aggregationId = readAggregationId(payload);

      if (aggregationId === tagReportsAggregationId) {
        return tagDeferred.promise;
      }

      return defaultDeferred.promise;
    });
    replaceChartBarView(runtime, capturedChartProps);
    renderReadyApp(runtime);

    await user.click(await findWorkspaceRouteButton(/^Reports\b/i));

    expect(
      await screen.findByRole("status", { name: /reports loading/i }),
    ).toBeVisible();

    await user.click(
      await screen.findByRole("button", { name: /sum time by tag/i }),
    );

    defaultDeferred.resolve(
      createCategorySeries("Stale time by page result", [
        { label: "Stale", value: 1 },
      ]),
    );

    await waitFor(() =>
      expect(screen.queryByText("Stale time by page result")).not.toBeInTheDocument(),
    );

    tagDeferred.resolve(
      createCategorySeries("Fresh time by tag result", [
        { label: "deep-work", value: 900 },
      ]),
    );

    expect(await screen.findByText("Fresh time by tag result")).toBeVisible();
    expect(capturedChartProps.at(-1)?.data).toMatchObject({
      kind: "chart.category-series",
      title: "Fresh time by tag result",
    });
  });

  it("shows loading, redacted errors, and task-estimate partial/unavailable states", async () => {
    const runtime = await createRuntime({
      eventIds: ["event-error"],
      pageIds: ["home-page", "error-page"],
    });
    const deferred = createDeferred<ChartData>();
    const user = userEvent.setup({
      advanceTimers: (delay) => vi.advanceTimersByTime(delay),
    });

    createRuntimePage(runtime, homeTitle, []);
    const errorPage = createRuntimePage(runtime, "Error Page", [
      {
        blockId: "error-private",
        text: "PRIVATE_BODY_TOKEN estimate 2h",
      },
    ]);

    appendTimerSegment(runtime, errorPage, {
      durationSeconds: 1_200,
      endAt: "2026-05-20T14:20:00.000Z",
      segmentId: "segment-error",
      startAt: "2026-05-20T14:00:00.000Z",
    });
    replaceStatsCommand(runtime, () => deferred.promise);
    renderReadyApp(runtime);

    await user.click(await findWorkspaceRouteButton(/^Reports\b/i));

    expect(
      await screen.findByRole("status", { name: /reports loading/i }),
    ).toHaveTextContent(/loading|running/i);

    deferred.reject(createSensitiveReportsError());

    const alert = await screen.findByRole("alert");

    expect(alert).toHaveTextContent(/reports|aggregation|unavailable|could not/i);
    expectNoRouteLeak([
      "PRIVATE_BODY_TOKEN",
      "stats.run-aggregation",
      "SELECT *",
      "core_pages",
      "/home/aac6fef",
      "Bearer",
      "NativeBridge",
      "PluginHost",
    ]);

    replaceStatsCommand(runtime, async (payload) => {
      expect(readAggregationId(payload)).toBe(estimateReportsAggregationId);

      return createComparisonSeries("Estimate comparison", []);
    });

    await user.click(
      await screen.findByRole("button", { name: /estimate vs actual/i }),
    );

    expect(
      await screen.findByRole("status", { name: /reports data/i }),
    ).toHaveTextContent(/partial|unavailable|estimate/i);
    expectNoRouteLeak(["PRIVATE_BODY_TOKEN", "estimate 2h"]);
  });

  it("keeps stale Reports results from rendering after route switches and supports keyboard route activation", async () => {
    const runtime = await createRuntime({
      eventIds: ["event-keyboard"],
      pageIds: ["home-page", "keyboard-page"],
    });
    const deferred = createDeferred<ChartData>();
    const user = userEvent.setup({
      advanceTimers: (delay) => vi.advanceTimersByTime(delay),
    });

    createRuntimePage(runtime, homeTitle, []);
    const keyboardPage = createRuntimePage(runtime, "Keyboard Page", []);

    appendTimerSegment(runtime, keyboardPage, {
      durationSeconds: 600,
      endAt: "2026-05-20T15:10:00.000Z",
      segmentId: "segment-keyboard",
      startAt: "2026-05-20T15:00:00.000Z",
    });
    replaceStatsCommand(runtime, () => deferred.promise);
    renderReadyApp(runtime);

    const reportsRoute = await findWorkspaceRouteButton(/^Reports\b/i);

    await tabToElement(user, reportsRoute);
    await user.keyboard("{Enter}");

    expect(reportsRoute).toHaveAttribute("aria-current", "page");
    expect(
      await screen.findByRole("status", { name: /reports loading/i }),
    ).toBeVisible();

    await user.click(await findWorkspaceRouteButton(/^Calendar\b/i));

    deferred.resolve(
      createCategorySeries("Stale report after Calendar switch", [
        { label: "Keyboard Page", value: 600 },
      ]),
    );

    await waitFor(() => {
      expect(
        screen.queryByText("Stale report after Calendar switch"),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("main", { name: /calendar/i }),
      ).toBeVisible();
    });
  });

  it("shows unavailable Reports states for missing Stats command, missing Chart view, or inactive owners", async () => {
    await expectReportsUnavailableState({
      label: "missing Stats command",
      mutateRuntime(runtime) {
        runtime.commands.unregister(statsRunAggregationCommandId);
      },
    });
    await expectReportsUnavailableState({
      label: "missing Chart view",
      mutateRuntime(runtime) {
        runtime.registries.views.unregister(chartBarViewId);
      },
    });
    await expectReportsUnavailableState({
      label: "inactive Stats plugin",
      async mutateRuntime(runtime) {
        await deactivatePlugin(runtime, statsPluginId);
      },
    });
  });
});

describe("TASK-042 static route boundaries", () => {
  it("does not change package, native, IPC, schema, capability, permission, or release surfaces", async () => {
    const changedSurfaceFiles = await listTask042SurfaceChangesFromMaster();

    expect(
      await disallowedNativeSurfaceChanges(changedSurfaceFiles),
    ).toStrictEqual([]);
  });

  it("keeps Calendar and Reports shell code behind public registries without private plugin imports or raw owner handles", async () => {
    const violations: string[] = [];
    const files = await readTask042ProductionSourceFilesForSurfaceScan();

    for (const sourceFile of files) {
      for (const moduleSpecifier of collectStaticModuleSpecifiers(
        sourceFile.source,
      )) {
        const resolvedModule = resolveModuleSpecifier(
          path.join(repoRoot, sourceFile.filePath),
          moduleSpecifier,
        );
        const forbiddenImport = findForbiddenTask042AppShellImport(
          resolvedModule,
        );

        if (forbiddenImport !== undefined) {
          violations.push(
            `${sourceFile.filePath} -> ${moduleSpecifier}: ${forbiddenImport}`,
          );
        }
      }

      violations.push(...findForbiddenTask042SurfacePatterns(sourceFile));
    }

    expect(violations).toStrictEqual([]);
  });

  it("does not add charting libraries, MUI X, stale React/MUI/testing APIs, execution sinks, workers, FTS, or broad query facades", async () => {
    const violations: string[] = [];
    const packageJson = JSON.parse(
      await readFile(path.join(repoRoot, "package.json"), "utf8"),
    ) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const dependencyNames = [
      ...Object.keys(packageJson.dependencies ?? {}),
      ...Object.keys(packageJson.devDependencies ?? {}),
    ];

    violations.push(
      ...dependencyNames
        .filter((dependency) =>
          /^(?:@mui\/x-|@visx\/|d3|recharts|chart\.js|echarts|highcharts|victory|nivo)$/iu.test(
            dependency,
          ),
        )
        .map((dependency) => `package.json: unreviewed chart dependency ${dependency}`),
    );

    for (const sourceFile of await readTask042FilesForApiSurfaceScan()) {
      violations.push(...findForbiddenTestingApiPatterns(sourceFile));

      if (isProductionSourcePath(sourceFile.filePath)) {
        violations.push(...findForbiddenMuiImportPatterns(sourceFile));
        violations.push(...findRemovedMuiPropPatterns(sourceFile));
        violations.push(...findForbiddenExecutionSinkPatterns(sourceFile));
        violations.push(...findForbiddenWorkerIndexPatterns(sourceFile));
        violations.push(...findForbiddenBroadFacadePatterns(sourceFile));
      }
    }

    expect(violations).toStrictEqual([]);
  });
});

function renderReadyApp(runtime: AppRuntime): void {
  render(<App initializeRuntime={vi.fn(async () => runtime)} />);
}

async function createRuntime(
  options: CreateRuntimeOptions = {},
): Promise<AppRuntime> {
  const createPageId =
    options.pageIds === undefined
      ? undefined
      : createSequenceFactory(options.pageIds);
  const createEventId =
    options.eventIds === undefined
      ? undefined
      : createSequenceFactory(options.eventIds);

  return createAppRuntime({
    createNativeBridge: () => createNoopNativeBridge(),
    ...(createPageId === undefined && createEventId === undefined
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

function createRuntimePage(
  runtime: AppRuntime,
  title: string,
  lines: readonly SourceLine[],
): MarkdownPage {
  return runtime.pages.create({
    body: structuredDocument(lines),
    title,
  });
}

function structuredDocument(
  lines: readonly SourceLine[],
): StructuredMarkdownDocument {
  return {
    content: lines.map(
      (line): BlockNode => ({
        blockId: line.blockId,
        text: line.text,
        type: "markdown.line",
      }),
    ),
    type: "doc",
  };
}

function appendTimerSegment(
  runtime: AppRuntime,
  page: MarkdownPage,
  input: {
    durationSeconds: number;
    endAt: string;
    segmentId: string;
    startAt: string;
  },
): AppEvent {
  return runtime.events.append({
    namespace: "timer",
    pageId: page.id,
    payload: {
      durationSeconds: input.durationSeconds,
      endAt: input.endAt,
      pageId: page.id,
      segmentId: input.segmentId,
      source: "timer",
      startAt: input.startAt,
    },
    sourcePluginId: "timer",
    type: "time_segment_created",
  });
}

function replaceCalendarView(
  runtime: AppRuntime,
  viewId: typeof calendarDayViewId | typeof calendarWeekViewId,
  viewType: "calendar.day" | "calendar.week",
  capturedProps: CalendarViewProps[],
): void {
  runtime.registries.views.unregister(viewId);
  runtime.registries.views.register({
    accepts: { kind: "calendar.time-segments" },
    component: (props: CalendarViewProps) => {
      capturedProps.push(props);
      const segments = props.data?.segments ?? [];

      return (
        <section
          aria-label={viewType === "calendar.day" ? "Calendar day" : "Calendar week"}
          role="region"
        >
          <p aria-label="Calendar data" role="status">
            {segments.length === 0
              ? "No time segments"
              : `Calendar received ${segments.length} segment(s)`}
          </p>
          <ul>
            {segments.map((segment) => (
              <li key={segment.segmentId}>{segment.pageTitle}</li>
            ))}
          </ul>
        </section>
      );
    },
    id: viewId,
    pluginId: calendarPluginId,
    title: viewType === "calendar.day" ? "Calendar day" : "Calendar week",
    type: viewType,
  });
}

function replaceCalendarViewWithCommandProbe(runtime: AppRuntime): void {
  runtime.registries.views.unregister(calendarDayViewId);
  runtime.registries.views.register({
    accepts: { kind: "calendar.time-segments" },
    component: function CalendarCommandProbe(props: CalendarViewProps) {
      const [status, setStatus] = useBridgeProbeStatus();
      const firstSegment = props.data?.segments?.[0];

      return (
        <section aria-label="Calendar day" role="region">
          <button
            onClick={() => {
              void props.commands
                ?.execute(calendarOpenSegmentCommandId, {
                  pageId: firstSegment?.pageId,
                  segmentId: firstSegment?.segmentId,
                })
                .then(
                  () => setStatus("exact accepted"),
                  () => setStatus("exact rejected"),
                );
            }}
            type="button"
          >
            Open exact Calendar segment
          </button>
          <button
            onClick={() => {
              void props.commands?.execute("timer.stop", {}).then(
                () => setStatus("raw accepted"),
                () => setStatus("raw rejected"),
              );
            }}
            type="button"
          >
            Try raw command facade
          </button>
          <p aria-label="Calendar bridge" role="status">
            {status}
          </p>
        </section>
      );
    },
    id: calendarDayViewId,
    pluginId: calendarPluginId,
    title: "Calendar day",
    type: "calendar.day",
  });
}

function useBridgeProbeStatus(): [string, (status: string) => void] {
  return useState("idle");
}

function replaceStatsCommand(
  runtime: AppRuntime,
  handler: (payload: unknown) => unknown | Promise<unknown>,
  pluginId = statsPluginId,
): void {
  try {
    runtime.commands.unregister(statsRunAggregationCommandId);
  } catch {
    // Replacement tests do not depend on the original handler remaining present.
  }

  runtime.commands.register({
    handler,
    id: statsRunAggregationCommandId,
    pluginId,
    title: "Run aggregation",
  });
}

function replaceChartBarView(
  runtime: AppRuntime,
  capturedProps: ChartViewProps[],
): void {
  runtime.registries.views.unregister(chartBarViewId);
  runtime.registries.views.register({
    accepts: { kinds: ["chart.category-series", "chart.comparison-series"] },
    component: (props: ChartViewProps) => {
      capturedProps.push(props);

      return (
        <section aria-label="Bar chart" role="region">
          <h3>{props.data?.title ?? "Missing chart data"}</h3>
          <pre>{JSON.stringify(props.data)}</pre>
        </section>
      );
    },
    id: chartBarViewId,
    pluginId: chartPluginId,
    title: "Bar chart",
    type: chartBarViewType,
  });
}

async function findWorkspaceRouteButton(name: RegExp): Promise<HTMLElement> {
  const navigation = await screen.findByRole("navigation", {
    name: /^Workspace$/i,
  });
  const workspaceRoutes = within(navigation).getByRole("list", {
    name: /^Workspace routes$/i,
  });

  return within(workspaceRoutes).findByRole("button", { name });
}

async function expectCalendarState({
  createRuntimeOptions,
  expectedText,
  label,
  mutateRuntime,
  seed,
}: {
  createRuntimeOptions: CreateRuntimeOptions;
  expectedText: RegExp;
  label: string;
  mutateRuntime?(runtime: AppRuntime): void | Promise<void>;
  seed?(runtime: AppRuntime): void | Promise<void>;
}): Promise<void> {
  const runtime = await createRuntime(createRuntimeOptions);
  const user = userEvent.setup({
    advanceTimers: (delay) => vi.advanceTimersByTime(delay),
  });

  if (seed === undefined) {
    createRuntimePage(runtime, homeTitle, []);
  } else {
    await seed(runtime);
  }

  await mutateRuntime?.(runtime);

  const { unmount } = render(<App initializeRuntime={vi.fn(async () => runtime)} />);

  await user.click(await findWorkspaceRouteButton(/^Calendar\b/i));

  const state = await findRouteState(expectedText);

  expect(state, label).toBeVisible();
  expect(state).toHaveTextContent(expectedText);
  expectNoRouteLeak(["PRIVATE_BODY_TOKEN", "SELECT *", "/home/aac6fef"]);
  unmount();
}

async function expectReportsUnavailableState({
  label,
  mutateRuntime,
}: {
  label: string;
  mutateRuntime(runtime: AppRuntime): void | Promise<void>;
}): Promise<void> {
  const runtime = await createRuntime({
    eventIds: [`event-${label.replace(/\s+/gu, "-")}`],
    pageIds: ["home-page", `${label.replace(/\s+/gu, "-")}-page`],
  });
  const user = userEvent.setup({
    advanceTimers: (delay) => vi.advanceTimersByTime(delay),
  });

  createRuntimePage(runtime, homeTitle, []);
  const page = createRuntimePage(runtime, `${label} page`, [
    { blockId: "private", text: "PRIVATE_BODY_TOKEN" },
  ]);

  appendTimerSegment(runtime, page, {
    durationSeconds: 300,
    endAt: "2026-05-20T16:05:00.000Z",
    segmentId: `segment-${label.replace(/\s+/gu, "-")}`,
    startAt: "2026-05-20T16:00:00.000Z",
  });
  await mutateRuntime(runtime);
  renderReadyApp(runtime);

  await user.click(await findWorkspaceRouteButton(/^Reports\b/i));

  const state = await findRouteState(/unavailable|could not load|missing/i);

  expect(state, label).toBeVisible();
  expectNoRouteLeak(["PRIVATE_BODY_TOKEN", "SELECT *", "/home/aac6fef"]);
}

async function findRouteState(expectedText: RegExp): Promise<HTMLElement> {
  let state: HTMLElement | null = null;

  await waitFor(() => {
    const candidates = [
      ...screen.queryAllByRole("alert"),
      ...screen.queryAllByRole("status"),
      ...screen.queryAllByRole("region"),
    ];

    state =
      candidates.find((candidate) =>
        expectedText.test(candidate.textContent ?? ""),
      ) ?? null;

    expect(state).not.toBeNull();
  });

  if (state === null) {
    throw new Error("Expected route state to be visible");
  }

  return state;
}

async function deactivatePlugin(
  runtime: AppRuntime,
  pluginId: string,
): Promise<void> {
  const host = runtime.pluginHost as AppRuntime["pluginHost"] & {
    deactivate?(pluginId: string): Promise<unknown>;
  };

  if (host.deactivate === undefined) {
    throw new Error("Expected test runtime PluginHost to support deactivation");
  }

  await host.deactivate(pluginId);
}

function commandWasExecuted(
  execute: ExecuteSpy,
  commandId: string,
): boolean {
  return execute.mock.calls.some((call) => call[0] === commandId);
}

function createCategorySeries(
  title: string,
  categories: ChartCategorySeries["categories"],
): ChartCategorySeries {
  return {
    categories,
    kind: "chart.category-series",
    title,
    unit: "seconds",
  };
}

function createComparisonSeries(
  title: string,
  comparisons: ChartComparisonSeries["comparisons"],
): ChartComparisonSeries {
  return {
    comparisons,
    kind: "chart.comparison-series",
    title,
    unit: "seconds",
  };
}

function readAggregationId(payload: unknown): string {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "aggregationId" in payload &&
    typeof payload.aggregationId === "string"
  ) {
    return payload.aggregationId;
  }

  return "";
}

function createDeferred<Value>(): Deferred<Value> {
  let reject!: (reason: unknown) => void;
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return {
    promise,
    reject,
    resolve,
  };
}

function createSensitiveReportsError(): Error {
  const error = new Error(
    [
      "stats.run-aggregation",
      "SELECT * FROM core_pages WHERE token='SECRET'",
      "/home/aac6fef/Mirabilis/private/report.md",
      "Bearer FAKE_SECRET_TOKEN",
      "PRIVATE_BODY_TOKEN",
      "NativeBridge PluginHost",
    ].join(" "),
  );

  error.stack = [
    "Error: stats.run-aggregation SECRET",
    "    at report (/home/aac6fef/Mirabilis/src/plugins/stats/private.ts:12:4)",
  ].join("\n");

  return error;
}

async function tabToElement(
  user: ReturnType<typeof userEvent.setup>,
  target: HTMLElement,
): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (document.activeElement === target) {
      return;
    }

    await user.tab();
  }

  throw new Error("Expected target navigation item to be reachable by Tab");
}

function minuteInstant(minuteOffset: number): string {
  return new Date(
    Date.parse("2026-05-20T00:00:00.000Z") + minuteOffset * 60_000,
  ).toISOString();
}

function createIds(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_value, index) => `${prefix}-${index}`);
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
      async exportMarkdown(_pageId: string, _path: string) {
        void _pageId;
        void _path;

        return undefined;
      },
      async importMarkdown(_path: string) {
        void _path;

        return "";
      },
    },
    notifications: {
      async notify(_input) {
        void _input;

        return undefined;
      },
    },
    shortcuts: {
      async register(_shortcut: string, _commandId: string) {
        void _shortcut;
        void _commandId;

        return undefined;
      },
      async unregister(_shortcut: string) {
        void _shortcut;

        return undefined;
      },
    },
  };
}

function expectNoRouteLeak(markers: readonly string[]): void {
  const text = document.body.textContent ?? "";

  for (const marker of markers) {
    expect(text).not.toContain(marker);
  }

  expect(text).not.toMatch(
    /SELECT\s+\*|core_pages|\/home\/aac6fef|Bearer|FAKE_SECRET|NativeBridge|PluginHost|sqlite|stack|at\s+\S+:\d+:\d+/i,
  );
}

async function listTask042SurfaceChangesFromMaster(): Promise<string[]> {
  const changedTrackedFiles = await runGitLines([
    "diff",
    "--name-only",
    "master",
    "--",
    ...task042SurfaceEntrypoints,
  ]);
  const untrackedFiles = await runGitLines([
    "ls-files",
    "--others",
    "--exclude-standard",
    "--",
    ...task042SurfaceEntrypoints,
  ]);

  return [...new Set([...changedTrackedFiles, ...untrackedFiles])].sort();
}

async function readTask042ProductionSourceFilesForSurfaceScan(): Promise<
  SourceFile[]
> {
  const [appShellSources, changedSources] = await Promise.all([
    readAppShellSourceFiles(),
    readChangedProductionSourceFilesFromMaster(),
  ]);
  const sourceByPath = new Map<string, SourceFile>();

  for (const sourceFile of [...appShellSources, ...changedSources]) {
    if (isProductionSourcePath(sourceFile.filePath)) {
      sourceByPath.set(sourceFile.filePath, sourceFile);
    }
  }

  return [...sourceByPath.values()].sort((left, right) =>
    left.filePath.localeCompare(right.filePath),
  );
}

async function readTask042FilesForApiSurfaceScan(): Promise<SourceFile[]> {
  const [productionFiles, changedTestFiles] = await Promise.all([
    readTask042ProductionSourceFilesForSurfaceScan(),
    readChangedTestSourceFilesFromMaster(),
  ]);
  const sourceByPath = new Map<string, SourceFile>();

  for (const sourceFile of [...productionFiles, ...changedTestFiles]) {
    sourceByPath.set(sourceFile.filePath, sourceFile);
  }

  return [...sourceByPath.values()].sort((left, right) =>
    left.filePath.localeCompare(right.filePath),
  );
}

async function readAppShellSourceFiles(): Promise<SourceFile[]> {
  const fileGroups = await Promise.all(
    appShellEntrypoints.map((entrypoint) =>
      readSourceFilesIfExists(path.join(repoRoot, entrypoint)),
    ),
  );

  return fileGroups.flat().sort((left, right) =>
    left.filePath.localeCompare(right.filePath),
  );
}

async function readChangedProductionSourceFilesFromMaster(): Promise<
  SourceFile[]
> {
  const changedFiles = await listChangedSourceFilesFromMaster();
  const sourceFiles = await Promise.all(
    changedFiles.filter(isProductionSourcePath).map(readSourceFileIfExists),
  );

  return sourceFiles.filter(
    (sourceFile): sourceFile is SourceFile => sourceFile !== undefined,
  );
}

async function readChangedTestSourceFilesFromMaster(): Promise<SourceFile[]> {
  const changedFiles = await listChangedSourceFilesFromMaster();
  const sourceFiles = await Promise.all(
    changedFiles
      .filter((filePath) => /^src\/test\//u.test(filePath))
      .map(readSourceFileIfExists),
  );

  return sourceFiles.filter(
    (sourceFile): sourceFile is SourceFile => sourceFile !== undefined,
  );
}

async function listChangedSourceFilesFromMaster(): Promise<string[]> {
  const changedTrackedFiles = await runGitLines([
    "diff",
    "--name-only",
    "master",
    "--",
    "src",
  ]);
  const untrackedFiles = await runGitLines([
    "ls-files",
    "--others",
    "--exclude-standard",
    "--",
    "src",
  ]);

  return [...new Set([...changedTrackedFiles, ...untrackedFiles])]
    .map((filePath) => filePath.replace(/\\/gu, "/"))
    .filter((filePath) => sourceExtensions.has(path.extname(filePath)))
    .sort();
}

async function readSourceFileIfExists(
  filePath: string,
): Promise<SourceFile | undefined> {
  const absolutePath = path.join(repoRoot, filePath);
  const entry = await statIfExists(absolutePath);

  if (entry === undefined || !entry.isFile()) {
    return undefined;
  }

  return {
    filePath,
    source: await readFile(absolutePath, "utf8"),
  };
}

async function readSourceFilesIfExists(
  absolutePath: string,
): Promise<SourceFile[]> {
  const entry = await statIfExists(absolutePath);

  if (entry === undefined) {
    return [];
  }

  if (entry.isFile()) {
    return sourceExtensions.has(path.extname(absolutePath))
      ? [
          {
            filePath: toRepoRelativePath(absolutePath),
            source: await readFile(absolutePath, "utf8"),
          },
        ]
      : [];
  }

  if (!entry.isDirectory()) {
    return [];
  }

  const childEntries = await readdir(absolutePath, { withFileTypes: true });
  const childFiles = await Promise.all(
    childEntries.map((childEntry) =>
      readSourceFilesIfExists(path.join(absolutePath, childEntry.name)),
    ),
  );

  return childFiles.flat();
}

async function statIfExists(absolutePath: string) {
  try {
    return await stat(absolutePath);
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return undefined;
    }

    throw error;
  }
}

function collectStaticModuleSpecifiers(contents: string): string[] {
  const specifiers: string[] = [];
  const importExportPattern =
    /\b(?:import|export)\s+(?:type\s+)?(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g;
  const sideEffectImportPattern = /\bimport\s*["']([^"']+)["']/g;
  const dynamicImportPattern = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;
  const commonJsRequirePattern = /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g;

  for (const match of contents.matchAll(importExportPattern)) {
    const moduleSpecifier = match[1];

    if (moduleSpecifier !== undefined) {
      specifiers.push(moduleSpecifier);
    }
  }

  for (const match of contents.matchAll(sideEffectImportPattern)) {
    const moduleSpecifier = match[1];

    if (moduleSpecifier !== undefined) {
      specifiers.push(moduleSpecifier);
    }
  }

  for (const match of contents.matchAll(dynamicImportPattern)) {
    const moduleSpecifier = match[1];

    if (moduleSpecifier !== undefined) {
      specifiers.push(moduleSpecifier);
    }
  }

  for (const match of contents.matchAll(commonJsRequirePattern)) {
    const moduleSpecifier = match[1];

    if (moduleSpecifier !== undefined) {
      specifiers.push(moduleSpecifier);
    }
  }

  return [...new Set(specifiers)].sort();
}

function resolveModuleSpecifier(
  importerPath: string,
  moduleSpecifier: string,
): string {
  if (!moduleSpecifier.startsWith(".")) {
    return moduleSpecifier.replace(/\\/gu, "/");
  }

  return path
    .relative(repoRoot, path.resolve(path.dirname(importerPath), moduleSpecifier))
    .replace(/\\/gu, "/");
}

function findForbiddenTask042AppShellImport(
  resolvedModule: string,
): string | undefined {
  const normalized = resolvedModule.toLowerCase();

  if (
    /(?:^|\/)plugins\/(?:calendar|stats|chart|timer|habit|tag|task)(?:\/(?!index(?:\.ts|\.tsx)?$)|\.ts|\.tsx$)/u.test(
      normalized,
    )
  ) {
    return "private business plugin import";
  }

  if (
    /@tauri-apps|(?:^|\/)core\/native(?:$|\/)|(?:^|\/)core\/plugin-host(?:$|\/)|(?:^|\/)core\/stores(?:$|\/)|(?:^|\/)core\/registries(?:$|\/)/u.test(
      normalized,
    )
  ) {
    return "raw native or Core owner import";
  }

  return undefined;
}

function findForbiddenTask042SurfacePatterns(sourceFile: SourceFile): string[] {
  const patterns = new Map<RegExp, string>([
    [
      /\b(?:runtime|appRuntime)\.stores\b|\bcreateCoreStores\b/u,
      "raw Core store handle",
    ],
    [/\bNativeBridge\b|\b__TAURI__\b|\b@tauri-apps\b/u, "native handle"],
    [/\bsqlite\b|\brusqlite\b|\bDbQuery\b|\braw\s*sql\b/iu, "SQLite or raw SQL surface"],
    [
      /\b(?:query|feed|dashboard|index)(?:Facade|Bridge|Registry|Store|Service)\b/u,
      "broad query/feed/index/dashboard facade",
    ],
    [
      /\bprops\s*=\s*\{\{[^}]*\b(?:runtime|stores|registries|pluginHost|nativeBridge|commands)\b/isu,
      "raw host handle passed to plugin-rendered UI",
    ],
  ]);

  return [...patterns.entries()]
    .filter(([pattern]) => pattern.test(sourceFile.source))
    .map(([, description]) => `${sourceFile.filePath}: ${description}`);
}

function findForbiddenMuiImportPatterns(sourceFile: SourceFile): string[] {
  const violations: string[] = [];

  for (const moduleSpecifier of collectStaticModuleSpecifiers(sourceFile.source)) {
    if (
      moduleSpecifier === "@mui/material" ||
      moduleSpecifier === "@mui/icons-material" ||
      moduleSpecifier.startsWith("@material-ui/")
    ) {
      violations.push(`${sourceFile.filePath}: stale or barrel MUI import`);
    }
  }

  return violations;
}

function findRemovedMuiPropPatterns(sourceFile: SourceFile): string[] {
  if (/^src\/test\//u.test(sourceFile.filePath)) {
    return [];
  }

  const patterns = new Map<RegExp, string>([
    [/<ListItem\b[^>]*\bbutton(?:\s|=|>|\{)/u, "ListItem button prop"],
    [/<[A-Z][\w.:-]*\b[^>]*\bBackdropProps\s*=/u, "BackdropProps prop"],
    [/<[A-Z][\w.:-]*\b[^>]*\bPaperProps\s*=/u, "PaperProps prop"],
    [/<[A-Z][\w.:-]*\b[^>]*\bTransitionComponent\s*=/u, "TransitionComponent prop"],
    [/<[A-Z][\w.:-]*\b[^>]*\bTransitionProps\s*=/u, "TransitionProps prop"],
    [/<[A-Z][\w.:-]*\b[^>]*\bcomponents\s*=/u, "components prop"],
    [/<[A-Z][\w.:-]*\b[^>]*\bcomponentsProps\s*=/u, "componentsProps prop"],
    [/<[A-Z][\w.:-]*\b[^>]*\bInputProps\s*=/u, "InputProps prop"],
    [/<[A-Z][\w.:-]*\b[^>]*\binputProps\s*=/u, "inputProps prop"],
  ]);

  return [...patterns.entries()]
    .filter(([pattern]) => pattern.test(sourceFile.source))
    .map(([, description]) => `${sourceFile.filePath}: ${description}`);
}

function findForbiddenTestingApiPatterns(sourceFile: SourceFile): string[] {
  const violations: string[] = [];
  const lowLevelEventName = "fire" + "Event";
  const reactDomTestUtilsSpecifier = ["react-dom", "test-utils"].join("/");

  for (const moduleSpecifier of collectStaticModuleSpecifiers(sourceFile.source)) {
    if (moduleSpecifier === reactDomTestUtilsSpecifier) {
      violations.push(`${sourceFile.filePath}: react-dom test utilities import`);
    }
  }

  const testingPatterns = new Map<RegExp, string>([
    [
      new RegExp(
        `import\\s+\\{[^}]*\\b${lowLevelEventName}\\b[^}]*\\}\\s+from\\s+["']@testing-library/react["']`,
        "u",
      ),
      "Testing Library low-level event import",
    ],
    [
      new RegExp(`\\b${lowLevelEventName}\\.`, "u"),
      "Testing Library low-level event usage",
    ],
    [/\b(?:describe|it|test)\.(?:only|skip)\s*\(/u, "focused or skipped test"],
    [/\bdelay\s*:\s*null\b/u, "user-event delay null"],
  ]);

  for (const [pattern, description] of testingPatterns) {
    if (pattern.test(sourceFile.source)) {
      violations.push(`${sourceFile.filePath}: ${description}`);
    }
  }

  return violations;
}

function findForbiddenExecutionSinkPatterns(sourceFile: SourceFile): string[] {
  const patterns = new Map<RegExp, string>([
    [/\bdangerouslySetInnerHTML\b/u, "HTML sink"],
    [/\binnerHTML\b|\bouterHTML\b|\binsertAdjacentHTML\b/u, "DOM HTML sink"],
    [/\bnew\s+Function\b|\beval\s*\(/u, "code execution sink"],
    [/\bDOMParser\b|\bparseFromString\b/u, "HTML parser sink"],
    [/\bmarkdownToHtml\b|\brenderMarkdown\b/iu, "Markdown execution sink"],
  ]);

  return [...patterns.entries()]
    .filter(([pattern]) => pattern.test(sourceFile.source))
    .map(([, description]) => `${sourceFile.filePath}: ${description}`);
}

function findForbiddenWorkerIndexPatterns(sourceFile: SourceFile): string[] {
  const patterns = new Map<RegExp, string>([
    [
      /\bnew\s+(?:Shared)?Worker\b|\b(?:Shared)?Worker\s*\(|\bworker_threads\b|\bnavigator\s*\.\s*serviceWorker\b|\bserviceWorker\s*\.\s*register\b/iu,
      "worker or service worker",
    ],
    [/\bFTS(?:3|4|5)?\b|\bfull[-\s]?text\s+search\b|\bMATCH\s+AGAINST\b/iu, "FTS surface"],
    [/\bpersistent(?:Calendar|Report|Stats)?Index\b|\bindexer\b/iu, "persistent indexer"],
  ]);

  return [...patterns.entries()]
    .filter(([pattern]) => pattern.test(sourceFile.source))
    .map(([, description]) => `${sourceFile.filePath}: ${description}`);
}

function findForbiddenBroadFacadePatterns(sourceFile: SourceFile): string[] {
  const patterns = new Map<RegExp, string>([
    [
      /\b(?:CrossPlugin|Plugin|Global)?(?:Query|Feed|Dashboard|Index)(?:Facade|Bridge|Registry|Service|Store)\b/u,
      "broad cross-plugin facade",
    ],
    [
      /\bcommands\s*:\s*\{\s*execute\s*:\s*runtime(?:Source)?\.commands\.execute\b/u,
      "raw Command Registry facade",
    ],
  ]);

  return [...patterns.entries()]
    .filter(([pattern]) => pattern.test(sourceFile.source))
    .map(([, description]) => `${sourceFile.filePath}: ${description}`);
}

function isProductionSourcePath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/gu, "/");

  return (
    normalized.startsWith("src/") &&
    sourceExtensions.has(path.extname(normalized)) &&
    !/^src\/test\//u.test(normalized) &&
    !/(?:^|\/)__tests__\//u.test(normalized) &&
    !/(?:^|\/)(?:__fixtures__|fixtures?|test-fixtures)\//u.test(normalized) &&
    !/\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(normalized)
  );
}

function toRepoRelativePath(filePath: string): string {
  return path.relative(repoRoot, filePath).replace(/\\/gu, "/");
}

async function runGitLines(args: readonly string[]): Promise<string[]> {
  const { stdout } = await execFileAsync("git", args, { cwd: repoRoot });

  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}
