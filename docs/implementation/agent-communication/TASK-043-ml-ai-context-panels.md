# TASK-043 - Add ML And AI Context Panels

## Orchestration State

- Started: 2026-06-01 21:46 CST.
- Branch: `feat/task-043-ml-ai-context-panels`.
- Worktree: `/home/aac6fef/Developer/Mirabilis`.
- Parent role: orchestration only.
- Status: review-fix `implementer` Hypatia (`019ec48a-afa6-7d02-88ff-9188a19c9597`) is running; parent is waiting for final status.

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
- Huygens returned final status with implementation plus narrow test-maintenance fixes. Parent accepted the test edits as maintenance for ES2020/typecheck/matcher/helper-scope/panel-only leak assertions rather than weakening. Commits: `83164bf` (`Huygens(test-fix)(Add ML And AI Context Panels): repair context panel test expectations`) and `148084d` (`Huygens(implementation)(Add ML And AI Context Panels): implement context panel projections`).
- Ptolemy (`pr_explorer`, agent `019ec47a-e32d-7c71-a9c3-837265fed88a`), Beauvoir (`reviewer`, agent `019ec47a-e637-7b01-b93c-2f6f4def74b3`), Lovelace (`deprecation_auditor`, agent `019ec47a-e8cd-7431-aaa2-f3960d45806d`), Galileo (`security_reviewer`, agent `019ec47a-eb36-7f22-95bc-dfb01a0817ee`), Socrates (`docs_researcher`, agent `019ec47a-edd8-77f0-9628-57805d1e8dd0`), and Maxwell (`test_quality_reviewer`, agent `019ec47a-f17a-73f1-9767-a290e5f0fe22`) were spawned for review at 2026-06-14 12:54 CST.
- `doc_writer` review spawn hit the current agent thread limit and will be retried after capacity frees.
- Ptolemy (`pr_explorer`) returned final status with no blocker. It mapped changed paths and flagged review hotspots: missing context-panel CSS, ML scan-cap semantics, AI output redaction/bounding, intentional `ml.prediction-panel`-only mounting, and unrun full local gate.
- Lorentz (`doc_writer`, agent `019ec47d-95a4-7e22-8abf-7805c70f865e`) was spawned at 2026-06-14 12:57 CST after capacity freed.
- Lovelace (`deprecation_auditor`) returned final status with no P0/P1 and one P2: inactive tabs have `aria-controls` pointing at unmounted tabpanel ids.
- Maxwell (`test_quality_reviewer`) returned final status with no P0/P1. It found P2 coverage gaps for AI advisory command execution and payload assertions, AI stale async page-switch behavior, and weakened ML metadata/event overflow assertions.
- Socrates (`docs_researcher`) returned final status with no P0/P1. It verified current MUI v9, React 19, Testing Library, user-event, and Vitest guidance; OpenAI docs were not checked because live provider/request execution remains deferred. It repeated P2 findings for unmounted controlled tabpanels and missing context-panel CSS/layout coverage.
- Galileo (`security_reviewer`) returned final status with no P0/P1. It found one P2: non-exact ML prediction DTOs can flow into `ai.explain-prediction`, including provider/secret-shaped fields; and one P3: projection builders can throw on Proxy trap input instead of failing closed.
- Beauvoir (`reviewer`) returned final status with one P1: resolved AI provider failure DTOs such as `ai.provider-unconfigured` are rendered as successful suggestions. It also found P2 issues for shallow ML prediction validation before `ai.explain-prediction` and pre-filter ML metadata/event caps that can drop later valid current-page rows.
- Lorentz (`doc_writer`) returned final status and completed docs-only sync in commit `3088541`.
- Tesla (`test_writer`, agent `019ec485-25ce-7cd3-b759-b66a2f24fa57`) was spawned at 2026-06-14 13:05 CST for failing review-fix regression tests covering the P1/P2/P3 review findings.
- Tesla returned final status with test-only review-fix coverage in `src/test/ml-ai-context-projections.test.ts` and `src/test/ml-ai-context-panels.test.tsx`. Commit `7884458` records the red tests.
- Hypatia (`implementer`, agent `019ec48a-afa6-7d02-88ff-9188a19c9597`) was spawned at 2026-06-14 13:11 CST for production fixes to satisfy Tesla's review-fix tests.

## Parent Decisions

- Use an optional right-side context panel next to the Markdown workspace, gated to current page routes. Do not implement a new Drawer route for TASK-043.
- Render ML and AI through exact `ViewHost` ids (`ml.prediction-panel`, `ai.suggestion-panel`, `ai.review-panel`). Defer broad `page.sidebar.panel` SlotHost mounting to a later reviewed task.
- Allow only current-page advisory AI commands in the shell integration: `ai.suggest-tags`, `ai.suggest-due-date`, `ai.generate-subtasks`, and `ai.explain-prediction` only after a valid ML prediction exists. Exclude weekly review, filter generation, inbox cleanup, arbitrary text-to-task, durable acceptance/apply/save workflows, and any mutation workflow.
- Cap ML projection arrays at 1,000 and AI projection arrays at 100. Current-page text must be bounded and current-page only; no full workspace body projection.
- No live provider execution, provider settings UI, secret/keychain storage, durable AI suggestion acceptance, network/native execution, package, lockfile, Tauri, Rust, IPC, capability, permission, schema, native, or release changes.
- Review outcome decision: TASK-043 is not merge-ready. Fix the P1 and local P2/P3 findings in this branch before final gate and merge.

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
- 2026-06-14 12:52 CST: Huygens returned final status. Parent validation passed: `bun run test:frontend -- src/test/ml-ai-context-projections.test.ts src/test/ml-ai-context-panels.test.tsx src/test/app-shell-boundary.test.ts src/test/view-slot-hosts.test.tsx src/test/ml-plugin-baseline-predictions.test.tsx src/test/ai-plugin-provider-abstraction.test.tsx` passed with 6 files / 88 tests; `bun run typecheck`, `bun run lint`, and `git diff --check` passed.
- 2026-06-14 12:52 CST: Implementation integration committed in `83164bf` and `148084d`; branch is clean and synced to origin.
- 2026-06-14 12:54 CST: six review agents spawned; `doc_writer` spawn deferred because the current agent thread limit was reached.
- 2026-06-14 12:57 CST: Ptolemy, Lovelace, Maxwell, Socrates, and Galileo returned final statuses; Lorentz was spawned as replacement docs writer after capacity freed. Parent is waiting for Beauvoir and Lorentz before deciding review-fix delegation.
- 2026-06-14 13:04 CST: Beauvoir returned final status with one P1 and two P2 findings. Lorentz returned final status and docs-only sync was committed as `3088541`. Parent will delegate review-fix regression tests first.
- 2026-06-14 13:05 CST: Tesla spawned as `test_writer`; parent state is waiting for completion/final status before validating or committing review-fix tests.
- 2026-06-14 13:10 CST: Tesla returned final status. Parent red validation ran `bun run test:frontend -- src/test/ml-ai-context-projections.test.ts src/test/ml-ai-context-panels.test.tsx`; expected red result was 8 failures and 16 passing tests, matching the review findings. `git diff --check` passed. Tests were committed as `7884458`.
- 2026-06-14 13:11 CST: Hypatia spawned as `implementer`; parent state is waiting for completion/final status before validating or committing production fixes.

## Next Action

- Wait for Hypatia (`implementer`) completion/final status before validating and committing review fixes.
