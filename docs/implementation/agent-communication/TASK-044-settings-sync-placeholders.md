# TASK-044 - Add Settings And Sync Placeholders

## Orchestration State

- Started: 2026-06-14 14:04 CST.
- Branch: `feat/task-044-settings-sync-placeholders`.
- Worktree: `/home/aac6fef/Developer/Mirabilis`.
- Parent role: orchestration only.
- Status: task started; parent is preparing pre-test guidance delegation.

## Scope

- Add Settings and Sync placeholder route/panel surfaces to the current MUI app shell.
- Settings route must list app/runtime information and currently available plugin settings descriptors, including inert `ai.provider-settings` and Sync skeleton status.
- Sync route or panel must clearly show Sync as placeholder/skeleton status with no runtime sync commands, transport, remote endpoint, conflict UI, background jobs, or settings persistence enabled.
- Disabled controls and explanatory states must be accessible and visible without claiming unsupported behavior.
- Settings and Sync placeholders must not accept, store, render, or log API keys, tokens, credentials, remote endpoints, filesystem paths, provider secrets, or other secret-like values.
- Any settings action that exists must go through registered commands; this task should avoid adding mutation actions unless they already exist as safe public descriptors.

## Constraints

- Parent remains orchestration-only and must wait for child-agent completion/final status before dependent steps.
- Tests must be written before production implementation.
- No live provider execution, provider settings input UI, secret/keychain storage, remote endpoint persistence, network/native sync, background jobs, conflict UI, package, lockfile, Tauri, Rust, IPC, capability, permission, schema, or release changes.
- Do not expose raw runtime handles, Core stores, registries, Plugin Host, NativeBridge, raw invoke, filesystem/path values, provider settings, secrets, plugin private stores, or sibling plugin internals to route UI.

## Source Docs

- `docs/product/07-user-interface-design.md`
- `docs/product/03-plugin-platform.md`
- `docs/product/05-built-in-plugins.md`
- `docs/architecture/05-plugin-implementations.md#sync-plugin`
- `docs/architecture/07-runtime-flows.md#17-启动流程`
- `docs/testing/strategy.md#task-032-sync-plugin-skeleton-guidance`

## Parent Decisions

- Treat Settings/Sync as inert app-shell placeholders backed by public runtime/plugin manifest data.
- Keep Sync tied to TASK-032 skeleton: plugin id `sync`, no runtime commands, views, settings panels, transport, background jobs, remote endpoint settings, or conflict UI.
- Keep AI provider settings descriptor informational only; do not add provider settings forms, API key fields, model inputs, endpoint inputs, or persistence.
- Prefer RTL/user-event tests against visible routes and disabled controls plus static no-secret/no-network/no-native/no-persistence guards.

## Validation

- 2026-06-14 14:04 CST: branch created from validated `master` commit `6e394fa`.
- 2026-06-14 14:04 CST: 11 project agent TOML files parsed successfully.
- 2026-06-14 14:04 CST: `codex --strict-config doctor --summary --ascii` reported config/auth/MCP/network/websocket OK, with known unrestricted-sandbox notes and known `TERM=dumb` terminal failure.

## Agent Notes

- No TASK-044 child agents have returned final status yet.

## Next Action

- Spawn pre-test guidance agents, then wait for completion/final statuses before delegating red tests.
