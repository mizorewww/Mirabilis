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
import { StrictMode, useEffect, useState, type ComponentType } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "../App";
import { createAppRuntime, type AppRuntime } from "../bootstrap";
import {
  createCoreStores,
  type BlockNode,
  type CoreStores,
  type DbQuery,
  type MarkdownPage,
  type MetadataJsonValue,
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
  attrs?: Record<string, unknown>;
  blockId: string;
  text: string;
};

type CreateRuntimeOptions = {
  filterIds?: readonly string[];
  metadataIds?: readonly string[];
  pageIds?: readonly string[];
};

type CapturedProps = Record<string, unknown>;

type SourceFile = {
  filePath: string;
  source: string;
};

type DurableRouteState = {
  activeRoute?: {
    filterId?: string;
    kind: string;
    pageId?: string;
    role?: string;
    routeToken?: string;
  };
  homePageId: string;
  recentPageIds: string[];
  version: 1;
};

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const execFileAsync = promisify(execFile);
const homeTitle = "Home";
const appShellRouteNamespace = "app-shell.navigation";
const appShellRouteKey = "route-state";
const appShellRouteOwner = "app-shell";
const durableRouteStateVersion = 1;
const maxRecentPageIds = 8;
const markdownPageViewId = "markdown.page-editor";
const pageEditorViewType = "page.editor";
const taskPluginId = "task";
const taskPageListViewId = "task.page-list";
const pageListViewType = "page.list";
const filterResultsKind = "filter-results.markdown-pages";
const allTasksFilterId = "task.filter.all-tasks";
const appShellEntrypoints = [
  "src/App.tsx",
  "src/main.tsx",
  "src/shell",
  "src/providers",
] as const;
const routePersistenceEntrypoints = [
  "src/App.tsx",
  "src/shell",
  "src/providers",
] as const;
const task047NoDriftEntrypoints = [
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
  "src/plugins/search",
  "src/plugins/sync",
  "src/plugins/ai/providers",
  "src/plugins/ai/settings.ts",
] as const;
const sourceExtensions = new Set([".ts", ".tsx"]);
const viewportRestores: Array<() => void> = [];

afterEach(() => {
  for (const restoreViewport of viewportRestores.splice(0).reverse()) {
    restoreViewport();
  }

  vi.restoreAllMocks();
});

describe("TASK-047 durable navigation route state", () => {
  it("persists a selected page route and restores that page after a fresh app restart", async () => {
    const firstRuntime = await createRuntime({
      metadataIds: ["route-state-record"],
      pageIds: ["home-page", "deep-work-page"],
    });
    const firstHome = createRuntimePage(firstRuntime, homeTitle, [
      { blockId: "home-body", text: "Home body before restart" },
    ]);
    const firstProject = createRuntimePage(firstRuntime, "Deep Work", [
      { blockId: "deep-work-body", text: "Deep Work body before restart" },
    ]);
    const firstCapturedEditorProps: CapturedProps[] = [];
    const user = userEvent.setup();

    replaceRegisteredPageEditor(
      firstRuntime,
      createBridgeLoadingPageEditor(firstCapturedEditorProps),
    );
    const view = renderReadyApp(firstRuntime);

    expect(await screen.findByText("Home body before restart")).toBeVisible();

    await user.click(await findRecentPageButton(/Deep Work/i));

    expect(await screen.findByText("Deep Work body before restart")).toBeVisible();
    expect(latestCapturedPageId(firstCapturedEditorProps)).toBe(firstProject.id);

    await waitFor(() => {
      const routeState = readDurableRouteState(firstRuntime, firstHome.id);

      expect(routeState).toMatchObject({
        activeRoute: {
          kind: "page",
          pageId: firstProject.id,
          role: "recent",
        },
        homePageId: firstHome.id,
        recentPageIds: [firstProject.id],
        version: durableRouteStateVersion,
      });
      expectRouteStateIsIdsOnly(routeState);
    });

    const persistedRouteState = readDurableRouteState(
      firstRuntime,
      firstHome.id,
    );

    view.unmount();

    const restartedRuntime = await createRuntime({
      metadataIds: ["route-state-record"],
      pageIds: ["home-page", "deep-work-page"],
    });
    const restartedHome = createRuntimePage(restartedRuntime, homeTitle, [
      { blockId: "home-body", text: "Home body after restart" },
    ]);
    const restartedProject = createRuntimePage(restartedRuntime, "Deep Work", [
      { blockId: "deep-work-body", text: "Deep Work body after restart" },
    ]);
    const restartedCapturedEditorProps: CapturedProps[] = [];

    seedDurableRouteState(restartedRuntime, restartedHome.id, persistedRouteState);
    replaceRegisteredPageEditor(
      restartedRuntime,
      createBridgeLoadingPageEditor(restartedCapturedEditorProps),
    );
    renderReadyApp(restartedRuntime, { strictMode: true });

    expect(
      await screen.findByRole("heading", { name: /^Deep Work Workspace$/i }),
    ).toBeVisible();
    expect(await screen.findByText("Deep Work body after restart")).toBeVisible();
    expect(latestCapturedPageId(restartedCapturedEditorProps)).toBe(
      restartedProject.id,
    );

    const recentProjectRoute = await findRecentPageButton(/Deep Work/i);

    expect(recentProjectRoute).toHaveAttribute("aria-current", "page");
    expect(readDurableRouteState(restartedRuntime, restartedHome.id)).toMatchObject({
      activeRoute: {
        kind: "page",
        pageId: restartedProject.id,
        role: "recent",
      },
      homePageId: restartedHome.id,
    });
  });

  it("restores an active saved-filter route through ViewHost and keeps active navigation accessible", async () => {
    const runtime = await createRuntime({
      metadataIds: [
        "route-state-record",
        "task-enabled-record",
        "task-status-record",
      ],
      pageIds: ["home-page", "restored-task-page"],
    });
    const home = createRuntimePage(runtime, homeTitle, []);
    const taskPage = createRuntimePage(runtime, "Restored Task", [
      { blockId: "restored-task-body", text: "- [ ] Restored Task" },
    ]);
    const capturedPageListProps: CapturedProps[] = [];

    setTaskMetadata(runtime, taskPage);
    seedDurableRouteState(runtime, home.id, {
      activeRoute: {
        filterId: allTasksFilterId,
        kind: "filter",
        role: "all-tasks",
      },
      homePageId: home.id,
      recentPageIds: [taskPage.id],
      version: durableRouteStateVersion,
    });
    replaceTaskPageListView(runtime, capturedPageListProps);
    renderReadyApp(runtime, { strictMode: true });

    expect(
      await screen.findByRole("heading", { name: /^All Tasks Workspace$/i }),
    ).toBeVisible();
    expect(await screen.findByText("Restored Task")).toBeVisible();

    const navigation = await screen.findByRole("navigation", {
      name: /^Workspace$/i,
    });
    const allTasksRoute = within(navigation).getByRole("button", {
      name: /^All Tasks\b/i,
    });

    expect(allTasksRoute).toHaveAttribute("aria-current", "page");
    expectLatestFilterViewPropsArePageSummaries(capturedPageListProps, [
      taskPage.title,
    ]);
  });

  it("reuses a persisted Home page identity without creating a duplicate Home page", async () => {
    const runtime = await createRuntime({
      metadataIds: ["route-state-record"],
      pageIds: ["durable-home-page", "unexpected-session-home-page"],
    });
    const durableHome = createRuntimePage(runtime, "Renamed Home", [
      { blockId: "renamed-home-body", text: "Renamed durable home body" },
    ]);
    const capturedEditorProps: CapturedProps[] = [];

    seedDurableRouteState(runtime, durableHome.id, {
      activeRoute: {
        kind: "page",
        pageId: durableHome.id,
        role: "home",
      },
      homePageId: durableHome.id,
      recentPageIds: [],
      version: durableRouteStateVersion,
    });
    replaceRegisteredPageEditor(
      runtime,
      createBridgeLoadingPageEditor(capturedEditorProps),
    );
    renderReadyApp(runtime, { strictMode: true });

    expect(await screen.findByText("Renamed durable home body")).toBeVisible();
    expect(latestCapturedPageId(capturedEditorProps)).toBe(durableHome.id);
    expect(runtime.pages.list({ includeArchived: true })).toHaveLength(1);

    const navigation = await screen.findByRole("navigation", {
      name: /^Workspace$/i,
    });
    const homeRoute = within(navigation).getByRole("button", {
      name: /^Home\b/i,
    });

    expect(homeRoute).toHaveAttribute("aria-current", "page");
  });

  it("restores recent pages in persisted order while capping, deduping, and dropping invalid ids", async () => {
    const runtime = await createRuntime({
      metadataIds: ["route-state-record"],
      pageIds: [
        "home-page",
        "alpha-page",
        "beta-page",
        "gamma-page",
        "archived-page",
        "delta-page",
        "epsilon-page",
        "zeta-page",
        "eta-page",
        "theta-page",
        "iota-page",
      ],
    });
    const home = createRuntimePage(runtime, homeTitle, []);
    const alpha = createRuntimePage(runtime, "Alpha Project", []);
    const beta = createRuntimePage(runtime, "Beta Project", []);
    const gamma = createRuntimePage(runtime, "Gamma Project", []);
    const archived = createRuntimePage(runtime, "Archived Project", []);
    const delta = createRuntimePage(runtime, "Delta Project", []);
    const epsilon = createRuntimePage(runtime, "Epsilon Project", []);
    const zeta = createRuntimePage(runtime, "Zeta Project", []);
    const eta = createRuntimePage(runtime, "Eta Project", []);
    const theta = createRuntimePage(runtime, "Theta Project", []);
    const iota = createRuntimePage(runtime, "Iota Project", []);

    runtime.pages.archive(archived.id);
    seedDurableRouteState(runtime, home.id, {
      activeRoute: {
        kind: "page",
        pageId: beta.id,
        role: "recent",
      },
      homePageId: home.id,
      recentPageIds: [
        beta.id,
        "missing-page",
        archived.id,
        alpha.id,
        beta.id,
        home.id,
        gamma.id,
        delta.id,
        epsilon.id,
        zeta.id,
        eta.id,
        theta.id,
        iota.id,
      ],
      version: durableRouteStateVersion,
    });
    renderReadyApp(runtime);

    const recentPages = await screen.findByRole("list", {
      name: /^Recent pages$/i,
    });
    const recentButtons = within(recentPages).getAllByRole("button");
    const expectedRecentNames = [
      /Beta Project/i,
      /Alpha Project/i,
      /Gamma Project/i,
      /Delta Project/i,
      /Epsilon Project/i,
      /Zeta Project/i,
      /Eta Project/i,
      /Theta Project/i,
    ];

    expect(recentButtons).toHaveLength(maxRecentPageIds);
    expectedRecentNames.forEach((name, index) => {
      expect(recentButtons[index]).toHaveAccessibleName(name);
    });
    expect(
      within(recentPages).queryByRole("button", { name: /Home/i }),
    ).not.toBeInTheDocument();
    expect(
      within(recentPages).queryByRole("button", { name: /Archived Project/i }),
    ).not.toBeInTheDocument();
    expect(
      within(recentPages).queryByRole("button", { name: /Iota Project/i }),
    ).not.toBeInTheDocument();
    expect(recentButtons[0]).toHaveAttribute("aria-current", "page");
  });

  it("fails malformed, stale, archived, and unsafe persisted routes closed without leaking route DTO data", async () => {
    const cases: Array<{
      label: string;
      state: MetadataJsonValue;
    }> = [
      {
        label: "malformed object",
        state: {
          bodyMarkdown: "PRIVATE_MARKDOWN_SNIPPET",
          raw: "not a route state",
          version: durableRouteStateVersion,
        },
      },
      {
        label: "unknown route kind with raw projection fields",
        state: {
          activeRoute: {
            bodyMarkdown: "PRIVATE_MARKDOWN_SNIPPET",
            kind: "search.results",
            query: "SELECT * FROM core_pages",
            rawError: "PluginHost stack /home/aac6fef/private.sqlite",
          },
          homePageId: "home-page",
          recentPageIds: ["secret-page"],
          version: durableRouteStateVersion,
        },
      },
      {
        label: "archived page",
        state: {
          activeRoute: {
            kind: "page",
            pageId: "secret-page",
            role: "recent",
          },
          homePageId: "home-page",
          recentPageIds: ["secret-page"],
          version: durableRouteStateVersion,
        },
      },
      {
        label: "wrong owner filter",
        state: {
          activeRoute: {
            filterId: "wrong-owner-filter",
            kind: "filter",
            role: "saved",
            routeToken: "stale-route-token",
          },
          homePageId: "home-page",
          recentPageIds: [],
          version: durableRouteStateVersion,
        },
      },
    ];

    for (const testCase of cases) {
      const runtime = await createRuntime({
        filterIds: ["wrong-owner-filter"],
        metadataIds: ["route-state-record"],
        pageIds: ["home-page", "secret-page"],
      });
      const home = createRuntimePage(runtime, homeTitle, [
        { blockId: "home-body", text: "Safe Home body" },
      ]);
      const secretPage = createRuntimePage(runtime, "Secret Route Page", [
        {
          blockId: "secret-body",
          text: [
            "PRIVATE_MARKDOWN_SNIPPET",
            "SELECT * FROM core_pages",
            "/home/aac6fef/private.sqlite",
            "Bearer SECRET_TOKEN",
          ].join(" "),
        },
      ]);
      const capturedEditorProps: CapturedProps[] = [];

      runtime.pages.archive(secretPage.id);
      runtime.filters.save({
        id: "wrong-owner-filter",
        name: "Unsafe saved filter",
        query: {
          where: [
            {
              field: "metadata.unsafe.secret",
              op: "eq",
              value: "PRIVATE_MARKDOWN_SNIPPET",
            },
          ],
        },
        sourcePluginId: "missing-plugin",
        viewType: pageListViewType,
      });
      seedDurableRouteState(runtime, home.id, testCase.state);
      replaceRegisteredPageEditor(
        runtime,
        createBridgeLoadingPageEditor(capturedEditorProps),
      );

      const view = renderReadyApp(runtime, { strictMode: true });

      await waitFor(() => {
        const unavailable = screen.queryByRole("alert", {
          name: /route unavailable/i,
        });
        const homeBody = screen.queryByText("Safe Home body");

        expect(unavailable ?? homeBody).toBeTruthy();
      });
      expect(document.body.textContent ?? "").not.toMatch(
        /PRIVATE_MARKDOWN_SNIPPET|SELECT\s+\*|core_pages|\/home\/aac6fef|Bearer|SECRET_TOKEN|PluginHost|NativeBridge|stack|provider|sk-test/i,
      );

      view.unmount();
    }
  });

  it("keeps narrow drawer behavior accessible after durable route selection", async () => {
    installViewport(640);
    const runtime = await createRuntime({
      metadataIds: ["route-state-record"],
      pageIds: ["home-page", "project-page"],
    });
    const home = createRuntimePage(runtime, homeTitle, []);
    const project = createRuntimePage(runtime, "Narrow Durable Project", [
      { blockId: "project-body", text: "Narrow durable project body" },
    ]);
    const user = userEvent.setup();

    seedDurableRouteState(runtime, home.id, {
      activeRoute: {
        kind: "page",
        pageId: home.id,
        role: "home",
      },
      homePageId: home.id,
      recentPageIds: [project.id],
      version: durableRouteStateVersion,
    });
    renderReadyApp(runtime);

    const drawerToggle = await screen.findByRole("button", {
      name: /^Workspace navigation$/i,
    });

    expect(drawerToggle).toHaveAttribute("aria-expanded", "false");

    await user.click(drawerToggle);
    await user.click(await findRecentPageButton(/Narrow Durable Project/i));

    expect(drawerToggle).toHaveFocus();
    expect(drawerToggle).toHaveAttribute("aria-expanded", "false");
    await waitFor(() =>
      expect(
        screen.queryByRole("navigation", { name: /^Workspace$/i }),
      ).not.toBeInTheDocument(),
    );

    await user.click(drawerToggle);

    const selectedProject = await findRecentPageButton(/Narrow Durable Project/i);

    expect(selectedProject).toHaveAttribute("aria-current", "page");
  });
});

describe("TASK-047 route-state static guards", () => {
  it("keeps durable navigation persistence on the Core metadata allowlist and out of browser/native storage", async () => {
    const sourceFiles = await readSourceFiles(routePersistenceEntrypoints);
    const joinedSource = sourceFiles
      .map((file) => `${file.filePath}\n${file.source}`)
      .join("\n");

    expect({
      hasRouteKey: joinedSource.includes(appShellRouteKey),
      hasRouteNamespace: joinedSource.includes(appShellRouteNamespace),
    }).toStrictEqual({
      hasRouteKey: true,
      hasRouteNamespace: true,
    });
    expect(sourceFiles.flatMap(findForbiddenRoutePersistenceSource)).toStrictEqual(
      [],
    );
  });

  it("does not drift package, lockfile, Cargo, Tauri, native, Search, Sync, AI provider, or release surfaces", async () => {
    expect(
      await disallowedNativeSurfaceChanges(
        await listTask047NoDriftChangesFromMaster(),
      ),
    ).toStrictEqual([]);
  });

  it("keeps app-shell and tests free of stale MUI, React, and user-event APIs", async () => {
    const appShellFiles = await readSourceFiles(appShellEntrypoints);
    const testFiles = await readSourceFiles(["src/test"]);

    expect([
      ...appShellFiles.flatMap(findRemovedMuiApiPatterns),
      ...appShellFiles.flatMap(findRemovedReactApiPatterns),
      ...testFiles.flatMap(findRemovedReactTestApiPatterns),
      ...testFiles.flatMap(findDirectUserEventCalls),
      ...testFiles.flatMap(findFocusedOrSkippedTests),
    ]).toStrictEqual([]);
  });
});

function renderReadyApp(
  runtime: AppRuntime,
  options: { strictMode?: boolean } = {},
): RenderResult {
  const initializeRuntime = vi.fn(async () => runtime);
  const app = <App initializeRuntime={initializeRuntime} />;

  return render(options.strictMode === true ? <StrictMode>{app}</StrictMode> : app);
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
    body: structuredDocument(lines),
    title,
  });
}

function structuredDocument(
  lines: readonly SourceLine[],
): StructuredMarkdownDocument {
  return {
    content: lines.map((line): BlockNode => {
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

function seedDurableRouteState(
  runtime: AppRuntime,
  homePageId: string,
  value: MetadataJsonValue,
): void {
  runtime.metadata.set({
    key: appShellRouteKey,
    namespace: appShellRouteNamespace,
    pageId: homePageId,
    sourcePluginId: appShellRouteOwner,
    value,
    valueType: "json",
  });
}

function readDurableRouteState(
  runtime: AppRuntime,
  homePageId: string,
): DurableRouteState {
  const record = runtime.metadata.get(
    homePageId,
    appShellRouteNamespace,
    appShellRouteKey,
  );

  expect(record.sourcePluginId).toBe(appShellRouteOwner);
  expect(record.valueType).toBe("json");
  expect(isRecord(record.value)).toBe(true);

  return record.value as DurableRouteState;
}

function expectRouteStateIsIdsOnly(value: unknown): void {
  expect(collectUnsafeRouteStatePaths(value)).toStrictEqual([]);
  expect(collectUnsafeRouteStateStringValues(value)).toStrictEqual([]);
}

function collectUnsafeRouteStatePaths(
  value: unknown,
  pathPrefix = "routeState",
): string[] {
  if (typeof value === "function" || typeof value === "symbol") {
    return [pathPrefix];
  }

  if (!isRecord(value) && !Array.isArray(value)) {
    return [];
  }

  const prototype = Object.getPrototypeOf(value);
  const prototypeViolation =
    Array.isArray(value) ||
    prototype === Object.prototype ||
    prototype === null
      ? []
      : [`${pathPrefix} has non-plain prototype`];

  const descriptorViolations = Reflect.ownKeys(value).flatMap((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    const keyPath = `${pathPrefix}.${String(key)}`;

    if (typeof key === "symbol") {
      return [keyPath];
    }

    if (descriptor === undefined) {
      return [];
    }

    return descriptor.get !== undefined || descriptor.set !== undefined
      ? [keyPath]
      : [];
  });

  return [
    ...prototypeViolation,
    ...descriptorViolations,
    ...Object.entries(value).flatMap(([key, nestedValue]) => {
      const pathName = `${pathPrefix}.${key}`;
      const keyViolation = isForbiddenRouteStateKey(key) ? [pathName] : [];

      return [
        ...keyViolation,
        ...collectUnsafeRouteStatePaths(nestedValue, pathName),
      ];
    }),
  ];
}

function collectUnsafeRouteStateStringValues(
  value: unknown,
  pathPrefix = "routeState",
): string[] {
  if (typeof value === "string") {
    return /```|^- \[[ x]\]|PRIVATE_|SELECT\s+\*|core_pages|\/home\/|C:\\|Bearer|sk-test|OPENAI|provider|secret|password|NativeBridge|PluginHost|stack|function\s*\(/iu.test(
      value,
    )
      ? [pathPrefix]
      : [];
  }

  if (!isRecord(value) && !Array.isArray(value)) {
    return [];
  }

  return Object.entries(value).flatMap(([key, nestedValue]) =>
    collectUnsafeRouteStateStringValues(nestedValue, `${pathPrefix}.${key}`),
  );
}

function isForbiddenRouteStateKey(key: string): boolean {
  return new Set([
    "accessor",
    "body",
    "bodymarkdown",
    "calendar",
    "commandregistry",
    "commands",
    "db",
    "error",
    "events",
    "filter",
    "filesystem",
    "functions",
    "handle",
    "handles",
    "markdown",
    "native",
    "nativebridge",
    "page",
    "params",
    "path",
    "pluginhost",
    "projection",
    "provider",
    "query",
    "rawerror",
    "registry",
    "report",
    "runtime",
    "search",
    "snippet",
    "sql",
    "stack",
    "store",
    "stores",
    "tauri",
    "title",
  ]).has(key.toLowerCase().replace(/[-_]/gu, ""));
}

function setTaskMetadata(runtime: AppRuntime, page: MarkdownPage): void {
  runtime.metadata.set({
    key: "enabled",
    namespace: taskPluginId,
    pageId: page.id,
    sourcePluginId: taskPluginId,
    value: true,
    valueType: "boolean",
  });
  runtime.metadata.set({
    key: "status",
    namespace: taskPluginId,
    pageId: page.id,
    sourcePluginId: taskPluginId,
    value: "todo",
    valueType: "string",
  });
}

function replaceRegisteredPageEditor(
  runtime: AppRuntime,
  component: ComponentType<CapturedProps>,
): void {
  runtime.registries.views.unregister(markdownPageViewId);
  runtime.registries.views.register({
    accepts: {
      kind: "markdown-page",
    },
    component,
    id: markdownPageViewId,
    pluginId: "markdown",
    title: "Replacement Markdown page editor",
    type: pageEditorViewType,
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
  runtime.registries.views.register({
    accepts: {
      kind: filterResultsKind,
    },
    component: createCapturingPageListView(capturedProps),
    id: taskPageListViewId,
    pluginId: taskPluginId,
    title: "Replacement task page list",
    type: pageListViewType,
  });
}

function createCapturingPageListView(
  capturedProps: CapturedProps[],
): ComponentType<CapturedProps> {
  return function CapturingPageListView(props: CapturedProps) {
    capturedProps.push(props);
    const pages = Array.isArray(props.pages) ? props.pages : [];

    return (
      <ul aria-label="Task pages">
        {pages.map((page, index) => {
          const pageRecord = isRecord(page) ? page : {};
          const routeToken =
            typeof pageRecord.routeToken === "string"
              ? pageRecord.routeToken
              : `missing-route-token-${index}`;
          const title =
            typeof pageRecord.title === "string"
              ? pageRecord.title
              : "missing title";

          return <li key={routeToken}>{title}</li>;
        })}
      </ul>
    );
  };
}

function expectLatestFilterViewPropsArePageSummaries(
  capturedProps: readonly CapturedProps[],
  expectedTitles: readonly string[],
): void {
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

  expect(
    pages.map((page) =>
      isRecord(page) && typeof page.title === "string" ? page.title : undefined,
    ),
  ).toStrictEqual(expectedTitles);
  expect(collectUnsafeFilterViewPropPaths(latestProps)).toStrictEqual([]);
  expect(collectUnsafeRouteStateStringValues(latestProps, "props")).toStrictEqual(
    [],
  );
}

function collectUnsafeFilterViewPropPaths(
  value: unknown,
  pathPrefix = "props",
): string[] {
  if (typeof value === "function" || typeof value === "symbol") {
    return [pathPrefix];
  }

  if (!isRecord(value) && !Array.isArray(value)) {
    return [];
  }

  const prototype = Object.getPrototypeOf(value);
  const prototypeViolation =
    Array.isArray(value) ||
    prototype === Object.prototype ||
    prototype === null
      ? []
      : [`${pathPrefix} has non-plain prototype`];

  const descriptorViolations = Reflect.ownKeys(value).flatMap((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    const keyPath = `${pathPrefix}.${String(key)}`;

    if (typeof key === "symbol") {
      return [keyPath];
    }

    if (descriptor === undefined) {
      return [];
    }

    return descriptor.get !== undefined || descriptor.set !== undefined
      ? [keyPath]
      : [];
  });

  return [
    ...prototypeViolation,
    ...descriptorViolations,
    ...Object.entries(value).flatMap(([key, nestedValue]) => {
      const pathName = `${pathPrefix}.${key}`;
      const keyViolation =
        Array.isArray(value) || isAllowedFilterViewPropKey(key)
          ? []
          : [pathName];

      return [
        ...keyViolation,
        ...collectUnsafeFilterViewPropPaths(nestedValue, pathName),
      ];
    }),
  ];
}

function isAllowedFilterViewPropKey(key: string): boolean {
  return new Set(["data", "kind", "pages", "routeToken", "title"]).has(key);
}

async function findRecentPageButton(name: RegExp): Promise<HTMLElement> {
  const navigation = await screen.findByRole("navigation", {
    name: /^Workspace$/i,
  });
  const recentPages = await within(navigation).findByRole("list", {
    name: /^Recent pages$/i,
  });

  return within(recentPages).findByRole("button", { name });
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

function installViewport(width: number): void {
  const previousInnerWidth = window.innerWidth;
  const previousMatchMedia =
    "matchMedia" in window ? window.matchMedia : undefined;

  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: width,
  });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => createMatchMediaList(query, width),
    writable: true,
  });

  viewportRestores.push(() => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: previousInnerWidth,
    });

    if (previousMatchMedia === undefined) {
      Reflect.deleteProperty(window, "matchMedia");
    } else {
      Object.defineProperty(window, "matchMedia", {
        configurable: true,
        value: previousMatchMedia,
        writable: true,
      });
    }
  });
}

function createMatchMediaList(query: string, width: number): MediaQueryList {
  const mediaQueryList: MediaQueryList = {
    addEventListener() {
      return undefined;
    },
    addListener() {
      return undefined;
    },
    dispatchEvent() {
      return true;
    },
    matches: queryMatchesViewport(query, width),
    media: query,
    onchange: null,
    removeEventListener() {
      return undefined;
    },
    removeListener() {
      return undefined;
    },
  };

  return mediaQueryList;
}

function queryMatchesViewport(query: string, width: number): boolean {
  const maxWidth = /max-width:\s*([0-9.]+)px/iu.exec(query)?.[1];

  if (maxWidth !== undefined) {
    return width <= Number(maxWidth);
  }

  const minWidth = /min-width:\s*([0-9.]+)px/iu.exec(query)?.[1];

  if (minWidth !== undefined) {
    return width >= Number(minWidth);
  }

  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function listTask047NoDriftChangesFromMaster(): Promise<string[]> {
  const changedTrackedFiles = await runGitLines([
    "diff",
    "--name-only",
    "master",
    "--",
    ...task047NoDriftEntrypoints,
  ]);
  const untrackedFiles = await runGitLines([
    "ls-files",
    "--others",
    "--exclude-standard",
    "--",
    ...task047NoDriftEntrypoints,
  ]);

  return [...new Set([...changedTrackedFiles, ...untrackedFiles])].sort();
}

async function readSourceFiles(
  relativePaths: readonly string[],
): Promise<SourceFile[]> {
  const fileGroups = await Promise.all(
    relativePaths.map((relativePath) =>
      listSourceFilesIfExists(path.join(repoRoot, relativePath)),
    ),
  );
  const filePaths = fileGroups.flat().sort();

  return Promise.all(
    filePaths.map(async (filePath) => ({
      filePath: toRepoRelativePath(filePath),
      source: await readFile(filePath, "utf8"),
    })),
  );
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

function findForbiddenRoutePersistenceSource({
  filePath,
  source,
}: SourceFile): string[] {
  const patterns = new Map<RegExp, string>([
    [/\blocalStorage\b/u, "browser localStorage route persistence"],
    [/\bsessionStorage\b/u, "browser sessionStorage route persistence"],
    [/\bindexedDB\b/u, "browser IndexedDB route persistence"],
    [/\bnavigator\.storage\b/u, "browser storage manager route persistence"],
    [/@tauri-apps\/plugin-store/u, "Tauri Store route persistence"],
    [/\bnew\s+Store\s*\(/u, "Tauri Store route persistence"],
    [/\bNativeBridge\b.*route/iu, "route-specific NativeBridge surface"],
    [/\bPluginHost\b.*route/iu, "route state stores PluginHost details"],
  ]);

  return [...patterns.entries()]
    .filter(([pattern]) => pattern.test(source))
    .map(([, label]) => `${filePath}: ${label}`);
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
    [/<[A-Z][\w.:-]*\bBackdropProps\s*=/u, "BackdropProps prop"],
    [/<[A-Z][\w.:-]*\bPaperProps\s*=/u, "PaperProps prop"],
    [/<[A-Z][\w.:-]*\bSlideProps\s*=/u, "SlideProps prop"],
    [/<[A-Z][\w.:-]*\bTransitionComponent\s*=/u, "TransitionComponent prop"],
    [
      /<[A-Z][\w.:-]*\bcomponentsProps\s*=/u,
      "deprecated componentsProps slot prop",
    ],
    [
      /<[A-Z][\w.:-]*\bcomponents\s*=/u,
      "deprecated components slot prop",
    ],
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

function findRemovedReactApiPatterns({ filePath, source }: SourceFile): string[] {
  const patterns = new Map<RegExp, string>([
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

function findRemovedReactTestApiPatterns({
  filePath,
  source,
}: SourceFile): string[] {
  const patterns = new Map<RegExp, string>([
    [/from\s+["']react-dom\/test-utils["']/u, "react-dom test utilities import"],
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

function findDirectUserEventCalls({ filePath, source }: SourceFile): string[] {
  const directCallPattern = /\buserEvent\.(click|type|keyboard|tab)\s*\(/gu;

  return [...source.matchAll(directCallPattern)].map(
    (match) => `${filePath}: direct userEvent.${match[1]} call without setup`,
  );
}

function findFocusedOrSkippedTests({ filePath, source }: SourceFile): string[] {
  const focusedOrSkippedPattern =
    /\b(?:describe|it|test)\s*\.\s*(?:only|skip)\s*\(/gu;

  return [...source.matchAll(focusedOrSkippedPattern)].map(
    (match) => `${filePath}: ${match[0]}`,
  );
}

function collectStaticModuleSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const importExportPattern =
    /\b(?:import|export)\s+(?:type\s+)?(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g;
  const sideEffectImportPattern = /\bimport\s*["']([^"']+)["']/g;
  const dynamicImportPattern = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;
  const commonJsRequirePattern = /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g;

  for (const match of source.matchAll(importExportPattern)) {
    if (match[1] !== undefined) {
      specifiers.push(match[1]);
    }
  }

  for (const match of source.matchAll(sideEffectImportPattern)) {
    if (match[1] !== undefined) {
      specifiers.push(match[1]);
    }
  }

  for (const match of source.matchAll(dynamicImportPattern)) {
    if (match[1] !== undefined) {
      specifiers.push(match[1]);
    }
  }

  for (const match of source.matchAll(commonJsRequirePattern)) {
    if (match[1] !== undefined) {
      specifiers.push(match[1]);
    }
  }

  return [...new Set(specifiers)].sort();
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
