# TASK-044 - Add Settings And Sync Placeholders

## Orchestration State

- Started: 2026-06-14 14:04 CST.
- Branch: `feat/task-044-settings-sync-placeholders`.
- Worktree: `/home/aac6fef/Developer/Mirabilis`.
- Parent role: orchestration only.
- Status: review is running; parent is waiting for completion/final statuses.

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
- Use the existing top-bar Settings control to open a visible Settings workspace route; include Sync as a named skeleton section/panel inside Settings rather than adding a top-level Sync Drawer route.
- Treat settings descriptors as public manifest descriptor DTOs only. Do not render executable settings panels.

## Validation

- 2026-06-14 14:04 CST: branch created from validated `master` commit `6e394fa`.
- 2026-06-14 14:04 CST: 11 project agent TOML files parsed successfully.
- 2026-06-14 14:04 CST: `codex --strict-config doctor --summary --ascii` reported config/auth/MCP/network/websocket OK, with known unrestricted-sandbox notes and known `TERM=dumb` terminal failure.

## Agent Notes

- Darwin (`planner`, agent `019ec4bb-f239-77c2-8ae2-4ad86405f398`) spawned at 2026-06-14 14:05 CST for task slicing, acceptance criteria, and red-test guidance.
- Kuhn (`docs_researcher`, agent `019ec4bb-f4d6-71f0-ae3b-2629997d44bb`) spawned at 2026-06-14 14:05 CST for local docs plus current MUI/React/Testing Library guidance.
- Leibniz (`security_reviewer`, agent `019ec4bb-f804-7993-8bb5-87ec28b47c6a`) spawned at 2026-06-14 14:05 CST for secret/settings/sync boundary guidance.
- Hegel (`deprecation_auditor`, agent `019ec4bb-fa7b-7df2-a9f1-8fde208b0cb1`) spawned at 2026-06-14 14:05 CST for MUI/React/testing deprecation guidance.
- Leibniz returned final status with no blocker and P0 red-test targets for no secret surfaces, no Sync activation, no native/package drift, no raw runtime leaks, and no execution/render sinks.
- Darwin returned final status with no blocker and recommended a Settings route with embedded Sync skeleton panel. Suggested red tests cover Settings route/runtime facts, public settings descriptor listing, Sync skeleton status, and boundary/no-drift guards.
- Kuhn returned final status with no blocker. It verified MUI v9.1.1 List/Alert/Button/Switch/Tooltip/Drawer/path-import docs, React 19.2 act/upgrade guidance, Testing Library role/query/user-event guidance, and Vitest v4.1.7 docs. OpenAI docs were not checked because TASK-044 must not change live provider behavior.
- Hegel returned final status with no blocker. It reinforced MUI path imports, no stale MUI APIs, non-urgent placeholder `Alert role="status"`, React 19 testing patterns, awaited user-event interactions, and no focused/skipped tests.
- Bohr (`test_writer`, agent `019ec4c1-997e-7761-8c3b-e206cf710e98`) was spawned at 2026-06-14 14:11 CST to add failing RTL/static tests for TASK-044.
- Bohr returned final status with test-only changes in `src/test/settings-sync-placeholders.test.tsx` and `src/test/mui-shell-frame.test.tsx`. Commit `9a90de1` records the red tests.
- Boyle (`implementer`, agent `019ec4ca-1dbe-7a10-a3b7-fc0716d6a14b`) was spawned at 2026-06-14 14:20 CST to make Bohr's red tests pass with minimum production changes.
- Boyle returned final status with implementation in `src/App.tsx` and `src/App.css`. Commit `b1f4318` records the implementation.
- Helmholtz (`pr_explorer`, agent `019ec4d1-2525-7230-b2c2-717e96173b8c`), Banach (`reviewer`, agent `019ec4d1-2c3c-7e91-b519-a24040efff2c`), Euclid (`security_reviewer`, agent `019ec4d1-2ed8-7492-9a63-ab601ea61a41`), Cicero (`deprecation_auditor`, agent `019ec4d1-3146-7582-a929-344e5c7e481b`), Boole (`docs_researcher`, agent `019ec4d1-46a8-7e63-bc1c-1c863cb0a520`), and Raman (`test_quality_reviewer`, agent `019ec4d1-49c3-7e11-818c-912ed4a28198`) were spawned for review at 2026-06-14 14:28 CST.
- `doc_writer` review spawn hit the current agent thread limit and will be retried after capacity frees.

## Next Action

- Wait for review agents to return completion/final statuses; retry `doc_writer` after capacity frees.
