# TASK-037 Agent Communication - Mount Home Workspace Editor

## Task

- ID: TASK-037.
- Name: Mount Home Workspace Editor.
- Branch: `feat/task-037-home-workspace-editor`.
- Started: 2026-05-26 03:45 CST.
- Parent role: orchestration only. Parent delegates current-doc/deprecation/security guidance, planning, test writing, implementation, review, docs sync, and release readiness to specialized agents.

## Source Docs And Code Read By Parent

- `docs/implementation/task-index.md#task-037-mount-home-workspace-editor`.
- `docs/product/07-user-interface-design.md`.
- `docs/product/04-editor-and-workflows.md`.
- `docs/architecture/04-slots-editor-task.md#8-markdown-editor-plugin`.
- `docs/architecture/07-runtime-flows.md#181-用户输入任务`.
- `docs/testing/strategy.md#task-016-markdown-editor-plugin-shell-guidance`.
- `docs/testing/strategy.md#task-019-task-navigation-and-infinite-nesting-guidance`.
- `docs/testing/strategy.md#task-020-checkbox-toggle-and-task-events-guidance`.
- Current `src/App.tsx` MUI shell frame.
- Current `src/shell/hosts/ViewHost.tsx` / `SlotHost.tsx`.
- Current Markdown editor plugin registrations and related tests.

## Initial Parent Interpretation

- TASK-037 should turn the Home placeholder into the first real user-visible Markdown workspace.
- The ready app should create or select a session Home Markdown Page when no page route is active.
- The central workspace should render the registered `page.editor` view through `ViewHost`, not by directly importing Markdown editor component code into App Shell.
- Existing Markdown editor behavior must still be user-visible: typing, toolbar snippets, save, task-title open, and checkbox toggle.
- Page switches must ignore stale async editor/save/task-open/checkbox-toggle completions.

## Initial Constraints

- Write failing tests first.
- Tests must use React Testing Library and `@testing-library/user-event` for typing, toolbar clicks, save clicks, task-title clicks, and checkbox toggles.
- Use accessible role/name queries and visible outcome assertions.
- Keep scope limited to Home workspace editor mounting; do not add metadata/timeline/sidebar/search/capture/calendar/report/ML/AI/settings/sync route behavior beyond existing placeholders.
- Do not add package, Tauri, Rust, IPC, capability, permission, persistence schema, filesystem, release, or native behavior changes.
- Preserve TASK-036 host boundaries: plugin UI gets narrow controlled props, descriptor-backed wrappers, and no full runtime/native handles.

## Validation At Start

- 11 `.codex/agents/*.toml` files parsed successfully.
- `codex --strict-config doctor --summary --ascii` reported config/auth/MCP/network/websocket OK with known non-blocking unrestricted sandbox/network notes and known `TERM=dumb` terminal failure.

## Current Next Action

- Ask `implementer` to make the focused Home workspace editor tests pass without expanding the TASK-037 scope or weakening TASK-036 host boundaries.

## Pre-Test Guidance Outcomes

- Aristotle (`planner`) recommended the smallest safe TASK-037 slice:
  - only replace the Home route placeholder with a session Home Markdown workspace;
  - create/select exactly one session-scoped Home Markdown Page when no active page route exists;
  - render the registered `page.editor` view through `ViewHost`, with `viewId="markdown.page-editor"` and `viewType="page.editor"`;
  - keep non-Home routes as placeholders;
  - keep page state and editor commands in one in-memory runtime source for this task;
  - defer durable Home identity, saved filters, metadata/timeline slots, rich editor behavior, filesystem import/export, persistent/native Home creation, and all dialogs/routes outside Home.
- Halley (`docs_researcher`) confirmed current official guidance:
  - dynamic registered components should be rendered via `ViewHost` / `createElement`, not direct function calls;
  - tests should use React Testing Library role/name queries and `userEvent.setup()` with awaited typing/clicking;
  - async UI assertions should use awaited `findBy*` or `waitFor` where needed;
  - React async load/save/open/toggle paths need cleanup/generation guards for stale completions;
  - MUI additions should use v9 path imports and avoid deprecated props/patterns.
- Sagan (`security_reviewer`) defined P0/P1 boundaries:
  - do not broaden public `useRuntime()` beyond frozen `{ app }`;
  - do not import `MarkdownPageEditor` or any business plugin private component into App Shell;
  - do not loosen generic `ViewHost` function/key filtering for editor props;
  - build a shell-internal trusted adapter with exact command allowlists, likely `markdown.insert-text`, `task.open-task-page`, and `task.toggle-status`;
  - expose only current-page bounded `pageFacade.load/save`, not NativeBridge, DB, raw runtime markdown pages, filesystem/path, or full page dumps;
  - all async insert/save/open/toggle paths must ignore stale page/generation completions and redact raw errors.
- Mendel (`deprecation_auditor`) found no P0 but identified P1 design risks:
  - current `ViewHost` and `MarkdownPageEditor` prop contracts do not directly match, so TASK-037 needs a narrow adapter or plugin view compatibility path;
  - App Shell currently cannot access full runtime through public `useRuntime()`, and should not expand that public facade;
  - MUI v9 additions must avoid old `componentsProps`, `InputProps`, `PaperProps`, `TransitionComponent`, `GridLegacy`, `Hidden`, `makeStyles`, and similar deprecated APIs.
- Parent decision:
  - accept the adapter-first direction;
  - do not ask test writer to relax TASK-036 host boundaries;
  - require failing tests for Home workspace rendering, no direct editor import, no raw runtime/facade leaks, real user-event editing flows, stale async guards, and no package/native drift before implementation.

## Test Writer Outcome

- Epicurus (`test_writer`) added failing TASK-037 acceptance and boundary coverage in commit `35bda50`.
- Changed files:
  - `src/test/home-workspace-editor.test.tsx`;
  - `src/test/mui-shell-frame.test.tsx`;
  - `src/test/app-shell-boundary.test.ts`.
- Coverage added:
  - the ready first screen must show an editable Home Markdown textbox instead of Home placeholders, startup copy, landing copy, or hero copy;
  - StrictMode-style rerenders must still create/select exactly one session Home page;
  - Home must render the registered `page.editor` / `markdown.page-editor` view through `ViewHost`, allowing a swapped registered editor while preventing raw runtime, command, store, native, registry, filesystem, path, or page facade leaks in plugin props;
  - realistic user flows type Markdown, click toolbar snippet buttons, save, click a task title, navigate back to Home, and toggle a checkbox through accessible UI;
  - stale toolbar insert completion after navigating away from Home must not overwrite another route or the Home page;
  - non-Home routes remain placeholders and do not mount the Markdown editor;
  - TASK-037 must not change package, native, Tauri, IPC, capability, permission, or release surfaces;
  - App Shell static boundary tests now reject direct Markdown editor component references and plugin-private imports;
  - the MUI deprecated API guard now covers `InputProps`, `PaperProps`, and `TransitionComponent`.
- Parent red validation:
  - `bun run test:frontend -- src/test/home-workspace-editor.test.tsx src/test/mui-shell-frame.test.tsx src/test/app-shell-boundary.test.ts src/test/view-slot-hosts.test.tsx src/test/markdown-editor-plugin-shell.test.tsx src/test/markdown-page-persistence.test.tsx src/test/task-navigation-infinite-nesting.test.tsx src/test/task-checkbox-toggle-events.test.tsx` failed as expected with 2 failed files / 6 passed and 8 failed / 104 passed because Home still rendered placeholders and no Markdown textbox / registered editor.
  - `bun run typecheck` passed.
  - `git diff --check` passed.
- Parent decision:
  - accept the tests as the TASK-037 red baseline;
  - commit them separately before implementation;
  - delegate production changes to `implementer`.

## Implementation Delegation Notes

- Noether (`implementer`) was assigned TASK-037 production implementation after the failing-test commit.
- Parent waited for a blocking result, sent one concise status request, waited another window, and initially observed no worktree changes before closing Noether.
- Outcome: Noether produced no final output; after shutdown, unverified production edits appeared in the working tree.
- Parent decision: treat the late edits as partial agent output, do not commit them directly, and delegate a replacement implementer to review, continue, or correct them rather than taking over production work in the parent thread.

## Implementation Outcome

- Popper (`implementer`) reviewed the late Noether edits, completed the production implementation, and produced commit `11fd2a3`.
- Changed production files:
  - `src/App.tsx`;
  - `src/plugins/markdown-editor/components/MarkdownPageEditor.tsx`;
  - `src/providers/RuntimeProvider.tsx`;
  - `src/providers/runtime-source-context.ts`;
  - `src/shell/hosts/MarkdownWorkspaceBridge.tsx`;
  - `src/shell/hosts/MarkdownWorkspaceBridgeContext.ts`;
  - `src/shell/hosts/index.ts`.
- Delivered behavior:
  - Home now selects or creates a session `Home` Markdown Page on the ready first screen;
  - Home renders `markdown.page-editor` / `page.editor` through `ViewHost`;
  - the Markdown editor supports hosted ViewHost props through a shell-internal workspace bridge while preserving direct and loaded `pageFacade` usage;
  - the bridge exposes only current-page bounded load/save, exact command allowlist wrappers for `markdown.insert-text`, `task.open-task-page`, and `task.toggle-status`, editor extension collection, and page open navigation;
  - user typing, snippet insert, save status, task-title open, checkbox toggle, and stale insert navigation behavior pass the red acceptance tests;
  - non-Home routes remain placeholders.
- Parent validation after Popper:
  - `bun run test:frontend -- src/test/home-workspace-editor.test.tsx src/test/mui-shell-frame.test.tsx src/test/app-shell-boundary.test.ts src/test/view-slot-hosts.test.tsx src/test/markdown-editor-plugin-shell.test.tsx src/test/markdown-page-persistence.test.tsx src/test/task-navigation-infinite-nesting.test.tsx src/test/task-checkbox-toggle-events.test.tsx` passed with 8 files / 112 tests.
  - `bun run typecheck` passed.
  - `bun run lint` passed.
  - `git diff --check` passed.
  - Package, native, Tauri, IPC, capability, permission, and release files had no diff.
- Parent decision:
  - accept `11fd2a3` as the implementation commit;
  - proceed to review agents before branch-level gate and closeout.
