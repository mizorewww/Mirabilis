# TASK-008 Agent Communication - View Registry and Slot Registry

## Task

- Task ID: TASK-008.
- Task name: Add View Registry and Slot Registry.
- Branch: `feat/task-008-view-slot-registry`.
- Worktree: `/home/aac6fef/Developer/Mirabilis`.
- Parent role: orchestration only.

## Source Docs

- `docs/product/02-core-data-model.md#45-view-registry`.
- `docs/architecture/04-slots-editor-task.md#7-slot-系统`.
- `docs/product/06-view-slots.md`.
- `docs/implementation/task-index.md#task-008-add-view-registry-and-slot-registry`.
- `docs/testing/strategy.md`.

## Acceptance Criteria

- Plugins can register views by id/type and slots by slot name.
- Slot contributions support order and conditional rendering metadata.
- Duplicate IDs are rejected.
- View/slot registries remain UI-framework compatible with React components.

## Initial Parent Interpretation

- TASK-008 implements Core registration and discovery only.
- Core must not implement actual React rendering, built-in business views, slot renderers, command palette UI, plugin host lifecycle, IPC, permissions, persistence, or Tauri behavior.
- View and slot components are plugin-provided values. The registry should remain UI-framework compatible by accepting component references without importing React runtime where possible.
- Slot `when` is conditional rendering metadata/function supplied by plugins; TASK-008 should store it and expose it to renderers, not execute matching logic unless local docs require it.
- Follow the in-memory registry/store hardening patterns established by TASK-003 through TASK-007 where they fit component-bearing contributions.

## Agent/Config Checks

- `.codex/agents/*.toml` parsed successfully.
- `codex --strict-config doctor --summary --ascii` reported configuration/auth/MCP/network OK and a desktop-terminal `TERM=dumb` failure, treated as non-blocking for repository agent work.

## Current Status

- Status: pre-test guidance active.
- Active agents:
  - Hooke (`planner`, `019e436e-7986-7ba2-b8c5-6a2d8fab1838`): TASK-008 API, scope, and TDD plan.
  - Halley (`docs_researcher`, `019e436e-7cc2-7f01-983a-c26bea4748f7`): current TypeScript/React/Vitest guidance for view/slot registry tests.
  - Tesla (`deprecation_auditor`, `019e436e-93cb-7ec0-b695-7e2b1ed98b87`): TASK-008 risk and deprecated-pattern audit.

## Agent Handoffs

### Pre-test Guidance Round

- Status: active.
- Agents:
  - Hooke (`planner`, `019e436e-7986-7ba2-b8c5-6a2d8fab1838`): propose focused View Registry and Slot Registry API, validation, ordering, duplicate handling, unregister behavior, component-reference semantics, and acceptance tests.
  - Halley (`docs_researcher`, `019e436e-7cc2-7f01-983a-c26bea4748f7`): verify current official TypeScript, React, and Vitest guidance relevant to component-compatible registry types and tests.
  - Tesla (`deprecation_auditor`, `019e436e-93cb-7ec0-b695-7e2b1ed98b87`): audit component-reference cloning, condition function exposure, slot ordering edge cases, duplicate atomicity, UI-framework coupling, and boundary risks.

## Next Action

Wait for TASK-008 pre-test guidance agents.
