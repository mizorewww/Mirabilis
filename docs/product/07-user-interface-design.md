# User Interface Design

This document defines the first complete Mirabilis UI design target. It is a product and architecture design document; status notes below distinguish implemented scaffold and generic host infrastructure from TASK-037+ design targets.

Current M9 status: TASK-035 delivered the baseline MUI substrate and first shell frame: the reviewed MUI dependency quartet, `ThemeProvider`, `CssBaseline`, top `AppBar`, left `Drawer`, central `main`, placeholder Home/Inbox/Today/All Tasks/Reports routes, and top-bar placeholder tools. TASK-036 delivered generic trusted `ViewHost` / `SlotHost` shell hosts for registry-owned views and slots. Route/editor mounting, real command and `pageFacade` adapters, lazy/Suspense behavior, actual slot placement, command/search/capture dialogs, `Portal` floating slots, responsive polish, and real route data remain TASK-037+ work.

## Diagnosis And Current Gap

TASK-001 through TASK-033 delivered the runtime substrate, built-in plugin behavior, persistence boundary, and local release gate. TASK-035 adds the first MUI shell scaffold, and TASK-036 adds generic registry-backed host infrastructure. The user-visible app still needs the full Markdown-first workspace described by the product docs.

The gap is not a missing business feature in Core. The gap is composition:

- App Shell now mounts a baseline product frame around the existing runtime and has generic trusted hosts for registry-backed views and slots, but it does not yet mount concrete routes, dialogs, or route data.
- Existing plugin views and slots are mostly reusable pieces that still need route-specific DTO projections, command/page facade adapters, and concrete placement in the workspace.
- Deferred route surfaces, overlays, contextual panels, and responsive behavior need one MUI design system before production scaffolding.
- UI tests must prove real typing, clicking, keyboard navigation, focus return, and visible outcomes from the user's perspective.

The first implementation task after this design document was TASK-035: add the MUI substrate and first app shell frame. TASK-036 added the generic `ViewHost` / `SlotHost` boundary. TASK-037+ continue by mounting concrete workspace routes and slots.

## Unfinished UI And Workflow Inventory

| Area | MUI UI framework now | Future native/backend/security |
| --- | --- | --- |
| App shell and workspace | Use `ThemeProvider`, `CssBaseline`, a dense `AppBar`, left `Drawer`, central `main`, optional right context panel, `ViewHost`, `SlotHost`, and `Portal` for floating slots. Replace startup-card composition with a workbench frame. | No native, Tauri, Rust, package-lock, capability, IPC, updater, or release packaging expansion unless a later task explicitly scopes it. |
| Editor | Mount the existing Markdown editor through the registered `page.editor` view path inside the MUI workspace. Frame the editor with page title, metadata region, save/status controls, and page timeline slots as tasks land. | Rich editor, Tiptap/ProseMirror, filesystem Markdown import/export, full CommonMark round trip, save-time task/tag scan, and native file dialogs remain separate future work. |
| Navigation and filters | Use `Drawer`, `List`, `ListItemButton`, `Tabs` only where useful, and accessible route buttons for Home, Inbox, All Tasks, Today, recent pages, Calendar, Reports, ML/AI, Settings, and Sync placeholders. Saved filters render through existing filter/query and view registry paths. | Persistent navigation state, global route database, broad query facade, plugin index execution, and SQLite FTS remain future backend/security-reviewed tasks. |
| Metadata, timer, and timeline | Mount `page.header.metadata`, `page.timeline`, and `global.floating` slots through MUI layout regions. Let plugin-owned controls execute through existing command facades. | Timer totals, Recently Worked, Unnoted Sessions saved filters, manual segment editing, Calendar drag/drop, native persistence/schema work, and broader feed/query facade remain future tasks. |
| Quick Capture and Search | Use MUI `Dialog` for command palette, Quick Capture, and search. Use `TextField`, `List`, `DialogActions`, and visible loading/empty/error states. | Native/global shortcuts, notifications, background capture, persistent search index, worker, SQLite FTS, and filesystem access remain future security-reviewed scope. |
| Calendar and reporting | Add routes that build explicit bounded DTO projections and render existing registered Calendar, Stats, and Chart views through `ViewHost`. Use MUI layout primitives for dense route surfaces. | Drag/drop editing, external calendar sync, broad cross-plugin query facade, persistent stats dashboards, production charting dependencies, native/schema changes, and release surfaces remain future tasks. |
| ML, AI, sync, and settings | Show optional right panel and settings placeholders using MUI panels, lists, alerts, and empty states. ML/AI panels consume exact bounded projections and advisory DTOs. Sync/settings remain clear placeholders until explicit implementation tasks exist. | Live AI provider execution, secrets, keychain, persistent plugin settings, sync transport, remote endpoint storage, conflict UI, network/native capability changes, and provider settings UI require future security review. |
| Responsive and accessibility | Use MUI breakpoints, temporary Drawer on narrow widths, keyboard-reachable dialogs, named landmarks, labelled controls, focus return, and role/name based test coverage. | Tauri WebDriver or app-level E2E can follow after the route surface is stable. Native mobile integration remains out of scope. |
| Native and release-excluded | Keep all M9 UI tasks TypeScript/React/MUI unless a task explicitly says otherwise. `bun run check:quick` is the expected UI gate. | `bun run check:full`, Tauri capability updates, generated permissions, Rust IPC, package/Cargo/Tauri changes, and release packaging are excluded from MUI shell work unless explicitly re-scoped. |

## MUI Information Architecture And App Layout

Mirabilis is a desktop productivity app, not a marketing site. The first viewport must be the workspace.

Recommended shell hierarchy:

```text
ThemeProvider
CssBaseline
RuntimeProvider
AppShell
  AppBar + dense Toolbar
    sidebar toggle
    current route/page title
    command button
    search button
    quick capture button
    sync/settings status affordances
  Box display="flex"
    Drawer navigation
      primary routes
      saved filters
      recent pages
      plugin routes
    Box component="main"
      workspace state boundary
      page metadata slot region
      ViewHost for current page/filter/view route
      page timeline slot region
    aside optional context panel
      ML/AI/settings/sync contextual panels
  Portal
    global.floating SlotHost
  Dialog surfaces
    command palette
    quick capture
    search
```

Layout rules:

- The top bar is functional and dense. It should not become a hero, landing page, or branding banner.
- The left drawer owns navigation. It should be permanent on desktop and temporary/collapsible on narrow layouts.
- The central `main` owns the current page, filter, calendar, reporting, or plugin view route.
- The right context panel is optional and must never block the editor on desktop. On narrow layouts it becomes a temporary panel/dialog.
- Floating slot content uses `Portal` so global timer UI can break out of normal document flow without receiving broad runtime handles.
- Dialogs are used only for interruptive or overlay workflows: command palette, Quick Capture, search, and future confirmations.

## Component Map

| Shell component | MUI primitives | Runtime data path | Notes |
| --- | --- | --- | --- |
| `MirabilisThemeProvider` | `ThemeProvider`, `createTheme`, `CssBaseline` | No runtime data. | Defines tokens, typography, density, and component defaults. |
| `AppShell` | `Box`, `AppBar`, `Toolbar`, `Drawer`, `IconButton`, `Divider` | Trusted shell-internal runtime channel, not public `useRuntime()`. | Composes layout only. It must not import business plugin internals. |
| `AppTopBar` | `AppBar`, `Toolbar`, `Tooltip`, `IconButton`, `Button`, `Typography` | Command/search/capture open state and current route label. | Prefer icons for tools; text only when command meaning is not obvious. |
| `LeftNavigationDrawer` | `Drawer`, `List`, `ListItemButton`, `ListItemIcon`, `ListItemText`, `Collapse` | Pages, filters, plugin route descriptors, current route. | Navigation changes shell state; plugin actions still go through commands. |
| `ViewHost` | `Box`, `Alert`, `CircularProgress`, `Skeleton` | View Registry descriptor plus explicit accepted data. | Fails closed on missing view, wrong data kind, thrown render errors, or unsafe props. |
| `SlotHost` | `Box`, `Stack`, `Alert` | Slot Registry list plus controlled props. | Sorts by registry order and evaluates conditions only with controlled props. |
| `WorkspacePageFrame` | `Stack`, `Breadcrumbs`, `Typography`, `Chip`, `Button` | Current page route, metadata records, editor data. | Hosts metadata above editor and timeline below editor. |
| `ContextPanel` | `Box`, `Drawer` on narrow, `Tabs` or `ToggleButtonGroup` if needed | Current page projection DTOs for ML/AI/settings panels. | Optional; fail closed when data is unavailable. |
| `CommandPaletteDialog` | `Dialog`, `TextField`, `List`, `ListItemButton`, `DialogTitle` | Command Registry descriptors and command execution. | Keyboard-first command selection and focus return. |
| `QuickCaptureDialog` | `Dialog`, `TextField`, `DialogActions`, `Button` | `quick-capture.*` commands and returned page IDs. | Saves captured Markdown as inert text through plugin commands. |
| `SearchDialog` | `Dialog`, `TextField`, `List`, `CircularProgress` | `search.query` command and `search.results` view DTO. | Bounded query input, no persistent index. |
| `CalendarReportsRoutes` | `Stack`, `Paper`, `Tabs`, `ToggleButtonGroup` | Explicit bounded projections into Calendar, Stats, and Chart views. | Does not read plugin private stores. |
| `SettingsSyncPlaceholders` | `List`, `Switch`, `Alert`, `Button` disabled where needed | Public plugin manifest/settings descriptors only. | Must state unavailable/inert status without accepting secrets. |

## Theme, Tokens, And Visual Rules

Use a work-focused desktop app theme:

- `palette.mode`: light by default, with dark-mode-ready tokens but no mode switch required in TASK-035.
- Primary color: restrained blue or neutral ink. Avoid one-hue purple/blue-purple dominance.
- Secondary/accent color: green or amber used sparingly for status, timer, and confirmation.
- Background: app background, navigation background, and editor surface must be distinct but quiet.
- Typography: local/system font stack only. Do not add Google Fonts or external font CDN.
- Density: use dense `Toolbar`, compact list rows, `size="small"` inputs/buttons where the workflow benefits.
- Shape: keep cards/panels at 8px radius or less.
- Elevation: use low elevation or borders for desktop surfaces. Avoid decorative floating cards.
- Spacing: use the 8px grid. Dense controls may use 4px internal gaps.
- Icons: use `@mui/icons-material` path imports for navigation and command affordances.
- Text: fit labels inside controls at desktop and narrow widths. Do not rely on viewport-scaled type.

Component default direction:

- Buttons: text or icon+text for clear commands; icon-only with tooltip for common tools.
- Inputs: `TextField` for command/search/capture text, multiline where the user types Markdown.
- Navigation: `Drawer` plus `ListItemButton`, with `aria-current` or selected state for active route.
- Surfaces: panels and repeated result items can be cards; page sections should remain full-width bands or unframed layout.
- Loading: `Skeleton` for page/list shells, `CircularProgress` or `LinearProgress` for command execution.
- Errors: `Alert` with redacted user-safe text.

## Interaction Flows

### First Workspace

1. App starts through the existing runtime bootstrap.
2. Shell creates or selects a session Home Markdown Page if no route is selected.
3. Central workspace renders `page.editor` through `ViewHost`.
4. User typing, toolbar snippets, save, task-title open, and checkbox toggle continue through existing Markdown/Task command paths.

### Page And Task Navigation

1. User selects Home, recent page, or task title.
2. Shell stores the selected page route.
3. Editor loads the page through the existing Markdown page facade.
4. Task-title clicks must execute `task.open-task-page` and open only the returned page ID.
5. Checkbox clicks must execute `task.toggle-status` and update visible state only from the returned status.

### Saved Filters

1. User chooses All Tasks, Today, Inbox, or a saved filter in the Drawer.
2. Shell reads the public filter definition and current pages/metadata.
3. Shell executes data-only filter logic with metadata owner reservations where required.
4. `ViewHost` renders the filter `viewType`, such as `page.list`.
5. Empty result slots render through `SlotHost`.

### Metadata, Timer, And Timeline

1. Page route provides current `pageId`.
2. Header mounts `page.header.metadata` through `SlotHost` or the existing `MetadataBar`.
3. Timer Start, Tag add/remove, and related controls use plugin-owned commands.
4. `global.floating` renders active timer UI through `Portal`.
5. `page.timeline` renders current page segment/note UI when available.

### Command Palette

1. User clicks command icon or presses the documented keybinding once implemented.
2. `Dialog` opens with focus in the command search field.
3. User types to filter command descriptors.
4. Enter or click executes through Command Registry only.
5. Dialog closes and focus returns to the launcher.

### Quick Capture

1. User opens capture from the top bar.
2. `Dialog` renders the registered Quick Capture modal or shell-owned MUI wrapper around its registered view.
3. User types Markdown.
4. Save executes `quick-capture.save`; save and open executes `quick-capture.save-and-open` and navigates to the returned page through normal route state.
5. Cancel closes without mutation and returns focus.

### Search

1. User opens search from the top bar.
2. `Dialog` opens with focus in the search field.
3. User types and submits bounded query text.
4. Shell executes `search.query` through Command Registry.
5. Results render via the registered `search.results` view or route DTO.
6. Selecting a result navigates to that page.

### Calendar And Reports

1. User selects Calendar or Reports in the Drawer.
2. Shell builds explicit bounded projections from public current runtime data.
3. Calendar views receive `calendar.time-segments`; Stats commands receive normalized aggregation input; Chart views receive chart DTOs.
4. Empty or unavailable data shows visible states instead of raw errors.

### ML, AI, Settings, And Sync

1. User opens the right context panel or Settings route.
2. ML receives exact bounded current-page projections and renders prediction DTOs only.
3. AI renders advisory panels and mocked/injected provider state only; no live provider is enabled by UI mounting.
4. Sync/settings placeholders show inert status and next-step messaging without accepting secrets or remote endpoint credentials.

## Responsive Behavior

Breakpoints:

- Desktop: permanent left Drawer, central workspace, optional right panel.
- Tablet/narrow desktop: collapsible left Drawer, central workspace, right panel collapses to a temporary Drawer.
- Mobile-width desktop window: top bar stays compact, left Drawer is temporary, right context panel is hidden behind a button, dialogs become full-screen where appropriate.

Rules:

- The Markdown editor remains the primary screen at all widths.
- No UI element may overlap editor text, modal content, or toolbar controls incoherently.
- Top app bar actions collapse to icon buttons with tooltips before text truncates.
- Drawer navigation labels may truncate with accessible full names.
- Dialogs must scroll internally if content exceeds viewport.
- Floating timer UI must not cover active input controls on narrow layouts.

## Loading, Empty, And Error States

Use consistent state language across hosts and routes:

- Startup loading: centered application status with no fake workspace.
- Runtime failure: generic alert, no raw error, stack, SQL, path, token, plugin ID, or provider detail.
- Missing page: visible workspace empty state with action to return Home.
- Missing view: non-leaky "View unavailable" state from `ViewHost`.
- Wrong data kind: fail closed and show unavailable state, not partial plugin render.
- Empty page: editor is still usable.
- Empty filter/search/calendar/report: named empty state and next command where safe.
- Command pending: disable duplicate submit, keep typed text visible, and show progress.
- Command failure: user-safe alert and focus remains in the workflow surface.
- Plugin render failure: boundary isolates the host region and does not crash the whole shell.

## Accessibility Rules

- Use semantic landmarks: `banner`, `navigation`, `main`, optional `complementary`, and named dialogs.
- Every icon-only button needs an accessible name and tooltip.
- Active navigation state must be programmatically exposed.
- Dialogs must have names, initial focus, Escape/close behavior, focus trap behavior, and focus return.
- Search and command palette keyboard flows must be deterministic.
- Text inputs must have labels, not placeholder-only names.
- Status and error messages must be discoverable through role/name or status/alert semantics.
- Do not hide focus outlines.
- Do not use ARIA to replace native semantics where MUI/native elements already provide them.
- Plugin-rendered text stays inert React text unless a later task explicitly designs a safe rendering surface.

## Testing Strategy For Real User Input And Clicking

UI implementation tests must use React Testing Library plus `@testing-library/user-event`.

Required pattern:

```ts
const user = userEvent.setup();

await user.click(screen.getByRole("button", { name: /quick capture/i }));
await user.type(screen.getByRole("textbox", { name: /capture markdown/i }), "- [ ] Follow up");
await user.keyboard("{Control>}k{/Control}");
```

Rules:

- Use accessible role/name queries first: `getByRole`, `findByRole`, `getByLabelText`, and visible text only when role is not appropriate.
- Await `user.click`, `user.type`, and `user.keyboard`.
- Assert visible outcomes: selected route, rendered editor text, saved status, dialog open/closed state, focus return, list result, alert text, disabled state, or command result.
- Do not assert private React state, implementation-only class names, internal registry objects, or direct plugin internals from UI tests.
- Prefer full user flows over direct event dispatch. Use `fireEvent` only for rare low-level cases that `user-event` cannot model.
- Tests for command/search/capture/dialog workflows must cover typing, clicking, keyboard selection, Escape/cancel, submit, loading, success, error, and focus return where relevant.
- Tests for editor/task flows must prove real typing, save, task-title click, checkbox click, stale async result handling, and page switch behavior.
- Static boundary tests must continue proving no direct Tauri/native/package/Rust/capability drift for UI-only tasks.

## Architecture And Security Constraints

- Core remains business-free. Task, habit, timer, calendar, heatmap, stats, chart, ML, AI, sync, and settings behavior stays plugin-owned.
- All user actions that mutate or invoke plugin behavior go through Command Registry or an already documented owner-scoped command facade.
- Cross-plugin collaboration goes through Event, Metadata, Query, or registered commands.
- Plugins must not directly mutate another plugin's private data.
- Plugin views and slots receive narrow controlled props only. They must not receive full runtime, Core stores, registries, Plugin Host, NativeBridge, raw invoke, filesystem, path, shell, notification, shortcut, DB, provider settings, or secrets.
- `useRuntime()` stays the public safe facade that exposes only copied app info.
- If the trusted App Shell needs full runtime handles for composition, design a separate shell-internal runtime channel before implementation and keep it unavailable to plugin-rendered descendants.
- No direct Tauri imports, Rust command changes, Tauri capability changes, permission updates, package/Cargo/Tauri config changes, lockfile edits, native files, or release gate changes are allowed in MUI UI tasks unless explicitly scoped.
- Search, AI, and Sync UI must avoid logging or rendering full workspace dumps, provider secrets, remote endpoints, raw errors, SQL, filesystem paths, or tokens.

## Package And Framework Notes

Implementation tasks should verify the official docs again immediately before dependency or API changes. As of this TASK-034 design pass:

- Add MUI only in the implementation task that owns package changes: `@mui/material`, `@emotion/react`, `@emotion/styled`, and `@mui/icons-material`.
- React 19 and React DOM 19 are already present in `package.json`; MUI installation docs list React/React DOM peer ranges that include React 19.
- Use Emotion, the default MUI styling engine. Do not add styled-components.
- Use local/system fonts. Do not add Google Fonts or a CDN.
- Import MUI components and icons by path for dev performance, for example `@mui/material/Button` and `@mui/icons-material/Search`, not barrel imports from `@mui/material` or `@mui/icons-material`.
- Use `ThemeProvider` and `CssBaseline` at the MUI substrate layer.
- Use MUI `AppBar`, `Drawer`, `Dialog`, and `Portal` for the shell primitives described above.
- Keep `@testing-library/user-event` as the realistic interaction API for UI tests.

Official source links verified for this design:

- MUI installation: <https://mui.com/material-ui/getting-started/installation/>
- MUI minimizing bundle size and path imports: <https://mui.com/material-ui/guides/minimizing-bundle-size/>
- MUI theming and `ThemeProvider`: <https://mui.com/material-ui/customization/theming/>
- MUI `CssBaseline`: <https://mui.com/material-ui/react-css-baseline/>
- MUI icons package: <https://mui.com/material-ui/material-icons/>
- MUI `AppBar`: <https://mui.com/material-ui/react-app-bar/>
- MUI `Drawer`: <https://mui.com/material-ui/react-drawer/>
- MUI `Dialog`: <https://mui.com/material-ui/react-dialog/>
- MUI `Portal`: <https://mui.com/material-ui/react-portal/>
- Testing Library user-event setup: <https://testing-library.com/docs/user-event/setup/>
- Testing Library query priority and role/name guidance: <https://testing-library.com/docs/queries/about/>
- WAI-ARIA modal dialog pattern: <https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/>
