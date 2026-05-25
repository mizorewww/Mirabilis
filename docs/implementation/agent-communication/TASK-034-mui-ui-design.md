# TASK-034 Agent Communication - Design MUI Workspace And Audit Unfinished UI

## Task

- ID: TASK-034.
- Name: Design MUI Workspace And Audit Unfinished UI.
- Branch: `docs/task-034-mui-ui-design`.
- Worktree: `/home/aac6fef/Developer/Mirabilis`.
- Started: 2026-05-26 01:11 CST.
- Parent role: orchestration only.
- Current phase: docs/design/audit in progress.
- Next action after docs: TASK-035 - Add MUI Substrate And First Shell Frame.

## User Directive

- First create complete documentation design and UI design.
- Use MUI.
- Scaffold later.
- Write implementation tests that simulate real user typing, clicking, and keyboard use.
- Split tasks so all incomplete UI work is tracked.
- Find all incomplete content and get all UI work done through the roadmap.

## Correction From Earlier Framing

- The earlier TASK-034 implementation framing, "Replace Startup Card With A Usable Workspace", is superseded.
- TASK-034 is now docs-only design and audit work.
- TASK-035 is the first implementation task and owns the MUI substrate plus first shell frame.
- No production code, tests, package/Cargo/Tauri files, lockfiles, git metadata, commits, merges, or pushes are allowed in TASK-034 doc-writer scope.

## Source Docs Read

- `docs/product/README.md`.
- `docs/product/01-vision-and-core.md`.
- `docs/product/03-plugin-platform.md`.
- `docs/product/04-editor-and-workflows.md`.
- `docs/product/05-built-in-plugins.md`.
- `docs/product/06-view-slots.md`.
- `docs/architecture/README.md`.
- `docs/architecture/03-plugin-api-and-host.md`.
- `docs/architecture/04-slots-editor-task.md`.
- `docs/architecture/07-runtime-flows.md`.
- `docs/development/01-data-roadmap-and-mvp.md`.
- `docs/development/02-implementation-roadmap-and-constraints.md`.
- `docs/testing/strategy.md`.
- `docs/implementation/task-index.md`.
- `docs/implementation/progress.md`.
- `docs/implementation/agent-communication/status.md`.

## Official Docs Verified

- MUI installation: `@mui/material`, Emotion packages, and React peer dependencies.
- MUI icons package: `@mui/icons-material`.
- MUI theming and `ThemeProvider`.
- MUI `CssBaseline`.
- MUI path imports and bundle-size guidance.
- MUI `AppBar`, `Drawer`, `Dialog`, and `Portal`.
- Testing Library query priority and role/name guidance.
- `@testing-library/user-event` setup and realistic interaction guidance.
- WAI-ARIA modal dialog pattern.

## Accepted Design Conclusions

- Use MUI as the UI substrate for implementation tasks.
- Use `ThemeProvider` and `CssBaseline` at the app substrate layer.
- Use a dense top `AppBar`, left `Drawer`, central `main` with `ViewHost`, optional right context panel, `Portal` for floating slots, and `Dialog` for command/search/capture.
- Keep the app a work-focused desktop workspace, not a landing page or hero.
- Prefer local/system font over Google CDN.
- Use MUI component and icon path imports.
- Required MUI packages for implementation are `@mui/material`, `@emotion/react`, `@emotion/styled`, and `@mui/icons-material`; React 19 peers are already present.

## Unfinished Work Inventory Groups

- App shell/workspace.
- Editor.
- Navigation/filters.
- Metadata/timer/timeline.
- Quick capture/search.
- Calendar/reporting.
- ML/AI/sync/settings.
- Responsive/accessibility.
- Native/release-excluded.

## Architecture And Security Constraints

- Core remains business-free.
- Plugin and business actions go through Command Registry or documented owner-scoped command facades.
- Plugin-rendered UI receives narrow controlled props only.
- No plugin-rendered UI receives full runtime, Core stores, registries, Plugin Host, NativeBridge, raw invoke, filesystem, path, DB, provider settings, or secrets.
- No direct Tauri/native/package/Rust/capability changes are allowed unless a later task explicitly scopes them.
- `useRuntime()` remains the public safe facade.
- If implementation needs full runtime handles for shell composition, design a separate trusted shell-internal runtime channel before using it.

## Required Documentation Edits

- Add `docs/product/07-user-interface-design.md`.
- Link the new design doc from `docs/product/README.md`.
- Update M9 in `docs/implementation/task-index.md`.
- Retitle TASK-034 as the docs/design/audit task.
- Split implementation through TASK-045:
  - TASK-035 MUI substrate and first shell frame.
  - TASK-036 ViewHost and SlotHost.
  - TASK-037 Home workspace editor.
  - TASK-038 Sidebar navigation.
  - TASK-039 Metadata/timer/timeline slots.
  - TASK-040 Command palette and Quick Capture dialog.
  - TASK-041 Search overlay and results route.
  - TASK-042 Calendar and reporting routes.
  - TASK-043 ML and AI context panels.
  - TASK-044 Settings and Sync placeholders.
  - TASK-045 Responsive and accessibility polish.
- Update `docs/implementation/progress.md`.
- Update `docs/implementation/agent-communication/status.md`.
- Keep this TASK-034 communication file current.

## Validation

- Required validation: `git diff --check`.

## Outcome

- Confucius (`doc_writer`) completed the TASK-034 docs-only design/audit update.
- Files changed:
  - `docs/product/07-user-interface-design.md`
  - `docs/product/README.md`
  - `docs/implementation/task-index.md`
  - `docs/implementation/progress.md`
  - `docs/implementation/agent-communication/status.md`
  - `docs/implementation/agent-communication/TASK-034-mui-ui-design.md`
- Delivered:
  - full MUI UI design and unfinished-work inventory;
  - M9 retitling and task split through TASK-045;
  - product README link;
  - progress/status update;
  - official MUI, Testing Library, user-event, and WAI-ARIA source links.
- Validation: `git diff --check` passed.
- Parent decision: accept TASK-034 as complete docs/design work. The first implementation task is TASK-035, not TASK-034.
