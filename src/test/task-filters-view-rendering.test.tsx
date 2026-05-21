import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { render, screen } from "@testing-library/react";
import { type ComponentType } from "react";
import { describe, expect, it } from "vitest";

import { BUILT_IN_PLUGINS, createAppRuntime, type AppRuntime } from "../bootstrap";
import * as Core from "../core";
import {
  type AppPlugin,
  createCoreStores,
  type CoreStores,
  type DbQuery,
  type FilterDefinition,
  type FilterQuery,
  type MarkdownPage,
  type MetadataValueType,
  type NativeBridge,
  type PluginHostRecord,
  type SlotContribution,
  type ViewDefinition,
} from "../core";

type NativeBridgeTransactionResult<Response> =
  Response extends readonly unknown[]
    ? number extends Response["length"]
      ? Array<Response>
      : Response
    : Array<Response>;

type RelativeTodayValue = {
  kind: "relative-date";
  value: "today";
};

type ExecuteFilterQueryInput = {
  pages: readonly MarkdownPage[];
  metadata: ReturnType<AppRuntime["metadata"]["list"]>;
  query: FilterQuery;
  currentDate?: string;
  metadataOwnerReservations?: readonly MetadataOwnerReservation[];
};

type ExecuteFilterQuery = (
  input: ExecuteFilterQueryInput,
) => MarkdownPage[];

type MetadataOwnerReservation = {
  namespace: string;
  sourcePluginId: string;
};

type PageListViewProps = {
  pages: readonly MarkdownPage[];
};

type FilterEmptyStateProps = {
  filterName: string;
};

type PluginLifecycleHost = AppRuntime["pluginHost"] & {
  register(plugin: AppPlugin): Promise<PluginHostRecord>;
  activate(pluginId: string): Promise<PluginHostRecord>;
  deactivate(pluginId: string): Promise<PluginHostRecord>;
};

type CreateRuntimeOptions = {
  pageIds?: readonly string[];
  metadataIds?: readonly string[];
  filterIds?: readonly string[];
};

const taskPluginId = "task";
const reviewPluginId = "review";
const allTasksFilterId = "task.filter.all-tasks";
const todayFilterId = "task.filter.today";
const taskPageListViewId = "task.page-list";
const pageListViewType = "page.list";
const taskEmptyStateSlotId = "task.filter-empty-state";
const filterEmptyStateSlot = "filter.empty_state";
const fixedCurrentDate = "2026-05-21";
const relativeTodayValue = {
  kind: "relative-date",
  value: "today",
} as const satisfies RelativeTodayValue;
const builtInMetadataOwnerReservations = [
  {
    namespace: taskPluginId,
    sourcePluginId: taskPluginId,
  },
] as const satisfies readonly MetadataOwnerReservation[];
const allTasksFilterQuery = {
  where: [{ field: "metadata.task.enabled", op: "eq", value: true }],
} satisfies FilterQuery;
const todayFilterQuery = {
  where: [
    { field: "metadata.task.enabled", op: "eq", value: true },
    { field: "metadata.task.status", op: "neq", value: "done" },
  ],
  or: [
    {
      where: [
        {
          field: "metadata.task.scheduled",
          op: "eq",
          value: relativeTodayValue,
        },
      ],
    },
    {
      where: [
        {
          field: "metadata.task.due",
          op: "eq",
          value: relativeTodayValue,
        },
      ],
    },
  ],
} satisfies FilterQuery;
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
  "src-tauri/permissions",
  "src-tauri/src/commands",
  "src-tauri/src/lib.rs",
  "src-tauri/src/main.rs",
  "src-tauri/tauri.conf.json",
];

describe("Task filters, page.list view rendering, and empty state slot", () => {
  it("registers task-owned All Tasks and Today filters plus the page.list view and empty-state slot", async () => {
    const runtime = await createRuntime();
    const taskPlugin = BUILT_IN_PLUGINS.find(
      (plugin) => plugin.manifest.id === taskPluginId,
    );
    const taskFilters = runtime.filters.list({ sourcePluginId: taskPluginId });
    const taskFilterNames = taskFilters.map((filter) => filter.name).sort();
    const allTasks = getSavedFilter(runtime, "All Tasks");
    const today = getSavedFilter(runtime, "Today");
    const taskCommandIds = runtime.registries.commands
      .list({ pluginId: taskPluginId })
      .map((command) => command.id);
    const taskView = runtime.registries.views.get(taskPageListViewId);
    const emptyStateSlot = runtime.registries.slots.get(taskEmptyStateSlotId);

    expect.soft(taskPlugin).toBeDefined();
    expect(taskFilterNames).toStrictEqual(["All Tasks", "Today"]);
    expect(allTasks).toMatchObject({
      name: "All Tasks",
      query: allTasksFilterQuery,
      viewType: pageListViewType,
      sourcePluginId: taskPluginId,
    });
    expect(today).toMatchObject({
      name: "Today",
      query: todayFilterQuery,
      viewType: pageListViewType,
      sourcePluginId: taskPluginId,
    });
    expect(taskCommandIds).not.toEqual(
      expect.arrayContaining(["task.set_due", "task.set-due"]),
    );
    expect(taskView).toMatchObject({
      id: taskPageListViewId,
      pluginId: taskPluginId,
      type: pageListViewType,
      accepts: {
        kind: "filter-results.markdown-pages",
      },
      component: expect.anything(),
    });
    expect(emptyStateSlot).toMatchObject({
      id: taskEmptyStateSlotId,
      pluginId: taskPluginId,
      slot: filterEmptyStateSlot,
      order: 100,
      component: expect.anything(),
    });
  });

  it("declares current Task Plugin metadata fields in the real manifest", () => {
    const taskPlugin = getBuiltInTaskPlugin();
    const metadataFields =
      taskPlugin.manifest.contributes?.metadataFields ?? [];

    expect(metadataFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          namespace: "task",
          key: "enabled",
          valueType: "boolean",
        }),
        expect.objectContaining({
          namespace: "task",
          key: "status",
          valueType: "string",
        }),
        expect.objectContaining({
          namespace: "task",
          key: "sourcePageId",
          valueType: "string",
        }),
        expect.objectContaining({
          namespace: "task",
          key: "sourceBlockId",
          valueType: "string",
        }),
        expect.objectContaining({
          namespace: "task",
          key: "scheduled",
          valueType: "date",
        }),
        expect.objectContaining({
          namespace: "task",
          key: "due",
          valueType: "date",
        }),
      ]),
    );
  });

  it("can deactivate, re-register, and reactivate Task Plugin without colliding or duplicating default filters", async () => {
    const runtime = await createRuntime();
    const host = getLifecyclePluginHost(runtime);
    const taskPlugin = getBuiltInTaskPlugin();
    const customTaskFilter = runtime.filters.save({
      id: "task.filter.custom-focus",
      name: "Custom Focus",
      query: {
        where: [
          {
            field: "metadata.task.status",
            op: "eq",
            value: "todo",
          },
        ],
      },
      viewType: pageListViewType,
      sourcePluginId: taskPluginId,
    });

    expect(getTaskDefaultFilterIds(runtime)).toStrictEqual([
      allTasksFilterId,
      customTaskFilter.id,
      todayFilterId,
    ]);

    await expect(host.deactivate(taskPluginId)).resolves.toMatchObject({
      id: taskPluginId,
      enabled: false,
      status: "installed",
    });
    expect(getTaskDefaultFilterIds(runtime)).toStrictEqual([
      allTasksFilterId,
      customTaskFilter.id,
      todayFilterId,
    ]);

    await expect(host.register(taskPlugin)).resolves.toMatchObject({
      id: taskPluginId,
      enabled: false,
      status: "registered",
    });
    await expect(host.activate(taskPluginId)).resolves.toMatchObject({
      id: taskPluginId,
      enabled: true,
      status: "active",
    });

    const taskFilters = runtime.filters.list({ sourcePluginId: taskPluginId });

    expect(taskFilters).toHaveLength(3);
    expect(getTaskDefaultFilterIds(runtime)).toStrictEqual([
      allTasksFilterId,
      customTaskFilter.id,
      todayFilterId,
    ]);
    expect(taskFilters.map((filter) => filter.name).sort()).toStrictEqual([
      "All Tasks",
      "Custom Focus",
      "Today",
    ]);
    expect(runtime.filters.get(customTaskFilter.id)).toStrictEqual(
      customTaskFilter,
    );
  });

  it("executes All Tasks through the Core filter engine and renders task page titles as inert text", async () => {
    const runtime = await createRuntime({
      pageIds: [
        "page-todo",
        "page-done",
        "page-note",
        "page-archived",
        "page-forged",
        "page-unsafe-html",
        "page-unsafe-link",
      ],
      metadataIds: createMetadataIds(18),
    });
    const todo = createPage(runtime, "Write filter tests");
    const done = createPage(runtime, "Already done");
    const note = createPage(runtime, "Plain note");
    const archived = createPage(runtime, "Archived task");
    const forged = createPage(runtime, "Forged task metadata");
    const unsafeHtml = createPage(runtime, "<img onerror=alert(1)>");
    const unsafeLink = createPage(runtime, "[x](javascript:alert(1))");

    setTaskMetadata(runtime, todo, { status: "todo" });
    setTaskMetadata(runtime, done, { status: "done" });
    setTaskMetadata(runtime, archived, { status: "todo" });
    runtime.pages.archive(archived.id);
    runtime.metadata.set({
      pageId: forged.id,
      namespace: "task",
      key: "enabled",
      value: true,
      valueType: "boolean",
      sourcePluginId: "tag",
    });
    setTaskMetadata(runtime, unsafeHtml, { status: "todo" });
    setTaskMetadata(runtime, unsafeLink, { status: "todo" });

    const allTasksFilter = getSavedFilter(runtime, "All Tasks");
    const results = executeFilter(runtime, allTasksFilter);

    expect(results.map((page) => page.title)).toStrictEqual([
      todo.title,
      done.title,
      unsafeHtml.title,
      unsafeLink.title,
    ]);

    renderSavedFilterResults(runtime, allTasksFilter, results);

    expect(screen.getByText(todo.title)).toBeVisible();
    expect(screen.getByText(done.title)).toBeVisible();
    expect(screen.queryByText(note.title)).not.toBeInTheDocument();
    expect(screen.queryByText(archived.title)).not.toBeInTheDocument();
    expect(screen.queryByText(forged.title)).not.toBeInTheDocument();
    expect(screen.getByText(unsafeHtml.title)).toBeVisible();
    expect(screen.getByText(unsafeLink.title)).toBeVisible();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(document.body.innerHTML).not.toMatch(/<script\b/iu);
    expect(document.body.innerHTML).not.toMatch(/href=["']javascript:/iu);
  });

  it("executes Today with deterministic local date semantics and renders only unfinished due or scheduled task pages", async () => {
    const runtime = await createRuntime({
      pageIds: [
        "page-due-today",
        "page-scheduled-today",
        "page-done-today",
        "page-future",
        "page-invalid-date",
        "page-string-date",
        "page-no-date",
      ],
      metadataIds: createMetadataIds(32),
    });
    const dueToday = createPage(runtime, "Due today");
    const scheduledToday = createPage(runtime, "Scheduled today");
    const doneToday = createPage(runtime, "Done today");
    const future = createPage(runtime, "Future task");
    const invalidDate = createPage(runtime, "Invalid date task");
    const stringDate = createPage(runtime, "String date task");
    const noDate = createPage(runtime, "No date task");

    setTaskMetadata(runtime, dueToday, {
      status: "todo",
      due: fixedCurrentDate,
    });
    setTaskMetadata(runtime, scheduledToday, {
      status: "todo",
      scheduled: fixedCurrentDate,
    });
    setTaskMetadata(runtime, doneToday, {
      status: "done",
      due: fixedCurrentDate,
    });
    setTaskMetadata(runtime, future, {
      status: "todo",
      due: "2026-05-22",
    });
    setTaskMetadata(runtime, invalidDate, {
      status: "todo",
      due: "not-a-date",
    });
    setTaskMetadata(runtime, stringDate, {
      status: "todo",
      due: fixedCurrentDate,
      dueValueType: "string",
    });
    setTaskMetadata(runtime, noDate, { status: "todo" });

    const todayFilter = getSavedFilter(runtime, "Today");
    const results = executeFilter(runtime, todayFilter, fixedCurrentDate);

    expect(results.map((page) => page.title)).toStrictEqual([
      dueToday.title,
      scheduledToday.title,
    ]);

    renderSavedFilterResults(runtime, todayFilter, results);

    expect(screen.getByText(dueToday.title)).toBeVisible();
    expect(screen.getByText(scheduledToday.title)).toBeVisible();
    expect(screen.queryByText(doneToday.title)).not.toBeInTheDocument();
    expect(screen.queryByText(future.title)).not.toBeInTheDocument();
    expect(screen.queryByText(invalidDate.title)).not.toBeInTheDocument();
    expect(screen.queryByText(stringDate.title)).not.toBeInTheDocument();
    expect(screen.queryByText(noDate.title)).not.toBeInTheDocument();
  });

  it("renders empty filter results through the registered filter.empty_state slot with minimal data props", async () => {
    const runtime = await createRuntime();
    const todayFilter = getSavedFilter(runtime, "Today");
    const emptyResults = executeFilter(runtime, todayFilter, fixedCurrentDate);

    expect(emptyResults).toStrictEqual([]);

    renderSavedFilterResults(runtime, todayFilter, emptyResults);

    expect(screen.getByRole("status")).toHaveTextContent(/today/iu);
    expect(screen.getByRole("status")).toHaveTextContent(/empty|no|nothing/iu);
  });

  it("resolves a saved filter's registered view from viewType instead of a hard-coded task view id", async () => {
    const runtime = await createRuntime({
      pageIds: ["page-review-ready"],
      metadataIds: ["metadata-review-state"],
      filterIds: ["filter-review-ready"],
    });
    const ready = createPage(runtime, "Ready review");

    runtime.registries.views.register<PageListViewProps>({
      id: "review.page-list",
      pluginId: reviewPluginId,
      type: "review.list",
      title: "Review page list",
      component: ReviewPageListView,
      accepts: {
        kind: "filter-results.markdown-pages",
      },
    });
    runtime.metadata.set({
      pageId: ready.id,
      namespace: "review",
      key: "state",
      value: "ready",
      valueType: "string",
      sourcePluginId: reviewPluginId,
    });
    const filter = runtime.filters.save({
      name: "Ready reviews",
      query: {
        where: [
          { field: "metadata.review.state", op: "eq", value: "ready" },
        ],
      },
      viewType: "review.list",
      sourcePluginId: reviewPluginId,
    });
    const results = executeFilter(runtime, filter);

    renderSavedFilterResults(runtime, filter, results);

    expect(screen.getByRole("list", { name: "Review pages" })).toBeVisible();
    expect(screen.getByText(`review result: ${ready.title}`)).toBeVisible();
  });

  it("uses generic empty-state copy for empty page.list filters", async () => {
    const runtime = await createRuntime({
      filterIds: ["filter-generic-empty"],
    });
    const filter = runtime.filters.save({
      name: "Saved pages",
      query: {
        where: [
          { field: "metadata.review.state", op: "eq", value: "ready" },
        ],
      },
      viewType: pageListViewType,
      sourcePluginId: reviewPluginId,
    });
    const emptyResults = executeFilter(runtime, filter, fixedCurrentDate);

    expect(emptyResults).toStrictEqual([]);

    renderSavedFilterResults(runtime, filter, emptyResults);

    const status = screen.getByRole("status");

    expect(status).toHaveTextContent(/saved pages/iu);
    expect(status).toHaveTextContent(/empty|no|nothing/iu);
    expect(status).not.toHaveTextContent(/\btasks?\b/iu);
  });

  it("does not require native, Tauri, package, Cargo, permission, or command-surface changes", async () => {
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
  const createFilterId =
    options.filterIds === undefined
      ? undefined
      : createSequenceFactory(options.filterIds);

  return createAppRuntime({
    createNativeBridge: () => createNoopNativeBridge(),
    ...(createPageId === undefined &&
    createMetadataId === undefined &&
    createFilterId === undefined
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
              ...(createFilterId === undefined
                ? {}
                : {
                    filters: {
                      createId: createFilterId,
                    },
                  }),
            }),
        }),
  });
}

function createPage(runtime: AppRuntime, title: string): MarkdownPage {
  return runtime.pages.create({
    title,
    body: {
      type: "doc",
      content: [],
    },
  });
}

function ReviewPageListView({ pages }: PageListViewProps) {
  return (
    <ul aria-label="Review pages">
      {pages.map((page) => (
        <li key={page.id}>{`review result: ${page.title}`}</li>
      ))}
    </ul>
  );
}

function setTaskMetadata(
  runtime: AppRuntime,
  page: MarkdownPage,
  input: {
    status: "todo" | "done";
    due?: string;
    dueValueType?: MetadataValueType;
    scheduled?: string;
    scheduledValueType?: MetadataValueType;
  },
): void {
  runtime.metadata.set({
    pageId: page.id,
    namespace: "task",
    key: "enabled",
    value: true,
    valueType: "boolean",
    sourcePluginId: taskPluginId,
  });
  runtime.metadata.set({
    pageId: page.id,
    namespace: "task",
    key: "status",
    value: input.status,
    valueType: "string",
    sourcePluginId: taskPluginId,
  });

  if (input.due !== undefined) {
    runtime.metadata.set({
      pageId: page.id,
      namespace: "task",
      key: "due",
      value: input.due,
      valueType: input.dueValueType ?? "date",
      sourcePluginId: taskPluginId,
    });
  }

  if (input.scheduled !== undefined) {
    runtime.metadata.set({
      pageId: page.id,
      namespace: "task",
      key: "scheduled",
      value: input.scheduled,
      valueType: input.scheduledValueType ?? "date",
      sourcePluginId: taskPluginId,
    });
  }
}

function executeFilter(
  runtime: AppRuntime,
  filter: FilterDefinition,
  currentDate?: string,
): MarkdownPage[] {
  const executeFilterQuery = requireExecuteFilterQuery();

  return executeFilterQuery({
    pages: runtime.pages.list({ includeArchived: true }),
    metadata: runtime.metadata.list(),
    query: filter.query,
    ...(currentDate === undefined ? {} : { currentDate }),
  });
}

function getSavedFilter(
  runtime: AppRuntime,
  filterName: "All Tasks" | "Today",
): FilterDefinition {
  const filter = runtime.filters
    .list({ sourcePluginId: taskPluginId })
    .find((candidate) => candidate.name === filterName);

  if (filter === undefined) {
    throw new Error(`Missing ${filterName} task filter`);
  }

  return filter;
}

function renderSavedFilterResults(
  runtime: AppRuntime,
  filter: FilterDefinition,
  pages: readonly MarkdownPage[],
): void {
  if (pages.length === 0) {
    const EmptyState = getFilterEmptyStateSlot(runtime);

    render(<EmptyState filterName={filter.name} />);
    return;
  }

  const PageListView = getPageListViewForFilter(runtime, filter);

  render(<PageListView pages={pages} />);
}

function getPageListViewForFilter(
  runtime: AppRuntime,
  filter: FilterDefinition,
): ComponentType<PageListViewProps> {
  const view = runtime.registries.views.list({ type: filter.viewType })[0];

  if (view === undefined) {
    throw new Error(`Missing view for filter viewType ${filter.viewType}`);
  }

  return (view as ViewDefinition<PageListViewProps>).component;
}

function getFilterEmptyStateSlot(
  runtime: AppRuntime,
): ComponentType<FilterEmptyStateProps> {
  const contribution = runtime.registries.slots.list({
    slot: filterEmptyStateSlot,
  })[0];

  if (contribution === undefined) {
    throw new Error(`Missing ${filterEmptyStateSlot} slot contribution`);
  }

  return (contribution as SlotContribution<FilterEmptyStateProps>).component;
}

function getTaskDefaultFilterIds(runtime: AppRuntime): string[] {
  return runtime.filters
    .list({ sourcePluginId: taskPluginId })
    .map((filter) => filter.id)
    .sort();
}

function getBuiltInTaskPlugin(): AppPlugin {
  const taskPlugin = BUILT_IN_PLUGINS.find(
    (plugin) => plugin.manifest.id === taskPluginId,
  );

  if (taskPlugin === undefined) {
    throw new Error("Missing built-in Task Plugin");
  }

  return taskPlugin;
}

function getLifecyclePluginHost(runtime: AppRuntime): PluginLifecycleHost {
  return runtime.pluginHost as PluginLifecycleHost;
}

function readExecuteFilterQuery(): ExecuteFilterQuery | undefined {
  const coreExports = Core as typeof Core & {
    executeFilterQuery?: ExecuteFilterQuery;
  };

  return coreExports.executeFilterQuery;
}

function requireExecuteFilterQuery(): ExecuteFilterQuery {
  const executeFilterQuery = readExecuteFilterQuery();

  if (executeFilterQuery === undefined) {
    throw new Error("Core must export executeFilterQuery from ../core");
  }

  return (input) =>
    executeFilterQuery({
      ...input,
      metadataOwnerReservations:
        input.metadataOwnerReservations ?? builtInMetadataOwnerReservations,
    });
}

function createMetadataIds(count: number): string[] {
  return Array.from({ length: count }, (_value, index) => {
    return `metadata-${index + 1}`;
  });
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
    shortcuts: {
      async register() {
        return undefined;
      },
      async unregister() {
        return undefined;
      },
    },
    notifications: {
      async notify() {
        return undefined;
      },
    },
    files: {
      async importMarkdown() {
        return "";
      },
      async exportMarkdown() {
        return undefined;
      },
    },
  };
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
