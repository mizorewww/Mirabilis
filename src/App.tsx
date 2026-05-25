import { useEffect, useMemo, useRef, useState } from "react";
import AddIcon from "@mui/icons-material/Add";
import BarChartIcon from "@mui/icons-material/BarChart";
import HomeIcon from "@mui/icons-material/Home";
import InboxIcon from "@mui/icons-material/Inbox";
import KeyboardCommandKeyIcon from "@mui/icons-material/KeyboardCommandKey";
import MenuIcon from "@mui/icons-material/Menu";
import SearchIcon from "@mui/icons-material/Search";
import SettingsIcon from "@mui/icons-material/Settings";
import TodayIcon from "@mui/icons-material/Today";
import ViewListIcon from "@mui/icons-material/ViewList";
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
import Stack from "@mui/material/Stack";
import Toolbar from "@mui/material/Toolbar";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { ThemeProvider, createTheme } from "@mui/material/styles";

import { createAppRuntime } from "./bootstrap";
import type { AppRuntime } from "./bootstrap";
import {
  exportStructuredDocumentToMarkdown,
  importMarkdownToStructuredDocument,
  type MarkdownPage,
  type StructuredMarkdownDocument,
} from "./core";
import {
  MarkdownWorkspaceBridgeProvider,
  RuntimeProvider,
  useRuntime,
  type MarkdownWorkspaceBridgeValue,
  type RuntimeInitializer,
} from "./providers";
import { ViewHost } from "./shell/hosts";
import "./App.css";

type AppProps = {
  initializeRuntime?: RuntimeInitializer<AppRuntime>;
};

type WorkspaceRouteId =
  | "home"
  | "inbox"
  | "today"
  | "all"
  | "reports";

type ShellToolId = "command" | "search" | "capture" | "settings";

type WorkspaceRoute = {
  id: WorkspaceRouteId;
  label: string;
  eyebrow: string;
  summary: string;
  placeholders: readonly string[];
  icon: typeof HomeIcon;
};

type ShellTool = {
  id: ShellToolId;
  label: string;
  icon: typeof KeyboardCommandKeyIcon;
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

type AppRuntimeState =
  | { status: "loading" }
  | { status: "ready"; runtime: AppRuntime }
  | { status: "failed" };

const sessionHomeTitle = "Home";
const markdownPageViewId = "markdown.page-editor";
const pageEditorViewType = "page.editor";
const markdownInsertCommandId = "markdown.insert-text";
const openTaskPageCommandId = "task.open-task-page";
const toggleTaskStatusCommandId = "task.toggle-status";
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

const workspaceRoutes: readonly WorkspaceRoute[] = [
  {
    id: "home",
    label: "Home",
    eyebrow: "Workspace",
    summary: "Session Home page",
    placeholders: [],
    icon: HomeIcon,
  },
  {
    id: "inbox",
    label: "Inbox",
    eyebrow: "Capture",
    summary: "Unprocessed notes and captures will appear here.",
    placeholders: [
      "Inbox filter placeholder",
      "Capture review placeholder",
      "Empty state slot placeholder",
    ],
    icon: InboxIcon,
  },
  {
    id: "today",
    label: "Today",
    eyebrow: "Focus",
    summary: "Today route placeholder for the focused work queue.",
    placeholders: [
      "Today filter placeholder",
      "Due and active work placeholder",
      "Route status placeholder",
    ],
    icon: TodayIcon,
  },
  {
    id: "all",
    label: "All Tasks",
    eyebrow: "Saved filter",
    summary: "Saved filter placeholder for the full work index.",
    placeholders: [
      "Saved filter placeholder",
      "List view placeholder",
      "Filter empty state placeholder",
    ],
    icon: ViewListIcon,
  },
  {
    id: "reports",
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
  const [selectedRouteId, setSelectedRouteId] =
    useState<WorkspaceRouteId>("home");
  const [selectedPageId, setSelectedPageId] = useState(homePageId);
  const [currentPageState] = useState<CurrentPageState>(() => ({
    pageId: homePageId,
    generation: 0,
  }));
  const [navigationOpen, setNavigationOpen] = useState(true);
  const [activeTool, setActiveTool] = useState<ShellToolId>("command");
  const selectedRoute =
    workspaceRoutes.find((route) => route.id === selectedRouteId) ??
    workspaceRoutes[0];
  const workspaceTitleId = `workspace-title-${selectedRoute.id}`;
  const bridge = useMemo(
    () =>
      createMarkdownWorkspaceBridge({
        currentPageState,
        runtime: runtimeSource,
        openPage(pageId) {
          setCurrentPage(currentPageState, pageId);
          setSelectedRouteId("home");
          setSelectedPageId(pageId);
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
          aria-label="Workspace"
          className="app-shell__navigation"
          component="nav"
          hidden={!navigationOpen}
          id="workspace-navigation"
        >
          <Drawer open variant="permanent">
            <Toolbar />
            <Box className="app-shell__nav-content">
              <Typography className="app-shell__nav-heading" variant="overline">
                Workspace
              </Typography>
              <List aria-label="Workspace routes" dense>
                {workspaceRoutes.map((route) => {
                  const RouteIcon = route.icon;
                  const isSelected = route.id === selectedRoute.id;

                  return (
                    <ListItemButton
                      aria-current={isSelected ? "page" : undefined}
                      key={route.id}
                      onClick={() => {
                        setSelectedRouteId(route.id);

                        if (route.id === "home") {
                          setCurrentPage(currentPageState, homePageId);
                          setSelectedPageId(homePageId);
                        } else {
                          unsetCurrentPage(currentPageState);
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
              <Divider />
              <Box className="app-shell__nav-footer">
                <Typography variant="caption">
                  Shell placeholders only. Plugin surfaces stay behind registered
                  views and commands.
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
            <Chip label={selectedRoute.eyebrow} size="small" variant="outlined" />
            <Typography component="h2" id={workspaceTitleId} variant="h5">
              {selectedRoute.label} Workspace
            </Typography>
            <Typography color="text.secondary" variant="body2">
              {selectedRoute.summary}
            </Typography>
          </Stack>

          {selectedRoute.id === "home" ? (
            <HomeWorkspaceEditor
              bridge={bridge}
              pageId={selectedPageId}
              runtime={runtimeSource}
            />
          ) : (
            <Stack
              aria-label={`${selectedRoute.label} route placeholders`}
              className="app-shell__workspace-placeholders"
              component="section"
              spacing={1}
            >
              {selectedRoute.placeholders.map((placeholder) => (
                <Box className="app-shell__placeholder-row" key={placeholder}>
                  <Typography variant="body2">{placeholder}</Typography>
                </Box>
              ))}
            </Stack>
          )}

          <Box className="app-shell__tool-status" role="status">
            <Typography variant="body2">
              {shellTools.find((tool) => tool.id === activeTool)?.label} surface
              placeholder
            </Typography>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

function HomeWorkspaceEditor({
  bridge,
  pageId,
  runtime,
}: {
  bridge: MarkdownWorkspaceBridgeValue;
  pageId: string;
  runtime: AppRuntime;
}) {
  return (
    <Box className="app-shell__workspace-editor">
      <MarkdownWorkspaceBridgeProvider bridge={bridge}>
        <ViewHost
          acceptedData={{
            kind: "markdown-page",
            pageId,
          }}
          isPluginAvailable={(pluginId) => isPluginActive(runtime, pluginId)}
          registry={runtime.registries.views}
          viewId={markdownPageViewId}
          viewType={pageEditorViewType}
        />
      </MarkdownWorkspaceBridgeProvider>
    </Box>
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

function createMarkdownWorkspaceBridge({
  currentPageState,
  openPage,
  runtime,
}: {
  currentPageState: CurrentPageState;
  openPage(pageId: string): void;
  runtime: AppRuntime;
}): MarkdownWorkspaceBridgeValue {
  const commandOpenedPageIds = new Set<string>();

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
          allowCommandOpenedPageId(commandOpenedPageIds, output);

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
      if (commandOpenedPageIds.delete(pageId)) {
        openPage(pageId);
      }
    },
  };
}

function allowCommandOpenedPageId(
  commandOpenedPageIds: Set<string>,
  output: unknown,
): void {
  if (!isRecord(output) || typeof output.pageId !== "string") {
    return;
  }

  const pageId = output.pageId.trim();

  if (pageId.length > 0) {
    commandOpenedPageIds.add(pageId);
  }
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

function isPluginActive(runtime: AppRuntime, pluginId: string): boolean {
  const plugins = runtime.pluginHost.listPlugins?.();

  if (plugins === undefined) {
    return true;
  }

  return plugins.some(
    (plugin) =>
      plugin.id === pluginId &&
      plugin.enabled === true &&
      plugin.status === "active",
  );
}

export default App;
