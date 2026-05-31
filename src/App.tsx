import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from "react";
import AddIcon from "@mui/icons-material/Add";
import ArticleIcon from "@mui/icons-material/Article";
import BarChartIcon from "@mui/icons-material/BarChart";
import HomeIcon from "@mui/icons-material/Home";
import InboxIcon from "@mui/icons-material/Inbox";
import KeyboardCommandKeyIcon from "@mui/icons-material/KeyboardCommandKey";
import MenuIcon from "@mui/icons-material/Menu";
import SearchIcon from "@mui/icons-material/Search";
import SettingsIcon from "@mui/icons-material/Settings";
import TodayIcon from "@mui/icons-material/Today";
import ViewListIcon from "@mui/icons-material/ViewList";
import Alert from "@mui/material/Alert";
import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CssBaseline from "@mui/material/CssBaseline";
import Divider from "@mui/material/Divider";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Portal from "@mui/material/Portal";
import Stack from "@mui/material/Stack";
import Toolbar from "@mui/material/Toolbar";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { ThemeProvider, createTheme } from "@mui/material/styles";

import { createAppRuntime } from "./bootstrap";
import type { AppRuntime } from "./bootstrap";
import {
  MetadataBar,
  type MetadataBarCommandRegistry,
} from "./plugins/metadata-ui";
import {
  executeFilterQuery,
  exportStructuredDocumentToMarkdown,
  importMarkdownToStructuredDocument,
  type FilterDefinition,
  type MarkdownPage,
  type MetadataRecord,
  type MetadataOwnerReservation,
  type PluginHostRecord,
  type SlotContribution,
  type StructuredMarkdownDocument,
} from "./core";
import {
  MarkdownWorkspaceBridgeProvider,
  RuntimeProvider,
  useRuntime,
  type MarkdownWorkspaceBridgeValue,
  type RuntimeInitializer,
} from "./providers";
import { PluginRenderBoundary, SlotHost, ViewHost } from "./shell/hosts";
import "./App.css";

type AppProps = {
  initializeRuntime?: RuntimeInitializer<AppRuntime>;
};

type PageRouteRole = "home" | "recent" | "command-open";

type FilterRouteRole = "inbox" | "all-tasks" | "today" | "saved";

type PlaceholderRouteId = "reports";

type ActiveRoute =
  | {
      kind: "page";
      pageId: string;
      role: PageRouteRole;
    }
  | {
      kind: "filter";
      filterId: string;
      role: FilterRouteRole;
    }
  | {
      kind: "placeholder";
      routeId: PlaceholderRouteId;
    };

type ShellToolId = "command" | "search" | "capture" | "settings";

type NavigationIcon = typeof HomeIcon;

type PageNavigationRoute = {
  kind: "page";
  role: "home";
  label: string;
  eyebrow: string;
  summary: string;
  icon: NavigationIcon;
};

type FilterNavigationRoute = {
  kind: "filter";
  role: Exclude<FilterRouteRole, "saved">;
  filterId: string;
  label: string;
  eyebrow: string;
  summary: string;
  icon: NavigationIcon;
};

type PlaceholderNavigationRoute = {
  kind: "placeholder";
  routeId: PlaceholderRouteId;
  label: string;
  eyebrow: string;
  summary: string;
  placeholders: readonly string[];
  icon: NavigationIcon;
};

type ShellTool = {
  id: ShellToolId;
  label: string;
  icon: NavigationIcon;
};

type MarkdownWorkspaceDocument = {
  id: string;
  title: string;
  markdown: string;
  body?: StructuredMarkdownDocument;
};

type CurrentPageState = {
  pageId: string;
  generation: number;
};

type CommandOpenedPageAuthorization = {
  sourcePageId: string;
  generation: number;
};

type AppRuntimeState =
  | { status: "loading" }
  | { status: "ready"; runtime: AppRuntime }
  | { status: "failed" };

type RecentPageSummary = {
  accessibleLabel: string;
  id: string;
  title: string;
};

type FilterPageSummary = {
  routeToken: string;
  title: string;
};

const sessionHomeTitle = "Home";
const markdownPageViewId = "markdown.page-editor";
const pageEditorViewType = "page.editor";
const markdownInsertCommandId = "markdown.insert-text";
const openTaskPageCommandId = "task.open-task-page";
const toggleTaskStatusCommandId = "task.toggle-status";
const pageTimelineSlot = "page.timeline";
const globalFloatingSlot = "global.floating";
const timerPluginId = "timer";
const timerPauseCommandId = "timer.pause";
const timerResumeCommandId = "timer.resume";
const timerStopCommandId = "timer.stop";
const filterResultViewKind = "filter-results.markdown-pages";
const filterEmptyStateSlot = "filter.empty_state";
const metadataSegmentPattern = /^[A-Za-z][A-Za-z0-9_-]*$/u;
const timerFloatingCommandIds = new Set([
  timerPauseCommandId,
  timerResumeCommandId,
  timerStopCommandId,
]);
const primaryRouteLabels = new Set([
  "all tasks",
  "home",
  "inbox",
  "reports",
]);
const metadataValueTypes = new Set([
  "boolean",
  "date",
  "json",
  "null",
  "number",
  "string",
]);
const appInitializationPromises = new WeakMap<
  RuntimeInitializer<AppRuntime>,
  Promise<AppRuntime>
>();

const mirabilisTheme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#2f5f7a",
      dark: "#1f4358",
      contrastText: "#ffffff",
    },
    secondary: {
      main: "#5b7b42",
      contrastText: "#ffffff",
    },
    background: {
      default: "#f4f6f3",
      paper: "#ffffff",
    },
    text: {
      primary: "#17211b",
      secondary: "#536159",
    },
  },
  shape: {
    borderRadius: 8,
  },
  typography: {
    fontFamily: [
      "Inter",
      "ui-sans-serif",
      "system-ui",
      "-apple-system",
      "BlinkMacSystemFont",
      '"Segoe UI"',
      "sans-serif",
    ].join(", "),
    button: {
      textTransform: "none",
      fontWeight: 650,
    },
  },
  components: {
    MuiButton: {
      defaultProps: {
        size: "small",
      },
    },
    MuiIconButton: {
      defaultProps: {
        size: "small",
      },
    },
    MuiToolbar: {
      defaultProps: {
        variant: "dense",
      },
    },
  },
});

const primaryNavigationRoutes: readonly [
  PageNavigationRoute,
  FilterNavigationRoute,
  FilterNavigationRoute,
  FilterNavigationRoute,
  PlaceholderNavigationRoute,
] = [
  {
    kind: "page",
    role: "home",
    label: "Home",
    eyebrow: "Workspace",
    summary: "Session Home page",
    icon: HomeIcon,
  },
  {
    kind: "filter",
    role: "inbox",
    filterId: "quick-capture.filter.inbox",
    label: "Inbox",
    eyebrow: "Capture",
    summary: "Unprocessed Quick Capture pages",
    icon: InboxIcon,
  },
  {
    kind: "filter",
    role: "today",
    filterId: "task.filter.today",
    label: "Today",
    eyebrow: "Focus",
    summary: "Due or scheduled work for today",
    icon: TodayIcon,
  },
  {
    kind: "filter",
    role: "all-tasks",
    filterId: "task.filter.all-tasks",
    label: "All Tasks",
    eyebrow: "Saved filter",
    summary: "Complete task page index",
    icon: ViewListIcon,
  },
  {
    kind: "placeholder",
    routeId: "reports",
    label: "Reports",
    eyebrow: "Review",
    summary: "Reporting and chart workspace placeholder.",
    placeholders: [
      "Stats projection placeholder",
      "Chart view placeholder",
      "Review panel placeholder",
    ],
    icon: BarChartIcon,
  },
];

const shellTools: readonly ShellTool[] = [
  {
    id: "command",
    label: "Command",
    icon: KeyboardCommandKeyIcon,
  },
  {
    id: "search",
    label: "Search",
    icon: SearchIcon,
  },
  {
    id: "capture",
    label: "Quick Capture",
    icon: AddIcon,
  },
  {
    id: "settings",
    label: "Settings",
    icon: SettingsIcon,
  },
];

function App({ initializeRuntime = createDefaultAppRuntime }: AppProps) {
  return (
    <ThemeProvider theme={mirabilisTheme}>
      <CssBaseline />
      <AppRuntimeBoundary initializeRuntime={initializeRuntime} />
    </ThemeProvider>
  );
}

function AppRuntimeBoundary({
  initializeRuntime,
}: {
  initializeRuntime: RuntimeInitializer<AppRuntime>;
}) {
  const initializeRuntimeRef = useRef(initializeRuntime);
  const [state, setState] = useState<AppRuntimeState>(() => ({
    status: "loading",
  }));

  useEffect(() => {
    let active = true;

    getAppInitializationPromise(initializeRuntimeRef.current)
      .then((runtime) => {
        if (active) {
          setState({ status: "ready", runtime });
        }
      })
      .catch(() => {
        if (active) {
          setState({ status: "failed" });
        }
      });

    return () => {
      active = false;
    };
  }, []);

  if (state.status === "failed") {
    return (
      <main className="app-startup app-startup--failed">
        <div className="app-startup__message" role="alert">
          Mirabilis could not start. Close and reopen the app.
        </div>
      </main>
    );
  }

  if (state.status === "loading") {
    return (
      <main className="app-startup" aria-busy="true">
        <p className="app-startup__message">Starting Mirabilis</p>
      </main>
    );
  }

  return (
    <RuntimeProvider runtime={state.runtime}>
      <MirabilisShell runtimeSource={state.runtime} />
    </RuntimeProvider>
  );
}

function createDefaultAppRuntime(): Promise<AppRuntime> {
  return createAppRuntime();
}

function getAppInitializationPromise(
  initializeRuntime: RuntimeInitializer<AppRuntime>,
): Promise<AppRuntime> {
  const existingPromise = appInitializationPromises.get(initializeRuntime);

  if (existingPromise !== undefined) {
    return existingPromise;
  }

  const promise = Promise.resolve()
    .then(initializeRuntime)
    .catch((error: unknown) => {
      if (appInitializationPromises.get(initializeRuntime) === promise) {
        appInitializationPromises.delete(initializeRuntime);
      }

      throw error;
    });

  appInitializationPromises.set(initializeRuntime, promise);

  return promise;
}

function MirabilisShell({ runtimeSource }: { runtimeSource: AppRuntime }) {
  const runtime = useRuntime();
  const homePageId = useSessionHomePageId(runtimeSource);
  const [currentPageState] = useState<CurrentPageState>(() => ({
    pageId: homePageId,
    generation: 0,
  }));
  const [activeRoute, setActiveRoute] = useState<ActiveRoute>(() => ({
    kind: "page",
    pageId: homePageId,
    role: "home",
  }));
  const [slotRevision, setSlotRevision] = useState(0);
  const [navigationOpen, setNavigationOpen] = useState(true);
  const [activeTool, setActiveTool] = useState<ShellToolId>("command");
  const refreshSlotSurfaces = useCallback(() => {
    setSlotRevision((revision) => revision + 1);
  }, []);
  const routeDetails = getActiveRouteDetails(
    runtimeSource,
    activeRoute,
    homePageId,
  );
  const recentPages = activeRouteCanShowRecentPages(runtimeSource, activeRoute)
    ? listRecentPages(runtimeSource, homePageId)
    : [];
  const savedFilterRoutes = listSavedFilterRoutes(runtimeSource);
  const workspaceTitleId = "workspace-title";
  const selectPageRoute = (pageId: string, role: PageRouteRole) => {
    setCurrentPage(currentPageState, pageId);
    setActiveRoute({
      kind: "page",
      pageId,
      role,
    });
  };
  const selectFilterRoute = (filterId: string, role: FilterRouteRole) => {
    unsetCurrentPage(currentPageState);
    setActiveRoute({
      filterId,
      kind: "filter",
      role,
    });
  };
  const selectPlaceholderRoute = (routeId: PlaceholderRouteId) => {
    unsetCurrentPage(currentPageState);
    setActiveRoute({
      kind: "placeholder",
      routeId,
    });
  };
  const bridge = useMemo(
    () =>
      createMarkdownWorkspaceBridge({
        currentPageState,
        runtime: runtimeSource,
        openPage(pageId) {
          setCurrentPage(currentPageState, pageId);
          setActiveRoute({
            kind: "page",
            pageId,
            role: "command-open",
          });
        },
      }),
    [currentPageState, runtimeSource],
  );

  return (
    <Box className="app-shell">
      <AppBar
        aria-label="Mirabilis"
        component="header"
        elevation={0}
        position="sticky"
      >
        <Toolbar className="app-shell__toolbar">
          <Tooltip title="Toggle workspace navigation">
            <IconButton
              aria-controls="workspace-navigation"
              aria-expanded={navigationOpen}
              aria-label="Workspace navigation"
              color="inherit"
              edge="start"
              onClick={() => setNavigationOpen((open) => !open)}
            >
              <MenuIcon fontSize="small" />
            </IconButton>
          </Tooltip>

          <Stack className="app-shell__brand" spacing={0}>
            <Typography component="h1" variant="subtitle1">
              Mirabilis
            </Typography>
            <Typography variant="caption">Version {runtime.app.version}</Typography>
          </Stack>

          <Stack
            className="app-shell__actions"
            component="div"
            direction="row"
            spacing={1}
          >
            {shellTools.map((tool) => {
              const ToolIcon = tool.icon;

              return (
                <Button
                  aria-pressed={activeTool === tool.id}
                  color="inherit"
                  key={tool.id}
                  onClick={() => setActiveTool(tool.id)}
                  startIcon={<ToolIcon fontSize="small" />}
                  variant={activeTool === tool.id ? "outlined" : "text"}
                >
                  {tool.label}
                </Button>
              );
            })}
          </Stack>
        </Toolbar>
      </AppBar>

      <Box className="app-shell__frame">
        <Box
          className="app-shell__navigation"
          hidden={!navigationOpen}
          id="workspace-navigation"
        >
          <Drawer open variant="permanent">
            <Toolbar />
            <Box className="app-shell__nav-content">
              <Box aria-label="Workspace" component="nav">
                <Typography className="app-shell__nav-heading" variant="overline">
                  Workspace
                </Typography>
                <List aria-label="Workspace routes" dense>
                  {primaryNavigationRoutes.map((route) => {
                    const RouteIcon = route.icon;
                    const isSelected = primaryRouteIsActive(
                      route,
                      activeRoute,
                      homePageId,
                    );

                    return (
                      <ListItemButton
                        aria-current={isSelected ? "page" : undefined}
                        key={`${route.kind}:${route.label}`}
                        onClick={() => {
                          if (route.kind === "page") {
                            selectPageRoute(homePageId, route.role);
                          } else if (route.kind === "filter") {
                            selectFilterRoute(route.filterId, route.role);
                          } else {
                            selectPlaceholderRoute(route.routeId);
                          }
                        }}
                        selected={isSelected}
                      >
                        <ListItemIcon>
                          <RouteIcon fontSize="small" />
                        </ListItemIcon>
                        <ListItemText
                          primary={route.label}
                          secondary={route.eyebrow}
                        />
                      </ListItemButton>
                    );
                  })}
                </List>
                {recentPages.length > 0 ? (
                  <>
                    <Divider />
                    <Typography
                      className="app-shell__nav-heading app-shell__nav-heading--section"
                      variant="overline"
                    >
                      Recent pages
                    </Typography>
                    <List aria-label="Recent pages" dense>
                      {recentPages.map((page) => {
                        const isSelected =
                          activeRoute.kind === "page" &&
                          activeRoute.pageId === page.id &&
                          activeRoute.role !== "home";

                        return (
                          <ListItemButton
                            aria-label={
                              page.accessibleLabel === page.title
                                ? undefined
                                : page.accessibleLabel
                            }
                            aria-current={isSelected ? "page" : undefined}
                            key={page.id}
                            onClick={() => selectPageRoute(page.id, "recent")}
                            selected={isSelected}
                          >
                            <ListItemIcon>
                              <ArticleIcon fontSize="small" />
                            </ListItemIcon>
                            <ListItemText
                              primary={page.title}
                              secondary="Recent page"
                            />
                          </ListItemButton>
                        );
                      })}
                    </List>
                  </>
                ) : null}
              </Box>
              {savedFilterRoutes.length > 0 ? (
                <Box component="section">
                  <Divider />
                  <Typography
                    className="app-shell__nav-heading app-shell__nav-heading--section"
                    variant="overline"
                  >
                    Saved filters
                  </Typography>
                  <List aria-label="Saved filters" dense>
                    {savedFilterRoutes.map((route) => {
                      const isSelected =
                        activeRoute.kind === "filter" &&
                        activeRoute.filterId === route.filterId;

                      return (
                        <ListItemButton
                          aria-label={route.label}
                          aria-current={isSelected ? "page" : undefined}
                          key={route.filterId}
                          onClick={() =>
                            selectFilterRoute(route.filterId, "saved")
                          }
                          selected={isSelected}
                        >
                          <ListItemIcon>
                            <ViewListIcon fontSize="small" />
                          </ListItemIcon>
                          <ListItemText
                            primary={route.label}
                            secondary="Saved filter"
                          />
                        </ListItemButton>
                      );
                    })}
                  </List>
                </Box>
              ) : null}
              <Divider />
              <Box className="app-shell__nav-footer">
                <Typography variant="caption">
                  Plugin surfaces stay behind registered views and commands.
                </Typography>
              </Box>
            </Box>
          </Drawer>
        </Box>

        <Box
          aria-labelledby={workspaceTitleId}
          className="app-shell__workspace"
          component="main"
        >
          <Stack className="app-shell__workspace-header" spacing={1}>
            <Chip label={routeDetails.eyebrow} size="small" variant="outlined" />
            <Typography component="h2" id={workspaceTitleId} variant="h5">
              {routeDetails.label} Workspace
            </Typography>
            <Typography color="text.secondary" variant="body2">
              {routeDetails.summary}
            </Typography>
          </Stack>

          <WorkspaceRouteContent
            activeRoute={activeRoute}
            bridge={bridge}
            runtime={runtimeSource}
            slotRevision={slotRevision}
          />

          <Box className="app-shell__tool-status" role="status">
            <Typography variant="body2">
              {shellTools.find((tool) => tool.id === activeTool)?.label} surface
              placeholder
            </Typography>
          </Box>
        </Box>
      </Box>

      <Portal>
        <AppFloatingSlots
          onCommandExecuted={refreshSlotSurfaces}
          runtime={runtimeSource}
        />
      </Portal>
    </Box>
  );
}

function WorkspaceRouteContent({
  activeRoute,
  bridge,
  runtime,
  slotRevision,
}: {
  activeRoute: ActiveRoute;
  bridge: MarkdownWorkspaceBridgeValue;
  runtime: AppRuntime;
  slotRevision: number;
}) {
  if (activeRoute.kind === "page") {
    return (
      <PageWorkspaceEditor
        bridge={bridge}
        pageId={activeRoute.pageId}
        runtime={runtime}
        slotRevision={slotRevision}
      />
    );
  }

  if (activeRoute.kind === "filter") {
    return (
      <SavedFilterWorkspace filterId={activeRoute.filterId} runtime={runtime} />
    );
  }

  const route = getPlaceholderRoute(activeRoute.routeId);

  return (
    <Stack
      aria-label={`${route.label} route placeholders`}
      className="app-shell__workspace-placeholders"
      component="section"
      spacing={1}
    >
      {route.placeholders.map((placeholder) => (
        <Box className="app-shell__placeholder-row" key={placeholder}>
          <Typography variant="body2">{placeholder}</Typography>
        </Box>
      ))}
    </Stack>
  );
}

function PageWorkspaceEditor({
  bridge,
  pageId,
  runtime,
  slotRevision,
}: {
  bridge: MarkdownWorkspaceBridgeValue;
  pageId: string;
  runtime: AppRuntime;
  slotRevision: number;
}) {
  const page = getRoutePage(runtime, pageId);

  if (page === undefined) {
    return <RouteUnavailable />;
  }

  return (
    <Stack className="app-shell__page-workspace" spacing={2}>
      <Box className="app-shell__page-metadata">
        <PluginRenderBoundary
          fallbackLabel="Page metadata unavailable"
          fallbackText="Page metadata unavailable"
          resetKey={page.id}
        >
          <MetadataBar
            commands={runtime.commands as MetadataBarCommandRegistry}
            metadata={listPageMetadataRecords(runtime)}
            pageId={page.id}
            pluginHost={runtime.pluginHost}
            slots={runtime.registries.slots}
          />
        </PluginRenderBoundary>
      </Box>

      <Box className="app-shell__workspace-editor">
        <MarkdownWorkspaceBridgeProvider bridge={bridge}>
          <ViewHost
            acceptedData={{
              kind: "markdown-page",
              pageId: page.id,
            }}
            isPluginAvailable={(pluginId) => isPluginActive(runtime, pluginId)}
            registry={runtime.registries.views}
            viewId={markdownPageViewId}
            viewType={pageEditorViewType}
          />
        </MarkdownWorkspaceBridgeProvider>
      </Box>

      <Box className="app-shell__page-timeline">
        <SlotHost
          isPluginAvailable={(pluginId) => isPluginActive(runtime, pluginId)}
          key={`${page.id}:${slotRevision}`}
          props={{
            page: {
              id: page.id,
              title: page.title,
            },
          }}
          registry={runtime.registries.slots}
          slot={pageTimelineSlot}
        />
      </Box>
    </Stack>
  );
}

function AppFloatingSlots({
  onCommandExecuted,
  runtime,
}: {
  onCommandExecuted(): void;
  runtime: AppRuntime;
}) {
  const contributions = useMemo(
    () => listSlotContributions(runtime, globalFloatingSlot),
    [runtime],
  );
  const visibleContributionCount = useStagedFloatingContributionCount(
    createSlotContributionListKey(contributions),
    contributions.length,
  );

  if (contributions.length === 0) {
    return null;
  }

  return (
    <Box className="app-shell__floating-slots">
      {contributions.slice(0, visibleContributionCount).map((contribution) => (
        <AppFloatingSlotContribution
          contribution={contribution}
          key={contribution.id}
          onCommandExecuted={onCommandExecuted}
          runtime={runtime}
        />
      ))}
    </Box>
  );
}

const AppFloatingSlotContribution = memo(function AppFloatingSlotContribution({
  contribution,
  onCommandExecuted,
  runtime,
}: {
  contribution: SlotContribution;
  onCommandExecuted(): void;
  runtime: AppRuntime;
}) {
  const props = useMemo(
    () =>
      Object.freeze({
        commands: createFloatingCommandFacade({
          onCommandExecuted,
          pluginId: contribution.pluginId,
          runtime,
        }),
      }),
    [contribution.pluginId, onCommandExecuted, runtime],
  );

  if (!isPluginActive(runtime, contribution.pluginId)) {
    return null;
  }

  const condition = contribution.when;

  if (condition !== undefined) {
    if (typeof condition !== "function") {
      return null;
    }

    try {
      if (condition(props) !== true) {
        return null;
      }
    } catch {
      return null;
    }
  }

  const Component = contribution.component as ComponentType<
    Record<string, unknown>
  >;
  const renderedContribution = (
    <MemoizedDeferredFloatingContributionElement
      component={Component}
      props={props}
      propsKey={`${contribution.pluginId}:${contribution.id}`}
    />
  );

  return (
    <PluginRenderBoundary
      fallbackLabel="Floating slot unavailable"
      fallbackText="Floating contribution unavailable"
      key={`${contribution.pluginId}:${contribution.id}`}
      resetKey={`${contribution.pluginId}:${contribution.id}`}
    >
      {renderedContribution}
    </PluginRenderBoundary>
  );
}, areAppFloatingSlotContributionPropsEqual);

function areAppFloatingSlotContributionPropsEqual(
  previous: {
    contribution: SlotContribution;
    onCommandExecuted(): void;
    runtime: AppRuntime;
  },
  next: {
    contribution: SlotContribution;
    onCommandExecuted(): void;
    runtime: AppRuntime;
  },
): boolean {
  return (
    previous.contribution === next.contribution &&
    previous.runtime === next.runtime
  );
}

function DeferredFloatingContributionElement({
  component: Component,
  props,
}: {
  component: ComponentType<Record<string, unknown>>;
  props: Record<string, unknown>;
  propsKey: string;
}) {
  return useMemo(() => <Component {...props} />, [Component, props]);
}

const MemoizedDeferredFloatingContributionElement = memo(
  DeferredFloatingContributionElement,
  (previous, next) =>
    previous.component === next.component && previous.propsKey === next.propsKey,
);

function useStagedFloatingContributionCount(
  key: string,
  total: number,
): number {
  const [stage, setStage] = useState(() => ({
    count: 0,
    key,
  }));
  const visibleCount = stage.key === key ? Math.min(stage.count, total) : 0;

  useLayoutEffect(() => {
    if (stage.key !== key) {
      // Staged plugin mounting keeps earlier boundaries committed before later plugin failures.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStage({
        count: total > 0 ? 1 : 0,
        key,
      });
      return;
    }

    if (stage.count < total) {
      setStage({
        count: stage.count + 1,
        key,
      });
      return;
    }

    if (stage.count > total) {
      setStage({
        count: total,
        key,
      });
    }
  }, [key, stage.count, stage.key, total]);

  return visibleCount;
}

function createSlotContributionListKey(
  contributions: readonly SlotContribution[],
): string {
  return contributions
    .map((contribution) => `${contribution.pluginId}:${contribution.id}`)
    .join("\u0000");
}

function listSlotContributions(
  runtime: AppRuntime,
  slot: string,
): SlotContribution[] {
  try {
    return runtime.registries.slots.list({ slot });
  } catch {
    return [];
  }
}

function createFloatingCommandFacade({
  onCommandExecuted,
  pluginId,
  runtime,
}: {
  onCommandExecuted(): void;
  pluginId: string;
  runtime: AppRuntime;
}): {
  execute(commandId: string, input?: unknown): Promise<unknown>;
} {
  return Object.freeze({
    async execute(commandId, input) {
      if (
        pluginId !== timerPluginId ||
        !timerFloatingCommandIds.has(commandId) ||
        !isExactEmptyCommandPayload(input)
      ) {
        throw new Error("Floating command unavailable");
      }

      const output = await runtime.commands.execute(commandId, {});

      onCommandExecuted();

      return output;
    },
  });
}

function isExactEmptyCommandPayload(input: unknown): boolean {
  if (!isRecord(input) || Object.getPrototypeOf(input) !== Object.prototype) {
    return false;
  }

  return Reflect.ownKeys(input).length === 0;
}

function SavedFilterWorkspace({
  filterId,
  runtime,
}: {
  filterId: string;
  runtime: AppRuntime;
}) {
  const filter = getRouteFilter(runtime, filterId);

  if (filter === undefined || !filterSourceIsAvailable(runtime, filter)) {
    return <RouteUnavailable />;
  }

  if (!filterViewIsAvailable(runtime, filter)) {
    return <RouteUnavailable />;
  }

  const pageSummaries = executeRouteFilter(runtime, filter);

  if (pageSummaries === undefined) {
    return <RouteUnavailable />;
  }

  if (pageSummaries.length === 0) {
    return (
      <Box className="app-shell__filter-empty">
        <SlotHost
          isPluginAvailable={(pluginId) => isPluginActive(runtime, pluginId)}
          props={{
            filterName: filter.name,
          }}
          registry={runtime.registries.slots}
          slot={filterEmptyStateSlot}
        />
      </Box>
    );
  }

  return (
    <Box className="app-shell__filter-results">
      <ViewHost
        acceptedData={{
          kind: filterResultViewKind,
        }}
        isPluginAvailable={(pluginId) => isPluginActive(runtime, pluginId)}
        props={{
          pages: pageSummaries,
        }}
        registry={runtime.registries.views}
        viewType={filter.viewType}
      />
    </Box>
  );
}

function RouteUnavailable() {
  return (
    <Alert aria-label="Route unavailable" severity="error">
      Route unavailable. This workspace could not load.
    </Alert>
  );
}

function useSessionHomePageId(runtime: AppRuntime): string {
  const [homePageId] = useState(() => selectOrCreateSessionHomePage(runtime).id);

  return homePageId;
}

function selectOrCreateSessionHomePage(runtime: AppRuntime): MarkdownPage {
  const [existingHomePage] = runtime.pages
    .list()
    .filter((page) => page.title === sessionHomeTitle);

  if (existingHomePage !== undefined) {
    return existingHomePage;
  }

  return runtime.pages.create({
    title: sessionHomeTitle,
    body: createEmptyMarkdownDocument(),
  });
}

function primaryRouteIsActive(
  route: (typeof primaryNavigationRoutes)[number],
  activeRoute: ActiveRoute,
  homePageId: string,
): boolean {
  if (route.kind === "page") {
    return (
      activeRoute.kind === "page" &&
      activeRoute.role === route.role &&
      activeRoute.pageId === homePageId
    );
  }

  if (route.kind === "filter") {
    return (
      activeRoute.kind === "filter" &&
      activeRoute.filterId === route.filterId
    );
  }

  return (
    activeRoute.kind === "placeholder" &&
    activeRoute.routeId === route.routeId
  );
}

function getActiveRouteDetails(
  runtime: AppRuntime,
  activeRoute: ActiveRoute,
  homePageId: string,
): {
  label: string;
  eyebrow: string;
  summary: string;
} {
  if (activeRoute.kind === "page") {
    const homeRoute = primaryNavigationRoutes[0];

    if (activeRoute.role === "home" && activeRoute.pageId === homePageId) {
      return homeRoute;
    }

    const page = getRoutePage(runtime, activeRoute.pageId);

    return {
      eyebrow:
        activeRoute.role === "command-open" ? "Workspace" : "Recent page",
      label: page?.title ?? "Page",
      summary: "Markdown Page",
    };
  }

  if (activeRoute.kind === "filter") {
    const primaryRoute = primaryNavigationRoutes.find(
      (route) =>
        route.kind === "filter" && route.filterId === activeRoute.filterId,
    );

    if (primaryRoute !== undefined) {
      return primaryRoute;
    }

    const filter = getRouteFilter(runtime, activeRoute.filterId);

    return {
      eyebrow: "Saved filter",
      label: filter?.name ?? "Saved Filter",
      summary: "Saved filter results",
    };
  }

  return getPlaceholderRoute(activeRoute.routeId);
}

function getPlaceholderRoute(
  routeId: PlaceholderRouteId,
): PlaceholderNavigationRoute {
  const route = primaryNavigationRoutes.find(
    (candidate): candidate is PlaceholderNavigationRoute =>
      candidate.kind === "placeholder" && candidate.routeId === routeId,
  );

  return route ?? primaryNavigationRoutes[4];
}

function listRecentPages(
  runtime: AppRuntime,
  homePageId: string,
): RecentPageSummary[] {
  return runtime.pages
    .list()
    .filter((page) => page.id !== homePageId)
    .map(toRecentPageSummary);
}

function activeRouteCanShowRecentPages(
  runtime: AppRuntime,
  activeRoute: ActiveRoute,
): boolean {
  if (activeRoute.kind !== "filter") {
    return true;
  }

  const filter = getRouteFilter(runtime, activeRoute.filterId);

  if (filter === undefined || !filterSourceIsAvailable(runtime, filter)) {
    return false;
  }

  if (!filterViewIsAvailable(runtime, filter)) {
    return false;
  }

  const plugins = listPluginRecords(runtime);

  return (
    plugins !== undefined && filterQueryOwnersAreAvailable(filter, plugins)
  );
}

function listSavedFilterRoutes(
  runtime: AppRuntime,
): Array<{
  filterId: string;
  label: string;
}> {
  const primaryFilterIds = new Set(
    primaryNavigationRoutes
      .filter((route): route is FilterNavigationRoute => route.kind === "filter")
      .map((route) => route.filterId),
  );

  return runtime.filters
    .list()
    .filter(
      (filter) =>
        !primaryFilterIds.has(filter.id) &&
        filterSourceIsAvailable(runtime, filter) &&
        filterViewIsAvailable(runtime, filter),
    )
    .map((filter) => ({
      filterId: filter.id,
      label: filter.name,
    }));
}

function getRoutePage(
  runtime: AppRuntime,
  pageId: string,
): MarkdownPage | undefined {
  try {
    return runtime.pages.get(pageId);
  } catch {
    return undefined;
  }
}

function getRouteFilter(
  runtime: AppRuntime,
  filterId: string,
): FilterDefinition | undefined {
  try {
    return runtime.filters.get(filterId);
  } catch {
    return undefined;
  }
}

function executeRouteFilter(
  runtime: AppRuntime,
  filter: FilterDefinition,
): FilterPageSummary[] | undefined {
  try {
    const plugins = listPluginRecords(runtime);

    if (
      plugins === undefined ||
      !filterQueryOwnersAreAvailable(filter, plugins)
    ) {
      return undefined;
    }

    return executeFilterQuery({
      metadata: listActivePluginMetadata(runtime, plugins),
      metadataOwnerReservations: collectMetadataOwnerReservations(plugins),
      pages: runtime.pages.list({ includeArchived: true }),
      query: filter.query,
    }).map(toFilterPageSummary);
  } catch {
    return undefined;
  }
}

function toRecentPageSummary(page: MarkdownPage): RecentPageSummary {
  return {
    accessibleLabel: toRecentPageAccessibleLabel(page.title),
    id: page.id,
    title: page.title,
  };
}

function toRecentPageAccessibleLabel(title: string): string {
  const normalizedTitle = title.toLowerCase();

  if (normalizedTitle === "today") {
    return title;
  }

  return primaryRouteLabels.has(normalizedTitle)
    ? `Recent page ${title}`
    : title;
}

function toFilterPageSummary(
  page: MarkdownPage,
  index: number,
): FilterPageSummary {
  return {
    routeToken: `filter-result-${index + 1}`,
    title: page.title,
  };
}

function filterSourceIsAvailable(
  runtime: AppRuntime,
  filter: FilterDefinition,
): boolean {
  const plugins = listPluginRecords(runtime);

  if (plugins === undefined) {
    return false;
  }

  return (
    filter.sourcePluginId === undefined ||
    pluginRecordIsActive(plugins, filter.sourcePluginId)
  );
}

function filterViewIsAvailable(
  runtime: AppRuntime,
  filter: FilterDefinition,
): boolean {
  const plugins = listPluginRecords(runtime);

  if (plugins === undefined) {
    return false;
  }

  try {
    const views = runtime.registries.views
      .list({ type: filter.viewType })
      .filter((view) => pluginRecordIsActive(plugins, view.pluginId));

    return views.length === 1;
  } catch {
    return false;
  }
}

function collectMetadataOwnerReservations(
  plugins: readonly PluginHostRecord[],
): MetadataOwnerReservation[] {
  const reservations = new Map<string, string>();

  for (const plugin of plugins) {
    addPluginMetadataOwnerReservations(reservations, plugin);
  }

  return [...reservations].map(([namespace, sourcePluginId]) => ({
    namespace,
    sourcePluginId,
  }));
}

function listActivePluginMetadata(
  runtime: AppRuntime,
  plugins: readonly PluginHostRecord[],
): MetadataRecord[] {
  const activePluginIds = new Set(
    plugins.filter(pluginIsActive).map((plugin) => plugin.id),
  );

  return runtime.metadata
    .list()
    .filter((record) => activePluginIds.has(record.sourcePluginId));
}

function listPageMetadataRecords(runtime: AppRuntime): MetadataRecord[] {
  try {
    return runtime.metadata.list();
  } catch {
    return [];
  }
}

function filterQueryOwnersAreAvailable(
  filter: FilterDefinition,
  plugins: readonly PluginHostRecord[],
): boolean {
  const namespaces = collectFilterQueryMetadataNamespaces(filter.query);

  if (namespaces === undefined) {
    return false;
  }

  const reservations = new Map<string, string>();

  for (const plugin of plugins) {
    addPluginMetadataOwnerReservations(reservations, plugin);
  }

  for (const namespace of namespaces) {
    const sourcePluginId = reservations.get(namespace);

    if (
      sourcePluginId === undefined ||
      !pluginRecordIsActive(plugins, sourcePluginId)
    ) {
      return false;
    }
  }

  return true;
}

function collectFilterQueryMetadataNamespaces(
  query: unknown,
): Set<string> | undefined {
  const namespaces = new Set<string>();
  const activeQueries = new WeakSet<object>();

  return collectFilterQueryMetadataNamespacesInto(query, namespaces, {
    activeQueries,
    depth: 0,
  })
    ? namespaces
    : undefined;
}

function collectFilterQueryMetadataNamespacesInto(
  query: unknown,
  namespaces: Set<string>,
  state: {
    activeQueries: WeakSet<object>;
    depth: number;
  },
): boolean {
  if (!isRecord(query) || state.depth > 1_000) {
    return false;
  }

  if (state.activeQueries.has(query)) {
    return false;
  }

  state.activeQueries.add(query);

  try {
    const where = query.where;

    if (!Array.isArray(where)) {
      return false;
    }

    for (const condition of where) {
      if (!collectFilterConditionMetadataNamespace(condition, namespaces)) {
        return false;
      }
    }

    return (
      collectNestedFilterQueryMetadataNamespaces(query.and, namespaces, state) &&
      collectNestedFilterQueryMetadataNamespaces(query.or, namespaces, state)
    );
  } finally {
    state.activeQueries.delete(query);
  }
}

function collectNestedFilterQueryMetadataNamespaces(
  branches: unknown,
  namespaces: Set<string>,
  state: {
    activeQueries: WeakSet<object>;
    depth: number;
  },
): boolean {
  if (branches === undefined) {
    return true;
  }

  if (!Array.isArray(branches)) {
    return false;
  }

  return branches.every((branch) =>
    collectFilterQueryMetadataNamespacesInto(branch, namespaces, {
      activeQueries: state.activeQueries,
      depth: state.depth + 1,
    }),
  );
}

function collectFilterConditionMetadataNamespace(
  condition: unknown,
  namespaces: Set<string>,
): boolean {
  if (!isRecord(condition) || typeof condition.field !== "string") {
    return false;
  }

  const segments = condition.field.split(".");

  if (segments.length !== 3 || segments[0] !== "metadata") {
    return false;
  }

  const namespace = segments[1];
  const key = segments[2];

  if (!isSafeMetadataSegment(namespace) || !isSafeMetadataSegment(key)) {
    return false;
  }

  namespaces.add(namespace);

  return true;
}

function addPluginMetadataOwnerReservations(
  reservations: Map<string, string>,
  plugin: PluginHostRecord,
): void {
  const fields = plugin.manifest.contributes?.metadataFields;

  if (!Array.isArray(fields)) {
    return;
  }

  for (const field of fields) {
    if (
      field.namespace === plugin.id &&
      isSafeMetadataSegment(field.namespace) &&
      isSafeMetadataSegment(field.key) &&
      typeof field.valueType === "string" &&
      metadataValueTypes.has(field.valueType)
    ) {
      reservations.set(field.namespace, plugin.id);
    }
  }
}

function isSafeMetadataSegment(value: unknown): value is string {
  return typeof value === "string" && metadataSegmentPattern.test(value);
}

function createMarkdownWorkspaceBridge({
  currentPageState,
  openPage,
  runtime,
}: {
  currentPageState: CurrentPageState;
  openPage(pageId: string): void;
  runtime: AppRuntime;
}): MarkdownWorkspaceBridgeValue {
  const commandOpenedPageIds = new Map<
    string,
    CommandOpenedPageAuthorization
  >();

  return {
    pages: {
      async load(pageId) {
        const generation = ensureCurrentPage(currentPageState, pageId);
        const page = loadWorkspacePage(runtime, pageId);

        ensureCurrentPage(currentPageState, pageId, generation);

        return page;
      },
      async save(input) {
        const generation = ensureCurrentPage(currentPageState, input.pageId);
        const savedPage = saveWorkspacePage(runtime, input);

        ensureCurrentPage(currentPageState, input.pageId, generation);

        return savedPage;
      },
    },
    commandBus: {
      async execute(commandId, input) {
        if (commandId === markdownInsertCommandId) {
          const insertInput = readInsertInput(input);
          const generation = ensureCurrentPage(
            currentPageState,
            insertInput.pageId,
          );
          const output = await runtime.commands.execute(commandId, insertInput);

          ensureCurrentPage(currentPageState, insertInput.pageId, generation);

          return output;
        }

        if (commandId === openTaskPageCommandId) {
          const openInput = readSourceBlockInput(input);
          const generation = ensureCurrentPage(
            currentPageState,
            openInput.sourcePageId,
          );
          const output = await runtime.commands.execute(commandId, openInput);

          ensureCurrentPage(currentPageState, openInput.sourcePageId, generation);
          allowCommandOpenedPageId(commandOpenedPageIds, output, {
            sourcePageId: openInput.sourcePageId,
            generation,
          });

          return output;
        }

        if (commandId === toggleTaskStatusCommandId) {
          const toggleInput = readSourceBlockInput(input);
          const generation = ensureCurrentPage(
            currentPageState,
            toggleInput.sourcePageId,
          );
          const output = await runtime.commands.execute(commandId, toggleInput);

          ensureCurrentPage(
            currentPageState,
            toggleInput.sourcePageId,
            generation,
          );

          return output;
        }

        throw new Error("Command unavailable");
      },
    },
    markdownRuntime: {
      collectEditorExtensions() {
        return runtime.markdown.collectEditorExtensions();
      },
    },
    openPage(pageId) {
      const authorization = commandOpenedPageIds.get(pageId);

      if (
        authorization !== undefined &&
        isCurrentPageGeneration(currentPageState, authorization)
      ) {
        commandOpenedPageIds.delete(pageId);
        openPage(pageId);
      }
    },
  };
}

function allowCommandOpenedPageId(
  commandOpenedPageIds: Map<string, CommandOpenedPageAuthorization>,
  output: unknown,
  authorization: CommandOpenedPageAuthorization,
): void {
  if (!isRecord(output) || typeof output.pageId !== "string") {
    return;
  }

  const pageId = output.pageId.trim();

  if (pageId.length > 0) {
    commandOpenedPageIds.set(pageId, authorization);
  }
}

function isCurrentPageGeneration(
  currentPageState: CurrentPageState,
  authorization: CommandOpenedPageAuthorization,
): boolean {
  return (
    currentPageState.pageId === authorization.sourcePageId &&
    currentPageState.generation === authorization.generation
  );
}

function loadWorkspacePage(
  runtime: AppRuntime,
  pageId: string,
): MarkdownWorkspaceDocument {
  const page = runtime.pages.get(pageId);

  return {
    id: page.id,
    title: page.title,
    markdown: exportStructuredDocumentToMarkdown(page.body),
    body: page.body,
  };
}

function saveWorkspacePage(
  runtime: AppRuntime,
  input: {
    pageId: string;
    markdown: string;
  },
): MarkdownWorkspaceDocument {
  const current = runtime.pages.get(input.pageId);
  const body = importMarkdownToStructuredDocument(input.markdown, {
    previousDocument: current.body,
  });
  const saved = runtime.pages.update(input.pageId, { body });

  return {
    id: saved.id,
    title: saved.title,
    markdown: exportStructuredDocumentToMarkdown(saved.body),
    body: saved.body,
  };
}

function setCurrentPage(currentPageState: CurrentPageState, pageId: string): void {
  if (currentPageState.pageId !== pageId) {
    currentPageState.pageId = pageId;
    currentPageState.generation += 1;
  }
}

function unsetCurrentPage(currentPageState: CurrentPageState): void {
  if (currentPageState.pageId !== "") {
    currentPageState.pageId = "";
    currentPageState.generation += 1;
  }
}

function ensureCurrentPage(
  currentPageState: CurrentPageState,
  pageId: string,
  generation = currentPageState.generation,
): number {
  if (
    currentPageState.pageId !== pageId ||
    currentPageState.generation !== generation
  ) {
    throw new Error("Page unavailable");
  }

  return generation;
}

function readInsertInput(input: unknown): {
  pageId: string;
  markdown: string;
  text: string;
  selectionStart: number;
  selectionEnd?: number;
} {
  if (!isRecord(input)) {
    throw new Error("Command unavailable");
  }

  return {
    pageId: readNonemptyString(input.pageId),
    markdown: readString(input.markdown),
    text: readNonemptyString(input.text),
    selectionStart: readNumber(input.selectionStart),
    ...(input.selectionEnd === undefined
      ? {}
      : { selectionEnd: readNumber(input.selectionEnd) }),
  };
}

function readSourceBlockInput(input: unknown): {
  sourcePageId: string;
  sourceBlockId: string;
} {
  if (!isRecord(input)) {
    throw new Error("Command unavailable");
  }

  return {
    sourcePageId: readNonemptyString(input.sourcePageId),
    sourceBlockId: readNonemptyString(input.sourceBlockId),
  };
}

function readString(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Command unavailable");
  }

  return value;
}

function readNonemptyString(value: unknown): string {
  const text = readString(value);

  if (text.length === 0) {
    throw new Error("Command unavailable");
  }

  return text;
}

function readNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("Command unavailable");
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function createEmptyMarkdownDocument(): StructuredMarkdownDocument {
  return {
    type: "doc",
    content: [],
  };
}

function listPluginRecords(
  runtime: AppRuntime,
): readonly PluginHostRecord[] | undefined {
  const { listPlugins } = runtime.pluginHost;

  if (typeof listPlugins !== "function") {
    return undefined;
  }

  try {
    return listPlugins.call(runtime.pluginHost);
  } catch {
    return undefined;
  }
}

function isPluginActive(runtime: AppRuntime, pluginId: string): boolean {
  const plugins = listPluginRecords(runtime);

  if (plugins === undefined) {
    return false;
  }

  return pluginRecordIsActive(plugins, pluginId);
}

function pluginRecordIsActive(
  plugins: readonly PluginHostRecord[],
  pluginId: string,
): boolean {
  return plugins.some(
    (plugin) => plugin.id === pluginId && pluginIsActive(plugin),
  );
}

function pluginIsActive(plugin: PluginHostRecord): boolean {
  return plugin.enabled === true && plugin.status === "active";
}

export default App;
