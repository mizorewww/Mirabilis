import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { render, screen, within } from "@testing-library/react";
import { createElement, type ComponentType } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BUILT_IN_PLUGINS, createAppRuntime, type AppRuntime } from "../bootstrap";
import * as Core from "../core";
import {
  createCoreStores,
  type AppEvent,
  type BlockNode,
  type CoreStores,
  type DbQuery,
  type FilterDefinition,
  type FilterQuery,
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

type SourceLine = {
  blockId: string;
  text: string;
  attrs?: Record<string, unknown>;
};

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

type RelativeTodayValue = {
  kind: "relative-date";
  value: "today";
};

type MetadataOwnerReservation = {
  namespace: string;
  sourcePluginId: string;
};

type ExecuteFilterQueryInput = {
  currentDate?: string;
  metadata: readonly MetadataRecord[];
  metadataOwnerReservations?: readonly MetadataOwnerReservation[];
  pages: readonly MarkdownPage[];
  query: FilterQuery;
};

type ExecuteFilterQuery = (
  input: ExecuteFilterQueryInput,
) => MarkdownPage[];

type HabitCommandId =
  | "habit.refresh-habit"
  | "habit.check-today"
  | "habit.uncheck-today"
  | "habit.set-frequency";

type HeatmapViewProps = {
  data: HeatmapDateSeriesData;
};

type HeatmapDateSeriesData = {
  kind: "heatmap.date-series";
  rows: readonly HeatmapDateSeriesRow[];
};

type HeatmapDateSeriesRow = {
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

const habitPluginId = "habit";
const habitNamespace = "habit";
const heatmapPluginId = "heatmap";
const heatmapViewId = "heatmap.calendar";
const heatmapKind = "heatmap.date-series";
const habitCommandIds = [
  "habit.check-today",
  "habit.refresh-habit",
  "habit.set-frequency",
  "habit.uncheck-today",
] as const satisfies readonly HabitCommandId[];
const staleHabitCommandOrViewIds = [
  "habit.check_today",
  "habit.uncheck_today",
  "habit.set_frequency",
  "habit.heatmap",
] as const;
const habitsFilterId = "habit.filter.habits";
const todayHabitsFilterId = "habit.filter.today-habits";
const pageListViewType = "page.list";
const safeMiddayInstant = "2026-05-20T12:00:00.000Z";
const todayDate = "2026-05-20";
const yesterdayDate = "2026-05-19";
const tomorrowDate = "2026-05-21";
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const execFileAsync = promisify(execFile);
const relativeTodayValue = {
  kind: "relative-date",
  value: "today",
} as const satisfies RelativeTodayValue;
const habitMetadataOwnerReservations = [
  {
    namespace: habitNamespace,
    sourcePluginId: habitPluginId,
  },
] as const satisfies readonly MetadataOwnerReservation[];
const habitsFilterQuery = {
  where: [{ field: "metadata.habit.enabled", op: "eq", value: true }],
} satisfies FilterQuery;
const todayHabitsFilterQuery = {
  where: [
    { field: "metadata.habit.enabled", op: "eq", value: true },
    { field: "metadata.habit.frequency", op: "eq", value: "daily" },
  ],
  or: [
    {
      where: [
        {
          field: "metadata.habit.nextDue",
          op: "eq",
          value: relativeTodayValue,
        },
      ],
    },
    {
      where: [
        {
          field: "metadata.habit.nextDue",
          op: "lt",
          value: relativeTodayValue,
        },
      ],
    },
  ],
} satisfies FilterQuery;
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
const habitHeatmapProductionEntrypoints = [
  "src/bootstrap/built-in-plugins.ts",
  "src/plugins/habit",
  "src/plugins/heatmap",
] as const;

describe("Habit and Heatmap plugins", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("registers Habit and Heatmap as built-ins with only canonical runtime contributions", async () => {
    const runtime = await createRuntime();
    const builtInPluginIds = BUILT_IN_PLUGINS.map(
      (plugin) => plugin.manifest.id,
    );
    const habitCommandIdsForRuntime = runtime.registries.commands
      .list({ pluginId: habitPluginId })
      .map((command) => command.id)
      .sort();
    const habitFilters = runtime.filters.list({ sourcePluginId: habitPluginId });
    const habitFilterIds = habitFilters.map((filter) => filter.id).sort();
    const heatmapViews = runtime.registries.views.list({
      pluginId: heatmapPluginId,
    });
    const heatmapViewIds = heatmapViews.map((view) => view.id).sort();
    const heatmapView = heatmapViews.find((view) => view.id === heatmapViewId);

    expect.soft(builtInPluginIds).toEqual(
      expect.arrayContaining([habitPluginId, heatmapPluginId]),
    );
    expect.soft(habitCommandIdsForRuntime).toStrictEqual(
      [...habitCommandIds].sort(),
    );
    expect.soft(habitFilterIds).toStrictEqual(
      [habitsFilterId, todayHabitsFilterId].sort(),
    );
    expect.soft(getSavedHabitFilter(runtime, habitsFilterId)).toMatchObject({
      id: habitsFilterId,
      name: "Habits",
      query: habitsFilterQuery,
      sourcePluginId: habitPluginId,
      viewType: pageListViewType,
    });
    expect.soft(getSavedHabitFilter(runtime, todayHabitsFilterId)).toMatchObject({
      id: todayHabitsFilterId,
      name: "Today Habits",
      query: todayHabitsFilterQuery,
      sourcePluginId: habitPluginId,
      viewType: pageListViewType,
    });
    expect(JSON.stringify(getSavedHabitFilter(runtime, todayHabitsFilterId).query))
      .not.toMatch(/\blte\b/u);
    expect.soft(heatmapViewIds).toStrictEqual([heatmapViewId]);
    expect.soft(heatmapView).toMatchObject({
      accepts: { kind: heatmapKind },
      id: heatmapViewId,
      pluginId: heatmapPluginId,
      title: "Heatmap calendar",
      type: "heatmap",
    });

    for (const staleId of staleHabitCommandOrViewIds) {
      expect(habitCommandIdsForRuntime).not.toContain(staleId);
      expect(habitFilterIds).not.toContain(staleId);
      expect(heatmapViewIds).not.toContain(staleId);
    }
  });

  it("declares the #habit syntax and current Habit metadata fields in the manifest", () => {
    const habitPlugin = getBuiltInPlugin(habitPluginId);
    const markdownSyntax = habitPlugin.manifest.contributes?.markdownSyntax ?? [];
    const metadataFields =
      habitPlugin.manifest.contributes?.metadataFields ?? [];
    const metadataFieldIds = metadataFields.map((field) => field.id).sort();

    expect(markdownSyntax).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "habit.hashtag",
          syntax: "#habit",
        }),
      ]),
    );
    expect(metadataFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "habit.enabled",
          key: "enabled",
          namespace: habitNamespace,
          valueType: "boolean",
        }),
        expect.objectContaining({
          id: "habit.frequency",
          key: "frequency",
          namespace: habitNamespace,
          valueType: "string",
        }),
        expect.objectContaining({
          id: "habit.lastCheckedAt",
          key: "lastCheckedAt",
          namespace: habitNamespace,
          valueType: "date",
        }),
        expect.objectContaining({
          id: "habit.nextDue",
          key: "nextDue",
          namespace: habitNamespace,
          valueType: "date",
        }),
      ]),
    );
    expect(metadataFieldIds).not.toEqual(
      expect.arrayContaining([
        "habit.last_checked_at",
        "habit.streak",
        "habit.target",
      ]),
    );
  });

  it("refreshes valid #habit pages into Habit-owned metadata and ignores fenced, escaped, joined, and HTML-like false positives", async () => {
    useFakeClock(safeMiddayInstant);

    const runtime = await createRuntime({
      pageIds: [
        "habit-title-page",
        "habit-body-page",
        "habit-false-positive-page",
      ],
    });
    const titleHabit = createSourcePage(
      runtime,
      "Morning review #habit",
      [{ blockId: "title-body", text: "The title marks this page." }],
    );
    const bodyHabit = createSourcePage(runtime, "Body habit page", [
      { blockId: "intro", text: "Drink water #habit before lunch." },
    ]);
    const falsePositive = createSourcePage(runtime, "Escaped \\#habit page", [
      { blockId: "escaped", text: "Ignore escaped \\#habit in prose." },
      {
        blockId: "joined",
        text: "Ignore joined tokens such as daily#habit and URLs /docs#habit.",
      },
      { blockId: "html-like", text: "Ignore <span>#habit</span> text." },
      { blockId: "fence-open", text: "```" },
      { blockId: "fenced", text: "#habit inside code" },
      { blockId: "fence-close", text: "```" },
    ]);

    await expect(
      executeHabitCommand(runtime, "habit.refresh-habit", {
        pageId: titleHabit.id,
      }),
    ).resolves.toStrictEqual({
      enabled: true,
      frequency: "daily",
      nextDue: todayDate,
      pageId: titleHabit.id,
    });
    expectHabitMetadata(runtime, titleHabit.id, {
      enabled: true,
      frequency: "daily",
      nextDue: todayDate,
    });

    await expect(
      executeHabitCommand(runtime, "habit.refresh-habit", {
        pageId: bodyHabit.id,
      }),
    ).resolves.toStrictEqual({
      enabled: true,
      frequency: "daily",
      nextDue: todayDate,
      pageId: bodyHabit.id,
    });
    expectHabitMetadata(runtime, bodyHabit.id, {
      enabled: true,
      frequency: "daily",
      nextDue: todayDate,
    });

    await expect(
      executeHabitCommand(runtime, "habit.refresh-habit", {
        pageId: falsePositive.id,
      }),
    ).resolves.toStrictEqual({
      enabled: false,
      pageId: falsePositive.id,
    });
    expectNoHabitMetadata(runtime, falsePositive.id);
  });

  it("checks and unchecks today with Habit-owned metadata, checked/unchecked events, and no Task/Tag/source Markdown mutation", async () => {
    useFakeClock(safeMiddayInstant);

    const runtime = await createRuntime({
      eventIds: ["event-habit-checked", "event-habit-unchecked"],
      pageIds: ["habit-check-page"],
    });
    const page = createSourcePage(runtime, "Daily review #habit", [
      { blockId: "habit-line", text: "- [ ] Daily review #habit" },
    ]);
    runtime.metadata.set({
      key: "status",
      namespace: "task",
      pageId: page.id,
      sourcePluginId: "task",
      value: "todo",
      valueType: "string",
    });
    runtime.metadata.set({
      key: "tags",
      namespace: "tag",
      pageId: page.id,
      sourcePluginId: "tag",
      value: ["review"],
      valueType: "json",
    });
    const taskMetadataBefore = runtime.metadata.list({
      namespace: "task",
      pageId: page.id,
    });
    const tagMetadataBefore = runtime.metadata.list({
      namespace: "tag",
      pageId: page.id,
    });
    const sourceBodyBefore = runtime.pages.get(page.id).body;

    await expect(
      executeHabitCommand(runtime, "habit.check-today", { pageId: page.id }),
    ).resolves.toStrictEqual({
      checked: true,
      date: todayDate,
      nextDue: tomorrowDate,
      pageId: page.id,
    });
    expectHabitMetadata(runtime, page.id, {
      enabled: true,
      frequency: "daily",
      lastCheckedAt: todayDate,
      nextDue: tomorrowDate,
    });
    expectHabitEvents(runtime, [
      {
        date: todayDate,
        habitPageId: page.id,
        type: "checked",
      },
    ]);
    expect(runtime.pages.get(page.id).body).toStrictEqual(sourceBodyBefore);
    expect(runtime.metadata.list({ namespace: "task", pageId: page.id }))
      .toStrictEqual(taskMetadataBefore);
    expect(runtime.metadata.list({ namespace: "tag", pageId: page.id }))
      .toStrictEqual(tagMetadataBefore);

    await expect(
      executeHabitCommand(runtime, "habit.uncheck-today", { pageId: page.id }),
    ).resolves.toStrictEqual({
      checked: false,
      date: todayDate,
      nextDue: todayDate,
      pageId: page.id,
    });
    expect(readHabitMetadataValue(runtime, page.id, "lastCheckedAt")).not.toBe(
      todayDate,
    );
    expect(readHabitMetadataValue(runtime, page.id, "nextDue")).toBe(todayDate);
    expectHabitEvents(runtime, [
      {
        date: todayDate,
        habitPageId: page.id,
        type: "checked",
      },
      {
        date: todayDate,
        habitPageId: page.id,
        type: "unchecked",
      },
    ]);
    expect(runtime.pages.get(page.id).body).toStrictEqual(sourceBodyBefore);
    expect(runtime.metadata.list({ namespace: "task", pageId: page.id }))
      .toStrictEqual(taskMetadataBefore);
    expect(runtime.metadata.list({ namespace: "tag", pageId: page.id }))
      .toStrictEqual(tagMetadataBefore);
  });

  it("rejects missing or untrusted Habit targets even when callers forge Habit-looking metadata or events", async () => {
    useFakeClock(safeMiddayInstant);

    const runtime = await createRuntime({
      eventIds: ["event-forged-habit-check"],
      pageIds: ["forged-habit-page"],
    });
    const forgedPage = createSourcePage(runtime, "Forged metadata page", [
      { blockId: "content", text: "No trusted habit syntax here." },
    ]);
    runtime.metadata.set({
      key: "enabled",
      namespace: habitNamespace,
      pageId: forgedPage.id,
      sourcePluginId: "task",
      value: true,
      valueType: "boolean",
    });
    runtime.events.append({
      namespace: habitNamespace,
      pageId: forgedPage.id,
      payload: {
        date: todayDate,
        habitPageId: forgedPage.id,
      },
      sourcePluginId: "task",
      type: "checked",
    });
    const before = snapshotRuntimeState(runtime);

    await expect(
      executeHabitCommand(runtime, "habit.check-today", {
        pageId: "missing-page",
      }),
      "missing page",
    ).rejects.toBeInstanceOf(Error);
    expect(snapshotRuntimeState(runtime), "missing page").toStrictEqual(before);

    await expect(
      executeHabitCommand(runtime, "habit.check-today", {
        pageId: forgedPage.id,
      }),
      "forged metadata and event",
    ).rejects.toBeInstanceOf(Error);
    expect(snapshotRuntimeState(runtime), "forged metadata and event")
      .toStrictEqual(before);
  });

  it("rejects malformed Habit completion payloads without mutating stores", async () => {
    useFakeClock(safeMiddayInstant);

    const runtime = await createRuntime({
      pageIds: ["habit-payload-guard-page"],
    });
    const page = createSourcePage(runtime, "Payload guard #habit", [
      { blockId: "habit-line", text: "Payload guard #habit" },
    ]);
    await executeHabitCommand(runtime, "habit.refresh-habit", {
      pageId: page.id,
    });

    for (const commandId of [
      "habit.check-today",
      "habit.uncheck-today",
    ] as const satisfies readonly HabitCommandId[]) {
      for (const { input, label } of createInvalidHabitPagePayloads(page.id)) {
        const before = snapshotRuntimeState(runtime);

        await expect(
          executeHabitCommand(runtime, commandId, input),
          `${commandId}: ${label}`,
        ).rejects.toBeInstanceOf(Error);
        expect(snapshotRuntimeState(runtime), `${commandId}: ${label}`)
          .toStrictEqual(before);
      }
    }
  });

  it("accepts only the canonical daily frequency payload and keeps rejected frequency changes inert", async () => {
    useFakeClock(safeMiddayInstant);

    const runtime = await createRuntime({
      pageIds: ["habit-frequency-page"],
    });
    const page = createSourcePage(runtime, "Frequency page #habit", [
      { blockId: "habit-line", text: "Frequency page #habit" },
    ]);
    await executeHabitCommand(runtime, "habit.refresh-habit", {
      pageId: page.id,
    });

    await expect(
      executeHabitCommand(runtime, "habit.set-frequency", {
        frequency: "daily",
        pageId: page.id,
      }),
    ).resolves.toStrictEqual({
      frequency: "daily",
      pageId: page.id,
    });
    expect(readHabitMetadataValue(runtime, page.id, "frequency")).toBe("daily");

    for (const { input, label } of createInvalidHabitFrequencyPayloads(page.id)) {
      const before = snapshotRuntimeState(runtime);

      await expect(
        executeHabitCommand(runtime, "habit.set-frequency", input),
        label,
      ).rejects.toBeInstanceOf(Error);
      expect(snapshotRuntimeState(runtime), label).toStrictEqual(before);
    }
  });

  it("keeps duplicate same-day checks idempotent and avoids Heatmap double counts", async () => {
    useFakeClock(safeMiddayInstant);

    const runtime = await createRuntime({
      eventIds: ["event-first-check", "event-should-not-be-used"],
      pageIds: ["habit-idempotent-page"],
    });
    const page = createSourcePage(runtime, "Idempotent habit #habit", [
      { blockId: "habit-line", text: "Idempotent habit #habit" },
    ]);

    await executeHabitCommand(runtime, "habit.check-today", { pageId: page.id });
    await executeHabitCommand(runtime, "habit.check-today", { pageId: page.id });

    const checkedEvents = listHabitEvents(runtime).filter(
      (event) => event.type === "checked",
    );

    expect(checkedEvents).toHaveLength(1);

    renderHeatmapView(runtime, {
      data: normalizeHabitEventsForHeatmap(runtime, new Map([[page.id, page.title]])),
    });

    const heatmap = screen.getByRole("region", { name: "Heatmap calendar" });

    expect(
      within(heatmap).getByRole("button", {
        name: /2026-05-20.*1 completion.*Idempotent habit/u,
      }),
    ).toBeVisible();
  });

  it("appends a fresh checked event after a same-day uncheck so Heatmap normalizers see the active completion", async () => {
    useFakeClock(safeMiddayInstant);

    const runtime = await createRuntime({
      eventIds: [
        "event-recheck-first-check",
        "event-recheck-uncheck",
        "event-recheck-final-check",
      ],
      pageIds: ["habit-recheck-page"],
    });
    const page = createSourcePage(runtime, "Re-checkable habit #habit", [
      { blockId: "habit-line", text: "Re-checkable habit #habit" },
    ]);

    await executeHabitCommand(runtime, "habit.check-today", { pageId: page.id });
    await executeHabitCommand(runtime, "habit.uncheck-today", {
      pageId: page.id,
    });

    await expect(
      executeHabitCommand(runtime, "habit.check-today", { pageId: page.id }),
    ).resolves.toStrictEqual({
      checked: true,
      date: todayDate,
      nextDue: tomorrowDate,
      pageId: page.id,
    });
    expectHabitMetadata(runtime, page.id, {
      enabled: true,
      frequency: "daily",
      lastCheckedAt: todayDate,
      nextDue: tomorrowDate,
    });
    expectHabitEvents(runtime, [
      {
        date: todayDate,
        habitPageId: page.id,
        type: "checked",
      },
      {
        date: todayDate,
        habitPageId: page.id,
        type: "unchecked",
      },
      {
        date: todayDate,
        habitPageId: page.id,
        type: "checked",
      },
    ]);

    renderHeatmapView(runtime, {
      data: normalizeHabitEventsForHeatmap(runtime, new Map([[page.id, page.title]])),
    });

    const heatmap = screen.getByRole("region", { name: "Heatmap calendar" });

    expect(
      within(heatmap).getByRole("button", {
        name: /2026-05-20.*1 completion.*Re-checkable habit/u,
      }),
    ).toBeVisible();
  });

  it("executes Habits and Today Habits filters with Habit owner reservations, archive exclusion, and nextDue reappearance", async () => {
    useFakeClock(safeMiddayInstant);

    const runtime = await createRuntime({
      eventIds: ["event-filter-check"],
      pageIds: [
        "habit-filter-today",
        "habit-filter-overdue",
        "habit-filter-tomorrow",
        "habit-filter-weekly",
        "habit-filter-archived",
        "habit-filter-forged",
      ],
    });
    const todayPage = createPage(runtime, "Today habit");
    const overduePage = createPage(runtime, "Overdue habit");
    const tomorrowPage = createPage(runtime, "Tomorrow habit");
    const weeklyPage = createPage(runtime, "Weekly habit");
    const archivedPage = createPage(runtime, "Archived habit");
    const forgedPage = createPage(runtime, "Forged habit");
    setHabitMetadata(runtime, todayPage, { nextDue: todayDate });
    setHabitMetadata(runtime, overduePage, { nextDue: yesterdayDate });
    setHabitMetadata(runtime, tomorrowPage, { nextDue: tomorrowDate });
    setHabitMetadata(runtime, weeklyPage, {
      frequency: "weekly",
      nextDue: todayDate,
    });
    setHabitMetadata(runtime, archivedPage, { nextDue: todayDate });
    setHabitMetadata(runtime, forgedPage, {
      nextDue: todayDate,
      sourcePluginId: "task",
    });
    runtime.pages.archive(archivedPage.id);

    const habitsFilter = getSavedHabitFilter(runtime, habitsFilterId);
    const todayHabitsFilter = getSavedHabitFilter(runtime, todayHabitsFilterId);

    expect(executeHabitFilter(runtime, habitsFilter, todayDate).map((page) => page.id))
      .toStrictEqual([
        todayPage.id,
        overduePage.id,
        tomorrowPage.id,
        weeklyPage.id,
      ]);
    expect(
      executeHabitFilter(runtime, todayHabitsFilter, todayDate).map(
        (page) => page.id,
      ),
    ).toStrictEqual([todayPage.id, overduePage.id]);

    await executeHabitCommand(runtime, "habit.check-today", {
      pageId: todayPage.id,
    });

    expect(
      executeHabitFilter(runtime, todayHabitsFilter, todayDate).map(
        (page) => page.id,
      ),
    ).toStrictEqual([overduePage.id]);
    expect(
      executeHabitFilter(runtime, todayHabitsFilter, tomorrowDate).map(
        (page) => page.id,
      ),
    ).toStrictEqual([todayPage.id, overduePage.id, tomorrowPage.id]);
  });

  it("renders valid Heatmap date-series rows as an accessible ordered calendar with inert labels", async () => {
    const runtime = await createRuntime();
    const unsafeLabel = "Unsafe <img src=x onerror=alert(1)>";

    renderHeatmapView(runtime, {
      data: {
        kind: heatmapKind,
        rows: [
          createHeatmapRow({
            count: 2,
            date: "2026-05-21",
            label: "Later day",
          }),
          createHeatmapRow({
            count: 1,
            date: "2026-05-20",
            label: unsafeLabel,
          }),
          createHeatmapRow({
            count: 3,
            date: "2026-05-19",
            label: "Earlier day",
          }),
        ],
      },
    });

    const heatmap = screen.getByRole("region", { name: "Heatmap calendar" });
    const list = within(heatmap).getByRole("list", {
      name: "Heatmap date series",
    });
    const cells = within(list).getAllByRole("listitem");
    const buttons = within(list).getAllByRole("button");

    expect(cells).toHaveLength(3);
    expect(buttons).toHaveLength(3);
    expect(buttons[0]).toHaveAccessibleName(
      /2026-05-19.*3 completions.*Earlier day/u,
    );
    expect(buttons[1]).toHaveAccessibleName(
      /2026-05-20.*1 completion.*Unsafe <img src=x onerror=alert\(1\)>/u,
    );
    expect(buttons[2]).toHaveAccessibleName(
      /2026-05-21.*2 completions.*Later day/u,
    );
    expect(within(heatmap).getByText(unsafeLabel)).toBeVisible();
    expectNoDangerousDom();
  });

  it("rejects malformed Heatmap rows and Habit-owned event DTOs instead of rendering unsafe or non-normalized data", async () => {
    const runtime = await createRuntime();
    const valid = createHeatmapRow({
      count: 1,
      date: todayDate,
      label: "Valid normalized row",
    });
    const invalidRows = [
      withHeatmapRowOverrides(valid, {
        label: "Wrong owner",
        sourcePluginId: "habit",
        source: {
          ...valid.source,
          sourcePluginId: "task",
        },
      }),
      withHeatmapRowOverrides(valid, {
        count: 0,
        label: "Zero count",
      }),
      withHeatmapRowOverrides(valid, {
        count: Number.POSITIVE_INFINITY,
        label: "Infinite count",
      }),
      withHeatmapRowOverrides(valid, {
        date: "2026-13-40",
        label: "Invalid date",
      }),
      withHeatmapRowOverrides(valid, {
        label: "",
      }),
      withExtraHeatmapRowField(valid, "unexpected", "caller value", {
        label: "Extra field",
      }),
      omitRequiredHeatmapRowField(valid, "date", {
        label: "Missing date",
      }),
      withNonEnumerableHeatmapRowField(
        createHeatmapRow({
          count: 1,
          date: "2026-05-22",
          label: "Hidden date row",
        }),
        "date",
      ),
      withNonEnumerableHeatmapSourceField(
        createHeatmapRow({
          count: 1,
          date: "2026-05-23",
          label: "Hidden source owner row",
        }),
        "sourcePluginId",
      ),
      createAccessorHeatmapRow("Accessor label row"),
      createSymbolExtraHeatmapRow("Symbol extra row"),
      createPrototypeCarriedHeatmapRow("Prototype row"),
    ];

    renderHeatmapView(runtime, {
      data: {
        kind: heatmapKind,
        rows: [valid, ...toHeatmapRows(invalidRows)],
      },
    });

    const heatmap = screen.getByRole("region", { name: "Heatmap calendar" });
    const buttons = within(heatmap).getAllByRole("button");

    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAccessibleName(
      /2026-05-20.*1 completion.*Valid normalized row/u,
    );

    for (const hiddenLabel of [
      "Wrong owner",
      "Zero count",
      "Infinite count",
      "Invalid date",
      "Extra field",
      "Missing date",
      "Hidden date row",
      "Hidden source owner row",
      "Accessor label row",
      "Symbol extra row",
      "Prototype row",
    ]) {
      expect(within(heatmap).queryByText(hiddenLabel)).not.toBeInTheDocument();
    }

    renderHeatmapView(runtime, {
      data: {
        events: [
          {
            namespace: habitNamespace,
            payload: { date: todayDate, habitPageId: "page-direct-event" },
            sourcePluginId: habitPluginId,
            type: "checked",
          },
        ],
        kind: "habit.events",
      } as unknown as HeatmapDateSeriesData,
    });

    const statuses = screen.getAllByRole("status");

    expect(statuses[statuses.length - 1]).toHaveTextContent(/no heatmap data/i);
  });

  it("renders an empty state when Heatmap receives no valid date-series rows", async () => {
    const runtime = await createRuntime();

    renderHeatmapView(runtime, {
      data: {
        kind: heatmapKind,
        rows: [],
      },
    });

    const heatmap = screen.getByRole("region", { name: "Heatmap calendar" });

    expect(within(heatmap).getByRole("status")).toHaveTextContent(
      /no heatmap data/i,
    );
  });

  it("renders Habit completions only after the test harness normalizes public Habit checked events into Heatmap date-series data", async () => {
    useFakeClock(safeMiddayInstant);

    const runtime = await createRuntime({
      eventIds: ["event-integration-checked", "event-forged-integration"],
      pageIds: ["habit-heatmap-integration", "forged-heatmap-integration"],
    });
    const habitPage = createSourcePage(runtime, "Integrated habit #habit", [
      { blockId: "habit-line", text: "Integrated habit #habit" },
    ]);
    const forgedPage = createPage(runtime, "Forged integration page");

    await executeHabitCommand(runtime, "habit.check-today", {
      pageId: habitPage.id,
    });
    runtime.events.append({
      namespace: habitNamespace,
      pageId: forgedPage.id,
      payload: {
        date: todayDate,
        habitPageId: forgedPage.id,
      },
      sourcePluginId: "task",
      type: "checked",
    });

    renderHeatmapView(runtime, {
      data: normalizeHabitEventsForHeatmap(
        runtime,
        new Map([
          [habitPage.id, habitPage.title],
          [forgedPage.id, forgedPage.title],
        ]),
      ),
    });

    const heatmap = screen.getByRole("region", { name: "Heatmap calendar" });

    expect(
      within(heatmap).getByRole("button", {
        name: /2026-05-20.*1 completion.*Integrated habit/u,
      }),
    ).toBeVisible();
    expect(within(heatmap).queryByText("Forged integration page"))
      .not.toBeInTheDocument();
  });

  it("keeps Habit and Heatmap production isolated from Core business behavior, raw runtime/native surfaces, HTML sinks, and package/native diffs", async () => {
    const coreSources = await readProductionSources(["src/core"]);
    const productionSources = await readProductionSources(
      habitHeatmapProductionEntrypoints,
    );
    const productionFilePaths = productionSources
      .map(({ filePath }) => filePath)
      .sort();

    for (const { filePath, source } of coreSources) {
      expect(source, `${filePath}: Core business terms`).not.toMatch(
        /\b(?:habit|heatmap)\b/iu,
      );
    }

    expect(productionFilePaths).toEqual(
      expect.arrayContaining([
        "src/bootstrap/built-in-plugins.ts",
        "src/plugins/habit/index.ts",
        "src/plugins/habit/plugin.ts",
        "src/plugins/heatmap/index.ts",
        "src/plugins/heatmap/plugin.ts",
      ]),
    );

    for (const { filePath, source } of productionSources.filter(({ filePath }) =>
      /^src\/plugins\/(?:habit|heatmap)\//u.test(filePath),
    )) {
      expect(source, `${filePath}: raw runtime/native import`).not.toMatch(
        /@tauri-apps|\bNativeBridge\b|createTauriNativeBridge|\bPluginHost\b|\buseRuntime\b|runtime-context|from\s+["'][^"']*(?:core\/(?:stores|registries|runtime|native)|plugin-host|bootstrap)["']/u,
      );
      expect(source, `${filePath}: markdown or HTML injection sink`).not.toMatch(
        /dangerouslySetInnerHTML|\.innerHTML\b|renderMarkdown|markdownToHtml|marked|sanitizeHtml/iu,
      );
    }

    for (const { filePath, source } of productionSources.filter(({ filePath }) =>
      filePath.startsWith("src/plugins/heatmap/"),
    )) {
      expect(source, `${filePath}: Habit internals`).not.toMatch(
        /plugins\/habit|\bhabit\b/iu,
      );
      expect(source, `${filePath}: event-store read`).not.toMatch(
        /\b(?:ctx|runtime)?\.?events\s*\.\s*list\b|\beventsFacade\b/iu,
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

function createSourcePage(
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
    content: lines.map((line) => {
      const block: BlockNode = {
        blockId: line.blockId,
        text: line.text,
        type: "markdown.line",
      };

      if (line.attrs !== undefined) {
        block.attrs = line.attrs;
      }

      return block;
    }),
    type: "doc",
  };
}

function emptyDocument(): StructuredMarkdownDocument {
  return {
    content: [],
    type: "doc",
  };
}

function executeHabitCommand(
  runtime: AppRuntime,
  commandId: HabitCommandId,
  input?: unknown,
): Promise<unknown> {
  return runtime.commands.execute(commandId, input);
}

function getBuiltInPlugin(pluginId: string): (typeof BUILT_IN_PLUGINS)[number] {
  const plugin = BUILT_IN_PLUGINS.find(
    (candidate) => candidate.manifest.id === pluginId,
  );

  if (plugin === undefined) {
    throw new Error(`Missing built-in plugin ${pluginId}`);
  }

  return plugin;
}

function getSavedHabitFilter(
  runtime: AppRuntime,
  filterId: typeof habitsFilterId | typeof todayHabitsFilterId,
): FilterDefinition {
  const filter = runtime.filters.list({ sourcePluginId: habitPluginId }).find(
    (candidate) => candidate.id === filterId,
  );

  if (filter === undefined) {
    throw new Error(`Missing Habit filter ${filterId}`);
  }

  return filter;
}

function setHabitMetadata(
  runtime: AppRuntime,
  page: MarkdownPage,
  input: {
    enabled?: boolean;
    frequency?: string;
    lastCheckedAt?: string;
    nextDue: string;
    sourcePluginId?: string;
  },
): void {
  const sourcePluginId = input.sourcePluginId ?? habitPluginId;

  runtime.metadata.set({
    key: "enabled",
    namespace: habitNamespace,
    pageId: page.id,
    sourcePluginId,
    value: input.enabled ?? true,
    valueType: "boolean",
  });
  runtime.metadata.set({
    key: "frequency",
    namespace: habitNamespace,
    pageId: page.id,
    sourcePluginId,
    value: input.frequency ?? "daily",
    valueType: "string",
  });
  runtime.metadata.set({
    key: "nextDue",
    namespace: habitNamespace,
    pageId: page.id,
    sourcePluginId,
    value: input.nextDue,
    valueType: "date",
  });

  if (input.lastCheckedAt !== undefined) {
    runtime.metadata.set({
      key: "lastCheckedAt",
      namespace: habitNamespace,
      pageId: page.id,
      sourcePluginId,
      value: input.lastCheckedAt,
      valueType: "date",
    });
  }
}

function expectHabitMetadata(
  runtime: AppRuntime,
  pageId: string,
  expected: {
    enabled?: boolean;
    frequency?: string;
    lastCheckedAt?: string;
    nextDue?: string;
  },
): void {
  for (const [key, value] of Object.entries(expected)) {
    expect(runtime.metadata.get(pageId, habitNamespace, key)).toMatchObject({
      key,
      namespace: habitNamespace,
      pageId,
      sourcePluginId: habitPluginId,
      value,
      valueType: key === "enabled" ? "boolean" : key === "frequency" ? "string" : "date",
    });
  }
}

function expectNoHabitMetadata(runtime: AppRuntime, pageId: string): void {
  expect(runtime.metadata.list({ namespace: habitNamespace, pageId }))
    .toStrictEqual([]);
}

function readHabitMetadataValue(
  runtime: AppRuntime,
  pageId: string,
  key: string,
): unknown {
  return runtime.metadata.list({ key, namespace: habitNamespace, pageId })[0]
    ?.value;
}

function listHabitEvents(runtime: AppRuntime): AppEvent[] {
  return runtime.events.list({ namespace: habitNamespace });
}

function expectHabitEvents(
  runtime: AppRuntime,
  expectedEvents: ReadonlyArray<{
    date: string;
    habitPageId: string;
    type: "checked" | "unchecked";
  }>,
): void {
  const events = listHabitEvents(runtime);

  expect(events).toHaveLength(expectedEvents.length);

  for (const [index, expectedEvent] of expectedEvents.entries()) {
    const event = events[index];

    expect(event).toMatchObject({
      namespace: habitNamespace,
      pageId: expectedEvent.habitPageId,
      sourcePluginId: habitPluginId,
      type: expectedEvent.type,
    });
    expect(event?.type).not.toBe(`habit.${expectedEvent.type}`);
    expect(event?.payload).toStrictEqual({
      date: expectedEvent.date,
      habitPageId: expectedEvent.habitPageId,
    });
  }
}

function executeHabitFilter(
  runtime: AppRuntime,
  filter: FilterDefinition,
  currentDate: string,
): MarkdownPage[] {
  const executeFilterQuery = requireExecuteFilterQuery();

  return executeFilterQuery({
    currentDate,
    metadata: runtime.metadata.list(),
    metadataOwnerReservations: habitMetadataOwnerReservations,
    pages: runtime.pages.list({ includeArchived: true }),
    query: filter.query,
  });
}

function renderHeatmapView(
  runtime: AppRuntime,
  props: HeatmapViewProps,
): ReturnType<typeof render> {
  const View = getHeatmapViewComponent(runtime);

  return render(createElement(View, props));
}

function getHeatmapViewComponent(
  runtime: AppRuntime,
): ComponentType<HeatmapViewProps> {
  const view = runtime.registries.views
    .list({ pluginId: heatmapPluginId })
    .find((registeredView) => registeredView.id === heatmapViewId);

  if (view === undefined) {
    throw new Error("Heatmap Plugin must register heatmap.calendar.");
  }

  expect(view).toMatchObject({
    accepts: { kind: heatmapKind },
    type: "heatmap",
  });

  return (view as ViewDefinition<HeatmapViewProps>).component;
}

function createHeatmapRow(
  input: {
    count: number;
    date: string;
    label: string;
    namespace?: string;
    sourcePluginId?: string;
    type?: string;
  },
): HeatmapDateSeriesRow {
  const sourcePluginId = input.sourcePluginId ?? habitPluginId;

  return {
    count: input.count,
    date: input.date,
    label: input.label,
    sourcePluginId,
    source: {
      namespace: input.namespace ?? habitNamespace,
      sourcePluginId,
      type: input.type ?? "checked",
    },
  };
}

function withHeatmapRowOverrides(
  row: HeatmapDateSeriesRow,
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...row,
    ...overrides,
  };
}

function withExtraHeatmapRowField(
  row: HeatmapDateSeriesRow,
  key: string,
  value: unknown,
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...row,
    ...overrides,
    [key]: value,
  };
}

function omitRequiredHeatmapRowField(
  row: HeatmapDateSeriesRow,
  field: keyof HeatmapDateSeriesRow,
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  const clone: Record<string, unknown> = { ...row, ...overrides };

  delete clone[field];

  return clone;
}

function withNonEnumerableHeatmapRowField(
  row: HeatmapDateSeriesRow,
  field: keyof HeatmapDateSeriesRow,
): Record<string, unknown> {
  const clone: Record<string, unknown> = { ...row };

  makeNonEnumerableOwnValue(clone, field);

  return clone;
}

function withNonEnumerableHeatmapSourceField(
  row: HeatmapDateSeriesRow,
  field: keyof HeatmapDateSeriesRow["source"],
): Record<string, unknown> {
  const source: Record<string, unknown> = { ...row.source };
  const clone: Record<string, unknown> = {
    ...row,
    source,
  };

  makeNonEnumerableOwnValue(source, field);

  return clone;
}

function createAccessorHeatmapRow(label: string): Record<string, unknown> {
  const row = createHeatmapRow({
    count: 1,
    date: "2026-05-24",
    label,
  }) as Record<string, unknown>;

  Object.defineProperty(row, "label", {
    enumerable: true,
    get() {
      return label;
    },
  });

  return row;
}

function createSymbolExtraHeatmapRow(label: string): Record<string, unknown> {
  const row = createHeatmapRow({
    count: 1,
    date: "2026-05-25",
    label,
  }) as Record<PropertyKey, unknown>;

  Object.defineProperty(row, Symbol("sourcePluginId"), {
    enumerable: true,
    value: habitPluginId,
  });

  return row as Record<string, unknown>;
}

function createPrototypeCarriedHeatmapRow(
  label: string,
): Record<string, unknown> {
  const row = Object.create({
    sourcePluginId: "task",
  }) as Record<string, unknown>;
  const valid = createHeatmapRow({
    count: 1,
    date: "2026-05-26",
    label,
  });

  Object.assign(row, valid);

  return row;
}

function toHeatmapRows(
  rows: readonly Record<string, unknown>[],
): readonly HeatmapDateSeriesRow[] {
  return rows as unknown as readonly HeatmapDateSeriesRow[];
}

function normalizeHabitEventsForHeatmap(
  runtime: AppRuntime,
  pageTitles: ReadonlyMap<string, string>,
): HeatmapDateSeriesData {
  const activeCompletions = new Map<string, { date: string; habitPageId: string }>();

  for (const event of runtime.events.list()) {
    const payload = readPublicHabitCompletionPayload(event);

    if (payload === undefined) {
      continue;
    }

    const key = `${payload.habitPageId}\u0000${payload.date}`;

    if (event.type === "checked") {
      activeCompletions.set(key, payload);
    } else {
      activeCompletions.delete(key);
    }
  }

  const byDate = new Map<string, { count: number; labels: string[] }>();

  for (const completion of activeCompletions.values()) {
    const entry = byDate.get(completion.date) ?? { count: 0, labels: [] };

    entry.count += 1;
    entry.labels.push(
      pageTitles.get(completion.habitPageId) ?? completion.habitPageId,
    );
    byDate.set(completion.date, entry);
  }

  return {
    kind: heatmapKind,
    rows: [...byDate]
      .sort(([leftDate], [rightDate]) => leftDate.localeCompare(rightDate))
      .map(([date, entry]) =>
        createHeatmapRow({
          count: entry.count,
          date,
          label: entry.labels.sort().join(", "),
        }),
      ),
  };
}

function readPublicHabitCompletionPayload(
  event: AppEvent,
): { date: string; habitPageId: string } | undefined {
  if (
    event.namespace !== habitNamespace ||
    event.sourcePluginId !== habitPluginId ||
    (event.type !== "checked" && event.type !== "unchecked") ||
    !isRecord(event.payload)
  ) {
    return undefined;
  }

  const keys = Object.keys(event.payload).sort();

  if (
    keys.length !== 2 ||
    keys[0] !== "date" ||
    keys[1] !== "habitPageId" ||
    typeof event.payload.date !== "string" ||
    typeof event.payload.habitPageId !== "string"
  ) {
    return undefined;
  }

  return {
    date: event.payload.date,
    habitPageId: event.payload.habitPageId,
  };
}

function createInvalidHabitPagePayloads(
  pageId: string,
): Array<{ input: unknown; label: string }> {
  return [
    { input: undefined, label: "undefined payload" },
    { input: null, label: "null payload" },
    { input: {}, label: "empty payload" },
    { input: [], label: "array payload" },
    { input: { pageId: "" }, label: "blank pageId" },
    { input: { pageId: 42 }, label: "non-string pageId" },
    {
      input: { pageId, sourcePluginId: habitPluginId },
      label: "caller-supplied owner",
    },
    {
      input: { pageId, unexpected: true },
      label: "extra field",
    },
    {
      input: createAccessorPagePayload(pageId),
      label: "accessor pageId",
    },
    {
      input: createSymbolExtraPayload({ pageId }),
      label: "symbol extra",
    },
    {
      input: createNonEnumerableExtraPayload({ pageId }),
      label: "non-enumerable extra",
    },
    {
      input: createNonEnumerableFieldPayload({ pageId }, "pageId"),
      label: "non-enumerable pageId",
    },
    {
      input: createPrototypeCarriedPayload({ pageId }),
      label: "prototype-carried payload",
    },
  ];
}

function createInvalidHabitFrequencyPayloads(
  pageId: string,
): Array<{ input: unknown; label: string }> {
  return [
    { input: { pageId }, label: "missing frequency" },
    {
      input: { frequency: "weekly", pageId },
      label: "unsupported frequency",
    },
    {
      input: { frequency: "daily", pageId, sourcePluginId: habitPluginId },
      label: "caller-supplied owner",
    },
    {
      input: { frequency: "daily", pageId, unexpected: true },
      label: "extra field",
    },
    {
      input: createSymbolExtraPayload({ frequency: "daily", pageId }),
      label: "symbol extra",
    },
    {
      input: createNonEnumerableFieldPayload(
        { frequency: "daily", pageId },
        "frequency",
      ),
      label: "non-enumerable frequency",
    },
    {
      input: createPrototypeCarriedPayload({ frequency: "daily", pageId }),
      label: "prototype-carried payload",
    },
  ];
}

function createAccessorPagePayload(pageId: string): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  Object.defineProperty(payload, "pageId", {
    enumerable: true,
    get() {
      return pageId;
    },
  });

  return payload;
}

function createSymbolExtraPayload(
  base: Record<string, unknown>,
): Record<string, unknown> {
  const payload = { ...base } as Record<PropertyKey, unknown>;

  Object.defineProperty(payload, Symbol("sourcePluginId"), {
    enumerable: true,
    value: habitPluginId,
  });

  return payload as Record<string, unknown>;
}

function createNonEnumerableExtraPayload(
  base: Record<string, unknown>,
): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...base };

  Object.defineProperty(payload, "sourcePluginId", {
    enumerable: false,
    value: habitPluginId,
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
    sourcePluginId: habitPluginId,
  }) as Record<string, unknown>;

  Object.assign(payload, base);

  return payload;
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

function snapshotRuntimeState(runtime: AppRuntime): RuntimeSnapshot {
  return {
    events: runtime.events.list(),
    filters: runtime.filters.list(),
    metadata: runtime.metadata.list(),
    pages: runtime.pages.list({ includeArchived: true }),
  };
}

function requireExecuteFilterQuery(): ExecuteFilterQuery {
  const coreExports = Core as typeof Core & {
    executeFilterQuery?: ExecuteFilterQuery;
  };

  if (coreExports.executeFilterQuery === undefined) {
    throw new Error("Core must export executeFilterQuery from ../core");
  }

  return coreExports.executeFilterQuery;
}

function useFakeClock(isoInstant: string): void {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(isoInstant));
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
        throw new Error(`Unexpected Heatmap link href ${attribute.value}`);
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
  const files = await runGitLines(["ls-files", "--", ...entrypoints]);
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
