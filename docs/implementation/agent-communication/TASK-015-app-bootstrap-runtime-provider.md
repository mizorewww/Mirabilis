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

- Status: pre-test guidance agents running.
- Active agents:
  - Huygens the 2nd (`planner`) for scope, implementation slices, test split, dependencies, and risks.
  - Goodall the 2nd (`docs_researcher`) for current React, Testing Library, Tauri, and local-doc guidance.
  - Feynman the 2nd (`deprecation_auditor`) for React/Vite/Vitest/Tauri API and version-risk review.
  - Parfit the 2nd (`security_reviewer`) for NativeBridge exposure, runtime/provider boundaries, and App Shell constraints.
- Next parent step: wait for pre-test guidance, summarize recommendations here, then hand off red tests to `test_writer`.

## Agent Handoffs

### Pre-test Guidance Round

- Status: in progress.
- Agents:
  - Huygens the 2nd (`planner`): read-only plan for TASK-015 scope, test split, implementation boundaries, dependencies, and risks.
  - Goodall the 2nd (`docs_researcher`): read-only current guidance for React providers/hooks, Testing Library/Vitest async tests, and Tauri v2 bootstrap considerations.
  - Feynman the 2nd (`deprecation_auditor`): read-only deprecation/API risk audit for likely touched frontend/runtime/bootstrap code.
  - Parfit the 2nd (`security_reviewer`): read-only review of NativeBridge exposure, plugin/runtime boundaries, startup error handling, and no business logic in App Shell.
