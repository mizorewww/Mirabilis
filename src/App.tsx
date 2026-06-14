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
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
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
import Dialog from "@mui/material/Dialog";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Portal from "@mui/material/Portal";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Toolbar from "@mui/material/Toolbar";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import { ThemeProvider, createTheme, useTheme } from "@mui/material/styles";

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
  type AppEvent,
  type CommandDescriptor,
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
import {
  CommandPaletteDialog,
  QuickCaptureDialog,
  SearchDialog,
  type CommandPaletteCommand,
} from "./shell/dialogs";
import { PluginRenderBoundary, SlotHost, ViewHost } from "./shell/hosts";
import {
  buildCalendarTimeSegmentsProjection,
  buildReportsStatsInputProjection,
  type CalendarTimeSegmentProjectionRow,
  type ReportsAggregationId,
} from "./shell/projections/time-review";
import {
  buildAiContextProjection,
  buildMlContextProjection,
  readExactMlPredictionForPage,
} from "./shell/projections/ml-ai-context";
import "./App.css";

type AppProps = {
  initializeRuntime?: RuntimeInitializer<AppRuntime>;
};

type PageRouteRole = "home" | "recent" | "command-open";

type FilterRouteRole = "inbox" | "all-tasks" | "today" | "saved";

type CalendarRouteMode = "day" | "week";

type PlaceholderRouteId = "reports";

type SearchMatchedField = "body" | "title";

type SearchRouteResult = {
  readonly matchedFields: readonly SearchMatchedField[];
  readonly pageId: string;
  readonly snippet: string;
  readonly title: string;
};

type SearchRouteData = {
  readonly kind: "search.results";
  readonly query: string;
  readonly results: readonly SearchRouteResult[];
};

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
      kind: "calendar";
    }
  | {
      kind: "placeholder";
      routeId: PlaceholderRouteId;
    }
  | {
      kind: "settings";
    }
  | {
      data: SearchRouteData;
      kind: "search";
      resultUnavailable?: boolean;
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

type CalendarNavigationRoute = {
  kind: "calendar";
  label: string;
  eyebrow: string;
  summary: string;
  icon: NavigationIcon;
};

type ShellTool = {
  id: ShellToolId;
  label: string;
  icon: NavigationIcon;
};

type DeferredShellToolId = Extract<ShellToolId, "settings">;

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

type SettingsDescriptorSummary = {
  descriptorId: string;
  description?: string;
  pluginId: string;
  pluginName: string;
  title: string;
};

const sessionHomeTitle = "Home";
const markdownPageViewId = "markdown.page-editor";
const pageEditorViewType = "page.editor";
const markdownInsertCommandId = "markdown.insert-text";
const openTaskPageCommandId = "task.open-task-page";
const toggleTaskStatusCommandId = "task.toggle-status";
const quickCapturePluginId = "quick-capture";
const quickCaptureOpenCommandId = "quick-capture.open";
const quickCaptureSaveCommandId = "quick-capture.save";
const quickCaptureSaveAndOpenCommandId = "quick-capture.save-and-open";
const quickCaptureModalViewId = "quick-capture.modal";
const searchPluginId = "search";
const searchQueryCommandId = "search.query";
const searchResultsKind = "search.results";
const calendarPluginId = "calendar";
const calendarDayViewId = "calendar.day";
const calendarWeekViewId = "calendar.week";
const calendarOpenSegmentCommandId = "calendar.open-time-segment";
const utcTimeZone = "UTC";
const statsPluginId = "stats";
const statsRunAggregationCommandId = "stats.run-aggregation";
const chartPluginId = "chart";
const chartBarViewType = "chart.bar";
const defaultReportsAggregationId = "stats.sum-time-by-page";
const mlPluginId = "ml";
const mlRunPredictionCommandId = "ml.run-prediction";
const mlPredictionResultKind = "ml.remaining-time-prediction";
const mlPredictionPanelViewId = "ml.prediction-panel";
const aiPluginId = "ai";
const aiSuggestionPanelViewId = "ai.suggestion-panel";
const aiReviewPanelViewId = "ai.review-panel";
const aiSuggestTagsCommandId = "ai.suggest-tags";
const aiSuggestDueDateCommandId = "ai.suggest-due-date";
const aiGenerateSubtasksCommandId = "ai.generate-subtasks";
const aiExplainPredictionCommandId = "ai.explain-prediction";
const aiSuggestedTagsOutputKeys = new Set(["confidence", "kind", "tags"]);
const aiSuggestedDueDateOutputKeys = new Set([
  "confidence",
  "dueDate",
  "kind",
  "reason",
]);
const aiSubtaskSuggestionsOutputKeys = new Set([
  "kind",
  "markdown",
  "subtasks",
]);
const aiPredictionExplanationOutputKeys = new Set([
  "explanation",
  "kind",
  "limitations",
]);
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
  "calendar",
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
const maxCommandFieldLength = 160;
const maxCommandContextLabels = 6;
const maxSearchQueryLength = 200;
const maxSearchPageIdLength = 256;
const maxSearchResults = 50;
const maxSearchSnippetLength = 160;
const maxSearchTitleLength = 200;
const searchResultsDataKeys = new Set(["kind", "query", "results"]);
const searchResultItemKeys = new Set([
  "matchedFields",
  "pageId",
  "snippet",
  "title",
]);
const allowedSearchMatchedFields = new Set<SearchMatchedField>([
  "body",
  "title",
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
  CalendarNavigationRoute,
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
    kind: "calendar",
    label: "Calendar",
    eyebrow: "Timeline",
    summary: "Time segments by day or week",
    icon: CalendarMonthIcon,
  },
  {
    kind: "placeholder",
    routeId: "reports",
    label: "Reports",
    eyebrow: "Review",
    summary: "Stats aggregations rendered through Chart views",
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
  const theme = useTheme();
  const isNarrowLayout = useMediaQuery(theme.breakpoints.down("md"));
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
  const [navigationOpen, setNavigationOpen] = useState(() => !isNarrowLayout);
  const navigationToggleRef = useRef<HTMLButtonElement | null>(null);
  const [contextPanelOpen, setContextPanelOpen] = useState(false);
  const contextPanelToggleRef = useRef<HTMLButtonElement | null>(null);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [deferredShellTool, setDeferredShellTool] =
    useState<DeferredShellToolId>();
  const [searchDialogOpen, setSearchDialogOpen] = useState(false);
  const searchGenerationRef = useRef(0);
  const [quickCaptureDialogOpen, setQuickCaptureDialogOpen] = useState(false);
  const [quickCaptureOpenError, setQuickCaptureOpenError] = useState(false);
  const [quickCaptureOpenPending, setQuickCaptureOpenPending] = useState(false);
  const refreshSlotSurfaces = useCallback(() => {
    setSlotRevision((revision) => revision + 1);
  }, []);
  const commandPaletteCommands = listCommandPaletteCommands(runtimeSource);
  const routeDetails = getActiveRouteDetails(
    runtimeSource,
    activeRoute,
    homePageId,
  );
  const contextPanelPage =
    activeRoute.kind === "page"
      ? getRoutePage(runtimeSource, activeRoute.pageId)
      : undefined;
  const recentPages = activeRouteCanShowRecentPages(runtimeSource, activeRoute)
    ? listRecentPages(runtimeSource, homePageId)
    : [];
  const savedFilterRoutes = listSavedFilterRoutes(runtimeSource);
  const workspaceTitleId = "workspace-title";
  const closeTemporaryNavigation = useCallback(() => {
    if (!isNarrowLayout) {
      return;
    }

    setNavigationOpen(false);
    navigationToggleRef.current?.focus();
  }, [isNarrowLayout]);
  const closeContextPanel = useCallback(() => {
    setContextPanelOpen(false);
    contextPanelToggleRef.current?.focus();
  }, []);

  useEffect(() => {
    // Keep the shell's default navigation state aligned when the viewport class changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNavigationOpen(!isNarrowLayout);
  }, [isNarrowLayout]);

  useEffect(() => {
    if (
      !contextPanelOpen ||
      isNarrowLayout ||
      commandPaletteOpen ||
      searchDialogOpen ||
      quickCaptureDialogOpen
    ) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeContextPanel();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    closeContextPanel,
    commandPaletteOpen,
    contextPanelOpen,
    isNarrowLayout,
    quickCaptureDialogOpen,
    searchDialogOpen,
  ]);

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
    setContextPanelOpen(false);
    setActiveRoute({
      filterId,
      kind: "filter",
      role,
    });
  };
  const selectCalendarRoute = () => {
    unsetCurrentPage(currentPageState);
    setContextPanelOpen(false);
    setActiveRoute({
      kind: "calendar",
    });
  };
  const selectPlaceholderRoute = (routeId: PlaceholderRouteId) => {
    unsetCurrentPage(currentPageState);
    setContextPanelOpen(false);
    setActiveRoute({
      kind: "placeholder",
      routeId,
    });
  };
  const selectSettingsRoute = () => {
    unsetCurrentPage(currentPageState);
    setContextPanelOpen(false);
    setActiveRoute({
      kind: "settings",
    });
  };
  const openSearchResult = useCallback(
    (pageId: string) => {
      if (getRoutePage(runtimeSource, pageId) === undefined) {
        setActiveRoute((route) =>
          route.kind === "search"
            ? {
                ...route,
                resultUnavailable: true,
              }
            : route,
        );
        return;
      }

      setCurrentPage(currentPageState, pageId);
      setActiveRoute({
        kind: "page",
        pageId,
        role: "recent",
      });
    },
    [currentPageState, runtimeSource],
  );
  const executeCommandPaletteCommand = useCallback(
    async (command: CommandPaletteCommand) => {
      const descriptor = getActiveOwnedCommandDescriptor(
        runtimeSource,
        command.id,
        command.pluginId,
      );

      if (
        descriptor === undefined ||
        createCommandDescriptorFingerprint(descriptor) !==
          command.descriptorFingerprint
      ) {
        throw new Error("Command unavailable");
      }

      await runtimeSource.commands.execute(descriptor.id, {});
    },
    [runtimeSource],
  );
  const closeSearchDialog = useCallback(() => {
    searchGenerationRef.current += 1;
    setSearchDialogOpen(false);
  }, []);
  const runSearch = useCallback(
    async (query: string) => {
      const boundedQuery = query.slice(0, maxSearchQueryLength);
      const searchGeneration = searchGenerationRef.current + 1;
      const searchIsCurrent = () =>
        searchGenerationRef.current === searchGeneration;

      searchGenerationRef.current = searchGeneration;

      try {
        const result = await executeActiveOwnedCommand(
          runtimeSource,
          searchQueryCommandId,
          searchPluginId,
          { query: boundedQuery },
        );

        if (!searchIsCurrent()) {
          return;
        }

        const data = readSearchRouteData(result, boundedQuery);

        if (!searchIsCurrent()) {
          return;
        }

        unsetCurrentPage(currentPageState);
        setContextPanelOpen(false);
        setActiveRoute({
          data,
          kind: "search",
        });
      } catch (error) {
        if (!searchIsCurrent()) {
          return;
        }

        throw error;
      }
    },
    [currentPageState, runtimeSource],
  );
  const openQuickCaptureDialog = useCallback(async () => {
    if (quickCaptureDialogOpen || quickCaptureOpenPending) {
      return;
    }

    setQuickCaptureOpenError(false);
    setDeferredShellTool(undefined);
    setQuickCaptureOpenPending(true);

    try {
      const result = await executeActiveOwnedCommand(
        runtimeSource,
        quickCaptureOpenCommandId,
        quickCapturePluginId,
        {},
      );

      if (
        !isExpectedQuickCaptureOpenResult(result) ||
        !quickCaptureModalViewIsAvailable(runtimeSource)
      ) {
        throw new Error("Quick Capture unavailable");
      }

      setQuickCaptureDialogOpen(true);
    } catch {
      setQuickCaptureOpenError(true);
    } finally {
      setQuickCaptureOpenPending(false);
    }
  }, [quickCaptureDialogOpen, quickCaptureOpenPending, runtimeSource]);
  const saveQuickCapture = useCallback(
    async (markdown: string) => {
      const result = await executeActiveOwnedCommand(
        runtimeSource,
        quickCaptureSaveCommandId,
        quickCapturePluginId,
        { markdown },
      );

      if (!isQuickCaptureSaveResult(result)) {
        throw new Error("Quick Capture save unavailable");
      }
    },
    [runtimeSource],
  );
  const saveAndOpenQuickCapture = useCallback(
    async (markdown: string) => {
      const result = await executeActiveOwnedCommand(
        runtimeSource,
        quickCaptureSaveAndOpenCommandId,
        quickCapturePluginId,
        { markdown },
      );
      const pageId = readQuickCaptureOpenPageId(result);

      if (pageId === undefined || getRoutePage(runtimeSource, pageId) === undefined) {
        throw new Error("Quick Capture page unavailable");
      }

      setCurrentPage(currentPageState, pageId);
      setActiveRoute({
        kind: "page",
        pageId,
        role: "command-open",
      });
    },
    [currentPageState, runtimeSource],
  );
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
              ref={navigationToggleRef}
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
                  color="inherit"
                  key={tool.id}
                  onClick={() => {
                    if (tool.id === "command") {
                      setDeferredShellTool(undefined);
                      setCommandPaletteOpen(true);
                      return;
                    }

                    if (tool.id === "capture") {
                      void openQuickCaptureDialog();
                      return;
                    }

                    if (tool.id === "search") {
                      setQuickCaptureOpenError(false);
                      setDeferredShellTool(undefined);
                      setSearchDialogOpen(true);
                      return;
                    }

                    if (tool.id === "settings") {
                      setQuickCaptureOpenError(false);
                      setDeferredShellTool(undefined);
                      selectSettingsRoute();
                    }
                  }}
                  startIcon={<ToolIcon fontSize="small" />}
                  variant="text"
                >
                  {tool.label}
                </Button>
              );
            })}
            {contextPanelPage !== undefined ? (
              <Button
                aria-controls="page-context-panel"
                aria-expanded={contextPanelOpen}
                onClick={() => setContextPanelOpen((open) => !open)}
                ref={contextPanelToggleRef}
                variant="text"
              >
                Context Panel
              </Button>
            ) : null}
          </Stack>
        </Toolbar>
      </AppBar>

      <Box className="app-shell__frame">
        <Box
          className="app-shell__navigation"
          hidden={!navigationOpen}
          id="workspace-navigation"
        >
          <Drawer
            onClose={closeTemporaryNavigation}
            open={navigationOpen}
            variant={isNarrowLayout ? "temporary" : "permanent"}
          >
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
                          } else if (route.kind === "calendar") {
                            selectCalendarRoute();
                          } else {
                            selectPlaceholderRoute(route.routeId);
                          }

                          closeTemporaryNavigation();
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
                            onClick={() => {
                              selectPageRoute(page.id, "recent");
                              closeTemporaryNavigation();
                            }}
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
                          onClick={() => {
                            selectFilterRoute(route.filterId, "saved");
                            closeTemporaryNavigation();
                          }}
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
            {quickCaptureOpenError ? (
              <Alert severity="error">Quick Capture could not open.</Alert>
            ) : null}
            {deferredShellTool !== undefined ? (
              <Box role="status">
                {getDeferredShellToolStatus(deferredShellTool)}
              </Box>
            ) : null}
          </Stack>

          <WorkspaceRouteContent
            activeRoute={activeRoute}
            bridge={bridge}
            onOpenSearchResult={openSearchResult}
            runtime={runtimeSource}
            slotRevision={slotRevision}
          />
        </Box>
        {contextPanelPage !== undefined && contextPanelOpen ? (
          isNarrowLayout ? (
            <Dialog
              aria-labelledby="page-context-title"
              className="app-shell__context-dialog"
              fullScreen
              onClose={closeContextPanel}
              open={contextPanelOpen}
            >
              <PageContextPanel
                key={`${contextPanelPage.id}:${currentPageState.generation}:dialog`}
                onClose={closeContextPanel}
                page={contextPanelPage}
                runtime={runtimeSource}
                surface="dialog"
              />
            </Dialog>
          ) : (
            <PageContextPanel
              key={`${contextPanelPage.id}:${currentPageState.generation}:complementary`}
              onClose={closeContextPanel}
              page={contextPanelPage}
              runtime={runtimeSource}
              surface="complementary"
            />
          )
        ) : null}
      </Box>

      <CommandPaletteDialog
        commands={commandPaletteCommands}
        onClose={() => setCommandPaletteOpen(false)}
        onExecute={executeCommandPaletteCommand}
        open={commandPaletteOpen}
      />
      <SearchDialog
        onClose={closeSearchDialog}
        onSearch={runSearch}
        open={searchDialogOpen}
      />
      <QuickCaptureDialog
        onClose={() => setQuickCaptureDialogOpen(false)}
        onSave={saveQuickCapture}
        onSaveAndOpen={saveAndOpenQuickCapture}
        open={quickCaptureDialogOpen}
      />

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
  onOpenSearchResult,
  runtime,
  slotRevision,
}: {
  activeRoute: ActiveRoute;
  bridge: MarkdownWorkspaceBridgeValue;
  onOpenSearchResult(pageId: string): void;
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

  if (activeRoute.kind === "calendar") {
    return <CalendarWorkspace runtime={runtime} />;
  }

  if (activeRoute.kind === "search") {
    return (
      <SearchResultsWorkspace
        data={activeRoute.data}
        onOpenResult={onOpenSearchResult}
        resultUnavailable={activeRoute.resultUnavailable === true}
      />
    );
  }

  if (activeRoute.kind === "settings") {
    return <SettingsWorkspace runtime={runtime} />;
  }

  const route = getPlaceholderRoute(activeRoute.routeId);

  if (activeRoute.routeId === "reports") {
    return <ReportsWorkspace runtime={runtime} />;
  }

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

function SettingsWorkspace({ runtime }: { runtime: AppRuntime }) {
  const settingsDescriptors = listSettingsDescriptorSummaries(runtime);

  return (
    <Stack className="app-shell__settings-workspace" spacing={2}>
      <Box
        aria-labelledby="settings-runtime-facts-title"
        className="app-shell__settings-panel"
        component="section"
      >
        <Typography
          component="h3"
          id="settings-runtime-facts-title"
          variant="subtitle1"
        >
          Runtime facts
        </Typography>
        <Box className="app-shell__settings-facts" component="dl">
          <Box>
            <Typography color="text.secondary" component="dt" variant="caption">
              App
            </Typography>
            <Typography component="dd" variant="body2">
              Mirabilis
            </Typography>
          </Box>
          <Box>
            <Typography color="text.secondary" component="dt" variant="caption">
              Version
            </Typography>
            <Typography component="dd" variant="body2">
              {runtime.app.version}
            </Typography>
          </Box>
          <Box>
            <Typography color="text.secondary" component="dt" variant="caption">
              Plugin API
            </Typography>
            <Typography component="dd" variant="body2">
              {runtime.app.pluginApiVersion ?? "not advertised"}
            </Typography>
          </Box>
        </Box>
      </Box>

      <Box
        aria-labelledby="settings-plugin-descriptors-title"
        className="app-shell__settings-panel"
        component="section"
      >
        <Stack spacing={1}>
          <Typography
            component="h3"
            id="settings-plugin-descriptors-title"
            variant="subtitle1"
          >
            Plugin settings descriptors
          </Typography>
          <Typography color="text.secondary" variant="body2">
            Public plugin records are copied from the plugin host for display
            only.
          </Typography>
          {settingsDescriptors.length > 0 ? (
            <List aria-label="Public settings descriptors" dense>
              {settingsDescriptors.map((descriptor) => (
                <Box
                  className="app-shell__settings-descriptor"
                  component="li"
                  key={`${descriptor.pluginId}:${descriptor.descriptorId}`}
                >
                  <Stack spacing={0.5}>
                    <Typography variant="subtitle2">
                      {descriptor.pluginName}
                    </Typography>
                    <Typography color="text.secondary" variant="body2">
                      {descriptor.descriptorId}
                    </Typography>
                    <Typography variant="body2">{descriptor.title}</Typography>
                    {descriptor.description !== undefined ? (
                      <Typography color="text.secondary" variant="body2">
                        {descriptor.description}
                      </Typography>
                    ) : null}
                    <Typography color="text.secondary" variant="caption">
                      Inert manifest descriptor; descriptor-only and no
                      executable settings panel.
                    </Typography>
                  </Stack>
                </Box>
              ))}
            </List>
          ) : (
            <Box role="status">No plugin settings descriptors are registered.</Box>
          )}
        </Stack>
      </Box>

      <Box
        aria-labelledby="settings-sync-title"
        className="app-shell__settings-panel"
        component="section"
      >
        <Stack spacing={1}>
          <Typography component="h3" id="settings-sync-title" variant="subtitle1">
            Sync
          </Typography>
          <Box role="status">
            Sync is an inactive skeleton panel. It exposes public status only
            and has no executable settings panel.
          </Box>
          <List aria-label="Sync skeleton status" dense>
            {[
              "Plugin id sync",
              "no runtime commands",
              "no views",
              "no settings panels",
              "no transport",
              "no remote endpoint",
              "no background jobs",
              "no conflict UI",
              "no settings persistence enabled",
            ].map((status) => (
              <Box
                className="app-shell__settings-status-row"
                component="li"
                key={status}
              >
                <Typography variant="body2">{status}</Typography>
              </Box>
            ))}
          </List>
        </Stack>
      </Box>
    </Stack>
  );
}

type ProjectionSourceSnapshot = {
  events: AppEvent[];
  metadata: MetadataRecord[];
  pages: MarkdownPage[];
};

type ReportsViewState =
  | {
      status: "idle" | "loading";
    }
  | {
      status: "ready";
      chartData: unknown;
    }
  | {
      status: "error";
    };

type ContextPanelTabId = "ml" | "review" | "suggestions";

type MlContextState =
  | {
      status: "idle" | "loading" | "error";
    }
  | {
      prediction: unknown;
      status: "ready";
    };

type AiAllowedCommandId =
  | "ai.explain-prediction"
  | "ai.generate-subtasks"
  | "ai.suggest-due-date"
  | "ai.suggest-tags";

type AiCommandState =
  | {
      status: "loading" | "error";
    }
  | {
      output: unknown;
      status: "ready";
    };

type AiCommandStates = Partial<Record<AiAllowedCommandId, AiCommandState>>;

const reportsAggregationOptions: ReadonlyArray<{
  id: ReportsAggregationId;
  label: string;
}> = [
  {
    id: defaultReportsAggregationId,
    label: "Sum time by page",
  },
  {
    id: "stats.sum-time-by-tag",
    label: "Sum time by tag",
  },
  {
    id: "stats.estimate-vs-actual",
    label: "Estimate vs actual",
  },
  {
    id: "stats.habit-completion-rate",
    label: "Habit completion rate",
  },
  {
    id: "stats.task-switch-count",
    label: "Task switch count",
  },
  {
    id: "stats.unnoted-sessions-count",
    label: "Unnoted sessions count",
  },
];

function PageContextPanel({
  onClose,
  page,
  runtime,
  surface,
}: {
  onClose(): void;
  page: MarkdownPage;
  runtime: AppRuntime;
  surface: "complementary" | "dialog";
}) {
  const isComplementarySurface = surface === "complementary";
  const [activeTab, setActiveTab] = useState<ContextPanelTabId>("ml");
  const [mlState, setMlState] = useState<MlContextState>({ status: "idle" });
  const [aiStates, setAiStates] = useState<AiCommandStates>({});
  const [generatedAt] = useState(() => {
    const currentSecondMs = Math.floor(Date.now() / 1_000) * 1_000;

    return new Date(currentSecondMs).toISOString();
  });
  const mountedRef = useRef(true);
  const mlRunRef = useRef(0);
  const aiRunRefs = useRef<Partial<Record<AiAllowedCommandId, number>>>({});
  const snapshot = readProjectionSnapshot(runtime);
  const mlProjection =
    snapshot === undefined
      ? undefined
      : buildMlContextProjection({
          ...snapshot,
          currentPageId: page.id,
          generatedAt,
        });
  const aiProjection =
    snapshot === undefined
      ? undefined
      : buildAiContextProjection({
          ...snapshot,
          currentPageId: page.id,
          generatedAt,
          ...(mlState.status === "ready" ? { prediction: mlState.prediction } : {}),
        });
  const mlPrediction =
    mlState.status === "ready"
      ? mlState.prediction
      : {
          kind: mlPredictionResultKind,
        };
  const mlViewAvailable =
    getActiveOwnedView(
      runtime,
      mlPredictionPanelViewId,
      mlPluginId,
      mlPredictionPanelViewId,
    ) !== undefined;
  const mlCanRun =
    mlProjection !== undefined &&
    mlProjection.status.kind !== "unavailable" &&
    mlViewAvailable &&
    getActiveOwnedCommandDescriptor(
      runtime,
      mlRunPredictionCommandId,
      mlPluginId,
    ) !== undefined;

  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  const runMlPrediction = useCallback(async () => {
    if (mlProjection === undefined || mlProjection.status.kind === "unavailable") {
      setMlState({ status: "error" });
      return;
    }

    const runId = mlRunRef.current + 1;

    mlRunRef.current = runId;
    setMlState({ status: "loading" });

    try {
      const output = await executeActiveOwnedCommand(
        runtime,
        mlRunPredictionCommandId,
        mlPluginId,
        mlProjection.data,
      );
      const prediction = readMlPredictionForPage(output, page.id);

      if (!mountedRef.current || mlRunRef.current !== runId) {
        return;
      }

      if (prediction === undefined) {
        setMlState({ status: "error" });
        return;
      }

      setMlState({
        prediction,
        status: "ready",
      });
    } catch {
      if (mountedRef.current && mlRunRef.current === runId) {
        setMlState({ status: "error" });
      }
    }
  }, [mlProjection, page.id, runtime]);

  const runAiCommand = useCallback(
    async (commandId: AiAllowedCommandId, payload: unknown) => {
      if (!isRecord(payload)) {
        setAiStates((states) => ({
          ...states,
          [commandId]: { status: "error" },
        }));
        return;
      }

      const runId = (aiRunRefs.current[commandId] ?? 0) + 1;

      aiRunRefs.current[commandId] = runId;
      setAiStates((states) => ({
        ...states,
        [commandId]: { status: "loading" },
      }));

      try {
        const output = await executeActiveOwnedCommand(
          runtime,
          commandId,
          aiPluginId,
          payload,
        );

        if (
          !mountedRef.current ||
          aiRunRefs.current[commandId] !== runId
        ) {
          return;
        }

        if (!isAiCommandOutputForCommand(commandId, output)) {
          setAiStates((states) => ({
            ...states,
            [commandId]: { status: "error" },
          }));
          return;
        }

        setAiStates((states) => ({
          ...states,
          [commandId]: {
            output,
            status: "ready",
          },
        }));
      } catch {
        if (
          mountedRef.current &&
          aiRunRefs.current[commandId] === runId
        ) {
          setAiStates((states) => ({
            ...states,
            [commandId]: { status: "error" },
          }));
        }
      }
    },
    [runtime],
  );

  return (
    <Box
      aria-label={isComplementarySurface ? "Page context" : undefined}
      className="app-shell__context-panel"
      component={isComplementarySurface ? "aside" : "section"}
      id="page-context-panel"
      role={isComplementarySurface ? "complementary" : undefined}
    >
      <Stack className="app-shell__context-panel-header" spacing={1}>
        <Stack
          direction="row"
          spacing={1}
          sx={{ alignItems: "flex-start" }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography component="h2" variant="subtitle1">
              <span id="page-context-title">Page context</span>
            </Typography>
            <Typography color="text.secondary" variant="caption">
              {page.title}
            </Typography>
          </Box>
          <Button
            aria-label="Close context panel"
            onClick={onClose}
            sx={{ marginLeft: "auto" }}
            variant="text"
          >
            Close
          </Button>
        </Stack>

        <Tabs
          aria-label="Page context panels"
          onChange={(_event, value: ContextPanelTabId) => setActiveTab(value)}
          value={activeTab}
        >
          <Tab
            aria-controls="page-context-ml-panel"
            id="page-context-ml-tab"
            label="ML"
            value="ml"
          />
          <Tab
            aria-controls="page-context-suggestions-panel"
            id="page-context-suggestions-tab"
            label="Suggestions"
            value="suggestions"
          />
          <Tab
            aria-controls="page-context-review-panel"
            id="page-context-review-tab"
            label="Review"
            value="review"
          />
        </Tabs>
      </Stack>

      <Box
        aria-labelledby="page-context-ml-tab"
        className="app-shell__context-tab-panel"
        hidden={activeTab !== "ml"}
        id="page-context-ml-panel"
        role="tabpanel"
      >
        {activeTab === "ml" ? (
          <Stack spacing={1.5}>
            <Button
              disabled={!mlCanRun || mlState.status === "loading"}
              onClick={() => void runMlPrediction()}
              variant="contained"
            >
              Run prediction
            </Button>
            <MlContextStatus
              projectionStatus={mlProjection?.status}
              surfaceAvailable={mlCanRun}
              state={mlState}
            />
            {mlState.status === "ready" ? (
              <ViewHost
                acceptedData={mlPrediction}
                isPluginAvailable={(pluginId) => isPluginActive(runtime, pluginId)}
                registry={runtime.registries.views}
                viewId={mlPredictionPanelViewId}
                viewType={mlPredictionPanelViewId}
              />
            ) : null}
          </Stack>
        ) : null}
      </Box>

      <Box
        aria-labelledby="page-context-suggestions-tab"
        className="app-shell__context-tab-panel"
        hidden={activeTab !== "suggestions"}
        id="page-context-suggestions-panel"
        role="tabpanel"
      >
        {activeTab === "suggestions" ? (
          <Stack spacing={1.5}>
            <ViewHost
              acceptedData={{
                kind: aiSuggestionPanelViewId,
              }}
              isPluginAvailable={(pluginId) => isPluginActive(runtime, pluginId)}
              registry={runtime.registries.views}
              viewId={aiSuggestionPanelViewId}
              viewType={aiSuggestionPanelViewId}
            />
            <AiSuggestionControls
              aiProjection={aiProjection}
              commandStates={aiStates}
              onRunCommand={runAiCommand}
              runtime={runtime}
            />
          </Stack>
        ) : null}
      </Box>

      <Box
        aria-labelledby="page-context-review-tab"
        className="app-shell__context-tab-panel"
        hidden={activeTab !== "review"}
        id="page-context-review-panel"
        role="tabpanel"
      >
        {activeTab === "review" ? (
          <ViewHost
            acceptedData={{
              kind: aiReviewPanelViewId,
            }}
            isPluginAvailable={(pluginId) => isPluginActive(runtime, pluginId)}
            registry={runtime.registries.views}
            viewId={aiReviewPanelViewId}
            viewType={aiReviewPanelViewId}
          />
        ) : null}
      </Box>
    </Box>
  );
}

function MlContextStatus({
  projectionStatus,
  surfaceAvailable,
  state,
}: {
  projectionStatus: ReturnType<typeof buildMlContextProjection>["status"] | undefined;
  surfaceAvailable: boolean;
  state: MlContextState;
}) {
  if (
    projectionStatus === undefined ||
    projectionStatus.kind === "unavailable" ||
    !surfaceAvailable
  ) {
    return (
      <Alert severity="error">
        ML context unavailable. This panel could not load.
      </Alert>
    );
  }

  if (state.status === "loading") {
    return (
      <Box aria-label="ML prediction loading" role="status">
        Running prediction.
      </Box>
    );
  }

  if (state.status === "error") {
    return (
      <Alert severity="error">
        ML prediction unavailable. This panel could not load.
      </Alert>
    );
  }

  if (projectionStatus.kind === "partial") {
    return (
      <Box aria-label="ML context data" role="status">
        Partial ML context. Some rows were omitted.
      </Box>
    );
  }

  return null;
}

function AiSuggestionControls({
  aiProjection,
  commandStates,
  onRunCommand,
  runtime,
}: {
  aiProjection: ReturnType<typeof buildAiContextProjection> | undefined;
  commandStates: AiCommandStates;
  onRunCommand(commandId: AiAllowedCommandId, payload: unknown): void;
  runtime: AppRuntime;
}) {
  const commands = isRecord(aiProjection?.data.advisoryCommands)
    ? aiProjection.data.advisoryCommands
    : {};
  const suggestionCommands: ReadonlyArray<{
    commandId: AiAllowedCommandId;
    label: string;
  }> = [
    {
      commandId: aiSuggestTagsCommandId,
      label: "Suggest tags",
    },
    {
      commandId: aiSuggestDueDateCommandId,
      label: "Suggest due date",
    },
    {
      commandId: aiGenerateSubtasksCommandId,
      label: "Generate subtasks",
    },
    ...(isRecord(commands[aiExplainPredictionCommandId])
      ? [
          {
            commandId: aiExplainPredictionCommandId,
            label: "Explain prediction",
          } as const,
        ]
      : []),
  ];
  const hasLoadingCommand = suggestionCommands.some(
    ({ commandId }) => commandStates[commandId]?.status === "loading",
  );

  if (aiProjection === undefined || aiProjection.status.kind === "unavailable") {
    return (
      <Alert severity="error">
        AI suggestion unavailable. This panel could not load.
      </Alert>
    );
  }

  return (
    <Stack spacing={1}>
      <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }} useFlexGap>
        {suggestionCommands.map(({ commandId, label }) => {
          const payload = commands[commandId];
          const isAvailable =
            isRecord(payload) &&
            getActiveOwnedCommandDescriptor(runtime, commandId, aiPluginId) !==
              undefined;
          const state = commandStates[commandId];

          return (
            <Button
              disabled={!isAvailable || state?.status === "loading"}
              key={commandId}
              onClick={() => onRunCommand(commandId, payload)}
              variant="outlined"
            >
              {label}
            </Button>
          );
        })}
      </Stack>
      {aiProjection.status.kind === "partial" ? (
        <Box aria-label="AI context data" role="status">
          Partial AI context. Some rows were omitted.
        </Box>
      ) : null}
      {suggestionCommands.map(({ commandId }) => (
        <AiCommandResult
          commandId={commandId}
          key={commandId}
          suppressAlert={hasLoadingCommand}
          state={commandStates[commandId]}
        />
      ))}
    </Stack>
  );
}

function AiCommandResult({
  commandId,
  suppressAlert,
  state,
}: {
  commandId: AiAllowedCommandId;
  suppressAlert: boolean;
  state: AiCommandState | undefined;
}) {
  if (state === undefined) {
    return null;
  }

  if (state.status === "loading") {
    return (
      <Box aria-label={`${commandId} loading`} role="status">
        Generating suggestion.
      </Box>
    );
  }

  if (state.status === "error") {
    if (suppressAlert) {
      return (
        <Box aria-label={`${commandId} unavailable`} role="status">
          AI suggestion unavailable. Could not generate.
        </Box>
      );
    }

    return (
      <Alert severity="error">
        AI suggestion unavailable. Could not generate.
      </Alert>
    );
  }

  if (state.status === "ready") {
    return (
      <Box aria-label={`${commandId} result`} role="status">
        {formatAiCommandOutput(commandId, state.output)}
      </Box>
    );
  }

  return null;
}

function formatAiCommandOutput(
  commandId: AiAllowedCommandId,
  output: unknown,
): string {
  if (!isRecord(output)) {
    return "AI suggestion ready.";
  }

  if (commandId === aiSuggestTagsCommandId && Array.isArray(output.tags)) {
    const tags = output.tags.filter((tag): tag is string => typeof tag === "string");

    return tags.length > 0
      ? `Suggested tags: ${tags.join(", ")}`
      : "Suggested tags ready.";
  }

  if (
    commandId === aiSuggestDueDateCommandId &&
    typeof output.dueDate === "string"
  ) {
    return `Suggested due date: ${output.dueDate}`;
  }

  if (
    commandId === aiGenerateSubtasksCommandId &&
    typeof output.markdown === "string"
  ) {
    return `Generated subtasks: ${output.markdown}`;
  }

  if (
    commandId === aiExplainPredictionCommandId &&
    typeof output.explanation === "string"
  ) {
    return output.explanation;
  }

  return "AI suggestion ready.";
}

function isAiCommandOutputForCommand(
  commandId: AiAllowedCommandId,
  output: unknown,
): boolean {
  if (commandId === aiSuggestTagsCommandId) {
    const record = readExactDataRecord(output, aiSuggestedTagsOutputKeys);

    return (
      record !== undefined &&
      record.kind === "ai.suggested-tags" &&
      isConfidence(record.confidence) &&
      isStringArray(record.tags)
    );
  }

  if (commandId === aiSuggestDueDateCommandId) {
    const record = readExactDataRecord(output, aiSuggestedDueDateOutputKeys);

    return (
      record !== undefined &&
      record.kind === "ai.suggested-due-date" &&
      isConfidence(record.confidence) &&
      typeof record.dueDate === "string" &&
      /^\d{4}-\d{2}-\d{2}$/u.test(record.dueDate) &&
      typeof record.reason === "string"
    );
  }

  if (commandId === aiGenerateSubtasksCommandId) {
    const record = readExactDataRecord(output, aiSubtaskSuggestionsOutputKeys);

    return (
      record !== undefined &&
      record.kind === "ai.subtask-suggestions" &&
      typeof record.markdown === "string" &&
      isStringArray(record.subtasks)
    );
  }

  const record = readExactDataRecord(output, aiPredictionExplanationOutputKeys);

  return (
    record !== undefined &&
    record.kind === "ai.prediction-explanation" &&
    typeof record.explanation === "string" &&
    isStringArray(record.limitations)
  );
}

function readExactDataRecord(
  input: unknown,
  keys: ReadonlySet<string>,
): Record<string, unknown> | undefined {
  if (!isRecord(input)) {
    return undefined;
  }

  let prototype: object | null;
  let ownKeys: readonly PropertyKey[];

  try {
    prototype = Object.getPrototypeOf(input);
    ownKeys = Reflect.ownKeys(input);
  } catch {
    return undefined;
  }

  if (
    prototype !== Object.prototype ||
    ownKeys.length !== keys.size ||
    ownKeys.some((key) => typeof key !== "string" || !keys.has(key))
  ) {
    return undefined;
  }

  for (const key of keys) {
    let descriptor: PropertyDescriptor | undefined;

    try {
      descriptor = Object.getOwnPropertyDescriptor(input, key);
    } catch {
      return undefined;
    }

    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, "value")
    ) {
      return undefined;
    }
  }

  return input;
}

function isConfidence(value: unknown): boolean {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
  );
}

function isStringArray(value: unknown): value is string[] {
  if (!Array.isArray(value)) {
    return false;
  }

  let prototype: object | null;
  let ownKeys: readonly PropertyKey[];
  let length: number;

  try {
    prototype = Object.getPrototypeOf(value);
    ownKeys = Reflect.ownKeys(value);
    length = value.length;
  } catch {
    return false;
  }

  if (prototype !== Array.prototype || !Number.isSafeInteger(length)) {
    return false;
  }

  const allowedKeys = new Set<PropertyKey>(["length"]);

  for (let index = 0; index < length; index += 1) {
    const key = String(index);
    let descriptor: PropertyDescriptor | undefined;

    try {
      descriptor = Object.getOwnPropertyDescriptor(value, key);
    } catch {
      return false;
    }

    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, "value") ||
      typeof descriptor.value !== "string"
    ) {
      return false;
    }

    allowedKeys.add(key);
  }

  return ownKeys.every((key) => allowedKeys.has(key));
}

function readMlPredictionForPage(
  input: unknown,
  pageId: string,
): unknown | undefined {
  return readExactMlPredictionForPage(input, pageId);
}

function CalendarWorkspace({ runtime }: { runtime: AppRuntime }) {
  const [mode, setMode] = useState<CalendarRouteMode>("day");
  const range = useMemo(() => getCalendarRouteRange(mode), [mode]);
  const snapshot = readProjectionSnapshot(runtime);
  const viewId = mode === "day" ? calendarDayViewId : calendarWeekViewId;

  if (
    snapshot === undefined ||
    getActiveOwnedView(runtime, viewId, calendarPluginId, viewId) === undefined ||
    getActiveOwnedCommandDescriptor(
      runtime,
      calendarOpenSegmentCommandId,
      calendarPluginId,
    ) === undefined
  ) {
    return <RouteUnavailable />;
  }

  const projection = buildCalendarTimeSegmentsProjection({
    ...snapshot,
    rangeEndAt: range.rangeEndAt,
    rangeStartAt: range.rangeStartAt,
  });

  if (projection.status.kind === "unavailable") {
    return <RouteUnavailable />;
  }

  const commandBridge = makeTimeSegmentCommandBridge({
    runtime,
    segments: projection.data.segments,
  });

  return (
    <Stack
      aria-label="Calendar route"
      className="app-shell__calendar-route"
      component="section"
      spacing={2}
    >
      <Stack direction="row" spacing={1}>
        <Button
          aria-pressed={mode === "day"}
          onClick={() => setMode("day")}
          variant={mode === "day" ? "contained" : "outlined"}
        >
          Day
        </Button>
        <Button
          aria-pressed={mode === "week"}
          onClick={() => setMode("week")}
          variant={mode === "week" ? "contained" : "outlined"}
        >
          Week
        </Button>
      </Stack>

      <CalendarProjectionStatus status={projection.status} />

      <ViewHost
        acceptedData={projection.data}
        commandBridge={commandBridge}
        isPluginAvailable={(pluginId) => isPluginActive(runtime, pluginId)}
        props={{
          timeZone: utcTimeZone,
          ...(mode === "day" ? { date: range.date } : { weekStart: range.weekStart }),
        }}
        registry={runtime.registries.views}
        viewId={viewId}
        viewType={viewId}
      />
    </Stack>
  );
}

function CalendarProjectionStatus({
  status,
}: {
  status: ReturnType<typeof buildCalendarTimeSegmentsProjection>["status"];
}) {
  if (status.kind === "complete") {
    return null;
  }

  if (status.kind === "partial") {
    return (
      <Box aria-label="Calendar data" role="status">
        Partial calendar data. Showing {formatCount(status.limit ?? 0)} time
        segments.
      </Box>
    );
  }

  return (
    <Box aria-label="Calendar data" role="status">
      No time segments.
    </Box>
  );
}

function ReportsWorkspace({ runtime }: { runtime: AppRuntime }) {
  const [aggregationId, setAggregationId] = useState<ReportsAggregationId>(
    defaultReportsAggregationId,
  );
  const [viewState, setViewState] = useState<ReportsViewState>({
    status: "loading",
  });
  const dateRange = useMemo(() => getReportsDateRange(), []);
  const projection = useMemo(
    () => {
      const snapshot = readProjectionSnapshot(runtime);

      return snapshot === undefined
        ? undefined
        : buildReportsStatsInputProjection({
            ...snapshot,
            aggregationId,
            endDate: dateRange.endDate,
            startDate: dateRange.startDate,
          });
    },
    [aggregationId, dateRange.endDate, dateRange.startDate, runtime],
  );
  const routeAvailable =
    projection !== undefined &&
    getActiveOwnedCommandDescriptor(
      runtime,
      statsRunAggregationCommandId,
      statsPluginId,
    ) !== undefined &&
    getActiveOwnedView(
      runtime,
      projection.chartViewId,
      chartPluginId,
      projection.chartViewId,
    ) !== undefined;

  useEffect(() => {
    if (!routeAvailable || projection === undefined) {
      return;
    }

    let active = true;

    void executeActiveOwnedCommand(
      runtime,
      statsRunAggregationCommandId,
      statsPluginId,
      {
        aggregationId: projection.aggregationId,
        input: projection.input,
      },
    ).then(
      (chartData) => {
        if (active) {
          setViewState({
            chartData,
            status: "ready",
          });
        }
      },
      () => {
        if (active) {
          setViewState({ status: "error" });
        }
      },
    );

    return () => {
      active = false;
    };
  }, [projection, routeAvailable, runtime]);

  if (!routeAvailable || projection === undefined) {
    return <RouteUnavailable />;
  }

  return (
    <Stack
      aria-label="Reports route"
      className="app-shell__reports-route"
      component="section"
      spacing={2}
    >
      <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }} useFlexGap>
        {reportsAggregationOptions.map((option) => (
          <Button
            aria-pressed={aggregationId === option.id}
            key={option.id}
            onClick={() => {
              if (aggregationId !== option.id) {
                setViewState({ status: "loading" });
                setAggregationId(option.id);
              }
            }}
            variant={aggregationId === option.id ? "contained" : "outlined"}
          >
            {option.label}
          </Button>
        ))}
      </Stack>

      <ReportsProjectionStatus
        aggregationId={projection.aggregationId}
        status={projection.status}
      />

      {viewState.status === "loading" || viewState.status === "idle" ? (
        <Box aria-label="Reports loading" role="status">
          Running Reports aggregation.
        </Box>
      ) : null}

      {viewState.status === "error" ? (
        <Alert severity="error">
          Reports aggregation unavailable. This workspace could not load.
        </Alert>
      ) : null}

      {viewState.status === "ready" ? (
        <ViewHost
          acceptedData={viewState.chartData}
          isPluginAvailable={(pluginId) => isPluginActive(runtime, pluginId)}
          registry={runtime.registries.views}
          viewId={projection.chartViewId}
          viewType={chartBarViewType}
        />
      ) : null}
    </Stack>
  );
}

function ReportsProjectionStatus({
  aggregationId,
  status,
}: {
  aggregationId: ReportsAggregationId;
  status: ReturnType<typeof buildReportsStatsInputProjection>["status"];
}) {
  if (status.kind === "complete") {
    return null;
  }

  if (status.kind === "partial") {
    return (
      <Box aria-label="Reports data" role="status">
        {aggregationId === "stats.estimate-vs-actual"
          ? "Partial Reports data. Task estimate input is unavailable."
          : "Partial Reports data. Some rows were omitted."}
      </Box>
    );
  }

  return (
    <Box aria-label="Reports data" role="status">
      No Reports data.
    </Box>
  );
}

function SearchResultsWorkspace({
  data,
  onOpenResult,
  resultUnavailable,
}: {
  data: SearchRouteData;
  onOpenResult(pageId: string): void;
  resultUnavailable: boolean;
}) {
  return (
    <Stack
      aria-label="Search results"
      className="app-shell__search-results"
      component="section"
      spacing={2}
    >
      {resultUnavailable ? (
        <Alert severity="error">Result unavailable. Page could not open.</Alert>
      ) : null}

      <Typography aria-atomic role="status" variant="body2">
        {formatSearchResultsStatus(data.results.length)}
      </Typography>

      <List aria-label="Search results" dense>
        {data.results.map((result) => (
          <Box component="li" key={result.pageId}>
            <ListItemButton
              component="button"
              onClick={() => onOpenResult(result.pageId)}
              sx={{
                alignItems: "flex-start",
                display: "block",
                textAlign: "left",
                width: "100%",
              }}
            >
              <ListItemText
                primary={result.title}
                secondary={
                  <Box component="span">
                    <Typography
                      color="text.secondary"
                      component="span"
                      sx={{ display: "block" }}
                      variant="body2"
                    >
                      {result.snippet}
                    </Typography>
                    <Typography
                      color="text.secondary"
                      component="span"
                      sx={{ display: "block" }}
                      variant="caption"
                    >
                      Matched {result.matchedFields.join(", ")}
                    </Typography>
                  </Box>
                }
              />
            </ListItemButton>
          </Box>
        ))}
      </List>
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

  if (route.kind === "calendar") {
    return activeRoute.kind === "calendar";
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

  if (activeRoute.kind === "search") {
    return {
      eyebrow: "Search",
      label: "Search",
      summary: "Search results",
    };
  }

  if (activeRoute.kind === "calendar") {
    const route = primaryNavigationRoutes.find(
      (candidate): candidate is CalendarNavigationRoute =>
        candidate.kind === "calendar",
    );

    return (
      route ?? {
        eyebrow: "Timeline",
        label: "Calendar",
        summary: "Time segments by day or week",
      }
    );
  }

  if (activeRoute.kind === "settings") {
    return {
      eyebrow: "Settings",
      label: "Settings",
      summary: "App runtime facts and inert plugin settings descriptors",
    };
  }

  return getPlaceholderRoute(activeRoute.routeId);
}

function listSettingsDescriptorSummaries(
  runtime: AppRuntime,
): SettingsDescriptorSummary[] {
  const plugins = runtime.pluginHost.listPlugins?.() ?? [];

  return plugins
    .flatMap((plugin) =>
      (plugin.manifest.contributes?.settingsPanels ?? []).map((descriptor) => ({
        descriptorId: descriptor.id,
        ...(descriptor.description !== undefined
          ? { description: descriptor.description }
          : {}),
        pluginId: plugin.id,
        pluginName: plugin.name,
        title: descriptor.title,
      })),
    )
    .sort((left, right) => {
      const pluginCompare = left.pluginName.localeCompare(right.pluginName);

      if (pluginCompare !== 0) {
        return pluginCompare;
      }

      return left.descriptorId.localeCompare(right.descriptorId);
    });
}

function getPlaceholderRoute(
  routeId: PlaceholderRouteId,
): PlaceholderNavigationRoute {
  const route = primaryNavigationRoutes.find(
    (candidate): candidate is PlaceholderNavigationRoute =>
      candidate.kind === "placeholder" && candidate.routeId === routeId,
  );

  return route ?? primaryNavigationRoutes[5];
}

function getDeferredShellToolStatus(toolId: DeferredShellToolId): string {
  void toolId;
  return "Settings surface placeholder";
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

function readProjectionSnapshot(
  runtime: AppRuntime,
): ProjectionSourceSnapshot | undefined {
  try {
    return {
      events: runtime.events.list(),
      metadata: runtime.metadata.list(),
      pages: runtime.pages.list({ includeArchived: true }),
    };
  } catch {
    return undefined;
  }
}

function getActiveOwnedView(
  runtime: AppRuntime,
  viewId: string,
  pluginId: string,
  viewType: string,
) {
  if (!isPluginActive(runtime, pluginId)) {
    return undefined;
  }

  try {
    const view = runtime.registries.views.get(viewId);

    return view.id === viewId &&
      view.pluginId === pluginId &&
      view.type === viewType
      ? view
      : undefined;
  } catch {
    return undefined;
  }
}

function getCalendarRouteRange(mode: CalendarRouteMode): {
  date: string;
  rangeEndAt: string;
  rangeStartAt: string;
  weekStart: string;
} {
  const today = utcDateOnly(Date.now());
  const dayStartMs = Date.parse(`${today}T00:00:00.000Z`);
  const weekStart = mondayUtcDateOnly(dayStartMs);
  const weekStartMs = Date.parse(`${weekStart}T00:00:00.000Z`);
  const startMs = mode === "day" ? dayStartMs : weekStartMs;
  const endMs = startMs + (mode === "day" ? 1 : 7) * 24 * 60 * 60 * 1_000;

  return {
    date: today,
    rangeEndAt: new Date(endMs).toISOString(),
    rangeStartAt: new Date(startMs).toISOString(),
    weekStart,
  };
}

function getReportsDateRange(): {
  endDate: string;
  startDate: string;
} {
  const endDate = utcDateOnly(Date.now());
  const endMs = Date.parse(`${endDate}T00:00:00.000Z`);

  return {
    endDate,
    startDate: utcDateOnly(endMs - 6 * 24 * 60 * 60 * 1_000),
  };
}

function makeTimeSegmentCommandBridge({
  runtime,
  segments,
}: {
  runtime: AppRuntime;
  segments: readonly CalendarTimeSegmentProjectionRow[];
}) {
  const allowedSegments = new Set(segments.map(toSegmentRouteKey));
  const unavailableMessage = "Calendar command unavailable";

  return Object.freeze({
    execute(commandId: string, input?: unknown): Promise<unknown> {
      if (commandId !== calendarOpenSegmentCommandId) {
        return rejectRouteCommand(unavailableMessage);
      }

      const payload = readTimeSegmentCommandInput(input);

      if (payload === undefined || !allowedSegments.has(toSegmentRouteKey(payload))) {
        return rejectRouteCommand(unavailableMessage);
      }

      const descriptor = getActiveOwnedCommandDescriptor(
        runtime,
        calendarOpenSegmentCommandId,
        calendarPluginId,
      );

      if (descriptor === undefined) {
        return rejectRouteCommand(unavailableMessage);
      }

      return runtime.commands.execute(descriptor.id, payload);
    },
  });
}

function rejectRouteCommand(message: string): Promise<unknown> {
  const error = new Error(message);
  const rejected = {
    then<TResult1 = unknown, TResult2 = never>(
      onfulfilled?:
        | ((value: unknown) => TResult1 | PromiseLike<TResult1>)
        | null,
      onrejected?:
        | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
        | null,
    ): Promise<TResult1 | TResult2> {
      void onfulfilled;

      if (onrejected === undefined || onrejected === null) {
        return Promise.reject(error);
      }

      try {
        return Promise.resolve(onrejected(error));
      } catch (rejection) {
        return Promise.reject(rejection);
      }
    },
    catch<TResult = never>(
      onrejected?:
        | ((reason: unknown) => TResult | PromiseLike<TResult>)
        | null,
    ): Promise<unknown | TResult> {
      return rejected.then(undefined, onrejected);
    },
    finally(onfinally?: (() => void) | null): Promise<unknown> {
      try {
        onfinally?.();
      } catch (rejection) {
        return Promise.reject(rejection);
      }

      return Promise.reject(error);
    },
    [Symbol.toStringTag]: "Promise",
  };

  return rejected as Promise<unknown>;
}

function readTimeSegmentCommandInput(
  input: unknown,
): { pageId: string; segmentId: string } | undefined {
  if (
    !isRecord(input) ||
    Object.getPrototypeOf(input) !== Object.prototype ||
    Reflect.ownKeys(input).length !== 2
  ) {
    return undefined;
  }

  const pageId = readExactDataString(input, "pageId");
  const segmentId = readExactDataString(input, "segmentId");

  if (pageId === undefined || segmentId === undefined) {
    return undefined;
  }

  return {
    pageId,
    segmentId,
  };
}

function readExactDataString(
  input: Record<string, unknown>,
  key: string,
): string | undefined {
  const descriptor = Object.getOwnPropertyDescriptor(input, key);

  if (
    descriptor === undefined ||
    !descriptor.enumerable ||
    !Object.prototype.hasOwnProperty.call(descriptor, "value") ||
    typeof descriptor.value !== "string" ||
    descriptor.value.trim().length === 0
  ) {
    return undefined;
  }

  return descriptor.value;
}

function toSegmentRouteKey(input: { pageId: string; segmentId: string }): string {
  return `${input.segmentId}\u0000${input.pageId}`;
}

function utcDateOnly(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function mondayUtcDateOnly(ms: number): string {
  const date = new Date(ms);
  const day = date.getUTCDay();
  const offsetDays = day === 0 ? 6 : day - 1;

  return utcDateOnly(ms - offsetDays * 24 * 60 * 60 * 1_000);
}

function formatCount(count: number): string {
  if (!Number.isFinite(count) || count < 0) {
    return "0";
  }

  const rounded = Math.trunc(count);

  if (rounded < 1_000) {
    return String(rounded);
  }

  const text = String(rounded);
  const groups: string[] = [];

  for (let end = text.length; end > 0; end -= 3) {
    groups.unshift(text.slice(Math.max(0, end - 3), end));
  }

  return groups.join(",");
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
      const permit = commandOpenedPageIds.get(pageId);

      if (
        permit !== undefined &&
        isCurrentPageGeneration(currentPageState, permit)
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
  permit: CommandOpenedPageAuthorization,
): void {
  if (!isRecord(output) || typeof output.pageId !== "string") {
    return;
  }

  const pageId = output.pageId.trim();

  if (pageId.length > 0) {
    commandOpenedPageIds.set(pageId, permit);
  }
}

function isCurrentPageGeneration(
  currentPageState: CurrentPageState,
  permit: CommandOpenedPageAuthorization,
): boolean {
  return (
    currentPageState.pageId === permit.sourcePageId &&
    currentPageState.generation === permit.generation
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

function getActiveOwnedCommandDescriptor(
  runtime: AppRuntime,
  commandId: string,
  pluginId: string,
): CommandDescriptor | undefined {
  if (!isPluginActive(runtime, pluginId)) {
    return undefined;
  }

  try {
    const descriptor = runtime.commands.get(commandId);

    if (descriptor.id !== commandId || descriptor.pluginId !== pluginId) {
      return undefined;
    }

    return descriptor;
  } catch {
    return undefined;
  }
}

async function executeActiveOwnedCommand(
  runtime: AppRuntime,
  commandId: string,
  pluginId: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  const descriptor = getActiveOwnedCommandDescriptor(runtime, commandId, pluginId);

  if (descriptor === undefined) {
    throw new Error("Command unavailable");
  }

  return runtime.commands.execute(descriptor.id, input);
}

function listCommandPaletteCommands(
  runtime: AppRuntime,
): CommandPaletteCommand[] {
  const plugins = listPluginRecords(runtime);

  if (plugins === undefined) {
    return [];
  }

  try {
    return runtime.commands
      .list()
      .filter((descriptor) =>
        pluginRecordIsActive(plugins, descriptor.pluginId),
      )
      .map(toCommandPaletteCommand)
      .filter(
        (command): command is CommandPaletteCommand => command !== undefined,
      );
  } catch {
    return [];
  }
}

function toCommandPaletteCommand(
  descriptor: CommandDescriptor,
): CommandPaletteCommand | undefined {
  const id = descriptor.id;
  const pluginId = descriptor.pluginId;
  const title = toBoundedDisplayString(descriptor.title);
  const descriptorFingerprint = createCommandDescriptorFingerprint(descriptor);

  if (
    typeof id !== "string" ||
    id.trim().length === 0 ||
    typeof pluginId !== "string" ||
    pluginId.trim().length === 0 ||
    title === undefined ||
    descriptorFingerprint === undefined
  ) {
    return undefined;
  }

  const description = toBoundedDisplayString(descriptor.description);
  const defaultShortcut = toBoundedDisplayString(descriptor.defaultShortcut);
  const contextLabels = collectCommandContextLabels(descriptor.context).filter(
    (label) => !title.toLowerCase().includes(label.toLowerCase()),
  );

  return {
    descriptorFingerprint,
    id,
    pluginId,
    stableKey: createCommandPaletteStableKey(descriptor),
    title,
    contextLabels,
    ...(description === undefined ? {} : { description }),
    ...(defaultShortcut === undefined ? {} : { defaultShortcut }),
  };
}

function createCommandPaletteStableKey(descriptor: CommandDescriptor): string {
  return JSON.stringify([descriptor.pluginId, descriptor.id]);
}

function createCommandDescriptorFingerprint(
  descriptor: CommandDescriptor,
): string | undefined {
  try {
    return stableFingerprint([
      descriptor.id,
      descriptor.pluginId,
      descriptor.title,
      descriptor.description,
      descriptor.defaultShortcut,
      descriptor.context,
    ]);
  } catch {
    return undefined;
  }
}

function stableFingerprint(value: unknown): string {
  if (value === undefined) {
    return "undefined";
  }

  if (value === null) {
    return "null";
  }

  if (typeof value === "string") {
    return `string:${JSON.stringify(value)}`;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Unsafe fingerprint value");
    }

    return `number:${String(value)}`;
  }

  if (typeof value === "boolean") {
    return `boolean:${String(value)}`;
  }

  if (Array.isArray(value)) {
    return `array:[${value.map(stableFingerprint).join(",")}]`;
  }

  if (!isRecord(value)) {
    throw new Error("Unsafe fingerprint value");
  }

  const keys = Object.getOwnPropertyNames(value).sort();
  const fields = keys.map((key) => {
    const property = Object.getOwnPropertyDescriptor(value, key);

    if (property === undefined || "get" in property || "set" in property) {
      throw new Error("Unsafe fingerprint property");
    }

    return `${JSON.stringify(key)}:${stableFingerprint(property.value)}`;
  });

  return `object:{${fields.join(",")}}`;
}

function collectCommandContextLabels(context: unknown): string[] {
  const labels: string[] = [];

  try {
    collectCommandContextLabelsInto(context, labels, {
      depth: 0,
      seen: new WeakSet<object>(),
      visited: 0,
    });
  } catch {
    return [];
  }

  return labels;
}

function collectCommandContextLabelsInto(
  value: unknown,
  labels: string[],
  state: {
    depth: number;
    seen: WeakSet<object>;
    visited: number;
  },
): void {
  if (
    labels.length >= maxCommandContextLabels ||
    state.depth > 4 ||
    state.visited > 100
  ) {
    return;
  }

  state.visited += 1;

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    const label = toBoundedDisplayString(String(value));

    if (label !== undefined && !labels.includes(label)) {
      labels.push(label);
    }

    return;
  }

  if (value === null || typeof value !== "object") {
    return;
  }

  if (state.seen.has(value)) {
    return;
  }

  state.seen.add(value);

  try {
    if (Array.isArray(value)) {
      for (const item of value) {
        collectCommandContextLabelsInto(item, labels, {
          depth: state.depth + 1,
          seen: state.seen,
          visited: state.visited,
        });
      }

      return;
    }

    for (const propertyName of Object.getOwnPropertyNames(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, propertyName);

      if (
        descriptor === undefined ||
        "get" in descriptor ||
        "set" in descriptor
      ) {
        continue;
      }

      collectCommandContextLabelsInto(descriptor.value, labels, {
        depth: state.depth + 1,
        seen: state.seen,
        visited: state.visited,
      });
    }
  } finally {
    state.seen.delete(value);
  }
}

function toBoundedDisplayString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const text = value.replace(/\s+/gu, " ").trim();

  if (text.length === 0) {
    return undefined;
  }

  return text.slice(0, maxCommandFieldLength);
}

function isExpectedQuickCaptureOpenResult(value: unknown): boolean {
  return (
    isRecord(value) &&
    value.kind === "quick-capture.open-result" &&
    value.viewId === quickCaptureModalViewId
  );
}

function quickCaptureModalViewIsAvailable(runtime: AppRuntime): boolean {
  if (!isPluginActive(runtime, quickCapturePluginId)) {
    return false;
  }

  try {
    const view = runtime.registries.views.get(quickCaptureModalViewId);

    return (
      view.id === quickCaptureModalViewId &&
      view.pluginId === quickCapturePluginId
    );
  } catch {
    return false;
  }
}

function readSearchRouteData(
  input: unknown,
  expectedQuery: string,
): SearchRouteData {
  const payload = readExactPlainData(
    input,
    searchResultsDataKeys,
    "Search results",
  );

  if (
    payload.kind !== searchResultsKind ||
    payload.query !== expectedQuery ||
    typeof payload.query !== "string" ||
    payload.query.length > maxSearchQueryLength
  ) {
    throw new Error("Search results unavailable");
  }

  return {
    kind: searchResultsKind,
    query: payload.query,
    results: copyPlainArray(payload.results, maxSearchResults).map(
      readSearchRouteResult,
    ),
  };
}

function readSearchRouteResult(input: unknown): SearchRouteResult {
  const payload = readExactPlainData(
    input,
    searchResultItemKeys,
    "Search result",
  );
  const matchedFields = copyPlainArray(
    payload.matchedFields,
    allowedSearchMatchedFields.size,
  ).map(readSearchMatchedField);

  if (
    typeof payload.pageId !== "string" ||
    payload.pageId.trim().length === 0 ||
    payload.pageId.length > maxSearchPageIdLength ||
    typeof payload.title !== "string" ||
    payload.title.length > maxSearchTitleLength ||
    typeof payload.snippet !== "string" ||
    payload.snippet.length > maxSearchSnippetLength ||
    matchedFields.length === 0
  ) {
    throw new Error("Search result unavailable");
  }

  return {
    matchedFields,
    pageId: payload.pageId,
    snippet: payload.snippet,
    title: payload.title,
  };
}

function readSearchMatchedField(input: unknown): SearchMatchedField {
  if (!allowedSearchMatchedFields.has(input as SearchMatchedField)) {
    throw new Error("Search result unavailable");
  }

  return input as SearchMatchedField;
}

function readExactPlainData(
  input: unknown,
  requiredKeys: ReadonlySet<string>,
  label: string,
): Record<string, unknown> {
  if (
    typeof input !== "object" ||
    input === null ||
    Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Object.prototype
  ) {
    throw new Error(`${label} unavailable`);
  }

  const ownKeys = Reflect.ownKeys(input);

  if (ownKeys.length !== requiredKeys.size) {
    throw new Error(`${label} unavailable`);
  }

  for (const key of ownKeys) {
    if (typeof key !== "string" || !requiredKeys.has(key)) {
      throw new Error(`${label} unavailable`);
    }

    const descriptor = Object.getOwnPropertyDescriptor(input, key);

    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, "value")
    ) {
      throw new Error(`${label} unavailable`);
    }
  }

  return input as Record<string, unknown>;
}

function copyPlainArray(input: unknown, maxItems: number): unknown[] {
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) {
    throw new Error("Search results unavailable");
  }

  const lengthDescriptor = Object.getOwnPropertyDescriptor(input, "length");

  if (
    lengthDescriptor === undefined ||
    !Object.prototype.hasOwnProperty.call(lengthDescriptor, "value") ||
    !Number.isSafeInteger(lengthDescriptor.value) ||
    lengthDescriptor.value < 0 ||
    lengthDescriptor.value > maxItems
  ) {
    throw new Error("Search results unavailable");
  }

  const length = lengthDescriptor.value;
  const values: unknown[] = [];

  for (const key of Reflect.ownKeys(input)) {
    if (key === "length") {
      continue;
    }

    if (typeof key !== "string" || readArrayIndex(key, length) === null) {
      throw new Error("Search results unavailable");
    }
  }

  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(input, String(index));

    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, "value")
    ) {
      throw new Error("Search results unavailable");
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

function formatSearchResultsStatus(resultCount: number): string {
  if (resultCount === 0) {
    return "No results";
  }

  return resultCount === 1 ? "1 result" : `${resultCount} results`;
}

function isQuickCaptureSaveResult(value: unknown): value is {
  kind: "quick-capture.save-result";
  pageId: string;
} {
  return (
    isRecord(value) &&
    value.kind === "quick-capture.save-result" &&
    typeof value.pageId === "string" &&
    value.pageId.trim().length > 0
  );
}

function readQuickCaptureOpenPageId(value: unknown): string | undefined {
  if (!isQuickCaptureSaveResult(value)) {
    return undefined;
  }

  if (
    "openPageId" in value &&
    typeof value.openPageId === "string" &&
    value.openPageId.trim().length > 0
  ) {
    return value.openPageId.trim();
  }

  return value.pageId.trim();
}

export default App;
