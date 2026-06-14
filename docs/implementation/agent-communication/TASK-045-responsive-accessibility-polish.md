# TASK-045 - Responsive State And Accessibility Polish

## Orchestration State

- Started: 2026-06-14 17:30 CST.
- Branch: `feat/task-045-responsive-accessibility-polish`.
- Worktree: `/home/aac6fef/Developer/Mirabilis`.
- Parent role: orchestration only.
- Status: pre-test guidance is running; parent is waiting for child-agent completion/final statuses before red-test delegation.

## Scope

- Keep desktop and narrow layouts usable without incoherent overlap among the Markdown workspace, sidebar, top controls, contextual panel, floating surfaces, dialogs, and route content.
- Make sidebar collapse/drawer behavior, command palette, search overlay, Quick Capture dialog, editor, metadata/timer/timeline slots, Calendar/Reports routes, ML/AI panels, and Settings/Sync placeholders keyboard reachable with predictable focus return.
- Normalize loading, empty, unavailable, and error states across workbench, routes, `ViewHost`, `SlotHost`, overlays, and contextual panels.
- Keep state text user-safe: no raw errors, paths, SQL, tokens, provider details, secrets, or full runtime handles.
- Preserve app-shell landmarks, headings, labels, status regions, dialog semantics, focus management, and route navigation from the user's perspective.
- Keep the UI dense and work-focused. Do not add marketing landing pages, hero sections, decorative app sections, or card-heavy replacement surfaces.

## Constraints

- Parent remains orchestration-only and must wait for child-agent completion/final status before dependent steps.
- Tests must be written before production implementation.
- No native/Tauri/Rust/package/lockfile/capability/permission/IPC/schema/release changes.
- Do not add new plugin business behavior, settings persistence, sync transport, provider execution, broad query facades, or native/global shortcuts.
- Do not pass raw runtime handles, Core stores, registries, Plugin Host, NativeBridge, raw invoke, filesystem/path values, SQL, provider settings, secrets, plugin private stores, or sibling plugin internals to plugin-rendered UI.

## Source Docs

- `docs/product/07-user-interface-design.md`
- `docs/product/04-editor-and-workflows.md`
- `docs/product/06-view-slots.md`
- `docs/architecture/07-runtime-flows.md`
- `docs/testing/strategy.md`
- `docs/implementation/task-index.md#TASK-045`

## Parent Decisions

- Treat TASK-045 as a TypeScript/React/MUI UI-only polish and accessibility task.
- Preserve all route/data/plugin security boundaries delivered by TASK-035 through TASK-044.
- Use React Testing Library and `userEvent.setup()` for realistic keyboard, click, typing, focus-return, and visible outcome tests.
- Prefer role/name queries, landmarks, status/alert semantics, dialog semantics, and user-visible state assertions over implementation internals.
- Use `bun run check:quick` as the expected final gate unless an agent-backed scope change introduces native/package/IPC/release surfaces.

## Validation

- 2026-06-14 17:30 CST: branch created from validated `master` commit `1de3ec0`.
- 2026-06-14 17:30 CST: 11 project agent TOML files parsed successfully.
- 2026-06-14 17:30 CST: `codex --strict-config doctor --summary --ascii` reported config/auth/MCP/network/websocket OK, with known unrestricted-sandbox notes and known `TERM=dumb` terminal failure.

## Agent Notes

- Jason (`planner`, agent `019ec579-6734-7ef3-aa0e-a9e68cb38091`) spawned at 2026-06-14 17:32 CST for task slicing, acceptance criteria, and red-test guidance.
- Locke (`docs_researcher`, agent `019ec579-69f1-7d52-84a5-67e83c3bfa20`) spawned at 2026-06-14 17:32 CST for local docs plus current official WAI-ARIA, MUI responsive Drawer/Dialog/breakpoint, React Testing Library/user-event, and React testing guidance.
- Herschel (`security_reviewer`, agent `019ec579-6c46-7633-a2ef-47b1a73d4b9c`) spawned at 2026-06-14 17:32 CST for UI-only security/privacy boundary guidance.
- Aquinas (`deprecation_auditor`, agent `019ec579-6ebd-7853-b5a4-f7ef6069b349`) spawned at 2026-06-14 17:32 CST for stale MUI/React/testing API guidance.

## Next Action

- Wait for Jason, Locke, Herschel, and Aquinas completion/final statuses before red-test delegation. A wait timeout is not a failure or idle signal.
