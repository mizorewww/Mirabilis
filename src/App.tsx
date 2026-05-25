import { useState } from "react";
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
import {
  RuntimeProvider,
  useRuntime,
  type RuntimeInitializer,
  type RuntimeSource,
} from "./providers";
import "./App.css";

type AppProps = {
  initializeRuntime?: RuntimeInitializer<RuntimeSource>;
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
    summary:
      "Markdown workspace placeholder for the current page, metadata, and timeline regions.",
    placeholders: [
      "Page metadata slot placeholder",
      "Markdown editor view placeholder",
      "Page timeline slot placeholder",
    ],
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

function App({ initializeRuntime = createAppRuntime }: AppProps) {
  return (
    <ThemeProvider theme={mirabilisTheme}>
      <CssBaseline />
      <RuntimeProvider initializeRuntime={initializeRuntime}>
        <MirabilisShell />
      </RuntimeProvider>
    </ThemeProvider>
  );
}

function MirabilisShell() {
  const runtime = useRuntime();
  const [selectedRouteId, setSelectedRouteId] =
    useState<WorkspaceRouteId>("home");
  const [navigationOpen, setNavigationOpen] = useState(true);
  const [activeTool, setActiveTool] = useState<ShellToolId>("command");
  const selectedRoute =
    workspaceRoutes.find((route) => route.id === selectedRouteId) ??
    workspaceRoutes[0];
  const workspaceTitleId = `workspace-title-${selectedRoute.id}`;

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
                      onClick={() => setSelectedRouteId(route.id)}
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

export default App;
