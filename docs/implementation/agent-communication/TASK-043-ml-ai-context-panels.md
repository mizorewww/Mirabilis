# TASK-043 - Add ML And AI Context Panels

## Orchestration State

- Started: 2026-06-01 21:46 CST.
- Branch: `feat/task-043-ml-ai-context-panels`.
- Worktree: `/home/aac6fef/Developer/Mirabilis`.
- Parent role: orchestration only.
- Status: started; pre-test guidance delegation pending.

## Scope

- Add an optional right context panel for current-page ML and AI surfaces without covering the Markdown workspace.
- ML panel must build exact bounded current-page projections, execute `ml.run-prediction` through Command Registry, and render `ml.page-sidebar.prediction-panel` / `ml.prediction-panel` through registered hosts.
- AI panel must render `ai.suggestion-panel` and `ai.review-panel` with explicit caller-provided DTOs and can execute advisory AI commands with exact bounded projections.
- AI output remains advisory and non-mutating from shell integration.
- Malformed, unavailable, rejected, or absent data must fail closed with visible non-leaky states.

## Constraints

- Parent remains orchestration-only and must wait for child-agent completion/final status before dependent steps.
- Tests must be written before production implementation.
- No live provider execution, provider settings UI, secret/keychain storage, durable AI suggestion acceptance, network/native execution, package, lockfile, Tauri, Rust, IPC, capability, permission, schema, native, or release changes.
- Do not expose full workspace data, full runtime handles, provider settings, raw errors, secrets, plugin private stores, sibling plugin internals, or raw Core stores to hosted panels.

## Agent Notes

- Pending pre-test guidance from planner, docs/API researcher, security reviewer, and deprecation auditor.

## Parent Decisions

- Pending.

## Validation

- 2026-06-01 21:46 CST: branch created from clean validated `master`.
- 2026-06-01 21:46 CST: 11 project agent TOML files parsed successfully.
- 2026-06-01 21:46 CST: `codex --strict-config doctor --summary --ascii` reported config/auth/MCP/network/websocket OK, with known unrestricted-sandbox notes and known `TERM=dumb` terminal failure.

## Next Action

- Delegate planner, docs/API, security, and deprecation guidance before TDD tests.
