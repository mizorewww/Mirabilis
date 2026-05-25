import { execFile } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  render,
  screen,
  waitFor,
  within,
  type RenderResult,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState, type ComponentType } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "../App";
import { createAppRuntime, type AppRuntime } from "../bootstrap";
import {
  createCoreStores,
  type BlockNode,
  type CoreStores,
  type DbQuery,
  type MarkdownPage,
  type MetadataValueType,
  type NativeBridge,
  type StructuredMarkdownDocument,
} from "../core";
import { useMarkdownWorkspaceBridge } from "../shell/hosts";
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
  attrs?: Record<string, unknown>;
};

type CreateRuntimeOptions = {
  filterIds?: readonly string[];
  metadataIds?: readonly string[];
  pageIds?: readonly string[];
};

type PageSummary = {
  routeToken: string;
  title: string;
};

type CapturedProps = Record<string, unknown>;

type SourceFile = {
  filePath: string;
  source: string;
};

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const execFileAsync = promisify(execFile);
const fixedToday = "2026-05-21";
const fixedNow = new Date(`${fixedToday}T12:00:00.000Z`);
const homeTitle = "Home";
const markdownPageViewId = "markdown.page-editor";
const pageEditorViewType = "page.editor";
const taskPluginId = "task";
const taskPageListViewId = "task.page-list";
const pageListViewType = "page.list";
const filterResultsKind = "filter-results.markdown-pages";
const taskEmptyStateSlotId = "task.filter-empty-state";
const filterEmptyStateSlot = "filter.empty_state";
const allTasksFilterId = "task.filter.all-tasks";
const todayFilterId = "task.filter.today";
const inboxFilterId = "quick-capture.filter.inbox";
const tagPluginId = "tag";
const tagAddCommandId = "tag.add-tag";
const tagCreateFilterCommandId = "tag.create-filter";
const quickCaptureSaveCommandId = "quick-capture.save";
const appShellEntrypoints = [
  "src/App.tsx",
  "src/main.tsx",
  "src/shell",
  "src/providers",
] as const;
const task038SurfaceEntrypoints = [
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

afterEach(() => {
  vi.restoreAllMocks();
});

describe("TASK-038 sidebar page and saved-filter navigation", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(fixedNow);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps Home and recent page routes on the registered page editor through ViewHost", async () => {
    const runtime = await createRuntime({
      pageIds: ["home-page", "project-alpha-page"],
    });
    const home = createRuntimePage(runtime, homeTitle, [
      { blockId: "home-body", text: "Home route body" },
    ]);
    const project = createRuntimePage(runtime, "Project Alpha", [
      { blockId: "project-body", text: "Project Alpha body" },
    ]);
    const capturedEditorProps: CapturedProps[] = [];
    const user = userEvent.setup({
      advanceTimers: (delay) => vi.advanceTimersByTime(delay),
    });

    replaceRegisteredPageEditor(
      runtime,
      createBridgeLoadingPageEditor(capturedEditorProps),
    );
    renderReadyApp(runtime);

    expect(await screen.findByText("Registered route editor")).toBeVisible();
    expect(await screen.findByText("Home route body")).toBeVisible();

    const drawerToggle = screen.getByRole("button", {
      name: /^Workspace navigation$/i,
    });

    await user.click(drawerToggle);

    expect(
      screen.queryByRole("navigation", { name: /^Workspace$/i }),
    ).not.toBeInTheDocument();

    await user.click(drawerToggle);

    const navigation = screen.getByRole("navigation", { name: /^Workspace$/i });
    const homeRoute = within(navigation).getByRole("button", {
      name: /^Home\b/i,
    });
    const recentProjectRoute = await within(navigation).findByRole("button", {
      name: /Project Alpha/i,
    });

    expect(homeRoute).toHaveAttribute("aria-current", "page");
    expect(latestCapturedPageId(capturedEditorProps)).toBe(home.id);

    await user.click(recentProjectRoute);

    expect(recentProjectRoute).toHaveAttribute("aria-current", "page");
    expect(await screen.findByText("Project Alpha body")).toBeVisible();
    expect(latestCapturedPageId(capturedEditorProps)).toBe(project.id);

    await user.click(homeRoute);

    expect(homeRoute).toHaveAttribute("aria-current", "page");
    expect(await screen.findByText("Home route body")).toBeVisible();
    expect(latestCapturedPageId(capturedEditorProps)).toBe(home.id);
  });

  it("keeps Recent pages visible on filter routes and opens a recent page through the registered editor", async () => {
    const runtime = await createRuntime({
      pageIds: ["home-page", "project-roadmap-page"],
    });
    const capturedEditorProps: CapturedProps[] = [];
    const user = userEvent.setup({
      advanceTimers: (delay) => vi.advanceTimersByTime(delay),
    });

    createRuntimePage(runtime, homeTitle, [
      { blockId: "home-body", text: "Home route body" },
    ]);
    const project = createRuntimePage(runtime, "Project Roadmap", [
      { blockId: "project-roadmap-body", text: "Project Roadmap body" },
    ]);

    replaceRegisteredPageEditor(
      runtime,
      createBridgeLoadingPageEditor(capturedEditorProps),
    );
    renderReadyApp(runtime);

    await user.click(await findNavigationButton(/^today\b/i));

    const navigation = await screen.findByRole("navigation", {
      name: /^Workspace$/i,
    });
    const recentPages = await within(navigation).findByRole("list", {
      name: /^Recent pages$/i,
    });
    const projectRoute = await within(recentPages).findByRole("button", {
      name: /Project Roadmap/i,
    });

    expect(within(navigation).getByText("Recent pages")).toBeVisible();
    expect(projectRoute).toBeVisible();

    await user.click(projectRoute);

    expect(projectRoute).toHaveAttribute("aria-current", "page");
    expect(await screen.findByText("Project Roadmap body")).toBeVisible();
    expect(latestCapturedPageId(capturedEditorProps)).toBe(project.id);
  });

  it("routes All Tasks through the saved filter and renders safe page-summary DTOs through task.page-list", async () => {
    const runtime = await createRuntime({
      metadataIds: createMetadataIds(18),
      pageIds: [
        "home-page",
        "todo-task",
        "done-task",
        "plain-note",
        "archived-task",
        "forged-task",
        "unsafe-html-task",
        "unsafe-link-task",
      ],
    });
    const capturedPageListProps: CapturedProps[] = [];
    const user = userEvent.setup({
      advanceTimers: (delay) => vi.advanceTimersByTime(delay),
    });

    createRuntimePage(runtime, homeTitle, []);
    const todo = createRuntimePage(runtime, "Todo task", []);
    const done = createRuntimePage(runtime, "Done task", []);
    const plainNote = createRuntimePage(runtime, "Plain note", []);
    const archived = createRuntimePage(runtime, "Archived task", []);
    const forged = createRuntimePage(runtime, "Forged metadata task", []);
    const unsafeHtml = createRuntimePage(runtime, "<img onerror=alert(1)>", []);
    const unsafeLink = createRuntimePage(
      runtime,
      "[unsafe](javascript:alert(1))",
      [],
    );

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
    replaceTaskPageListView(runtime, capturedPageListProps);
    renderReadyApp(runtime);

    await user.click(await findNavigationButton(/all tasks/i));

    const taskPages = await screen.findByRole("list", { name: /task pages/i });

    expect(taskPages).toBeVisible();
    expect(within(taskPages).getByText(todo.title)).toBeVisible();
    expect(within(taskPages).getByText(done.title)).toBeVisible();
    expect(within(taskPages).getByText(unsafeHtml.title)).toBeVisible();
    expect(within(taskPages).getByText(unsafeLink.title)).toBeVisible();
    expect(within(taskPages).queryByText(plainNote.title)).not.toBeInTheDocument();
    expect(within(taskPages).queryByText(archived.title)).not.toBeInTheDocument();
    expect(within(taskPages).queryByText(forged.title)).not.toBeInTheDocument();
    expectNoDangerousDom();
    expectFilterViewReceivedOnlyPageSummaryDtos(capturedPageListProps, [
      todo,
      done,
      unsafeHtml,
      unsafeLink,
    ], { filterIds: [allTasksFilterId] });
    expect(await findNavigationButton(/all tasks/i)).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("routes Today using the deterministic current date and only unfinished due or scheduled task pages", async () => {
    const runtime = await createRuntime({
      metadataIds: createMetadataIds(30),
      pageIds: [
        "home-page",
        "due-today",
        "scheduled-today",
        "done-today",
        "future-task",
        "invalid-date-task",
        "string-date-task",
        "no-date-task",
      ],
    });
    const capturedPageListProps: CapturedProps[] = [];
    const user = userEvent.setup({
      advanceTimers: (delay) => vi.advanceTimersByTime(delay),
    });

    createRuntimePage(runtime, homeTitle, []);
    const dueToday = createRuntimePage(runtime, "Due today", []);
    const scheduledToday = createRuntimePage(runtime, "Scheduled today", []);
    const doneToday = createRuntimePage(runtime, "Done today", []);
    const future = createRuntimePage(runtime, "Future task", []);
    const invalidDate = createRuntimePage(runtime, "Invalid date task", []);
    const stringDate = createRuntimePage(runtime, "String date task", []);
    const noDate = createRuntimePage(runtime, "No date task", []);

    setTaskMetadata(runtime, dueToday, { due: fixedToday, status: "todo" });
    setTaskMetadata(runtime, scheduledToday, {
      scheduled: fixedToday,
      status: "todo",
    });
    setTaskMetadata(runtime, doneToday, { due: fixedToday, status: "done" });
    setTaskMetadata(runtime, future, { due: "2026-05-22", status: "todo" });
    setTaskMetadata(runtime, invalidDate, {
      due: "not-a-date",
      status: "todo",
    });
    setTaskMetadata(runtime, stringDate, {
      due: fixedToday,
      dueValueType: "string",
      status: "todo",
    });
    setTaskMetadata(runtime, noDate, { status: "todo" });
    replaceTaskPageListView(runtime, capturedPageListProps);
    renderReadyApp(runtime);

    await user.click(await findNavigationButton(/^today\b/i));

    const taskPages = await screen.findByRole("list", { name: /task pages/i });

    expect(within(taskPages).getByText(dueToday.title)).toBeVisible();
    expect(within(taskPages).getByText(scheduledToday.title)).toBeVisible();
    expect(within(taskPages).queryByText(doneToday.title)).not.toBeInTheDocument();
    expect(within(taskPages).queryByText(future.title)).not.toBeInTheDocument();
    expect(within(taskPages).queryByText(invalidDate.title)).not.toBeInTheDocument();
    expect(within(taskPages).queryByText(stringDate.title)).not.toBeInTheDocument();
    expect(within(taskPages).queryByText(noDate.title)).not.toBeInTheDocument();
    expectFilterViewReceivedOnlyPageSummaryDtos(capturedPageListProps, [
      dueToday,
      scheduledToday,
    ], { filterIds: [todayFilterId] });
    expect(await findNavigationButton(/^today\b/i)).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("routes Inbox through public Quick Capture save semantics and ignores a title-only Inbox page", async () => {
    const runtime = await createRuntime({
      metadataIds: createMetadataIds(6),
      pageIds: ["user-inbox", "trusted-inbox", "home-page"],
    });
    const capturedPageListProps: CapturedProps[] = [];
    const user = userEvent.setup({
      advanceTimers: (delay) => vi.advanceTimersByTime(delay),
    });
    createRuntimePage(runtime, "Inbox", [
      { blockId: "user-inbox-body", text: "User-owned Inbox body" },
    ]);

    await expect(
      runtime.commands.execute(quickCaptureSaveCommandId, {
        markdown: "Trusted Quick Capture Inbox body",
      }),
    ).resolves.toMatchObject({
      createdInbox: true,
      kind: "quick-capture.save-result",
      pageId: "trusted-inbox",
    });
    createRuntimePage(runtime, homeTitle, []);
    const trustedInbox = runtime.pages.get("trusted-inbox");

    replaceTaskPageListView(runtime, capturedPageListProps);
    renderReadyApp(runtime);

    await user.click(await findNavigationButton(/^inbox\b/i));

    const taskPages = await screen.findByRole("list", { name: /task pages/i });

    expect(within(taskPages).getByText(trustedInbox.title)).toBeVisible();
    expect(screen.queryByText("User-owned Inbox body")).not.toBeInTheDocument();
    expectFilterViewReceivedOnlyPageSummaryDtos(capturedPageListProps, [
      trustedInbox,
    ], { filterIds: [inboxFilterId] });
    expect(await findNavigationButton(/^inbox\b/i)).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("shows public tag saved filters in the Drawer even when their names contain a primary route label", async () => {
    const runtime = await createRuntime({
      filterIds: ["tag-filter-today"],
      metadataIds: createMetadataIds(2),
      pageIds: ["home-page", "tagged-today-page", "untagged-page"],
    });
    const capturedPageListProps: CapturedProps[] = [];
    const user = userEvent.setup({
      advanceTimers: (delay) => vi.advanceTimersByTime(delay),
    });

    createRuntimePage(runtime, homeTitle, []);
    const tagged = createRuntimePage(runtime, "Tagged Today Note", [
      { blockId: "tagged-body", text: "Visible tagged page body" },
    ]);
    const untagged = createRuntimePage(runtime, "Untagged Today Note", [
      { blockId: "untagged-body", text: "This page should not match #today" },
    ]);

    await runtime.commands.execute(tagAddCommandId, {
      pageId: tagged.id,
      tag: "today",
    });
    await expect(
      runtime.commands.execute(tagCreateFilterCommandId, { tag: "today" }),
    ).resolves.toStrictEqual({ filterId: "tag-filter-today" });
    replaceTaskPageListView(runtime, capturedPageListProps);
    renderReadyApp(runtime);

    const savedFilters = await screen.findByRole("list", {
      name: /^Saved filters$/i,
    });
    const todayTagFilter = await within(savedFilters).findByRole("button", {
      name: /#today/i,
    });

    await user.click(todayTagFilter);

    const taskPages = await screen.findByRole("list", { name: /task pages/i });

    expect(todayTagFilter).toHaveAttribute("aria-current", "page");
    expect(within(taskPages).getByText(tagged.title)).toBeVisible();
    expect(within(taskPages).queryByText(untagged.title)).not.toBeInTheDocument();
    expectFilterViewReceivedOnlyPageSummaryDtos(capturedPageListProps, [tagged], {
      filterIds: ["tag-filter-today"],
    });
  });

  it("renders empty filter results through filter.empty_state SlotHost with only minimal props", async () => {
    const runtime = await createRuntime({
      pageIds: ["home-page"],
    });
    const capturedEmptyStateProps: CapturedProps[] = [];
    const user = userEvent.setup({
      advanceTimers: (delay) => vi.advanceTimersByTime(delay),
    });

    createRuntimePage(runtime, homeTitle, []);
    replaceFilterEmptyStateSlot(runtime, capturedEmptyStateProps);
    renderReadyApp(runtime);

    await user.click(await findNavigationButton(/^today\b/i));

    expect(
      await screen.findByRole("status", { name: /filter empty state/i }),
    ).toHaveTextContent("Today empty via SlotHost");
    expect(capturedEmptyStateProps).toHaveLength(1);
    expect(capturedEmptyStateProps[0]).toStrictEqual({
      filterName: "Today",
    });
    expect(collectForbiddenFilterPropPaths(capturedEmptyStateProps[0])).toStrictEqual(
      [],
    );
    expect(collectFunctionValuePaths(capturedEmptyStateProps[0])).toStrictEqual(
      [],
    );
  });

  it("activates a Drawer filter route with Tab and Enter while preserving active state", async () => {
    const runtime = await createRuntime({
      metadataIds: createMetadataIds(4),
      pageIds: ["home-page", "keyboard-task"],
    });
    const capturedPageListProps: CapturedProps[] = [];
    const user = userEvent.setup({
      advanceTimers: (delay) => vi.advanceTimersByTime(delay),
    });

    createRuntimePage(runtime, homeTitle, []);
    const keyboardTask = createRuntimePage(runtime, "Keyboard routed task", []);

    setTaskMetadata(runtime, keyboardTask, { status: "todo" });
    replaceTaskPageListView(runtime, capturedPageListProps);
    renderReadyApp(runtime);

    const allTasksRoute = await findNavigationButton(/all tasks/i);

    await tabToElement(user, allTasksRoute);
    expect(allTasksRoute).toHaveFocus();

    await user.keyboard("{Enter}");

    expect(allTasksRoute).toHaveAttribute("aria-current", "page");
    const taskPages = await screen.findByRole("list", { name: /task pages/i });

    expect(within(taskPages).getByText(keyboardTask.title)).toBeVisible();
    expectFilterViewReceivedOnlyPageSummaryDtos(capturedPageListProps, [
      keyboardTask,
    ], { filterIds: [allTasksFilterId] });
  });

  it("shows visible redacted states for missing filters, missing views, and unavailable plugin routes", async () => {
    await expectUnavailableRouteState({
      label: "missing filter",
      mutateRuntime(runtime) {
        runtime.filters.delete(allTasksFilterId);
      },
      routeName: /all tasks/i,
    });
    await expectUnavailableRouteState({
      label: "missing view",
      mutateRuntime(runtime) {
        runtime.registries.views.unregister(taskPageListViewId);
      },
      routeName: /all tasks/i,
    });
    await expectUnavailableRouteState({
      label: "unavailable plugin",
      async mutateRuntime(runtime) {
        await deactivatePlugin(runtime, taskPluginId);
      },
      routeName: /all tasks/i,
    });
  });

  it("shows generic unavailable when a saved filter view is missing even if the filter has no matches", async () => {
    const runtime = await createRuntime({
      pageIds: ["home-page"],
    });
    const capturedEmptyStateProps: CapturedProps[] = [];
    const user = userEvent.setup({
      advanceTimers: (delay) => vi.advanceTimersByTime(delay),
    });

    createRuntimePage(runtime, homeTitle, []);
    replaceFilterEmptyStateSlot(runtime, capturedEmptyStateProps);
    runtime.registries.views.unregister(taskPageListViewId);
    renderReadyApp(runtime);

    await user.click(await findNavigationButton(/^today\b/i));

    const state = await findGenericUnavailableState();

    expect(state).toBeVisible();
    expect(capturedEmptyStateProps).toStrictEqual([]);
  });

  it("keeps inactive plugin metadata reservations closed for generic filters over reserved fields", async () => {
    const runtime = await createRuntime({
      metadataIds: createMetadataIds(1),
      pageIds: ["home-page", "forged-inactive-task-page"],
    });
    const capturedPageListProps: CapturedProps[] = [];
    const capturedEmptyStateProps: CapturedProps[] = [];
    const user = userEvent.setup({
      advanceTimers: (delay) => vi.advanceTimersByTime(delay),
    });

    createRuntimePage(runtime, homeTitle, []);
    const forgedPage = createRuntimePage(runtime, "Forged inactive task page", [
      {
        blockId: "forged-task-body",
        text: "FORGED_INACTIVE_TASK_BODY PRIVATE_PAGE_BODY_TOKEN",
      },
    ]);

    await deactivatePlugin(runtime, taskPluginId);
    registerPageListView(runtime, {
      capturedProps: capturedPageListProps,
      pluginId: tagPluginId,
      viewId: "tag.inactive-task-filter-page-list",
    });
    registerFilterEmptyStateSlot(runtime, {
      capturedProps: capturedEmptyStateProps,
      pluginId: tagPluginId,
      slotId: "tag.inactive-task-filter-empty-state",
    });
    runtime.metadata.set({
      pageId: forgedPage.id,
      namespace: "task",
      key: "enabled",
      value: true,
      valueType: "boolean",
      sourcePluginId: tagPluginId,
    });
    runtime.filters.save({
      id: "tag.filter.inactive-task-enabled",
      name: "Inactive Task Ownership",
      query: {
        where: [{ field: "metadata.task.enabled", op: "eq", value: true }],
      },
      sourcePluginId: tagPluginId,
      viewType: pageListViewType,
    });
    renderReadyApp(runtime);

    const savedFilters = await screen.findByRole("list", {
      name: /^Saved filters$/i,
    });

    await user.click(
      await within(savedFilters).findByRole("button", {
        name: /Inactive Task Ownership/i,
      }),
    );

    const state = await findUnavailableOrFilterEmptyState();

    expect(state).toBeVisible();
    expect(screen.queryByRole("list", { name: /task pages/i })).not.toBeInTheDocument();
    expect(capturedPageListProps).toStrictEqual([]);
    expect(document.body.textContent ?? "").not.toContain(forgedPage.id);
    expect(document.body.textContent ?? "").not.toContain(forgedPage.title);
    expect(document.body.textContent ?? "").not.toContain(
      "FORGED_INACTIVE_TASK_BODY",
    );
  });

  it("does not let active saved filters expose legacy metadata owned by an inactive plugin", async () => {
    const runtime = await createRuntime({
      metadataIds: createMetadataIds(1),
      pageIds: ["home-page", "legacy-task-page"],
    });
    const capturedPageListProps: CapturedProps[] = [];
    const capturedEmptyStateProps: CapturedProps[] = [];
    const user = userEvent.setup({
      advanceTimers: (delay) => vi.advanceTimersByTime(delay),
    });

    createRuntimePage(runtime, homeTitle, []);
    const legacyTaskPage = createRuntimePage(runtime, "Dormant Task Secret", [
      {
        blockId: "legacy-task-body",
        text: "LEGACY_TASK_BODY_TOKEN PRIVATE_PAGE_BODY_TOKEN",
      },
    ]);

    runtime.metadata.set({
      pageId: legacyTaskPage.id,
      namespace: "task",
      key: "enabled",
      value: true,
      valueType: "boolean",
      sourcePluginId: taskPluginId,
    });
    await deactivatePlugin(runtime, taskPluginId);
    registerPageListView(runtime, {
      capturedProps: capturedPageListProps,
      pluginId: tagPluginId,
      viewId: "tag.legacy-task-filter-page-list",
    });
    registerFilterEmptyStateSlot(runtime, {
      capturedProps: capturedEmptyStateProps,
      pluginId: tagPluginId,
      slotId: "tag.legacy-task-filter-empty-state",
    });
    runtime.filters.save({
      id: "tag.filter.legacy-task-enabled",
      name: "Inactive Owner Metadata",
      query: {
        where: [{ field: "metadata.task.enabled", op: "eq", value: true }],
      },
      sourcePluginId: tagPluginId,
      viewType: pageListViewType,
    });
    renderReadyApp(runtime);

    const savedFilters = await screen.findByRole("list", {
      name: /^Saved filters$/i,
    });

    await user.click(
      await within(savedFilters).findByRole("button", {
        name: /Inactive Owner Metadata/i,
      }),
    );

    const state = await findUnavailableOrFilterEmptyState();

    expect(state).toBeVisible();
    expect(screen.queryByRole("list", { name: /task pages/i })).not.toBeInTheDocument();
    expect(capturedPageListProps).toStrictEqual([]);
    expect(document.body.textContent ?? "").not.toContain(legacyTaskPage.id);
    expect(document.body.textContent ?? "").not.toContain(legacyTaskPage.title);
    expect(document.body.textContent ?? "").not.toContain("LEGACY_TASK_BODY_TOKEN");
  });

  it("fails closed when plugin ownership data is unavailable for filter source and view checks", async () => {
    const runtime = await createRuntime({
      metadataIds: createMetadataIds(2),
      pageIds: ["home-page", "ownership-unavailable-task-page"],
    });
    const capturedPageListProps: CapturedProps[] = [];
    const user = userEvent.setup({
      advanceTimers: (delay) => vi.advanceTimersByTime(delay),
    });

    createRuntimePage(runtime, homeTitle, []);
    const taskPage = createRuntimePage(runtime, "Ownership Data Task", [
      {
        blockId: "ownership-unavailable-body",
        text: "OWNERSHIP_UNAVAILABLE_BODY_TOKEN PRIVATE_PAGE_BODY_TOKEN",
      },
    ]);

    setTaskMetadata(runtime, taskPage, { status: "todo" });
    replaceTaskPageListView(runtime, capturedPageListProps);
    removePluginOwnershipData(runtime);
    renderReadyApp(runtime);

    await user.click(await findNavigationButton(/all tasks/i));

    const state = await findGenericUnavailableState();

    expect(state).toBeVisible();
    expect(screen.queryByRole("list", { name: /task pages/i })).not.toBeInTheDocument();
    expect(capturedPageListProps).toStrictEqual([]);
    expect(document.body.textContent ?? "").not.toContain(taskPage.id);
    expect(document.body.textContent ?? "").not.toContain(taskPage.title);
    expect(document.body.textContent ?? "").not.toContain(
      "OWNERSHIP_UNAVAILABLE_BODY_TOKEN",
    );
  });

  it("keeps user pages titled like primary routes visible in Recent pages and opens them through the editor", async () => {
    const runtime = await createRuntime({
      pageIds: ["home-page", "user-today-page"],
    });
    const capturedEditorProps: CapturedProps[] = [];
    const user = userEvent.setup({
      advanceTimers: (delay) => vi.advanceTimersByTime(delay),
    });

    createRuntimePage(runtime, homeTitle, []);
    const userTodayPage = createRuntimePage(runtime, "Today", [
      { blockId: "user-today-body", text: "User page named Today body" },
    ]);

    replaceRegisteredPageEditor(
      runtime,
      createBridgeLoadingPageEditor(capturedEditorProps),
    );
    renderReadyApp(runtime);

    const navigation = await screen.findByRole("navigation", {
      name: /^Workspace$/i,
    });
    const workspaceRoutes = within(navigation).getByRole("list", {
      name: /^Workspace routes$/i,
    });
    const recentPages = await within(navigation).findByRole("list", {
      name: /^Recent pages$/i,
    });
    const primaryTodayRoute = within(workspaceRoutes).getByRole("button", {
      name: /^Today\b/i,
    });
    const recentTodayRoute = await within(recentPages).findByRole("button", {
      name: /^Today\b/i,
    });

    expect(primaryTodayRoute).not.toHaveAttribute("aria-current", "page");

    await user.click(recentTodayRoute);

    expect(recentTodayRoute).toHaveAttribute("aria-current", "page");
    expect(await screen.findByText("User page named Today body")).toBeVisible();
    expect(latestCapturedPageId(capturedEditorProps)).toBe(userTodayPage.id);
  });
});

describe("TASK-038 static App Shell navigation boundaries", () => {
  it("keeps App Shell out of business-plugin private imports, private view constants, and raw native APIs", async () => {
    const appShellFiles = await listExistingSourceFiles(appShellEntrypoints);
    const violations: string[] = [];

    expect(appShellFiles).toContain(path.join(repoRoot, "src", "App.tsx"));

    for (const filePath of appShellFiles) {
      const source = await readFile(filePath, "utf8");
      const relativePath = toRepoRelativePath(filePath);

      for (const moduleSpecifier of collectStaticModuleSpecifiers(source)) {
        const resolvedModule = resolveModuleSpecifier(filePath, moduleSpecifier);
        const violation = findForbiddenTask038AppShellImport(resolvedModule);

        if (violation !== undefined) {
          violations.push(`${relativePath} -> ${moduleSpecifier}: ${violation}`);
        }
      }

      violations.push(
        ...findForbiddenTask038PrivateSymbolUses(source).map(
          (violation) => `${relativePath}: ${violation}`,
        ),
      );
    }

    expect(violations).toStrictEqual([]);
  });

  it("keeps removed MUI v9 and React 19 test APIs out of the shell/navigation slice", async () => {
    const sourceFiles = await readSourceFilesIfExists(path.join(repoRoot, "src"));
    const violations = sourceFiles
      .filter(
        ({ filePath }) =>
          filePath !== "src/test/sidebar-page-filter-navigation.test.tsx",
      )
      .flatMap((sourceFile) => [
        ...findRemovedMuiApiPatterns(sourceFile),
        ...findRemovedReactTestApiPatterns(sourceFile),
      ]);

    expect(violations).toStrictEqual([]);
  });

  it("keeps package, lock, Tauri, Rust, IPC, capability, permission, and release surfaces unchanged", async () => {
    expect(
      await disallowedNativeSurfaceChanges(
        await listTask038SurfaceChangesFromMaster(),
      ),
    ).toStrictEqual([]);
  });
});

function renderReadyApp(runtime: AppRuntime): RenderResult {
  return render(<App initializeRuntime={vi.fn(async () => runtime)} />);
}

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

function createRuntimePage(
  runtime: AppRuntime,
  title: string,
  lines: readonly SourceLine[],
): MarkdownPage {
  return runtime.pages.create({
    title,
    body: structuredDocument(lines),
  });
}

function structuredDocument(
  lines: readonly SourceLine[],
): StructuredMarkdownDocument {
  return {
    type: "doc",
    content: lines.map((line): BlockNode => {
      const block: BlockNode = {
        blockId: line.blockId,
        type: "markdown.line",
        text: line.text,
      };

      if (line.attrs !== undefined) {
        block.attrs = line.attrs;
      }

      return block;
    }),
  };
}

function setTaskMetadata(
  runtime: AppRuntime,
  page: MarkdownPage,
  input: {
    due?: string;
    dueValueType?: MetadataValueType;
    scheduled?: string;
    scheduledValueType?: MetadataValueType;
    status: "todo" | "done";
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

function replaceRegisteredPageEditor(
  runtime: AppRuntime,
  component: ComponentType<CapturedProps>,
): void {
  runtime.registries.views.unregister(markdownPageViewId);
  runtime.registries.views.register({
    id: markdownPageViewId,
    pluginId: "markdown",
    type: pageEditorViewType,
    title: "Replacement Markdown page editor",
    component,
    accepts: {
      kind: "markdown-page",
    },
  });
}

function createBridgeLoadingPageEditor(
  capturedProps: CapturedProps[],
): ComponentType<CapturedProps> {
  return function BridgeLoadingPageEditor(props: CapturedProps) {
    const bridge = useMarkdownWorkspaceBridge();
    const pageId = readCapturedPageId(props);
    const [markdown, setMarkdown] = useState("registered editor loading");

    capturedProps.push(props);

    useEffect(() => {
      let active = true;

      if (bridge === undefined || pageId === undefined) {
        setMarkdown("registered editor unavailable");

        return () => {
          active = false;
        };
      }

      void bridge.pages.load(pageId).then(
        (page) => {
          if (active) {
            setMarkdown(page.markdown);
          }
        },
        () => {
          if (active) {
            setMarkdown("registered editor unavailable");
          }
        },
      );

      return () => {
        active = false;
      };
    }, [bridge, pageId]);

    return (
      <section aria-label="Registered route editor">
        <p>Registered route editor</p>
        <p aria-label="Registered editor page body" role="status">
          {markdown}
        </p>
      </section>
    );
  };
}

function replaceTaskPageListView(
  runtime: AppRuntime,
  capturedProps: CapturedProps[],
): void {
  runtime.registries.views.unregister(taskPageListViewId);
  registerPageListView(runtime, {
    capturedProps,
    pluginId: taskPluginId,
    viewId: taskPageListViewId,
  });
}

function registerPageListView(
  runtime: AppRuntime,
  {
    capturedProps,
    pluginId,
    viewId,
  }: {
    capturedProps: CapturedProps[];
    pluginId: string;
    viewId: string;
  },
): void {
  runtime.registries.views.register({
    id: viewId,
    pluginId,
    type: pageListViewType,
    title: "Replacement page list",
    component: createCapturingPageListView(capturedProps),
    accepts: {
      kind: filterResultsKind,
    },
  });
}

function createCapturingPageListView(
  capturedProps: CapturedProps[],
): ComponentType<CapturedProps> {
  return function CapturingPageListView(props: CapturedProps) {
    capturedProps.push(props);
    const pages = readPageSummariesFromProps(props);

    return (
      <ul aria-label="Task pages">
        {pages.map((page) => (
          <li key={page.routeToken}>{page.title}</li>
        ))}
      </ul>
    );
  };
}

function replaceFilterEmptyStateSlot(
  runtime: AppRuntime,
  capturedProps: CapturedProps[],
): void {
  runtime.registries.slots.unregister(taskEmptyStateSlotId);
  registerFilterEmptyStateSlot(runtime, {
    capturedProps,
    pluginId: taskPluginId,
    slotId: taskEmptyStateSlotId,
  });
}

function registerFilterEmptyStateSlot(
  runtime: AppRuntime,
  {
    capturedProps,
    pluginId,
    slotId,
  }: {
    capturedProps: CapturedProps[];
    pluginId: string;
    slotId: string;
  },
): void {
  runtime.registries.slots.register({
    id: slotId,
    pluginId,
    slot: filterEmptyStateSlot,
    order: 100,
    component: (props: CapturedProps) => {
      capturedProps.push(props);

      return (
        <p aria-label="Filter empty state" role="status">
          {String(props.filterName)} empty via SlotHost
        </p>
      );
    },
  });
}

async function findNavigationButton(name: RegExp): Promise<HTMLElement> {
  const navigation = await screen.findByRole("navigation", {
    name: /^Workspace$/i,
  });

  return within(navigation).findByRole("button", { name });
}

async function tabToElement(
  user: ReturnType<typeof userEvent.setup>,
  target: HTMLElement,
): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (document.activeElement === target) {
      return;
    }

    await user.tab();
  }

  throw new Error("Expected target Drawer item to be reachable by Tab");
}

async function expectUnavailableRouteState({
  label,
  mutateRuntime,
  routeName,
}: {
  label: string;
  mutateRuntime(runtime: AppRuntime): void | Promise<void>;
  routeName: RegExp;
}): Promise<void> {
  const runtime = await createRuntime({
    metadataIds: createMetadataIds(4),
    pageIds: ["home-page", `${label.replace(/\s+/gu, "-")}-private-page`],
  });
  const user = userEvent.setup({
    advanceTimers: (delay) => vi.advanceTimersByTime(delay),
  });

  createRuntimePage(runtime, homeTitle, []);
  const sensitivePage = createRuntimePage(runtime, `${label} private title`, [
    {
      blockId: `${label.replace(/\s+/gu, "-")}-secret-block`,
      text: "PRIVATE_PAGE_BODY_TOKEN SELECT * FROM core_pages /home/aac6fef/secret.md",
    },
  ]);

  setTaskMetadata(runtime, sensitivePage, { status: "todo" });
  await mutateRuntime(runtime);

  const { unmount } = renderReadyApp(runtime);

  await user.click(await findNavigationButton(routeName));

  const state = await findGenericUnavailableState();

  expect(state).toBeVisible();
  expect(state).toHaveTextContent(/unavailable|not available|missing|could not load/i);
  expectNoSensitiveRouteLeak();
  unmount();
}

async function findGenericUnavailableState(): Promise<HTMLElement> {
  let state: HTMLElement | null = null;

  await waitFor(() => {
    state =
      screen.queryByRole("alert") ??
      screen.queryByRole("status", { name: /route|filter|view/i });

    expect(state).toBeDefined();
  });

  if (state === null) {
    throw new Error("Expected a generic unavailable state");
  }

  return state;
}

async function findUnavailableOrFilterEmptyState(): Promise<HTMLElement> {
  let state: HTMLElement | null = null;

  await waitFor(() => {
    state =
      screen.queryByRole("alert", { name: /route unavailable/i }) ??
      screen.queryByRole("status", { name: /filter empty state/i }) ??
      screen.queryByRole("status", { name: /route|filter|view/i });

    expect(state).toBeDefined();
  });

  if (state === null) {
    throw new Error("Expected an unavailable or empty filter state");
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

function removePluginOwnershipData(runtime: AppRuntime): void {
  const host = runtime.pluginHost as AppRuntime["pluginHost"] & {
    listPlugins?: AppRuntime["pluginHost"]["listPlugins"];
  };

  Object.defineProperty(host, "listPlugins", {
    configurable: true,
    value: undefined,
  });
}

function latestCapturedPageId(capturedProps: readonly CapturedProps[]): string {
  const latestProps = capturedProps[capturedProps.length - 1];
  const pageId = latestProps === undefined ? undefined : readCapturedPageId(latestProps);

  if (pageId === undefined) {
    throw new Error("Expected registered editor props to include a pageId");
  }

  return pageId;
}

function readCapturedPageId(props: CapturedProps): string | undefined {
  const data = props.data;

  if (!isRecord(data)) {
    return undefined;
  }

  return typeof data.pageId === "string" ? data.pageId : undefined;
}

function readPageSummariesFromProps(props: CapturedProps): PageSummary[] {
  const pages = props.pages;

  if (!Array.isArray(pages)) {
    return [];
  }

  return pages.map((page) => {
    if (!isRecord(page)) {
      return {
        routeToken: "invalid-page",
        title: "invalid page",
      };
    }

    return {
      routeToken: readPageRouteToken(page) ?? "missing-route-token",
      title: typeof page.title === "string" ? page.title : "missing title",
    };
  });
}

function expectFilterViewReceivedOnlyPageSummaryDtos(
  capturedProps: readonly CapturedProps[],
  expectedPages: readonly MarkdownPage[],
  options: {
    filterIds?: readonly string[];
  } = {},
): void {
  expect(capturedProps.length).toBeGreaterThan(0);

  const latestProps = capturedProps[capturedProps.length - 1];

  expect(latestProps).toBeDefined();

  if (latestProps === undefined) {
    return;
  }

  const pages = latestProps.pages;

  expect(Array.isArray(pages)).toBe(true);

  if (!Array.isArray(pages)) {
    return;
  }

  expect(pages.map(readPageSummaryTitle)).toStrictEqual(
    expectedPages.map((page) => page.title),
  );
  expect(collectForbiddenFilterPropPaths(latestProps)).toStrictEqual([]);
  expect(collectFunctionValuePaths(latestProps)).toStrictEqual([]);
  expect(
    collectForbiddenFilterPropValuePaths(latestProps, {
      filterIds: options.filterIds ?? [],
      pages: expectedPages,
    }),
  ).toStrictEqual([]);

  for (const page of pages) {
    expect(isRecord(page)).toBe(true);

    if (!isRecord(page)) {
      continue;
    }

    const keys = Object.keys(page).sort();
    const routeTokenKeys = keys.filter(isAllowedRouteTokenKey);

    expect(keys.every((key) => isAllowedPageSummaryKey(key))).toBe(true);
    expect(routeTokenKeys).toHaveLength(1);
    expect(typeof page.title).toBe("string");

    const routeTokenKey = routeTokenKeys[0];

    expect(routeTokenKey).toBeDefined();

    if (routeTokenKey !== undefined) {
      expect(typeof page[routeTokenKey]).toBe("string");
    }
  }
}

function readPageSummaryTitle(value: unknown): string | undefined {
  return isRecord(value) && typeof value.title === "string"
    ? value.title
    : undefined;
}

function readPageRouteToken(page: Record<string, unknown>): string | undefined {
  for (const key of ["routeToken", "routeKey", "key", "id"]) {
    const value = page[key];

    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }

  return undefined;
}

function isAllowedPageSummaryKey(key: string): boolean {
  return key === "title" || isAllowedRouteTokenKey(key);
}

function isAllowedRouteTokenKey(key: string): boolean {
  return key === "id" || key === "key" || key === "routeKey" || key === "routeToken";
}

function collectForbiddenFilterPropPaths(
  value: unknown,
  pathPrefix = "props",
): string[] {
  if (!isRecord(value) && !Array.isArray(value)) {
    return [];
  }

  return Object.entries(value).flatMap(([key, nestedValue]) => {
    const pathName = `${pathPrefix}.${key}`;
    const ownViolation = isForbiddenFilterPropKey(key) ? [pathName] : [];

    if (typeof nestedValue === "function") {
      return ownViolation;
    }

    if (isRecord(nestedValue) || Array.isArray(nestedValue)) {
      return [
        ...ownViolation,
        ...collectForbiddenFilterPropPaths(nestedValue, pathName),
      ];
    }

    return ownViolation;
  });
}

function collectFunctionValuePaths(
  value: unknown,
  pathPrefix = "props",
): string[] {
  if (!isRecord(value) && !Array.isArray(value)) {
    return [];
  }

  return Object.entries(value).flatMap(([key, nestedValue]) => {
    const pathName = `${pathPrefix}.${key}`;

    if (typeof nestedValue === "function") {
      return [pathName];
    }

    if (isRecord(nestedValue) || Array.isArray(nestedValue)) {
      return collectFunctionValuePaths(nestedValue, pathName);
    }

    return [];
  });
}

function collectForbiddenFilterPropValuePaths(
  value: unknown,
  {
    filterIds,
    pages,
  }: {
    filterIds: readonly string[];
    pages: readonly MarkdownPage[];
  },
  pathPrefix = "props",
): string[] {
  const forbiddenValues = new Set([
    ...filterIds,
    ...pages.map((page) => page.id),
    ...pages.flatMap(collectMarkdownPageBodyText),
  ]);

  return collectForbiddenStringValuePaths(value, forbiddenValues, pathPrefix);
}

function collectForbiddenStringValuePaths(
  value: unknown,
  forbiddenValues: ReadonlySet<string>,
  pathPrefix: string,
): string[] {
  if (typeof value === "string") {
    return forbiddenValues.has(value) ? [pathPrefix] : [];
  }

  if (!isRecord(value) && !Array.isArray(value)) {
    return [];
  }

  return Object.entries(value).flatMap(([key, nestedValue]) =>
    collectForbiddenStringValuePaths(
      nestedValue,
      forbiddenValues,
      `${pathPrefix}.${key}`,
    ),
  );
}

function collectMarkdownPageBodyText(page: MarkdownPage): string[] {
  return collectStructuredDocumentText(page.body).filter(
    (text) => text.trim().length > 0,
  );
}

function collectStructuredDocumentText(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }

  if (!isRecord(value) && !Array.isArray(value)) {
    return [];
  }

  return Object.values(value).flatMap(collectStructuredDocumentText);
}

function isForbiddenFilterPropKey(key: string): boolean {
  return new Set([
    "body",
    "commandregistry",
    "commands",
    "db",
    "events",
    "execute",
    "file",
    "files",
    "filter",
    "filterid",
    "filesystem",
    "fs",
    "handles",
    "metadata",
    "pageid",
    "native",
    "nativebridge",
    "pagebody",
    "path",
    "pluginhost",
    "query",
    "queryjson",
    "registries",
    "runtime",
    "sourcepluginid",
    "sql",
    "stores",
    "tauri",
  ]).has(key.toLowerCase().replace(/[-_]/gu, ""));
}

function expectNoSensitiveRouteLeak(): void {
  const text = document.body.textContent ?? "";

  expect(text).not.toMatch(
    /PRIVATE_PAGE_BODY_TOKEN|SELECT\s+\*|core_pages|\/home\/aac6fef|secret\.md|metadata\.task\.enabled|task\.filter\.all-tasks|task\.page-list|quick-capture\.filter\.inbox|trusted-inbox|user-inbox|stack|PluginHost|NativeBridge|Bearer|token|secret/i,
  );
}

function expectNoDangerousDom(): void {
  // eslint-disable-next-line testing-library/no-node-access -- security assertion requires DOM sink inspection.
  expect(document.querySelector("script")).toBeNull();
  // eslint-disable-next-line testing-library/no-node-access -- security assertion requires DOM sink inspection.
  expect(document.querySelector("img")).toBeNull();
  // eslint-disable-next-line testing-library/no-node-access -- security assertion requires DOM sink inspection.
  expect(document.querySelector("iframe")).toBeNull();

  for (const element of [...document.querySelectorAll("*")]) {
    for (const attribute of [...element.attributes]) {
      expect(attribute.name).not.toMatch(/^on/iu);
      expect(attribute.value).not.toMatch(/javascript:|data:text\/html|<script\b/iu);
    }
  }
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function listExistingSourceFiles(
  relativePaths: readonly string[],
): Promise<string[]> {
  const fileGroups = await Promise.all(
    relativePaths.map((relativePath) =>
      listSourceFilesIfExists(path.join(repoRoot, relativePath)),
    ),
  );

  return fileGroups.flat().sort();
}

async function listSourceFilesIfExists(absolutePath: string): Promise<string[]> {
  const entry = await statIfExists(absolutePath);

  if (entry === undefined) {
    return [];
  }

  if (entry.isFile()) {
    return sourceExtensions.has(path.extname(absolutePath)) ? [absolutePath] : [];
  }

  if (!entry.isDirectory()) {
    return [];
  }

  const childEntries = await readdir(absolutePath, { withFileTypes: true });
  const childFiles = await Promise.all(
    childEntries.map((childEntry) =>
      listSourceFilesIfExists(path.join(absolutePath, childEntry.name)),
    ),
  );

  return childFiles.flat();
}

async function readSourceFilesIfExists(
  absolutePath: string,
): Promise<SourceFile[]> {
  const filePaths = await listSourceFilesIfExists(absolutePath);
  const sourceFiles = await Promise.all(
    filePaths.map(async (filePath) => ({
      filePath: toRepoRelativePath(filePath),
      source: await readFile(filePath, "utf8"),
    })),
  );

  return sourceFiles.sort((left, right) =>
    left.filePath.localeCompare(right.filePath),
  );
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

function collectStaticModuleSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const importExportPattern =
    /\b(?:import|export)\s+(?:type\s+)?(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g;
  const sideEffectImportPattern = /\bimport\s*["']([^"']+)["']/g;
  const dynamicImportPattern = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;
  const commonJsRequirePattern = /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g;

  for (const match of source.matchAll(importExportPattern)) {
    const moduleSpecifier = match[1];

    if (moduleSpecifier !== undefined) {
      specifiers.push(moduleSpecifier);
    }
  }

  for (const match of source.matchAll(sideEffectImportPattern)) {
    const moduleSpecifier = match[1];

    if (moduleSpecifier !== undefined) {
      specifiers.push(moduleSpecifier);
    }
  }

  for (const match of source.matchAll(dynamicImportPattern)) {
    const moduleSpecifier = match[1];

    if (moduleSpecifier !== undefined) {
      specifiers.push(moduleSpecifier);
    }
  }

  for (const match of source.matchAll(commonJsRequirePattern)) {
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

function findForbiddenTask038AppShellImport(
  resolvedModule: string,
): string | undefined {
  const normalized = resolvedModule.toLowerCase();

  if (/@tauri-apps\/api(?:\/|$)/u.test(normalized)) {
    return "raw Tauri API import";
  }

  if (
    /(?:^|\/)plugins\/(?:task|tag|quick-capture|search|markdown-editor)(?:\/|$)/u.test(
      normalized,
    )
  ) {
    return "business plugin private implementation import";
  }

  if (
    /(?:^|\/)(?:task|tag|quick-capture|search|markdown-editor)\/(?:components|constants|plugin|views|private)(?:\/|$)/u.test(
      normalized,
    )
  ) {
    return "business plugin private module import";
  }

  if (
    /(?:^|\/)core\/(?:native|tauri|ipc|filesystem|files|db|sqlite)(?:\/|$)/u.test(
      normalized,
    )
  ) {
    return "raw native or persistence owner import";
  }

  return undefined;
}

function findForbiddenTask038PrivateSymbolUses(source: string): string[] {
  const forbiddenPatterns = new Map<RegExp, string>([
    [/\bTaskPageListView\b/u, "imports or references TaskPageListView directly"],
    [/\bTaskFilterEmptyState\b/u, "imports or references TaskFilterEmptyState directly"],
    [/\bQuickCapturePlugin\b/u, "imports or references QuickCapturePlugin directly"],
    [/\bQuickCaptureModalView\b/u, "imports or references QuickCapture modal directly"],
    [/\bQuickCaptureMobileInputView\b/u, "imports or references QuickCapture mobile input directly"],
    [/\b(?:quickCapture|inboxFilter|taskPageListView)Id\b/u, "imports plugin-private id constants"],
    [/\bwindow\.__TAURI__\b/u, "uses raw window.__TAURI__"],
  ]);

  return [...forbiddenPatterns.entries()]
    .filter(([pattern]) => pattern.test(source))
    .map(([, description]) => description);
}

function findRemovedMuiApiPatterns({ filePath, source }: SourceFile): string[] {
  const fileHasMuiImport = collectStaticModuleSpecifiers(source).some(
    (moduleSpecifier) =>
      moduleSpecifier.startsWith("@mui/") ||
      moduleSpecifier.startsWith("@material-ui/"),
  );

  if (!fileHasMuiImport) {
    return [];
  }

  const patterns = new Map<RegExp, string>([
    [/<ListItem\b[^>]*\bbutton(?:\s|=|>|\{)/u, "ListItem button prop"],
    [/<[A-Z][\w.:-]*\b[^>]*\bBackdropProps\s*=/u, "BackdropProps prop"],
    [/<[A-Z][\w.:-]*\b[^>]*\bPaperProps\s*=/u, "PaperProps prop"],
    [/<[A-Z][\w.:-]*\b[^>]*\bSlideProps\s*=/u, "SlideProps prop"],
    [/<[A-Z][\w.:-]*\b[^>]*\bTransitionComponent\s*=/u, "TransitionComponent prop"],
    [/<ListItemText\b[^>]*\bprimaryTypographyProps\s*=/u, "ListItemText primaryTypographyProps prop"],
    [/<ListItemText\b[^>]*\bsecondaryTypographyProps\s*=/u, "ListItemText secondaryTypographyProps prop"],
    [/\bcreateMuiTheme\b/u, "createMuiTheme"],
    [/\bMuiThemeProvider\b/u, "MuiThemeProvider"],
    [/\bGridLegacy\b/u, "GridLegacy"],
    [/\bHidden\b/u, "Hidden"],
    [/\bmakeStyles\b/u, "makeStyles"],
    [/from\s+["']@mui\/icons-material["']/u, "MUI icons barrel import"],
    [/from\s+["']@mui\/material["']/u, "MUI material barrel import"],
  ]);

  return [...patterns.entries()]
    .filter(([pattern]) => pattern.test(source))
    .map(([, label]) => `${filePath}: ${label}`);
}

function findRemovedReactTestApiPatterns({
  filePath,
  source,
}: SourceFile): string[] {
  const patterns = new Map<RegExp, string>([
    [/from\s+["']react-dom\/test-utils["']/u, "react-dom/test-utils import"],
    [/\bReactDOM\.render\s*\(/u, "ReactDOM.render"],
    [/\bReactDOM\.hydrate\s*\(/u, "ReactDOM.hydrate"],
    [/\bunmountComponentAtNode\s*\(/u, "unmountComponentAtNode"],
    [/\bfindDOMNode\s*\(/u, "findDOMNode"],
    [/\blegacyRoot\s*:\s*true/u, "legacyRoot"],
  ]);

  return [...patterns.entries()]
    .filter(([pattern]) => pattern.test(source))
    .map(([, label]) => `${filePath}: ${label}`);
}

async function listTask038SurfaceChangesFromMaster(): Promise<string[]> {
  const changedTrackedFiles = await runGitLines([
    "diff",
    "--name-only",
    "master",
    "--",
    ...task038SurfaceEntrypoints,
  ]);
  const untrackedFiles = await runGitLines([
    "ls-files",
    "--others",
    "--exclude-standard",
    "--",
    ...task038SurfaceEntrypoints,
  ]);

  return [...new Set([...changedTrackedFiles, ...untrackedFiles])].sort();
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
