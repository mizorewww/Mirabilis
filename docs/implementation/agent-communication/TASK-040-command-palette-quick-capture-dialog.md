# TASK-040 Agent Communication - Add Command Palette And Quick Capture Dialog

## Task

- ID: TASK-040.
- Name: Add Command Palette And Quick Capture Dialog.
- Branch: `feat/task-040-command-palette-quick-capture-dialog`.
- Started: 2026-05-31 18:59 CST.
- Parent role: orchestration only. Parent delegates planning, docs/current API research, TDD tests, implementation, review, docs sync, and release readiness to specialized agents.

## Source Docs Read By Parent

- `docs/implementation/task-index.md#task-040-add-command-palette-and-quick-capture-dialog`.
- `docs/product/07-user-interface-design.md`.
- `docs/product/03-plugin-platform.md`.
- `docs/product/05-built-in-plugins.md#25-quick-capture-plugin`.
- `docs/product/06-view-slots.md`.
- `docs/architecture/03-plugin-api-and-host.md`.
- `docs/architecture/05-plugin-implementations.md#133-quick-capture--search-plugin`.
- `docs/architecture/07-runtime-flows.md#1812-user-runs-quick-capture`.
- `docs/testing/strategy.md`.
- TASK-039 metadata/timer/timeline slot mounting closeout.

## Initial Parent Interpretation

- TASK-040 turns the existing top-bar command and Quick Capture placeholder controls into real app-shell modal workflows.
- The Markdown workspace remains the first screen; dialogs overlay it rather than replacing the route.
- Command palette should list Command Registry descriptors, filter by typed input, and execute selected commands only through Command Registry.
- Quick Capture should open through `quick-capture.open`, render the registered `quick-capture.modal` view or a shell-owned MUI wrapper, save through `quick-capture.save`, and save-and-open through `quick-capture.save-and-open`.
- `save-and-open` is an app-shell navigation responsibility: the Quick Capture command returns the trusted Inbox page id, then App Shell navigates through normal page-route state.

## Initial Constraints

- Write failing tests first.
- Tests must use React Testing Library and `@testing-library/user-event` for real opening, typing, keyboard selection, clicking, save/cancel/error, Escape, and focus-return flows.
- Dialogs must have accessible names, initial focus, Escape/cancel handling, focus return, disabled/pending states, and non-leaky errors.
- Command execution must go through Command Registry only; App Shell must not import Quick Capture private implementation internals or mutate stores directly.
- Quick Capture captured Markdown remains inert structured text; Task/Tag/AI cleanup is deferred.
- Native/global shortcut, mobile toolbar mounting, background capture, persistence beyond current runtime, package, lockfile, Tauri config, capability, generated permission, Rust, IPC, filesystem, schema, release, and native changes are out of scope.

## Validation At Start

- 11 `.codex/agents/*.toml` files parsed successfully.
- `codex --strict-config doctor --summary --ascii` reported config/auth/MCP/network/websocket OK with known non-blocking unrestricted sandbox/network notes and known `TERM=dumb` terminal failure.
- `master` was clean and pushed after TASK-039 merge-result validation before the branch was created.

## Current Next Action

- Run post-implementation review agents for correctness, security, deprecation, docs sync, test quality, and changed-path exploration.

## Pre-Test Guidance Outcomes

- Singer (`planner`) recommended one UI-only app-shell slice:
  - turn top-bar Command and Quick Capture placeholders into MUI `Dialog` workflows;
  - keep the Home Markdown workspace as the first screen and render dialogs as overlays;
  - list active `runtime.commands.list()` descriptors in the command palette, filter by typed input, support Enter/click execution, and execute through `runtime.commands.execute()` only;
  - call `quick-capture.open` before opening the Quick Capture dialog, then save through `quick-capture.save` / `quick-capture.save-and-open`;
  - navigate `save-and-open` to the returned Inbox page through normal app-shell page route state.
- Descartes (`docs_researcher`) verified current official docs for MUI v9.0.1 Dialog/Modal/TextField/List/Button/Progress path imports, WAI-ARIA modal dialog, React focus/portal/error-boundary references, Testing Library/user-event keyboard/focus guidance, and Vitest timers. Recommendations:
  - use MUI path imports such as `@mui/material/Dialog`, `DialogTitle`, `DialogContent`, `DialogActions`, `TextField`, `ListItemButton`, `Button`, and progress components;
  - use normal `dialog`, visible `DialogTitle`, initial focus in the search/capture text field, and MUI default focus trap/restore;
  - avoid `disableEscapeKeyDown`, deprecated MUI props, fake timers unless needed, and `check:full` unless native/package surfaces change.
- Heisenberg (`security_reviewer`) required:
  - command palette renders cloned descriptor DTOs only and never exposes raw registry mutation APIs, handlers, stores, plugin host, runtime, native bridge, filesystem/path/SQL, or function props;
  - palette execution only executes the selected active descriptor through Command Registry with exact `{}` payloads;
  - Quick Capture open/save/save-and-open use exact command payloads and fail closed for unavailable/wrong-owner/wrong-result command or view states;
  - save-and-open navigates only from returned `openPageId` / `pageId` via normal route state and never renders page bodies or raw command errors from dialog state;
  - errors, pending states, cancel/Escape, and focus return are visible, accessible, and redacted.
- Dalton (`deprecation_auditor`) found no P0 planned-surface blockers and highlighted P1 API constraints:
  - no MUI barrels or removed v9 legacy props such as `BackdropProps`, `PaperProps`, `TransitionComponent`, `TransitionProps`, `components`, `componentsProps`, `InputProps`, `inputProps`, `SelectProps`, `InputLabelProps`, or `FormHelperTextProps`;
  - no nested React roots for dialogs or plugin UI;
  - no Quick Capture private plugin imports; use public commands and registry/view-host paths only.

## Parent Decisions

- Command palette executes selected commands with exact `{}` only in TASK-040. Commands requiring payload/context forms show redacted failure/disabled behavior and broader command-specific forms remain deferred.
- Quick Capture uses a shell-owned MUI dialog wrapper for modal semantics while relying on public `quick-capture.open`, `quick-capture.save`, and `quick-capture.save-and-open` commands. The plugin baseline `quick-capture.modal` view remains public registry context, not a private import target.
- Top-bar Command and Quick Capture controls become dialog launchers with focus return; they no longer behave as placeholder `aria-pressed` toggles.

## Test Writer Outcome

- Turing (`test_writer`) added TASK-040 red acceptance tests in commit `6ccea0b`.
- Changed files:
  - `src/test/command-palette-quick-capture-dialog.test.tsx`;
  - `src/test/mui-shell-frame.test.tsx`;
  - `src/test/sidebar-page-filter-navigation.test.tsx`.
- Coverage added:
  - Command Palette open/close/focus return, filtering, active/inactive/missing-owner command behavior, exact `{}` execution, redacted failures, no free-form command-id execution, and DTO-only rendering boundaries.
  - Quick Capture open-before-dialog command contract, labelled Markdown form behavior, disabled/pending states, cancel/Escape, save, save-and-open navigation, trusted Inbox semantics, and redacted open/save failures.
  - Static guards for package/native/Tauri/Rust/IPC/capability drift, Quick Capture private App Shell imports, MUI v9 removed props/barrels, and forbidden test APIs.
- Parent red validation failed as expected:
  - `bun run test:frontend -- src/test/command-palette-quick-capture-dialog.test.tsx src/test/mui-shell-frame.test.tsx src/test/app-shell-boundary.test.ts src/test/quick-capture-search-plugins.test.tsx src/test/sidebar-page-filter-navigation.test.tsx src/test/home-workspace-editor.test.tsx`
  - Result: 2 failed files / 4 passed files, 13 failed / 69 passed tests.
  - Failure reason: App Shell still renders top-bar Command / Quick Capture as placeholder pressed-state controls and does not yet render accessible `Command Palette` or `Quick Capture` dialogs or execute `quick-capture.open`.
- Parent validation after red tests:
  - `bun run typecheck` passed.
  - `bun run lint` passed.
  - `git diff --check` passed.
  - Forbidden-pattern scan for `.only`, `.skip`, `fireEvent`, `jest.`, `react-dom/test-utils`, and `delay: null` returned no matches.
- Parent decision: accept `6ccea0b` as the TASK-040 red baseline and delegate production implementation.

## Implementation Outcome

- Arendt (`implementer`) implemented the TASK-040 app-shell dialogs in commit `fe68cab`.
- Parfit (`test-fix`) fixed the committed TASK-040 test typing string for literal Markdown bracket syntax in commit `dc7812e`.
- Production files changed:
  - `src/App.tsx`;
  - `src/shell/dialogs/CommandPaletteDialog.tsx`;
  - `src/shell/dialogs/QuickCaptureDialog.tsx`;
  - `src/shell/dialogs/index.ts`.
- Delivered behavior:
  - top-bar Command and Quick Capture controls now launch dialogs instead of placeholder pressed-state surfaces;
  - Command Palette lists active command descriptor DTOs, filters typed input, executes selected commands through Command Registry with exact `{}`, restores focus, and shows redacted errors;
  - Quick Capture opens through `quick-capture.open`, saves through `quick-capture.save`, save-and-open routes through returned page id via app-shell page state, guards pending/blank/cancel states, and shows redacted errors.
- Parent validation after implementation passed:
  - `bun run test:frontend -- src/test/command-palette-quick-capture-dialog.test.tsx src/test/mui-shell-frame.test.tsx src/test/app-shell-boundary.test.ts src/test/quick-capture-search-plugins.test.tsx src/test/sidebar-page-filter-navigation.test.tsx src/test/home-workspace-editor.test.tsx` (6 files / 82 tests).
  - `bun run test:frontend -- src/test/command-palette-quick-capture-dialog.test.tsx src/test/quick-capture-search-plugins.test.tsx src/test/sidebar-page-filter-navigation.test.tsx src/test/home-workspace-editor.test.tsx src/test/metadata-timer-timeline-slots.test.tsx` (5 files / 70 tests).
  - `bun run typecheck`.
  - `bun run lint`.
  - `git diff --check`.
- Parent decision: accept implementation/test-fix commits and run review agents.
