# User Interface Design

This document defines the first complete Mirabilis UI design target. It is a product and architecture design document; status notes below distinguish implemented scaffold, generic host infrastructure, delivered Home editor mounting, delivered sidebar/filter navigation, delivered metadata/timer/timeline slot mounting, delivered Command Palette / Quick Capture / Search dialogs, delivered Calendar / Reports routes, delivered ML / AI context panels, delivered Settings / Sync placeholder surfaces, and remaining deferred UI targets.

Current M9 status: TASK-035 delivered the baseline MUI substrate and first shell frame: the reviewed MUI dependency quartet, `ThemeProvider`, `CssBaseline`, top `AppBar`, left `Drawer`, central `main`, initial Home/Inbox/Today/All Tasks/Reports route status regions, and initial top-bar tool affordances. TASK-036 delivered generic trusted `ViewHost` / `SlotHost` shell hosts for registry-owned views and slots. TASK-037 delivered Home editor mounting: a session Home Markdown Page, registered `markdown.page-editor` / `page.editor` rendering through `ViewHost`, a provider-scoped Markdown workspace bridge, exact allowlist wrappers for `markdown.insert-text`, `task.open-task-page`, and `task.toggle-status`, current-page/generation guards, and one-shot command-returned open authorization bound to the source page generation. TASK-038 delivered MUI Drawer navigation for Home, recent page routes, Inbox, Today, All Tasks, and public saved filters: Home/recent page routes continue through the `ViewHost` editor path; Inbox/Today/All Tasks/public saved-filter routes resolve public `FilterDefinition`s, execute `executeFilterQuery`, render registered views through `ViewHost`, render empty states through `SlotHost`, pass only opaque `{ routeToken, title }` result DTOs, preserve saved-filter labels as accessible names, and expose active rows with `aria-current="page"`. TASK-039 delivered page-route metadata, timeline, and floating timer mounting: page routes render the public `metadata-ui` `MetadataBar` below the route title and above the editor, render `page.timeline` below the editor through `SlotHost` with only `{ page: { id, title } }`, and render `global.floating` through MUI `Portal` as React-owned portal children with only a timer-owned Pause / Resume / Stop facade using exact `{}` payloads. TASK-040 delivered app-shell Command Palette and Quick Capture dialogs over the Markdown workspace: top-bar Command and Quick Capture controls launch MUI `Dialog` workflows with focus return, Command Palette filters active command descriptor DTOs and executes selected commands through Command Registry with exact `{}` payloads, and Quick Capture opens/saves/save-and-opens through owner-checked public `quick-capture.*` commands. TASK-041 delivered the app-shell Search workflow: the top-bar Search control launches a MUI `Dialog`, executes active search-owned `search.query` with exact `{ query }`, copies valid results into a shell-owned bounded results route DTO, renders result rows inertly, validates selected pages before navigation, and invalidates stale pending results after close. TASK-042 delivered the Calendar and Reports Drawer routes: Calendar builds a shell-owned bounded `calendar.time-segments` projection from the public current-runtime snapshot, excludes missing or archived pages, mounts `calendar.day` / `calendar.week` through `ViewHost`, exposes visible empty/partial/unavailable states, caps projected segments at 1,000, and uses only a route-owned bridge for `calendar.open-time-segment({ segmentId, pageId })` on current projected segments. Reports builds bounded Stats input projections, defaults to `stats.sum-time-by-page`, executes active stats-owned `stats.run-aggregation`, rejects stale async results after route or aggregation changes, renders returned Chart-compatible DTOs through `chart.bar` via `ViewHost`, exposes loading/empty/partial/error/unavailable states, caps Chart-compatible report categories at 200, bounds segment `tagIds` to emitted tags, and reports task estimate, habit event, habit summary, and timer note overflow as partial rather than complete. TASK-043 delivered an optional right `Page context` panel on page routes: it keeps the Markdown workspace mounted, builds shell-owned current-page ML projections capped at 1,000 rows, builds AI projections capped at 100 rows with current-page body text capped at 50,000 chars, executes active owned `ml.run-prediction`, renders `ml.prediction-panel`, `ai.suggestion-panel`, and `ai.review-panel` through exact `ViewHost` ids, and exposes only advisory AI command buttons for `ai.suggest-tags`, `ai.suggest-due-date`, `ai.generate-subtasks`, and `ai.explain-prediction` after a valid current-page ML prediction. TASK-044 delivered a top-bar Settings workspace route that shows public app/runtime facts, public plugin settings descriptors including inert `ai.provider-settings`, and an embedded Sync skeleton status panel. Native/global Quick Capture shortcut, mobile Quick Capture toolbar, persistent Search index/worker/SQLite FTS/native or global shortcuts/ranking changes, responsive/persistent navigation polish, lazy/Suspense host behavior, broad query/feed facades, persistent reporting dashboards, AI acceptance/executable provider settings/secret storage/live provider execution, sync transport/conflict UI, native/schema/package changes, and broader route data remain deferred work.

## Diagnosis And Current Gap

TASK-001 through TASK-033 delivered the runtime substrate, built-in plugin behavior, persistence boundary, and local release gate. TASK-035 adds the first MUI shell scaffold, TASK-036 adds generic registry-backed host infrastructure, TASK-037 mounts the first real Home Markdown workspace, TASK-038 adds the first real sidebar/page/saved-filter navigation, TASK-039 mounts the first production metadata/timer/timeline slot surfaces, TASK-040 mounts Command Palette and Quick Capture dialogs from the top bar, TASK-041 mounts the Search dialog and results route, TASK-042 mounts Calendar and Reports routes from explicit transient projections, TASK-043 mounts current-page ML / AI context panels, and TASK-044 mounts the inert Settings workspace route with embedded Sync skeleton status. The user-visible app still needs responsive polish and persistent/broad projection surfaces described by the product docs.

The gap is not a missing business feature in Core. The gap is composition:

- App Shell now mounts a baseline product frame around the existing runtime, has generic trusted hosts for registry-backed views and slots, mounts the Home/recent page editor through `ViewHost`, mounts Inbox/Today/All Tasks/public saved-filter results through the filter executor plus `ViewHost`/`SlotHost`, mounts page-route metadata/timeline plus the global floating timer surface, launches Command Palette / Quick Capture / Search dialogs from the top bar, mounts Calendar / Reports Drawer routes from transient shell-owned projections, mounts the current-page ML / AI context panel, and mounts the Settings workspace route with public descriptor/status data. It does not yet mount sidebar/action/body-after slot regions or executable settings/sync workflows. Settings is an inert app-shell route; Search, Calendar, Reports, and ML/AI are bounded app-shell workflows with shell-owned route or panel data.
- Existing plugin views and slots are mostly reusable pieces. Home now has a provider-scoped Markdown workspace bridge with exact command/page adapters, saved-filter routes now have opaque result DTO projections, TASK-039 page routes now have narrow metadata/timeline props plus a timer-only floating command facade, TASK-042 Calendar / Reports routes have route-specific DTO projections and a Calendar-only command bridge, and TASK-043 ML / AI panels have exact current-page DTO projections plus owned command allowlists. Remaining route and panel work still needs route-specific DTO projections, command/page facade adapters, and concrete placement in the workspace.
- Deferred route surfaces, overlays, contextual panels, and responsive behavior need one MUI design system before production scaffolding.
- UI tests must prove real typing, clicking, keyboard navigation, focus return, and visible outcomes from the user's perspective.

The first implementation task after this design document was TASK-035: add the MUI substrate and first app shell frame. TASK-036 added the generic `ViewHost` / `SlotHost` boundary. TASK-037 mounted the Home workspace editor through that boundary. TASK-038 added sidebar page and saved-filter navigation. TASK-039 mounted page metadata, page timeline, and global floating timer slots. TASK-040 added app-shell Command Palette and Quick Capture dialogs. TASK-041 added app-shell Search dialog/results routing. TASK-042 added transient Calendar and Reports route projections and registered-view mounting. TASK-043 added current-page ML / AI context panels. TASK-044 added the inert Settings route with public runtime facts, public plugin settings descriptors, and embedded Sync skeleton status. Later UI work continues with native/global capture entry points, mobile capture toolbar, persistent Search index/worker/SQLite FTS/ranking, native/global Search shortcuts, broad query/feed/dashboard surfaces, executable settings/sync workflows, and responsive polish.

## Unfinished UI And Workflow Inventory

| Area | MUI UI framework now | Future native/backend/security |
| --- | --- | --- |
| App shell and workspace | Use `ThemeProvider`, `CssBaseline`, a dense `AppBar`, left `Drawer`, central `main`, optional right context panel, `ViewHost`, `SlotHost`, and `Portal` for floating slots. Replace startup-card composition with a workbench frame. | No native, Tauri, Rust, package-lock, capability, IPC, updater, or release packaging expansion unless a later task explicitly scopes it. |
| Editor | TASK-037 mounts the existing Markdown editor through registered `markdown.page-editor` / `page.editor` inside the Home MUI workspace. The shell bridge is provider-scoped, current-page bounded, and exposes only exact command allowlist wrappers plus page load/save for the active Home/task page. Frame the editor with page title, metadata region, and page timeline slots as later tasks land. | Rich editor, Tiptap/ProseMirror, filesystem Markdown import/export, full CommonMark round trip, save-time task/tag scan, and native file dialogs remain separate future work. |
| Navigation and filters | TASK-038 delivers MUI `Drawer` / `List` / `ListItemButton` navigation for Home, recent pages, Inbox, Today, All Tasks, and public saved filters. Page routes render the editor through `ViewHost`; saved-filter routes execute public filter/query logic and render registered `viewType`s through `ViewHost`, with `SlotHost` for empty states. TASK-042 turns Calendar and Reports Drawer rows into real transient route surfaces. TASK-043 keeps ML/AI out of Drawer routes and exposes them through the page-only right context panel. TASK-044 opens Settings from the top bar as an inert workspace route and embeds Sync skeleton status there; Sync has no top-level Drawer route. | Persistent navigation state, global route database, broad query facade, plugin index execution, SQLite FTS, and durable navigation storage remain future backend/security-reviewed tasks. |
| Metadata, timer, and timeline | TASK-039 mounts `page.header.metadata` through the public `MetadataBar` on page routes, mounts `page.timeline` below the editor through `SlotHost` with a narrow page DTO, and mounts `global.floating` through MUI `Portal` with timer-owned Pause / Resume / Stop controls only. | Timer totals, Recently Worked, Unnoted Sessions saved filters, manual segment editing, Calendar drag/drop, native persistence/schema work, `page.header.actions`, `page.sidebar.panel`, `page.body.after`, and broader feed/query facade remain future tasks. |
| Command Palette, Quick Capture, and Search | TASK-040 delivers MUI `Dialog` workflows for Command Palette and Quick Capture, launched from the top bar over the Markdown workspace with labelled `TextField` input, list/action controls where relevant, visible pending/error states, and focus return. TASK-041 delivers the top-bar Search MUI `Dialog`, exact active-owner `search.query` dispatch with `{ query }`, shell-owned bounded Search results route DTO, inert result route rendering, existing-page validation/navigation, and pending-close stale-result invalidation. | Native/global Quick Capture shortcut, mobile capture toolbar, notifications, background capture, persistent search index, search worker, SQLite FTS, native/global Search shortcuts, ranking beyond existing plugin behavior, and filesystem access remain future security-reviewed scope. |
| Calendar and reporting | TASK-042 delivers Drawer routes that build explicit bounded DTO projections and render existing registered Calendar, Stats, and Chart surfaces through `ViewHost`. Calendar mounts `calendar.day` / `calendar.week` from `calendar.time-segments`, shows empty/partial/unavailable states, caps visible route segments at 1,000, and exposes only exact `calendar.open-time-segment({ segmentId, pageId })` commands for currently projected segments. Reports defaults to `stats.sum-time-by-page`, runs `stats.run-aggregation`, renders returned Chart DTOs through `chart.bar`, shows loading/empty/partial/error/unavailable states, treats missing estimate data and input overflow as partial, caps Chart-compatible report categories at 200, and bounds segment `tagIds` to emitted tags. | Manual Calendar editing, drag/drop editing, external calendar sync, direct Calendar-owned cross-plugin reads, persistent query/feed facades, saved reporting filters, Stats dashboards beyond registered DTO views, production charting dependencies, native/schema/package changes, and release surfaces remain future tasks. |
| ML, AI, sync, and settings | TASK-043 delivers a page-route-only optional right context panel with ML, Suggestions, and Review tabs. ML consumes exact current-page projections capped at 1,000 rows, runs `ml.run-prediction`, and renders `ml.prediction-panel` through `ViewHost`. AI renders `ai.suggestion-panel` / `ai.review-panel`, supplies bounded advisory projections capped at 100 rows plus 50,000 current-page body chars, and exposes only `ai.suggest-tags`, `ai.suggest-due-date`, `ai.generate-subtasks`, and gated `ai.explain-prediction`. TASK-044 delivers a Settings workspace route that lists public app/runtime facts, public plugin settings descriptors, inert `ai.provider-settings`, and embedded Sync skeleton status only. | Live AI provider execution, secrets, keychain, persistent plugin settings, sync transport, remote endpoint storage, conflict UI, network/native capability changes, durable AI acceptance, and executable provider/settings UI require future security review. |
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
      ML/AI page context panel
    settings workspace route
      app/runtime facts, public descriptors, embedded Sync skeleton status
  Portal
    global.floating portal contribution host
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
| `AppTopBar` | `AppBar`, `Toolbar`, `Tooltip`, `IconButton`, `Button`, `Typography` | Command, capture, and Search dialog launch state, Settings route launch state, and current route label. | Prefer icons for tools; text only when command meaning is not obvious. |
| `LeftNavigationDrawer` | `Drawer`, `List`, `ListItemButton`, `ListItemIcon`, `ListItemText`, `Collapse` | Pages, filters, plugin route descriptors, current route. | Navigation changes shell state; plugin actions still go through commands. |
| `ViewHost` | `Box`, `Alert`, `CircularProgress`, `Skeleton` | View Registry descriptor plus explicit accepted data. | Fails closed on missing view, wrong data kind, thrown render errors, or unsafe props. |
| `SlotHost` | `Box`, `Stack`, `Alert` | Slot Registry list plus controlled props. | Sorts by registry order and evaluates conditions only with controlled props. |
| `WorkspacePageFrame` | `Stack`, `Breadcrumbs`, `Typography`, `Chip`, `Button` | Current page route, metadata records, editor data. | Hosts metadata above editor and timeline below editor. |
| `ContextPanel` | `Box`, `Drawer` on narrow, `Tabs` or `ToggleButtonGroup` if needed | Current page projection DTOs for ML/AI panels. | TASK-043 page-only panel renders exact `ViewHost` ids `ml.prediction-panel`, `ai.suggestion-panel`, and `ai.review-panel`; AI commands stay advisory and allowlisted. |
| `CommandPaletteDialog` | `Dialog`, `TextField`, `List`, `ListItemButton`, `DialogTitle` | Command Registry descriptors and command execution. | Keyboard-first command selection and focus return. |
| `QuickCaptureDialog` | `Dialog`, `TextField`, `DialogActions`, `Button` | `quick-capture.*` commands and returned page IDs. | Saves captured Markdown as inert text through plugin commands. |
| `SearchDialog` | `Dialog`, `TextField`, `List`, `CircularProgress` | Active search-owned `search.query` command with exact `{ query }` payload and shell-owned bounded `search.results` route DTO. | Bounded query input, inert results, existing-page navigation, no persistent index. |
| `CalendarReportsRoutes` | `Stack`, `Button`, `Alert`, `ViewHost` | TASK-042 route-owned projections into Calendar, Stats, and Chart views. | Excludes missing/archived pages, caps Calendar rows at 1,000 and Chart-compatible report categories at 200, and does not read plugin private stores or add native/package/schema surface. |
| `SettingsSyncPlaceholders` | `List`, `Switch`, `Alert`, `Button` disabled where needed | Public plugin manifest/settings descriptors only. | TASK-044 renders this as an inert Settings workspace route with embedded Sync skeleton status; it must not accept secrets. |

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
3. Central workspace renders `markdown.page-editor` / `page.editor` through `ViewHost`.
4. A provider-scoped Markdown workspace bridge gives the hosted editor only current-page bounded load/save, exact allowlist command wrappers, inert extension collection, and guarded page-open navigation.
5. User typing, toolbar snippets, save, task-title open, and checkbox toggle continue through existing Markdown/Task command paths.

### Page And Task Navigation

1. User selects Home, recent page, or task title.
2. Shell stores the selected page route.
3. Editor loads the page through the existing Markdown page facade.
4. Task-title clicks must execute `task.open-task-page` and open only the returned page ID while the original source page/generation is still current.
5. Delayed command-returned opens after leaving Home are ignored and cannot remount Home or reveal another page.
6. Checkbox clicks must execute `task.toggle-status` and update visible state only from the returned status.

### Saved Filters

TASK-038 delivered this flow for Inbox, Today, All Tasks, and public saved filters exposed by the current runtime:

1. User chooses All Tasks, Today, Inbox, or a public saved filter in the Drawer.
2. Shell reads the public `FilterDefinition` and current pages/metadata.
3. Shell verifies filter source ownership, view availability, plugin ownership data, and active metadata owner reservations; failures show a generic unavailable route.
4. Shell executes data-only filter logic with `executeFilterQuery`.
5. `ViewHost` renders the filter `viewType`, such as `page.list`, with only opaque result DTOs shaped as `{ routeToken, title }`.
6. Empty result slots render through `SlotHost` only after the route and view are trusted.

TASK-038 intentionally left persistent saved-filter navigation state, broad global route databases, Event/plugin-index `within` execution, save-time indexing, and arbitrary plugin view routes without explicit DTO designs for later tasks. TASK-042 has since delivered the transient app-shell Calendar and Reports route projections; persistent feeds and broad query facades remain separate future work.

### Metadata, Timer, And Timeline

1. Page route provides current `pageId`.
2. Header mounts `page.header.metadata` through the public `metadata-ui` `MetadataBar`.
3. Timer Start, Tag add/remove, and related controls use plugin-owned commands with descriptor-owner checks.
4. `global.floating` renders active timer UI through MUI `Portal` as React-owned portal children.
5. Floating timer controls receive only the timer-owned Pause / Resume / Stop facade and dispatch exact `{}` payloads.
6. `page.timeline` renders current page segment/note UI through `SlotHost` with only `{ page: { id, title } }`.

### Command Palette

1. User clicks command icon or presses the documented keybinding once implemented.
2. `Dialog` opens with focus in the command search field.
3. User types to filter command descriptors.
4. Enter or click executes through Command Registry only.
5. Dialog closes and focus returns to the launcher.

### Quick Capture

1. User opens capture from the top bar.
2. `Dialog` renders the shell-owned MUI Quick Capture wrapper; the registered `quick-capture.modal` view remains public registry context, not a private import target.
3. User types Markdown.
4. Save executes `quick-capture.save`; save and open executes `quick-capture.save-and-open` and navigates to the returned page through normal route state.
5. Cancel closes without mutation and returns focus.

### Search

TASK-041 delivers the app-shell Search flow:

1. User opens search from the top bar.
2. `Dialog` opens with focus in the search field.
3. User types and submits bounded query text.
4. Shell executes only the active search-owned `search.query` command through Command Registry with exact `{ query }`.
5. Shell copies a valid result into a shell-owned bounded `{ kind: "search.results", query, results }` route DTO; route state does not store full page bodies, raw runtime objects, or plugin-private objects.
6. Results route renders loading, empty, result, and generic error states with inert title/snippet/matched-field text.
7. Selecting a result validates that the page still exists, then navigates through normal app-shell page route state.
8. Closing Search while a query is pending returns focus and invalidates stale later resolve/reject results.

Persistent Search indexing, a background search worker, SQLite FTS, native/global Search shortcuts, and ranking beyond existing plugin behavior remain deferred.

### Calendar And Reports

TASK-042 delivers the current app-shell flow:

1. User selects Calendar or Reports in the Drawer.
2. Shell snapshots public current-runtime pages, metadata, and events, excluding missing or archived pages during projection.
3. Calendar builds a bounded `{ kind: "calendar.time-segments" }` projection from public Timer segment events joined to active pages, caps the route at 1,000 rows, and mounts `calendar.day` or `calendar.week` through `ViewHost`.
4. Calendar passes a route-owned `commandBridge` to `ViewHost`. The bridge only delegates `calendar.open-time-segment({ segmentId, pageId })` when that pair exists in the current projected segment set; every other command or stale segment pair is rejected before reaching Command Registry.
5. Reports builds bounded Stats inputs from Timer segment events, Timer note events, Habit checked/unchecked events, Habit metadata, and Tag metadata; default aggregation is `stats.sum-time-by-page`.
6. Reports executes the active stats-owned `stats.run-aggregation` command, rejects stale async results after route or aggregation changes, and mounts the returned Chart-compatible DTO through `chart.bar` / `ViewHost`.
7. Empty, partial, loading, error, and unavailable states are visible and generic. Calendar partial state is used for the 1,000-segment cap; Reports partial state is used for omitted rows, habit event / habit summary / timer note overflow, the 200 Chart-compatible category cap, bounded `tagIds`, and unavailable task estimate input.
8. TASK-042 adds no native, Tauri, IPC, permission, package, Rust, schema, release, production charting-library, or persistent feed/index surface.

### ML, AI, Settings, And Sync

TASK-043 delivers the current ML / AI context panel flow:

1. On a trusted page route, the user opens `Context Panel` from the top bar. The panel is a named `complementary` aside next to the Markdown workspace, not a Drawer route, and closing it returns focus to the launcher.
2. The ML tab snapshots public runtime pages, metadata, and events, builds an exact current-page `ml.remaining-time-prediction-input`, caps ML page/metadata/event arrays at 1,000 rows, and executes only active owned `ml.run-prediction`.
3. A valid ML result renders through `ViewHost` with exact id/type `ml.prediction-panel`. The registered `ml.page-sidebar.prediction-panel` slot remains available, but TASK-043 does not broadly mount `page.sidebar.panel`.
4. The Suggestions tab renders `ai.suggestion-panel` through `ViewHost` and exposes only advisory `ai.suggest-tags`, `ai.suggest-due-date`, and `ai.generate-subtasks` commands from bounded current-page projections. AI projection arrays cap at 100 rows, and current-page body text caps at 50,000 chars.
5. `ai.explain-prediction` appears only after a valid current-page ML prediction exists. The Review tab renders `ai.review-panel` through `ViewHost` with explicit `{ kind: "ai.review-panel" }` data.
6. AI command output remains advisory. The shell integration does not write pages, metadata, events, filters, sibling plugin data, settings, secrets, provider configuration, or AI metadata/events.
7. Unavailable views/commands, malformed data, command errors, stale async results, and page switches fail closed with non-leaky visible states. The panel does not expose full runtime handles, full workspace data, raw errors, provider settings, API keys, or provider details.
TASK-044 delivers the current Settings / Sync placeholder flow:

1. The top-bar `Settings` button opens a named Settings workspace route, not a modal provider form.
2. The route lists public app/runtime facts from the runtime app facade, including app version and Plugin API version.
3. The route lists public plugin settings descriptors from plugin manifests. `ai.provider-settings` appears as an inert descriptor-only entry with no executable settings panel.
4. The route embeds a Sync skeleton status region for manifest id `sync`. It states that Sync has no runtime commands, no views, no settings panels, no transport, no remote endpoint, no background jobs, no conflict UI, and no settings persistence enabled.
5. The route does not accept, store, render, or log API keys, tokens, credentials, remote endpoints, filesystem paths, provider settings, provider secrets, or other secret-shaped values.
6. Reopening the Settings route is route selection only; no settings or sync command is executed because no safe mutation action exists in this slice.

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
- Empty filter/search/calendar/report/context: named empty state and next command where safe.
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
