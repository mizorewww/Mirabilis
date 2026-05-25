# TASK-036 Agent Communication - Add Generic ViewHost And SlotHost

## Task

- ID: TASK-036.
- Name: Add Generic ViewHost And SlotHost.
- Branch: `feat/task-036-viewhost-slothost`.
- Started: 2026-05-26 02:05 CST.
- Parent role: orchestration only. Parent delegates current-doc/deprecation/security guidance, test writing, implementation, review, docs sync, and release readiness to specialized agents.

## Source Docs And Code Read By Parent

- `docs/implementation/task-index.md#task-036-add-generic-viewhost-and-slothost`.
- `docs/product/07-user-interface-design.md`.
- `docs/product/06-view-slots.md`.
- `docs/architecture/03-plugin-api-and-host.md`.
- `docs/architecture/04-slots-editor-task.md`.
- `docs/architecture/07-runtime-flows.md`.
- `docs/testing/strategy.md`.
- `src/core/registries/view-registry.ts`.
- `src/core/registries/slot-registry.ts`.
- Existing built-in plugin view/slot registration usages and tests.

## Initial Parent Interpretation

- TASK-036 should add trusted app-shell host components/helpers for rendering registry-owned views and slots, without yet mounting Home editor routes or real app data.
- `ViewHost` should resolve registered views by id/type, check caller-provided accepted data, and fail closed for missing, mismatched, malformed, thrown, unavailable, loading, empty, and error cases.
- `SlotHost` should render registered slot contributions by slot name in deterministic registry order, evaluate conditions only with controlled props, and isolate invalid/thrown contributions.
- Hosts must pass plugin-rendered React components only narrow controlled props/data. They must never expose full runtime handles or native/security surfaces.

## Initial Constraints

- Write failing tests before implementation.
- Tests should use React Testing Library and `@testing-library/user-event` where rendered slot controls are clicked and visible outcomes are asserted.
- Do not import business-plugin private implementations into app-shell host code.
- Do not add package, Tauri, Rust, IPC, capability, permission, persistence, schema, filesystem, release, or native behavior changes.
- Preserve public `useRuntime()` as the `{ app }` facade.

## Validation At Start

- 11 `.codex/agents/*.toml` files parsed successfully.
- `codex --strict-config doctor --summary --ascii` reported config/auth/MCP/WebSocket/reachability OK with known non-blocking unrestricted sandbox/network notes and known `TERM=dumb` terminal failure.

## Current Next Action

- Delegate current-doc, deprecation/API, and security guidance before failing tests.
