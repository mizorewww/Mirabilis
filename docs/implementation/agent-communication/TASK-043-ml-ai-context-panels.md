# TASK-043 - Add ML And AI Context Panels

## Orchestration State

- Started: 2026-06-01 21:46 CST.
- Branch: `feat/task-043-ml-ai-context-panels`.
- Worktree: `/home/aac6fef/Developer/Mirabilis`.
- Parent role: orchestration only.
- Status: `implementer` Huygens (`019ec46c-9844-7c22-a701-6ca383afa318`) is running; parent is waiting for final status.

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

- Einstein (`planner`, agent `019e8370-810b-7512-9862-87eee2292ead`) spawned at 2026-06-01 21:47 CST for task slicing and red-test guidance.
- Banach (`docs_researcher`, agent `019e8370-84d8-7210-b78a-5af43ddddb82`) spawned at 2026-06-01 21:47 CST for local docs and current API guidance.
- Avicenna (`security_reviewer`, agent `019e8370-882d-7140-854e-0bf527f9cc34`) spawned at 2026-06-01 21:47 CST for AI/secret/network/runtime boundary guidance.
- Aristotle (`deprecation_auditor`, agent `019e8370-8c9d-7cc2-b999-f7941a0c6db3`) spawned at 2026-06-01 21:47 CST for MUI/React/testing API guidance.
- Banach (`docs_researcher`) completed with no blocker. It verified MUI v9 Drawer/Tabs/migration/useMediaQuery, React 19 test-utils guidance, Testing Library query/async/user-event docs, and confirmed no OpenAI docs are needed unless TASK-043 changes live provider/request behavior.
- Avicenna (`security_reviewer`) completed with no blocker. It recommended projection, hosted-prop, mutation, and static guard tests; flagged P0/P1 risks around live provider/network/secrets/native/schema expansion, AI mutation, raw runtime handles, provider settings, full workspace data, and raw errors.
- Einstein (`planner`) completed with no blocker. It recommended a right-side shell-owned `ContextPanel`, current-page-route gating, exact `ViewHost` ids, no broad `page.sidebar.panel` mounting, new `src/shell/projections/ml-ai-context.ts`, new projection/panel tests, and adjacent ML/AI/ViewHost boundary suites.
- Aristotle (`deprecation_auditor`) completed with no P0 blocker. It warned to avoid removed MUI v9 props (`componentsProps`, `PaperProps`, `BackdropProps`, old system props), keep AI `ViewHost` data kinds equal to registered view ids, avoid live AI provider execution, and add stale async guards.
- Anscombe (`test_writer`) was spawned at 2026-06-01 21:57 CST to add failing projection, panel, and static-boundary tests.
- Anscombe returned final status with test-only changes. It added `src/test/ml-ai-context-projections.test.ts` and `src/test/ml-ai-context-panels.test.tsx`, covering bounded current-page projections, cap and fail-closed behavior, the user-visible right context panel, ML/AI `ViewHost` ids, advisory command allowlists, stale async/page-switch handling, redaction, non-mutation, and static no-native/no-network/no-secret boundaries.
- Huygens (`implementer`, agent `019ec46c-9844-7c22-a701-6ca383afa318`) was spawned at 2026-06-14 12:38 CST to implement the minimum production code needed to pass the committed red tests.

## Parent Decisions

- Use an optional right-side context panel next to the Markdown workspace, gated to current page routes. Do not implement a new Drawer route for TASK-043.
- Render ML and AI through exact `ViewHost` ids (`ml.prediction-panel`, `ai.suggestion-panel`, `ai.review-panel`). Defer broad `page.sidebar.panel` SlotHost mounting to a later reviewed task.
- Allow only current-page advisory AI commands in the shell integration: `ai.suggest-tags`, `ai.suggest-due-date`, `ai.generate-subtasks`, and `ai.explain-prediction` only after a valid ML prediction exists. Exclude weekly review, filter generation, inbox cleanup, arbitrary text-to-task, durable acceptance/apply/save workflows, and any mutation workflow.
- Cap ML projection arrays at 1,000 and AI projection arrays at 100. Current-page text must be bounded and current-page only; no full workspace body projection.
- No live provider execution, provider settings UI, secret/keychain storage, durable AI suggestion acceptance, network/native execution, package, lockfile, Tauri, Rust, IPC, capability, permission, schema, native, or release changes.

## Validation

- 2026-06-01 21:46 CST: branch created from clean validated `master`.
- 2026-06-01 21:46 CST: 11 project agent TOML files parsed successfully.
- 2026-06-01 21:46 CST: `codex --strict-config doctor --summary --ascii` reported config/auth/MCP/network/websocket OK, with known unrestricted-sandbox notes and known `TERM=dumb` terminal failure.
- 2026-06-01 21:47 CST: pre-test guidance agents spawned; parent is waiting for completion/final statuses.
- 2026-06-01 21:55 CST: pre-test guidance agents completed with no hard blockers. Parent decisions recorded above.
- 2026-06-01 21:57 CST: Anscombe (`test_writer`, agent `019e8379-1dc1-7dc1-aea5-26a217549ddf`) spawned for red tests. Parent state is waiting for completion/final status.
- 2026-06-14 12:37 CST: Anscombe returned final status. Parent red validation ran `bun run test:frontend -- src/test/ml-ai-context-projections.test.ts src/test/ml-ai-context-panels.test.tsx src/test/app-shell-boundary.test.ts src/test/view-slot-hosts.test.tsx src/test/ml-plugin-baseline-predictions.test.tsx src/test/ai-plugin-provider-abstraction.test.tsx`; expected red result matched missing `../shell/projections/ml-ai-context` and absent context-panel UI, while adjacent suites passed with 75 tests.
- 2026-06-14 12:37 CST: `git diff --check` passed, and red tests were committed as `dff783e` (`Anscombe(test)(Add ML And AI Context Panels): add context panel acceptance tests`).
- 2026-06-14 12:38 CST: Huygens spawned as `implementer`; parent state is waiting for completion/final status before integrating implementation work.

## Next Action

- Wait for Huygens (`implementer`) completion/final status. Do not integrate partial file edits or infer failure from wait timeouts.
