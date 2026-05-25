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

- Delegate current-doc, deprecation/API, security, and planning guidance before asking `test_writer` for failing tests.
