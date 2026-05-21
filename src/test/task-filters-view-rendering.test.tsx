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
  createCoreStores,
  type CoreStores,
  type DbQuery,
  type FilterDefinition,
  type FilterQuery,
  type MarkdownPage,
  type MetadataValueType,
  type NativeBridge,
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
};

type ExecuteFilterQuery = (
  input: ExecuteFilterQueryInput,
) => MarkdownPage[];

type PageListViewProps = {
  pages: readonly MarkdownPage[];
};

type FilterEmptyStateProps = {
  filterName: string;
};

type CreateRuntimeOptions = {
  pageIds?: readonly string[];
  metadataIds?: readonly string[];
  filterIds?: readonly string[];
};

const taskPluginId = "task";
const taskPageListViewId = "task.page-list";
const pageListViewType = "page.list";
const taskEmptyStateSlotId = "task.filter-empty-state";
const filterEmptyStateSlot = "filter.empty_state";
const fixedCurrentDate = "2026-05-21";
const relativeTodayValue = {
  kind: "relative-date",
  value: "today",
} as const satisfies RelativeTodayValue;
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

    const results = executeSavedFilter(runtime, "All Tasks");

    expect(results.map((page) => page.title)).toStrictEqual([
      todo.title,
      done.title,
      unsafeHtml.title,
      unsafeLink.title,
    ]);

    renderPageListView(runtime, results);

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

    const results = executeSavedFilter(runtime, "Today", fixedCurrentDate);

    expect(results.map((page) => page.title)).toStrictEqual([
      dueToday.title,
      scheduledToday.title,
    ]);

    renderPageListView(runtime, results);

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
    const emptyResults = executeSavedFilter(runtime, "Today", fixedCurrentDate);
    const EmptyState = getTaskFilterEmptyStateSlot(runtime);

    expect(emptyResults).toStrictEqual([]);

    render(<EmptyState filterName="Today" />);

    expect(screen.getByRole("status")).toHaveTextContent(/today/iu);
    expect(screen.getByRole("status")).toHaveTextContent(/empty|no|nothing/iu);
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

function executeSavedFilter(
  runtime: AppRuntime,
  filterName: "All Tasks" | "Today",
  currentDate?: string,
): MarkdownPage[] {
  const filter = getSavedFilter(runtime, filterName);
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

function renderPageListView(
  runtime: AppRuntime,
  pages: readonly MarkdownPage[],
): void {
  const PageListView = getTaskPageListView(runtime);

  render(<PageListView pages={pages} />);
}

function getTaskPageListView(
  runtime: AppRuntime,
): ComponentType<PageListViewProps> {
  const view = runtime.registries.views.get(taskPageListViewId);

  return (view as ViewDefinition<PageListViewProps>).component;
}

function getTaskFilterEmptyStateSlot(
  runtime: AppRuntime,
): ComponentType<FilterEmptyStateProps> {
  const contribution = runtime.registries.slots.get(taskEmptyStateSlotId);

  return (contribution as SlotContribution<FilterEmptyStateProps>).component;
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

  return executeFilterQuery;
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
