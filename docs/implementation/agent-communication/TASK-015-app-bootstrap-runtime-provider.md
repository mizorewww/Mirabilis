# TASK-015 Agent Communication - App Bootstrap Runtime Provider

## Task

- Task ID: TASK-015.
- Task name: Build app bootstrap and runtime provider.
- Branch: `feat/task-015-app-bootstrap-runtime-provider`.
- Worktree: `/home/aac6fef/Developer/Mirabilis`.
- Parent role: orchestration only.

## Source Docs

- `docs/architecture/01-overview-and-monorepo.md#2-monorepo-目录结构`.
- `docs/architecture/07-runtime-flows.md#17-启动流程`.
- `docs/implementation/task-index.md#task-015-build-app-bootstrap-and-runtime-provider`.
- `docs/testing/strategy.md`.

## Acceptance Criteria

- App initializes storage, Core services, registries, Plugin Host, built-in plugins, and React providers in documented order.
- Runtime is available to UI through a provider/hook.
- Startup failures surface a user-visible error state.
- No plugin business logic lives in App Shell.

## Initial Parent Interpretation

- TASK-015 should connect the existing NativeBridge and Core runtime/Plugin Host primitives into the React app startup path.
- The first implementation should be small and testable: a bootstrap function, runtime provider/hook, and user-visible startup states.
- Built-in plugins should be represented explicitly, but business plugin behavior remains out of scope unless current docs or agents find a TASK-015-specific minimum.
- App Shell may own lifecycle composition and error rendering; it must not implement task/tag/editor/timer/calendar behavior directly.
- Avoid new Tauri command/capability expansion unless bootstrap strictly requires it.

## Agent/Config Checks

- `.codex/agents/*.toml` parsed successfully with 11 agent config files.
- `codex --strict-config doctor --summary --ascii` reported configuration/auth/MCP/network/WebSocket/reachability OK, plus the known desktop-terminal `TERM=dumb` failure. Parent treats this as non-blocking for repository agent work.

## Current Status

- Status: pre-test guidance handoff.
- Active agents: none.
- Next parent step: spawn read-only planner, docs/current-guidance, deprecation/API, and security-boundary agents before red tests.

## Agent Handoffs

### Pre-test Guidance Round

- Status: pending.
- Planned agents:
  - `planner` for TASK-015 scope, test split, implementation boundaries, dependencies, and risks.
  - `docs_researcher` for current React, Testing Library, Tauri NativeBridge/bootstrap, and local-doc guidance.
  - `deprecation_auditor` for React 19/Vite/Vitest/Tauri API risk and stale patterns.
  - `security_reviewer` for NativeBridge exposure, plugin/runtime boundaries, startup error handling, and no business logic in App Shell.
