# Agent Communication Status

Last updated: 2026-05-21 20:04 CST.

## Current Task

- Task: TASK-022 - Implement All Tasks and Today filters.
- Branch: `feat/task-022-all-tasks-today-filters`.
- Worktree: `/home/aac6fef/Developer/Mirabilis`.
- Parent role: orchestration only.
- Current phase: third review-fix implementation is in progress.

## Active Agents

- Bernoulli (`implementer`) is fixing Heisenberg's third review-fix regressions.

## Completed Recent Task

- TASK-021 - Implement Tag Plugin baseline was completed on branch `feat/task-021-tag-plugin-baseline`, validated with focused Tag Plugin checks, final branch `bun run check:quick`, `bun run build`, and merge-result `bun run check:quick`, then merged to `master` in commit `b5389cd`.
- TASK-020 - Implement checkbox toggle and task events was completed on branch `feat/task-020-checkbox-toggle-task-events`, validated with focused frontend/runtime/docs checks, final branch `bun run check:quick`, `bun run build`, and merge-result `bun run check:quick`, then merged to `master` in commit `c42fa5f`.
- TASK-019 - Implement task navigation and infinite nesting was completed on branch `feat/task-019-task-navigation-infinite-nesting`, validated with focused frontend/runtime/security/docs checks, final `bun run check:quick`, `bun run build`, and merge-tree `bun run check:quick`, then merged to `master` in commit `7a2ce72`.

## Current TASK-022 State

- TASK-022 follows TASK-006, TASK-018, and TASK-021 and owns the first Filter/View slice:
  - All Tasks filter lists task-enabled pages.
  - Today filter uses documented metadata/date semantics.
  - Filters render through the registered view system.
  - Empty states are provided through slots.
- Initial parent interpretation:
  - Keep Filter behavior on generic query/view/slot primitives and plugin-owned contributions.
  - Use current Task Plugin metadata where possible; agents must define whether Today can be implemented with existing `task.status` / source metadata or needs a narrow due/scheduled metadata contract.
  - Keep automatic save-time scanning/indexing, native/Tauri/package changes, broad persistence/schema changes, release packaging, global metadata UI, and Timer/Calendar/Stats aggregation out of scope unless agents identify an acceptance dependency.
- Agent/config checks passed for orchestration start: 11 agent TOML files parsed; `codex doctor` OK except the known `TERM=dumb` terminal failure plus non-blocking update/sandbox notes.

## Parent Decisions At TASK-022 Start

- Start from `master` after TASK-021 merge commit `b5389cd`.
- Use branch `feat/task-022-all-tasks-today-filters`.
- Delegate planning/current-doc guidance, deprecation/API review, security review, TDD tests, implementation, review, and docs sync to agents.
- The parent thread must not write TASK-022 tests or production implementation unless a delegated role fails or is explicitly cancelled and the fallback is recorded.

## Source Docs Read By Parent For TASK-022

- `.codex/skills/mirabilis-dev-runner/SKILL.md`.
- `docs/implementation/progress.md`.
- `docs/implementation/task-index.md#task-022-implement-all-tasks-and-today-filters`.
- `docs/development/01-data-roadmap-and-mvp.md#phase-3task-plugin`.
- `docs/product/05-built-in-plugins.md#23-filter-plugin`.
- `docs/architecture/02-core-kernel.md#44-filter-store`.
- `docs/architecture/06-filter-native-database.md#14-filter-engine-设计`.
- Related Task/Tag references in `docs/product/05-built-in-plugins.md`, `docs/architecture/07-runtime-flows.md`, `docs/development/02-implementation-roadmap-and-constraints.md`, and `docs/testing/strategy.md`.

## TASK-022 Validation Log

- `.codex/agents/*.toml` parsed successfully with 11 files.
- `codex --strict-config doctor --summary --ascii` reported configuration/auth/MCP/network/WebSocket/reachability OK; non-blocking notes were unrestricted sandbox/network, the known `TERM=dumb` terminal failure, and an available Codex update.

## Completed TASK-022 Agent Outcomes

- Volta (`planner`) completed read-only planning. Recommendation: add a business-agnostic filter query executor, Task Plugin-owned All Tasks and Today filters, registered view rendering, and `filter.empty_state` slot. Keep global navigation, native/Tauri changes, save-time scanning, metadata UI, and broad Filter Plugin ownership changes out of scope.
- Meitner (`docs_researcher`) completed current-doc/test guidance. Recommendation: use registered view/slot paths, keep Today bounded to seeded date metadata with deterministic tests, and use React Testing Library/user-event/Vitest patterns.
- Mill (`deprecation_auditor`) completed API/deprecation guidance. P0 guidance: do not treat `FilterStore.list()` as query execution; preserve `page.list` for TASK-021 tag filter compatibility; keep task semantics out of Core; avoid native/package changes.
- Darwin (`security_reviewer`) completed security guidance. P0/P1 guidance: no executable JS filters or native exposure, data-only AST interpreter with allowlisted fields, Task Plugin metadata trust boundaries, deterministic date parsing, minimal view/slot props, and inert rendering.
- Wegener (`test_writer`) added failing TASK-022 acceptance tests in `src/test/core-filter-engine.test.ts` and `src/test/task-filters-view-rendering.test.tsx`. Coverage includes public `executeFilterQuery`, generic metadata query execution, owner-consistent metadata, path-injection fail-closed behavior, Tag filter compatibility, relative Today resolution, Task-owned All Tasks/Today filters, registered `page.list` rendering, `filter.empty_state`, inert unsafe titles, and native/package guard.
- Ramanujan (`implementer`) added the initial TASK-022 production implementation in `src/core/filter-engine.ts`, `src/core/index.ts`, `src/core/stores/filter-store.ts`, `src/plugins/task/plugin.ts`, and `src/plugins/task/components/TaskFilterViews.tsx`. It implements public `executeFilterQuery`, task-owned All Tasks/Today filters, registered `page.list` view rendering, and `filter.empty_state` slot. Commit: `a9a07e9`.
- Focused review completed with Maxwell (`pr_explorer`), Hubble (`reviewer`), Gibbs (`security_reviewer`), Schrodinger (`deprecation_auditor`), Planck (`test_quality_reviewer`), and Epicurus (`docs_researcher`). P0 findings: none. P1 findings: default Task filter registration is not idempotent after plugin deactivation/re-registration, and formal docs drift from the implemented filter/view/date contract. Accepted P2/P3 follow-up: type fixed filter IDs as public save inputs, broaden generic executor coverage, cover `gt`/`lt`, harden relative-date `neq`, make empty-state copy generic or prop-scoped, and prove view/slot lookup through `viewType` and `filter.empty_state`. Deferred P2/P3: Event/plugin-index `within` execution, git-coupled native guard cleanup, and absence-command assertion brittleness.
- Hooke (`test_writer`) added review-fix regression tests in `src/test/core-filter-engine.test.ts`, `src/test/task-filters-view-rendering.test.tsx`, `src/test/core-filter-store.test.ts`, and `src/test/plugin-api-contracts.test.ts`. Parent red validation matched the expected signal: focused tests had 4 failures / 90 passes, `bun run typecheck` failed on missing optional fixed filter id types, focused eslint passed, and `git diff --check` passed. Commit: `c765349`.
- Ampere (`implementer`) fixed the review regressions in `src/core/filter-engine.ts`, `src/core/stores/filter-store.ts`, `src/core/plugin-api/context.ts`, `src/plugins/task/plugin.ts`, and `src/plugins/task/components/TaskFilterViews.tsx`. It made Task default filters idempotent, typed optional fixed filter IDs, implemented the current `gt`/`lt` page/metadata comparison subset, hardened relative-date `neq`, and made empty-state copy generic. Parent validation passed: review-fix focused tests 94/94, adjacent view/task/tag tests 69/69, `bun run typecheck`, `bun run lint`, `git diff --check`, and native/package/Tauri diff guard. Commit: `a9b0579`.
- Post-fix focused review completed with Hume (`pr_explorer`), Dewey (`reviewer`), Avicenna (`security_reviewer`), Beauvoir (`deprecation_auditor`), and Archimedes (`test_quality_reviewer`). P0/P1 findings: none. Accepted P2 follow-up: preserve user-created task-owned filters during default upsert, guard direct `executeFilterQuery` against cyclic/over-deep queries, prevent cross-plugin fixed filter id collisions such as foreign-owned `task.filter.*`, remove the hidden assumption that every metadata `sourcePluginId` equals namespace while preserving built-in Task/Tag trust boundaries, and fail closed for malformed metadata `valueType` on `eq`/`neq`/`includes`. `within` remains deferred to formal docs sync as an explicit current-executor subset caveat.
- Ptolemy (`test_writer`) added second review-fix regression tests in `src/test/core-filter-engine.test.ts`, `src/test/plugin-api-contracts.test.ts`, and `src/test/task-filters-view-rendering.test.tsx`. Parent red validation matched the expected signal: focused tests had 10 failures / 100 passes, `bun run typecheck` passed, focused eslint passed, and `git diff --check` passed. Commit: `abbd9ff`; the auto-push initially timed out over SSH, then parent retried `git push` successfully.
- Einstein (`implementer`) fixed the second review regressions in `src/core/filter-engine.ts` and `src/core/plugin-host/plugin-host.ts`. It added direct query traversal guards, operator/value-shape validation, metadata value-shape validation, generic metadata owner handling with built-in Task/Tag owner boundaries, and plugin-facing fixed filter id namespace enforcement. Parent validation passed: second review-fix focused tests 110/110, adjacent view/task/tag tests 69/69, `bun run typecheck`, `bun run lint`, `git diff --check`, and native/package/Tauri diff guard. Commit: `2b61886`.
- Narrow post-second-fix review completed with Pauli (`reviewer`), Halley (`security_reviewer`), Helmholtz (`deprecation_auditor`), and Euclid (`test_quality_reviewer`). P0 findings: none. P1 finding: accessor-backed fixed filter IDs can bypass plugin-facing namespace enforcement and let a non-owner plugin save `task.filter.today`. Accepted P2 finding: non-owner plugins can squat built-in `task` / `tag` metadata identities before the owning plugin writes them. Accepted P3: malformed raw date metadata equality should fail closed if concise to cover. Deferred P3: total node/branch/condition budgets for very wide direct queries.
- Heisenberg (`test_writer`) added third review-fix regression tests in `src/test/plugin-api-contracts.test.ts` and `src/test/core-filter-engine.test.ts`. Parent red validation matched the expected signal: focused tests had 4 failures / 51 passes, `bun run typecheck` passed, focused eslint passed, and `git diff --check` passed. Commit: `0ed12aa`.

## Parent Decisions After TASK-022 Start

- Implement TASK-022 as a generic data-only filter query executor plus Task Plugin-owned default filters, registered `page.list` rendering, and `filter.empty_state` slot.
- Use `viewType: "page.list"` for TASK-022 task filters to preserve TASK-021 Tag Plugin filter compatibility.
- All Tasks query: `metadata.task.enabled eq true`; include done tasks; exclude archived pages through the page listing/query execution surface.
- Today query: task-enabled, not done, and either `metadata.task.scheduled` or `metadata.task.due` equals deterministic current local date. Date metadata uses `valueType: "date"` and `YYYY-MM-DD` strings.
- Defer date picker, `@date` parsing, `task.set_due`, automatic metadata extraction, Overdue/Done filters, JS filters, global saved-filter navigation, Tag filter UI beyond compatibility, native/Tauri/package/Rust changes, and persistence rewiring.

## Next Actions

1. Wait for Bernoulli's third review-fix implementation.
2. Re-run focused and adjacent validation, then commit implementation.
3. Spawn `doc_writer` for TASK-022 formal docs sync after behavior review fixes pass.
4. Run final branch gates before marking TASK-022 complete.

## Current TASK-021 State

- TASK-021 follows TASK-016 and TASK-008 and owns the Tag Plugin baseline:
  - `#tag` text is recognized as tag metadata.
  - Tags render in metadata bar through slot contribution.
  - Tag picker can add/remove tags through commands.
  - Tag filters can query pages by tag.
- Initial parent interpretation:
  - Keep Tag behavior in a built-in Tag Plugin, not Core business logic.
  - Use existing metadata/filter/view/slot/plugin primitives where possible.
  - Preserve Markdown-first behavior: the editor keeps tag text as Markdown text unless agents define a narrow command/indexing slice for TASK-021.
  - Keep rich editor autocomplete, date/page-link semantics, Timer/Calendar/Stats tag aggregation, native/Tauri/package changes, broad persistence/schema changes, and release packaging out of scope unless agents identify an acceptance dependency.
- Agent/config checks passed for orchestration start: 11 agent TOML files parsed; `codex doctor` OK except the known `TERM=dumb` terminal failure plus non-blocking update/sandbox notes.

## Parent Decisions At TASK-021 Start

- Start from `master` after TASK-020 merge commit `c42fa5f`.
- Use branch `feat/task-021-tag-plugin-baseline`.
- Delegate planning/current-doc guidance, deprecation/API review, security review, TDD tests, implementation, review, and docs sync to agents.
- The parent thread must not write TASK-021 tests or production implementation unless a delegated role fails or is explicitly cancelled and the fallback is recorded.

## Source Docs Read By Parent For TASK-021

- `.codex/skills/mirabilis-dev-runner/SKILL.md`.
- `docs/implementation/progress.md`.
- `docs/implementation/task-index.md#task-021-implement-tag-plugin-baseline`.
- `docs/product/05-built-in-plugins.md#15-tag-plugin`.
- `docs/product/04-editor-and-workflows.md#12-markdown-first-编辑器`.
- `docs/architecture/04-slots-editor-task.md` metadata bar / Tag Plugin notes.
- `docs/product/03-plugin-platform.md#94-metadata-field-registry`.
- Related Tag references in `docs/architecture/06-filter-native-database.md`, `docs/development/01-data-roadmap-and-mvp.md`, and `docs/development/02-implementation-roadmap-and-constraints.md`.

## TASK-021 Validation Log

- `.codex/agents/*.toml` parsed successfully with 11 files.
- `codex --strict-config doctor --summary --ascii` reported configuration/auth/MCP/network/WebSocket/reachability OK; non-blocking notes were unrestricted sandbox/network, the known `TERM=dumb` terminal failure, and an available Codex update.
- Focused red tests after Carver the 4th:

```bash
bun run test:frontend -- src/test/tag-plugin-baseline.test.tsx
bun run typecheck
bunx eslint src/test/tag-plugin-baseline.test.tsx --max-warnings=0
git diff --check
git diff --name-only master -- package.json bun.lock src-tauri/Cargo.lock src-tauri/Cargo.toml src-tauri/build.rs src-tauri/capabilities src-tauri/permissions src-tauri/src/commands src-tauri/src/lib.rs src-tauri/src/main.rs src-tauri/tauri.conf.json
```

- Result: expected red signal. `tag-plugin-baseline.test.tsx` ran 8 tests and all 8 failed because Tag Plugin surfaces are not implemented yet. `bun run typecheck`, focused eslint, and `git diff --check` passed. Native/package/Tauri surface diff was empty.
- Initial implementation validation after Wegener the 4th:

```bash
bun run test:frontend -- src/test/tag-plugin-baseline.test.tsx
bun run test:frontend -- src/test/tag-plugin-baseline.test.tsx src/test/markdown-editor-plugin-shell.test.tsx src/test/plugin-host-lifecycle.test.ts src/test/core-filter-store.test.ts
bun run typecheck
bun run lint
git diff --check
git diff --name-only master -- package.json bun.lock src-tauri/Cargo.lock src-tauri/Cargo.toml src-tauri/build.rs src-tauri/capabilities src-tauri/permissions src-tauri/src/commands src-tauri/src/lib.rs src-tauri/src/main.rs src-tauri/tauri.conf.json
```

- Result: all passed or clean. TASK-021 focused test passed with 1 file / 8 tests. Adjacent plugin/filter/editor coverage passed with 4 files / 116 tests. `bun run typecheck`, `bun run lint`, and `git diff --check` passed. Native/package/Tauri surface diff was empty.
- Review-fix red tests after Hypatia the 4th:

```bash
bun run test:frontend -- src/test/tag-plugin-baseline.test.tsx
bun run typecheck
git diff --check
```

- Result: expected red signal. Focused test file ran 12 tests with 4 failed / 8 passed, plus one unhandled rejection. Failures were extra extracted tags `time`, `https`, and `bad`; missing empty `tag.tags` metadata for a no-record remove; no accessible alert/status feedback for invalid add failure; and duplicate label/input association. `bun run typecheck` passed. `git diff --check` passed.
- Review-fix implementation validation after Faraday:

```bash
bun run test:frontend -- src/test/tag-plugin-baseline.test.tsx
bun run typecheck
bun run lint
git diff --check
git diff --name-only master -- package.json bun.lock src-tauri/Cargo.lock src-tauri/Cargo.toml src-tauri/build.rs src-tauri/capabilities src-tauri/permissions src-tauri/src/commands src-tauri/src/lib.rs src-tauri/src/main.rs src-tauri/tauri.conf.json
```

- Result: all passed or clean. TASK-021 focused test passed with 1 file / 12 tests. `bun run typecheck`, `bun run lint`, and `git diff --check` passed. Native/package/Tauri surface diff was empty. Commit: `f39c1e3`.

## Completed TASK-021 Agent Outcomes

- Boole the 4th (`planner`) completed read-only planning. Recommendation: implement a built-in `TagPlugin` only, use a command-driven tag recognition baseline, register a `page.header.metadata` tag slot, use add/remove picker commands, create tag-owned filter definitions, and keep Core/rich editor/indexer/native surfaces out of scope.
- Boyle the 4th (`docs_researcher`) completed current-doc/test guidance. Recommendation: use existing metadata/filter/command/slot/plugin facades, execute commands through `runtime.commands.execute`, test metadata writes as `namespace: "tag"`, `key: "tags"`, `valueType: "json"`, and cover UI with RTL/user-event role queries. It noted metadata field renderer/editor and full Filter Engine execution are future-facing.
- Descartes the 4th (`deprecation_auditor`) completed API/deprecation guidance. P0/P1 guidance: use plugin id `tag`, syntax id `tag.hashtag`, metadata field id `tag.tags`, `namespace: "tag"`, `key: "tags"`, `valueType: "json"`, kebab-case command IDs, explicit refresh semantics, filter query `metadata.tag.tags includes <tag>`, and slot id `tag.page-header-metadata.tags` on `page.header.metadata` with order `300`.
- Rawls the 4th (`security_reviewer`) completed security guidance. Recommendation: define a conservative tag grammar, reject untrusted/extra command payload fields, verify page existence, mutate through plugin facades/transactions, parse structured Markdown text rather than HTML, keep filters static/plugin-owned, render tags as inert React text, and avoid native/Tauri/package/Cargo changes.
- Carver the 4th (`test_writer`) added focused TASK-021 acceptance tests in `src/test/tag-plugin-baseline.test.tsx`. Coverage includes built-in plugin registration, manifest descriptors, commands, metadata writes, refresh extraction/normalization, picker add/remove commands, slot UI behavior, filter definition creation, native surface guard, and no task metadata mutation from source-line tags.
- Wegener the 4th (`implementer`) added the initial TASK-021 production implementation in `src/bootstrap/built-in-plugins.ts` and `src/plugins/tag/*`. It registers the built-in Tag Plugin, descriptors, commands, metadata slot, tag parsing/normalization, metadata writes, and tag-owned filter creation without native/Tauri/package changes.
- Focused review after commit `bde416d` completed:
  - Ramanujan the 4th (`pr_explorer`) found P2: tag slot command rejection handling is missing, and `tag.remove-tag` does not write explicit `tag.tags: []` on a missing-tag remove for a never-tagged page.
  - Carson the 4th (`reviewer`) found P2: `tag.refresh-tags` indexes prefixes of invalid source tokens like `#time:now` and `#https://example.test/tag`; P2: missing-tag remove on a never-tagged page does not persist empty tag metadata; P3: fixed slot input id can duplicate in multi-slot renders.
  - Popper the 4th (`security_reviewer`) found no P0/P1/P2 security findings.
  - Nietzsche the 4th (`test_quality_reviewer`) found no P0/P1 blocking gaps, but P2 missing coverage for invalid source-token forms and P2 branch-coupled native-surface guard.
  - Ptolemy the 4th (`deprecation_auditor`) found no code blockers. It noted docs-only drift in live agent communication status and formal docs still describing Tag Plugin recognition as entirely future after save.
- Hypatia the 4th (`test_writer`) added review-fix regression tests for invalid source-token extraction, explicit empty metadata on missing-tag remove, accessible local slot feedback on add failures, and distinct input label associations across multiple slot instances.
- Faraday (`implementer`) fixed the review-fix regressions in `src/plugins/tag/plugin.ts` and `src/plugins/tag/components/TagMetadataSlot.tsx`. It ignores invalid full source tokens, always persists touched empty tag metadata on remove, catches slot command failures, shows accessible tag feedback, and uses unique input ids. Commit: `f39c1e3`.
- Post-fix focused review after commit `f39c1e3` completed:
  - Kierkegaard (`pr_explorer`) found no P0/P1/P2 findings. P3 residuals: slot-local command state can become stale if a future metadata bar refreshes the same page externally, and the native-surface guard remains git-environment coupled.
  - Dalton (`reviewer`) found no P0/P1/P2/P3 correctness findings and confirmed the TASK-021 command, metadata, filter, slot, and native-surface contracts.
  - Poincare (`security_reviewer`) found no P0/P1/P2 security findings. P3: Unicode case-folding can convert raw non-ASCII characters such as `K` to ASCII before validation, which conflicts with the stated raw ASCII-only input intent.
  - Newton (`test_quality_reviewer`) found no P0/P1 gaps. P2: refresh coverage does not prove stale `tag.tags` records are replaced. P2: native-surface guard is still git-environment coupled.
  - Boole (`deprecation_auditor`) found no P0/P1 findings. P2: `TagMetadataSlot` narrows command results to `{ tags }`, ignores returned `pageId`, and should reject/ignore mismatched page results.
  - Erdos (`docs_researcher`) found P1 docs drift: formal docs still frame tag recognition as future/ambiguous and overstate metadata bar/filter UI behavior. It also identified P2 architecture/testing/progress sync needs and P3 metadata-shape documentation.
- Second review-fix cycle completed:
  - James (`test_writer`) added regressions for stale refresh replacement, slot command-result page matching, and raw non-ASCII tag rejection. Expected red: focused test ran 15 tests with 2 failures for `K` command input and mismatched slot add result; typecheck, focused eslint, `git diff --check`, and native/package guard passed.
  - Godel (`implementer`) fixed raw ASCII validation before lowercasing and strict slot command-result `{ pageId, tags }` validation. Parent validation passed: focused test 15/15, `bun run typecheck`, `bun run lint`, `git diff --check`, and native/package guard. Commit: `184e669`.
- Copernicus (`doc_writer`) synced formal TASK-021 docs in product, architecture, development, task-index, and testing docs. It documented the command-driven Tag Plugin baseline, `tag.hashtag`, `tag.tags`, `tag.refresh-tags`, add/remove commands, `TagMetadataSlot`, `tag.create-filter`, ASCII slug normalization, current non-features, and no native/Tauri/package surface changes. Commit: `cee4d4a`.
- Final TASK-021 branch validation passed:
  - `bun run check:quick` passed with 25 frontend test files / 366 tests plus Rust fmt, Rust clippy, and full Rust tests.
  - `bun run build` passed.

## Parent Decisions After TASK-021 Pre-test Guidance

- Implement only a built-in `TagPlugin`; Core remains generic infrastructure.
- Canonical ids: plugin `tag`, markdown syntax `tag.hashtag`, metadata field `tag.tags`, slot contribution `tag.page-header-metadata.tags`.
- Metadata contract: `namespace: "tag"`, `key: "tags"`, `valueType: "json"`, `value: string[]` of normalized tags without `#`.
- Commands:
  - `tag.refresh-tags({ pageId }) -> { pageId, tags }`.
  - `tag.add-tag({ pageId, tag }) -> { pageId, tags }`.
  - `tag.remove-tag({ pageId, tag }) -> { pageId, tags }`.
  - `tag.create-filter({ tag }) -> { filterId }`.
- Defer `tag.toggle-tag`; add/remove satisfy the picker acceptance criteria with a smaller command surface.
- Recognition is command-driven through `tag.refresh-tags`; no save-time scanner, global indexer, or rich editor tokenization in TASK-021.
- Tag grammar is conservative ASCII slug tags: trim, strip one leading `#`, lowercase, leading alphanumeric, then letters/digits/`_`/`-`, max length 32, max 32 unique tags per page, dedupe by first-seen order, reject blank/whitespace/control/HTML-like/URL-like/colon/non-ASCII values.
- Filter contract: `tag.create-filter` saves a plugin-owned filter named `#tag` with query `{ where: [{ field: "metadata.tag.tags", op: "includes", value: tag }] }` and `viewType: "page.list"`; result execution/rendering remains out of scope.
- UI contract: register a `page.header.metadata` slot component that renders inert tag chips/text and a small labeled add/remove picker. Tests may render the slot component directly or through a minimal test host because no full metadata-bar outlet exists yet.
- Security boundaries: strict payload readers, no trusted caller-supplied owner fields, page existence checks, plugin-facade metadata/filter writes, no `attrs.boundPageId` trust or Task Plugin metadata mutation, and no native/Tauri/package/Cargo surface.

## Next Actions

1. Commit `progress.md` and communication completion updates.
2. Merge TASK-021 back to `master`.
3. Verify merge-result local gate.

## Completed TASK-020 Agent Outcomes

- Ohm the 3rd (`planner`) completed read-only planning. Recommendation: keep TASK-020 to a Task Plugin command plus metadata/event/source-block update and narrow Markdown editor checkbox UI. Use canonical command `task.toggle-status`, payload `{ sourcePageId, sourceBlockId }`, result `{ pageId, status }`, status vocabulary `todo | done`, and same-transaction source Markdown/metadata/event mutation.
- Turing the 3rd (`docs_researcher`) completed current docs and test guidance. Recommendation: use React/Testing Library checkbox semantics with a real `<input type="checkbox">`, query by role/checked state, keep payload source-only, test `task.completed` and `task.reopened`, support reading `[x]` and `[X]` while writing normalized `[x]`, and fix docs drift later for `task.toggle_status` / `task.toggle_checkbox`.
- Poincare the 4th (`deprecation_auditor`) completed API/deprecation guidance. P0 guidance: select `task.toggle-status` before tests, do not register snake_case or checkbox aliases, use source identity input, and store events as `namespace: "task", type: "completed" | "reopened"` rather than `type: "task.completed"`.
- Arendt the 4th (`security_reviewer`) completed security guidance. No P0/P1 blockers. Required boundaries: do not trust caller-supplied task page IDs, statuses, event types, titles, timestamps, or `attrs.boundPageId`; verify current source block at command time; keep Plugin Host metadata/event ownership injection; stale UI results must be guarded; unsafe titles remain inert; no native/package/Tauri surface changes.
- Turing the 4th (`test_writer`) added focused TASK-020 acceptance tests in `src/test/task-checkbox-toggle-events.test.tsx`. Commit: `c9c0c33`.
- Ampere the 4th (`implementer`) added initial TASK-020 production implementation in `src/plugins/task/plugin.ts` and `src/plugins/markdown-editor/components/MarkdownPageEditor.tsx`. Focused checks passed locally, but the parent has not committed the implementation because focused review found P1/P2 follow-up issues.
- Avicenna the 4th (`reviewer`) found P1: successful checkbox toggles update editor Markdown but not the structured body snapshot, so task controls disappear immediately after toggle. P2: completed task lines lose title-open behavior because UI hides open buttons for done tasks and `task.open-task-page` still accepts only unchecked syntax.
- Laplace the 4th (`test_quality_reviewer`) found P1 test gaps matching the vanished-controls issue and missing loaded `pageId/pageFacade` checkbox coverage; P2 gaps for valid-shaped invalid source cases. Laplace noted the native-surface guard is brittle but useful as a temporary task-scope guard.
- Noether the 4th (`test_writer`) added review-fix regressions in `src/test/task-checkbox-toggle-events.test.tsx`. Commit: `0b7874b`.
- Hooke the 4th (`implementer`) fixed the review-fix regressions in `src/plugins/task/plugin.ts` and `src/plugins/markdown-editor/components/MarkdownPageEditor.tsx`.
- Focused review completed:
  - Gauss the 4th (`pr_explorer`) mapped the changed surface and confirmed no native/package/Tauri surface changes. Hotspots: initially checked unresolved task open behavior, rapid repeated checkbox toggles, UI duplicate task title text, client-side Markdown reconstruction, and stale status docs.
  - Sagan the 4th (`reviewer`) found two P2 correctness findings: task title click semantics are split across duplicated visible title text, and rapid repeated checkbox toggles can desync UI from committed state while async commands are in flight.
  - Franklin the 4th (`test_quality_reviewer`) found no P0/P1/P2 test-quality findings. P3: the native-surface guard shells out to `git diff master`.
  - Archimedes the 4th (`security_reviewer`) found no P0/P1/P2 security findings. P3: existing `task.resolve-task-block` / `task.open-task-page` input readers still allow extra fields, but they are ignored and not trusted.
  - Planck the 4th (`deprecation_auditor`) found P1 docs drift for stale command aliases/payloads, P2 checked-task open behavior under-specification, and P2 broader docs still saying checkbox toggle/events are unimplemented.
- Newton the 4th (`test_writer`) added second review-fix regressions for task title/open affordance separation, pending toggle suppression, unresolved checked-task open, and `task.resolve-task-block` remaining unchecked-only. Commit: `2134c16`.
- Euler the 4th (`implementer`) completed the second review-fix implementation in `src/plugins/markdown-editor/components/MarkdownPageEditor.tsx` and `src/plugins/task/plugin.ts`. It keeps the visible task title as the open button, labels the checkbox through that button without duplicating title text, suppresses repeated checkbox dispatch while a source block toggle is pending, and lets `task.open-task-page` create/bind/open unresolved checked task lines as done task pages without completion/reopen events.
- Second focused review after commit `0b54251` completed:
  - Linnaeus the 4th (`pr_explorer`) mapped the changed surface and found no native/package/Tauri surface changes. Linnaeus raised P2 integration risk: loaded/native `pageId/pageFacade + runtime.commands` flow is not covered by a real runtime command test because current loaded checkbox coverage uses a mocked command facade.
  - Socrates the 4th (`reviewer`) found no P0/P1/P2 correctness findings. Residual risk: formal docs still contain pre-TASK-020 wording.
  - Averroes the 4th (`test_quality_reviewer`) found no P0/P1/P2 test-quality gaps in current focused coverage.
  - Beauvoir the 4th (`security_reviewer`) found no P0/P1/P2 security issues. It confirmed source-only UI payloads, strict toggle trusted-field rejection, verified source/metadata task resolution, plugin-scoped event writes, inert unsafe titles, and clean native/package/Tauri surface.
  - Mencius the 4th (`deprecation_auditor`) found no P0/P1 code blockers. It raised P1 docs-only drift for stale command names and the `{ pageId }` payload example, plus P2 docs-only drift where product/architecture/testing docs still describe checkbox/events as unimplemented.
- Zeno the 4th (`test_writer`) added a real loaded-runtime regression in `src/test/task-checkbox-toggle-events.test.tsx`. It covers a loaded `pageId/pageFacade` editor path using real `runtime.commands.execute("task.toggle-status", { sourcePageId, sourceBlockId })`, source Markdown/body update, done metadata, `task.completed` event payload, and the checked checkbox remaining visible. The regression is green on current implementation.
- Peirce the 4th (`doc_writer`) synced formal TASK-020 docs in product, architecture, development, and testing docs. It replaced stale `task.toggle_status` / `task.toggle_checkbox` names, corrected the toggle payload/result contract, documented checkbox complete/reopen metadata and events, documented unresolved checked open behavior, and removed outdated wording that checkbox/events were unimplemented.

## Current TASK-020 State

- TASK-020 follows TASK-018/TASK-019 and owns the next Task Plugin behavior slice:
  - Clicking a task checkbox toggles task status.
  - Status changes update task metadata.
  - Completion writes a `task.completed` event.
  - Reopening or unchecking behavior must be defined and tested.
- Initial parent interpretation:
  - Keep all user actions behind the Command Registry.
  - Prefer a Task Plugin-owned toggle command that resolves source identity before mutating task metadata or source Markdown.
  - Preserve Core boundaries: Core owns command/event/metadata primitives, not task business behavior.
  - Keep filters/views, Tag Plugin parsing, Timer/Calendar behavior, metadata UI, rich editor migration, automatic save-time indexing, new Tauri commands/capabilities, filesystem/native behavior, package/Cargo changes, and release packaging out of scope unless agents identify a TASK-020 acceptance dependency.
- Known documentation/API risk to resolve before tests:
  - Local docs currently mention `task.toggle_status`, `task.toggle-status`, and `task.toggle_checkbox`. TASK-020 agents should select and test the final command contract, with current code style favoring kebab-case command IDs such as `task.resolve-task-block` and `task.open-task-page`.
- Agent/config checks passed for orchestration start: 11 agent TOML files parsed; `codex doctor` OK except the known `TERM=dumb` terminal failure plus the non-blocking update/sandbox notes.

## Parent Decisions At Start

- Start from `master` after TASK-019 merge commit `7a2ce72`.
- Use branch `feat/task-020-checkbox-toggle-task-events`.
- Delegate planning/current-doc guidance, deprecation/API review, security review, TDD tests, implementation, review, and docs sync to agents.
- The parent thread must not write TASK-020 tests or production implementation unless a delegated role fails or is explicitly cancelled and the fallback is recorded.

## Parent Decisions After Pre-test Guidance

- TASK-020 canonical command ID is `task.toggle-status`; docs using `task.toggle_status` or `task.toggle_checkbox` are stale and should be fixed during docs sync, not supported with aliases in code.
- Command input is exactly source identity: `{ sourcePageId, sourceBlockId }`. UI and callers must not provide trusted `pageId`, `boundPageId`, `status`, title, event type, or timestamps.
- Command result should be `{ pageId, status }`, where `status` is `todo` or `done`.
- Toggle behavior:
  - `- [ ] A` completes the task, rewrites the source marker to `- [x] A`, sets `task.status = "done"`, and appends `namespace: "task", type: "completed"`.
  - `- [x] A` or `- [X] A` reopens the task, rewrites the source marker to `- [ ] A`, sets `task.status = "todo"`, and appends `namespace: "task", type: "reopened"`.
  - Event payloads should use camelCase fields such as `taskPageId`, `sourcePageId`, `sourceBlockId`, `previousStatus`, and `status`; use event `createdAt` as the completion/reopen time unless a product task later introduces a dedicated completed-at metadata field.
- Source Markdown marker, task metadata, and event append must commit or roll back together through plugin transaction APIs.
- UI tests should use a real accessible checkbox, send only `{ sourcePageId, sourceBlockId }`, preserve title-button navigation behavior from TASK-019, and cover stale delayed toggle results after page switch or same-page unsaved edit.

## Parent Decisions After Focused Review

- Add TDD review-fix tests before changing implementation.
- Resolve duplicated title semantics by making the visible task title the open affordance. The checkbox remains a real accessible checkbox, but its visible label must not duplicate the task title or make clicking title text toggle status.
- Prevent rapid repeated toggle desync by disabling or otherwise ignoring checkbox toggles while a toggle for that source block is pending.
- Make `task.open-task-page` handle an unresolved checked source line by creating/binding/opening a task page with `task.status = "done"` and no `task.completed` / `task.reopened` event. Keep `task.resolve-task-block` unchanged as unchecked-only.
- Defer docs drift fixes to docs sync after behavior fixes pass focused review.

## Parent Decisions After Second Focused Review

- Accept Linnaeus the 4th's P2 integration risk as actionable before docs sync.
- Delegate a test writer to add a focused regression for the real loaded editor `pageId/pageFacade + runtime.commands.execute("task.toggle-status")` path, without mocking the task command result.
- If the new regression is red, delegate the fix to an implementer. If it is green, commit the test as coverage and proceed to docs sync.
- Accept Mencius the 4th's docs findings as docs-only blockers for completion, to be handled by a doc writer after the integration coverage decision.

## Source Docs Read By Parent

- `.codex/skills/mirabilis-dev-runner/SKILL.md`.
- `docs/implementation/progress.md`.
- `docs/implementation/task-index.md#task-020-implement-checkbox-toggle-and-task-events`.
- `docs/product/05-built-in-plugins.md#163-点击逻辑`.
- `docs/development/02-implementation-roadmap-and-constraints.md#204-所有跨插件协作走-event--metadata--query`.
- `docs/development/02-implementation-roadmap-and-constraints.md` Phase 3 boundary notes.
- `docs/architecture/07-runtime-flows.md#181-用户输入任务`.
- `docs/architecture/04-slots-editor-task.md#9-task-plugin-代码架构`.
- Related command/event examples in `docs/product/02-core-data-model.md` and `docs/product/03-plugin-platform.md`.

## Validation Log

- `.codex/agents/*.toml` parsed successfully with 11 files.
- `codex --strict-config doctor --summary --ascii` reported configuration/auth/MCP/network/WebSocket/reachability OK; non-blocking notes were unrestricted sandbox/network, the known `TERM=dumb` terminal failure, and an available Codex update.
- External docs verified by agents: React 19 events and controlled checkbox input docs, Testing Library/user-event v14 intro/click/ByRole checked/async docs, Vitest async and mock docs, Tauri v2 API/migration/permissions docs, Vite 7 guidance, and React 19 act/test-utils deprecation guidance.
- Focused red tests after Turing the 4th:

```bash
bun run test:frontend -- src/test/task-checkbox-toggle-events.test.tsx
bun run typecheck
git diff --cached --check
```

- Result: expected red signal. `task-checkbox-toggle-events.test.tsx` ran 11 tests with 8 failed / 3 passed. Failures were the expected missing `task.toggle-status` command (`COMMAND_NOT_FOUND`) and missing accessible checkbox UI (`Unable to find role="checkbox"`). `bun run typecheck` passed. `git diff --cached --check` passed before the test commit.
- Second review-fix implementation validation after Euler the 4th:

```bash
bun run test:frontend -- src/test/task-checkbox-toggle-events.test.tsx src/test/task-navigation-infinite-nesting.test.tsx src/test/task-plugin-syntax-page-creation.test.ts
bun run test:frontend -- src/test/task-checkbox-toggle-events.test.tsx src/test/task-navigation-infinite-nesting.test.tsx src/test/task-plugin-syntax-page-creation.test.ts src/test/markdown-editor-plugin-shell.test.tsx src/test/markdown-page-persistence.test.tsx src/test/plugin-host-lifecycle.test.ts
bun run typecheck
bun run lint
git diff --check
git diff --name-only master -- package.json bun.lock src-tauri/Cargo.lock src-tauri/Cargo.toml src-tauri/build.rs src-tauri/capabilities src-tauri/permissions src-tauri/src/commands src-tauri/src/lib.rs src-tauri/src/main.rs src-tauri/tauri.conf.json
```

- Result: all passed or clean. Focused TASK-018/019/020 tests passed with 3 files / 47 tests. Expanded frontend coverage passed with 6 files / 113 tests. `bun run typecheck`, `bun run lint`, and `git diff --check` passed. Native/package/Tauri surface diff was empty.
- Real loaded-runtime regression validation after Zeno the 4th:

```bash
bun run test:frontend -- src/test/task-checkbox-toggle-events.test.tsx
bun run test:frontend -- src/test/task-checkbox-toggle-events.test.tsx src/test/task-navigation-infinite-nesting.test.tsx src/test/task-plugin-syntax-page-creation.test.ts
bun run typecheck
git diff --check
```

- Result: all passed or clean. TASK-020 test file passed with 20 tests. Focused TASK-018/019/020 tests passed with 3 files / 48 tests. `bun run typecheck` and `git diff --check` passed.
- Formal docs sync validation after Peirce the 4th:

```bash
rg -n "task\\.toggle_status|task\\.toggle_checkbox|toggle-task-checkbox|toggle_status|toggle_checkbox" docs/product docs/architecture docs/development docs/testing
rg -n "task\\.toggle-status\\(\\{ pageId \\}\\)|task\\.toggle-status.*pageId|toggle-status.*\\{ pageId" docs/product docs/architecture docs/development docs/testing
rg -n "checkbox toggle/events|checkbox events|task completed/reopened events|点击 checkbox.*尚未实现|checkbox.*尚未实现|- \\[x\\].*尚未实现|task events.*尚未实现" docs/product docs/architecture docs/development docs/testing
rg -n "task\\.completed|task\\.reopened" docs/product docs/architecture docs/development docs/testing
git diff --check
```

- Result: stale command name, unimplemented checkbox/event wording, and dotted event scans were clean. The broad payload scan only matched valid `{ pageId }` return/open-command contexts, not stale `task.toggle-status({ pageId })` examples. `git diff --check` passed.
- Final TASK-020 local gate:

```bash
bun run check:quick
bun run build
```

- Result: both passed. `check:quick` passed with 24 frontend test files / 351 tests, Rust fmt, Rust clippy, and full Rust tests. `bun run build` passed.

## Next Actions

1. Commit TASK-021 pre-test guidance.
2. Delegate failing acceptance tests to `test_writer`.
3. Run expected-red focused tests before implementation.
