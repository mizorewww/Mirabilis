# TASK-027 Agent Communication - Habit and Heatmap Plugins

## Task

- ID: TASK-027.
- Name: Implement Habit and Heatmap plugins.
- Branch: `feat/task-027-habit-heatmap-plugins`.
- Started: 2026-05-25 09:41 CST.
- Parent role: orchestration only. Parent delegates planning, docs research, test writing, implementation, review, and docs sync to specialized agents.

## Source Docs Read By Parent

- `docs/implementation/task-index.md#task-027-implement-habit-and-heatmap-plugins`.
- `docs/product/05-built-in-plugins.md#17-habit-plugin`.
- `docs/architecture/05-plugin-implementations.md#12-habit--heatmap-插件架构`.
- `docs/development/01-data-roadmap-and-mvp.md#phase-7habit-plugin--heatmap-view-plugin`.
- `docs/development/02-implementation-roadmap-and-constraints.md#phase-7habit--heatmap-plugins`.
- Related Habit/Heatmap references in product, architecture, development, and testing docs.

## Initial Parent Interpretation

- Implement a built-in Habit Plugin baseline that recognizes habit pages through `#habit` syntax or habit-owned metadata.
- Habit completion should write Habit-owned events.
- Habits and Today Habits filters should work through existing filter/view primitives where possible.
- Implement a separate Heatmap Plugin baseline that renders habit completion events or normalized date-series data.
- Heatmap rendering belongs in a plugin-owned view, not Core.
- Keep Core free of habit/heatmap business behavior.
- Keep native/Tauri/package/Rust/schema changes, persistence rewiring, broad app-shell navigation, Stats/ML aggregation, Calendar scheduled feeds, external sync, and release packaging out of scope unless agents identify an acceptance-critical dependency.

## Validation At Start

- `.codex/agents/*.toml` parsed successfully with 11 files.
- `codex --strict-config doctor --summary --ascii` reported configuration/auth/MCP/network/WebSocket/reachability OK; non-blocking notes were unrestricted sandbox/network and the known `TERM=dumb` terminal failure.

## Parent Decisions

- Start from `master` commit `b898ca3`, after TASK-026 merge validation.
- Use branch `feat/task-027-habit-heatmap-plugins`.
- Delegate pre-test planning/current-doc guidance, deprecation/API review, and security review before writing tests because TASK-027 touches React/Vitest plugin views, filter/view/command/event boundaries, habit metadata/events, and plugin isolation.
- Parent thread will not write TASK-027 tests, production implementation, review findings, or formal docs sync unless a delegated agent fails or is explicitly cancelled and the fallback reason is recorded.

## Current Next Action

- Pre-test guidance started 2026-05-25 09:44 CST.
- Einstein (`planner`) is defining the smallest safe TASK-027 scope, canonical ids, acceptance criteria, risks, and TDD handoff.
- Laplace (`docs_researcher`) is checking current React/Vitest/Testing Library guidance for Habit filters and Heatmap/date-series view tests.
- Kierkegaard (`deprecation_auditor`) is auditing canonical Habit/Heatmap identifiers, stale docs/API risks, and deprecated framework patterns.
- Singer (`security_reviewer`) is reviewing Habit command/event/metadata trust boundaries, Heatmap input validation, inert rendering, and native/package/Tauri/Rust/schema guardrails.

## Current Next Action

- Wait for pre-test guidance agents, then record parent decisions and delegate failing acceptance tests to `test_writer`.

## Pre-Test Guidance Outcomes

- Einstein (`planner`) completed read-only planning. Recommendation: implement the smallest safe slice as a built-in `habit` plugin plus a separate generic `heatmap` plugin. Habit owns metadata, commands, filters, and events; Heatmap owns a generic date-series view. Existing Task checkbox auto-bridge, Habit Review, `habit.card` polish, `habit.heatmap` alias, skipped/weekly/monthly recurrence, full streak algorithm, save-time automatic indexing, source task propagation, Calendar/Stats/ML feeds, app-shell routes, native/Tauri/Rust/schema/package changes, and release packaging remain deferred.
- Laplace (`docs_researcher`) completed read-only current-doc/test guidance. Recommendation: use RTL `screen`/`within`, semantic `list` / `listitem` / `button` / `checkbox` / `region` queries, `userEvent.setup()`, deterministic date props or fake timers with `advanceTimers`, and avoid heatmap color/CSS/snapshot assertions. It recommended focused TASK-027 tests, static native/plugin-boundary guards, and later docs sync for stale snake_case and ambiguous checkbox wording.
- Kierkegaard (`deprecation_auditor`) completed read-only API audit. Recommendation: use kebab-case commands, camelCase metadata keys, split event storage as `namespace: "habit"` with `type: "checked" | "unchecked"`, `heatmap.calendar` as the generic Heatmap view, and namespaced `heatmap.date-series` data kind. It flagged `habit.check_today`, `habit.uncheck_today`, `habit.set_frequency`, `habit.last_checked_at`, `type: "habit.checked"`, `habit.heatmap`, and bare `date-series` as stale or avoidable.
- Singer (`security_reviewer`) completed read-only security guidance. P0/P1 constraints: no native/package/Rust/Tauri/schema changes; no Core habit/heatmap business behavior; plugins must use PluginContext facades only; command/DTO validators should reject extra/accessor/symbol/prototype/non-enumerable shapes; Habit completion must verify target pages and trusted Habit-owned metadata or `#habit` recognition; forged metadata/events must not make pages filterable or heatmap-visible; Heatmap must render inert generic data and must not import Habit internals or read Habit events directly.

## Parent Decisions After Guidance

- TASK-027 current scope is a Habit Plugin baseline plus a generic Heatmap Plugin baseline, not Task checkbox integration or a cross-plugin event query API.
- Plugin ids are `habit` and `heatmap`.
- Canonical commands:
  - `habit.refresh-habit({ pageId })`
  - `habit.check-today({ pageId })`
  - `habit.uncheck-today({ pageId })`
  - `habit.set-frequency({ pageId, frequency: "daily" })`
- Do not register snake_case command aliases such as `habit.check_today`, `habit.uncheck_today`, or `habit.set_frequency`.
- Habit metadata fields:
  - `habit.enabled`, `valueType: "boolean"`
  - `habit.frequency`, `valueType: "string"`, baseline value `daily`
  - `habit.lastCheckedAt`, `valueType: "date"`
  - `habit.nextDue`, `valueType: "date"`
- `habit.target`, `habit.streak`, `habit.last_checked_at`, skipped behavior, weekly/monthly recurrence, and full streak logic are deferred.
- Habit event records use `namespace: "habit"` and `type: "checked" | "unchecked"` with payload `{ habitPageId, date }`. Do not store dotted event types such as `type: "habit.checked"`.
- `habit.check-today` is the TASK-027 completion path. It verifies page existence and trusted Habit status, appends at most one `checked` event per habit/date, sets `lastCheckedAt` to today's local `YYYY-MM-DD`, and advances `nextDue` to tomorrow for daily habits.
- `habit.uncheck-today` appends `unchecked`, removes today's completion state, and sets `nextDue` back to today.
- Existing Task checkbox auto-bridge is deferred because current PluginContext has no command middleware, event subscription, or cross-plugin event read facade. Habit logic must not be added to Core, Task Plugin, Markdown Editor, or App Shell for this slice.
- Habit filters:
  - `habit.filter.habits`, name `Habits`, `viewType: "page.list"`, query `metadata.habit.enabled eq true`.
  - `habit.filter.today-habits`, name `Today Habits`, `viewType: "page.list"`, query enabled + daily + (`metadata.habit.nextDue eq today` OR `metadata.habit.nextDue lt today`). The current filter engine has `eq`, `neq`, `gt`, `lt`, `includes`, `exists`, and `within`, but no `lte`.
- Heatmap registers generic view `heatmap.calendar` with `type: "heatmap"` and `accepts: { kind: "heatmap.date-series" }`.
- Heatmap consumes normalized DTOs, not Habit-owned events directly. A test harness or future view host may normalize public Habit `checked` events into `heatmap.date-series`; Heatmap itself must not import Habit internals or call a plugin-facing event facade to read another plugin's events.

## Test Writer Handoff

- Next agent: `test_writer`.
- Required red tests:
  - Built-ins include `habit` and `heatmap`.
  - Habit manifest declares `#habit` syntax and metadata fields `habit.enabled`, `habit.frequency`, `habit.lastCheckedAt`, and `habit.nextDue`.
  - Habit runtime registers canonical commands and default filters; snake_case commands and `habit.heatmap` alias are absent.
  - `habit.refresh-habit` recognizes valid `#habit` syntax in page title/body, writes Habit-owned metadata, and ignores fenced/escaped/HTML-like false positives.
  - `habit.check-today` / `habit.uncheck-today` use exact payloads, verify trusted Habit pages, write Habit-owned metadata/events, are deterministic under fake timers, and do not mutate Task/Tag metadata or source Markdown.
  - Duplicate same-day `habit.check-today` is idempotent and does not double-write `checked` events.
  - Habits and Today Habits filters execute through the current filter engine with owner-reservation trust boundaries, excluding forged metadata and archived pages.
  - Heatmap view `heatmap.calendar` renders valid `heatmap.date-series` data, rejects malformed/wrong-owner/non-enumerable/prototype/accessor/symbol DTO rows, sorts deterministic date cells, renders inert text only, and has an empty state.
  - Integration-style test normalizes public Habit `checked` events in the test harness before rendering Heatmap; Heatmap must not read Habit events itself.
  - Static boundary/native guard: no Core habit/heatmap business terms, no raw runtime/store/registry/PluginHost/NativeBridge/Tauri imports, no Habit internals imported by generic Heatmap view, no HTML/Markdown sinks, and no package/native/Tauri/Rust/schema diffs.

## Test Writer Outcome

- Copernicus (`test_writer`) completed TASK-027 failing tests in `src/test/habit-heatmap-plugins.test.tsx`.
- Scope covered:
  - Built-in `habit` and `heatmap` registration, manifests, canonical commands, stale alias absence.
  - Habit `#habit` refresh, trusted-page behavior, strict payload validation, deterministic daily check/uncheck metadata/events, idempotency, and no Task/Tag/source Markdown mutation.
  - Habits and Today Habits filters through `executeFilterQuery` with Habit owner reservation trust boundaries.
  - Generic `heatmap.calendar` rendering from normalized `heatmap.date-series` DTOs, invalid row rejection, inert rendering, and empty state.
  - Integration harness normalization of public Habit `checked` events into Heatmap date-series data.
  - Static guards for Core business leakage, plugin isolation, no Habit internals in Heatmap, no HTML/Markdown sinks, and no native/package/schema diffs.
- Parent red validation passed:
  - `bun run test:frontend -- src/test/habit-heatmap-plugins.test.tsx` failed as expected with 13 failed / 1 passed because the production Habit and Heatmap plugin surfaces do not exist yet.
- Parent static validation passed:
  - `bun run typecheck`.
  - `./node_modules/.bin/eslint src/test/habit-heatmap-plugins.test.tsx --max-warnings=0`.
  - `.skip/.only` scan.
  - `git diff --check`.
  - Native/package/Tauri/Rust/schema diff guard.
- Test commit: `8fe0812 Copernicus(test)(Implement Habit and Heatmap plugins): add habit heatmap acceptance tests`; post-commit auto-push succeeded.

## Current Next Action

- Halley (`implementer`) completed minimum production code and parent committed it as `b44bf7a Halley(implementation)(Implement Habit and Heatmap plugins): implement habit and heatmap plugin baselines`.
- Files changed by implementation:
  - `src/bootstrap/built-in-plugins.ts`
  - `src/plugins/habit/index.ts`
  - `src/plugins/habit/plugin.ts`
  - `src/plugins/heatmap/index.ts`
  - `src/plugins/heatmap/plugin.ts`
- Parent validation after implementation:
  - `bun run test:frontend -- src/test/habit-heatmap-plugins.test.tsx` passed with 14 tests.
  - `bun run test:frontend -- src/test/habit-heatmap-plugins.test.tsx src/test/plugin-host-lifecycle.test.ts src/test/plugin-api-contracts.test.ts src/test/core-architecture-boundary.test.ts src/test/task-filters-view-rendering.test.tsx src/test/tag-plugin-baseline.test.tsx` passed with 6 files / 116 tests.
  - `bun run typecheck` passed.
  - `bun run lint` passed.
  - `git diff --check` passed.
  - Native/package/Tauri/Rust/schema diff guard was empty.
- Review wave started at 2026-05-25 10:19 CST:
  - Bernoulli (`pr_explorer`) for changed-path mapping.
  - Hooke (`reviewer`) for correctness review.
  - Heisenberg (`deprecation_auditor`) for API/deprecation audit.
  - Feynman (`security_reviewer`) for trust-boundary review.
  - Beauvoir (`docs_researcher`) for current-doc guidance.
  - Fermat (`test_quality_reviewer`) for test-quality review.
- `doc_writer` spawn is pending because the agent thread limit was reached; parent will retry after one active review agent closes.
- Parent next action: wait for review findings, retry doc sync, and address P0/P1 findings before the final local gate.

## Review Wave Outcomes

- Bernoulli (`pr_explorer`) completed changed-path mapping. It confirmed the branch was clean at `974ad6a` and highlighted same-day Habit event chronology, owner-reserved filter execution, local-date boundaries, custom `#habit` parsing, Heatmap row validation, and intentionally deferred scope as reviewer risk surfaces.
- Hooke (`reviewer`) found one P1 correctness issue: `habit.check-today` suppresses a new `checked` event if any historical same-day checked event exists. After `check-today -> uncheck-today -> check-today`, metadata is checked again but the append-only event stream ends at `unchecked`, so Heatmap/date-series normalizers can miss the active completion.
- Fermat (`test_quality_reviewer`) confirmed the same issue as a P1 test gap and recommended adding same-day re-check coverage. Non-blocking test follow-ups: malformed payload coverage for `habit.refresh-habit` and awareness that static diff guards depend on local `master`.
- Heisenberg (`deprecation_auditor`) confirmed the same P1 and found no deprecated API blockers. It also flagged stale formal docs: stale `habit.last_checked_at`, snake_case commands, dotted `habit.checked`, `habit.heatmap`, and bare `date-series`.
- Feynman (`security_reviewer`) found no P0/P1 security or isolation issues. Residual low-risk notes: Heatmap has no row-count cap and Habit-owned metadata can preserve trust after `#habit` removal.
- Beauvoir (`docs_researcher`) found no current official-doc P0/P1 changes needed. It verified current React `createElement`, Testing Library queries, Vitest fake-date APIs, W3C ARIA region guidance, and Tauri v2 capabilities guidance. It listed stale local docs for `doc_writer`.

## Parent Decisions After Review

- Treat the same-day `check -> uncheck -> check` chronology as P1 and fix before the final local gate.
- Add a focused failing regression test first through `test_writer`.
- Then delegate the production fix to `implementer`; the expected behavior is that same-day re-check after uncheck appends a trailing `checked` event so append-only event consumers and Heatmap normalizers see the active completion.
- Retry `doc_writer` now that review agents have closed; docs sync should cover canonical command ids, metadata keys, event namespace/type split, Heatmap ownership of `heatmap.calendar`, `heatmap.date-series`, and deferred scope.

## P1 Regression And Docs Handoff

- Darwin (`test_writer`) started at 2026-05-25 10:24 CST. Scope: edit tests only, add a failing same-day `check -> uncheck -> check` regression showing the event stream needs a trailing `checked` after re-check.
- Ramanujan (`doc_writer`) started at 2026-05-25 10:24 CST. Scope: edit formal docs only, sync stale Habit/Heatmap identifiers and deferred scope notes.
