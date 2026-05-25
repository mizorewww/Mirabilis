# TASK-031 Agent Communication - AI Plugin Provider Abstraction

## Task

- ID: TASK-031.
- Name: Implement AI Plugin provider abstraction.
- Branch: `feat/task-031-ai-plugin-provider-abstraction`.
- Started: 2026-05-25 14:28 CST.
- Parent role: orchestration only. Parent delegates planning, docs research, test writing, implementation, review, and docs sync to specialized agents.

## Source Docs Read By Parent

- `docs/implementation/task-index.md#task-031-implement-ai-plugin-provider-abstraction`.
- `docs/product/05-built-in-plugins.md#22-ai-plugin`.
- `docs/development/02-implementation-roadmap-and-constraints.md#phase-10ai-plugin`.
- `docs/architecture/05-plugin-implementations.md#14-ai-plugin-架构`.
- `docs/implementation/agent-workflow.md`.
- `docs/implementation/autonomous-development.md`.
- `docs/testing/strategy.md`.

## Official Docs Verified By Parent

- OpenAI latest model guide: `https://developers.openai.com/api/docs/guides/latest-model.md`.
- OpenAI Responses migration guide: `https://developers.openai.com/api/docs/guides/migrate-to-responses`.
- OpenAI Structured Outputs guide: `https://developers.openai.com/api/docs/guides/structured-outputs`.
- Parent summary:
  - Current latest-model guidance names `gpt-5.5`.
  - OpenAI recommends the Responses API for new projects.
  - Responses supports top-level `instructions` and `input`, `store: false` for non-stateful flows, `output_text` in the SDK examples, and `text.format` for Structured Outputs.
  - Structured Outputs should be preferred over plain JSON mode when schema adherence matters.

## Initial Parent Interpretation

- Implement a built-in AI Plugin provider abstraction while keeping provider details out of Core.
- The smallest likely slice is a TypeScript plugin-level provider interface, an OpenAI provider implementation behind that interface, mocked provider/API tests, and command handlers that shape prompts/inputs for the documented AI commands.
- Do not make real OpenAI API calls in tests.
- Do not commit, log, render, or fixture real secrets.
- Prefer no package/native/Tauri/Rust/schema/capability changes unless agents prove they are necessary for the acceptance criteria.
- Treat plugin settings as a risk to clarify: current docs and code show `settingsPanels` as manifest descriptors, and `PluginContext` does not currently expose a runtime plugin settings facade.
- Keep Core free of AI/provider/model/prompt business behavior.

## Validation At Start

- `.codex/agents/*.toml` parsed successfully with 11 files.
- `codex --strict-config doctor --summary --ascii` reported configuration/auth/MCP/reachability OK with known non-blocking notes: unrestricted sandbox/network, `TERM=dumb`, and a Responses WebSocket timeout while HTTPS reachability remained OK.

## Parent Decisions

- Start from `master` commit `01d5c2f`, after TASK-030 merge validation.
- Use branch `feat/task-031-ai-plugin-provider-abstraction`.
- Delegate pre-test planning/current-doc guidance, deprecation/API review, and security review before writing tests because TASK-031 touches OpenAI provider API shape, React/plugin views, plugin settings/secrets, network boundaries, and possible package/native surfaces.
- Parent thread will not write TASK-031 tests, production implementation, review findings, or formal docs sync unless a delegated agent fails or is explicitly cancelled and the fallback reason is recorded.

## Current Next Action

- Delegate pre-test guidance:
  - `planner` to define the smallest safe TASK-031 slice, canonical ids, command payload/result DTOs, settings approach, acceptance criteria, and deferred scope.
  - `docs_researcher` to verify current OpenAI Responses/Structured Outputs/model guidance plus React/Vitest Testing Library implications.
  - `deprecation_auditor` to audit stale AI command ids, provider API assumptions, and absent plugin settings APIs.
  - `security_reviewer` to define secret handling, logging, provider boundary, network/native/package, prompt-injection, and data-exfiltration constraints.

## Pre-Test Guidance Handoff

- Dalton the 2nd (`planner`) started at 2026-05-25 14:29 CST.
- Banach the 2nd (`docs_researcher`) started at 2026-05-25 14:29 CST.
- Singer the 2nd (`deprecation_auditor`) started at 2026-05-25 14:29 CST.
- Faraday the 2nd (`security_reviewer`) started at 2026-05-25 14:29 CST.
- All agents are read-only and must not edit files, commit, merge, or push.
- Parent next action: wait for guidance, record parent decisions, then delegate failing acceptance tests to `test_writer`.

## Pre-Test Guidance Outcomes

- Dalton the 2nd (`planner`) recommended the smallest safe slice:
  - built-in `ai` plugin registration through `BUILT_IN_PLUGINS`;
  - manifest/runtime registration for canonical commands, metadata/event descriptors, inert settings panel descriptor, and minimal fail-closed views;
  - provider abstraction owned entirely by `src/plugins/ai/**`;
  - OpenAI provider adapter boundary that maps generic AI requests to Responses API-shaped requests through injected/mockable transport;
  - AI-plugin-owned injectable provider settings store defaulting to unconfigured/no secret;
  - commands shape prompts/inputs and return validated suggestion DTOs only, with no page/metadata/filter/event persistence in this task.
- Banach the 2nd (`docs_researcher`) verified current official OpenAI docs:
  - latest-model guide currently names `gpt-5.5`;
  - Responses API is recommended for new projects;
  - Responses uses top-level `instructions` and `input`;
  - set `store: false` for non-stateful local-first commands;
  - use `text.format` for Structured Outputs;
  - refusals and provider failures need programmatic handling without leaking raw provider objects.
- Singer the 2nd (`deprecation_auditor`) found no P0 blocker for the recommended slice. It found P1 hazards:
  - current `PluginContext` has no runtime `settings` facade, and `settingsPanels` are manifest descriptors only;
  - AI cannot read sibling plugin-owned metadata/events or execute sibling commands through `ctx`;
  - product docs use stale underscore AI ids;
  - real OpenAI/network/secrets work should be deferred because there is no OpenAI SDK, no Tauri HTTP plugin, and no scoped native capability for it.
- Faraday the 2nd (`security_reviewer`) required:
  - no real or real-looking committed credentials;
  - no live OpenAI calls in tests or CI;
  - no Core/provider leakage;
  - no existing pages/metadata/events/filters/SQLite/localStorage/sessionStorage/IndexedDB/env-file persistence for API keys;
  - exact bounded command DTOs and explicit user-provided data scope;
  - no implicit full-workspace exfiltration;
  - redacted provider errors and no `console.*`;
  - static guards for HTML/code execution, storage, filesystem, Tauri/native/package, and unscoped network sinks.

## Parent Decisions After Guidance

- TASK-031 is not blocked if provider settings are implemented as an AI-plugin-owned injectable settings abstraction plus an inert settings panel descriptor. Persistent plugin settings, settings UI, OS keychain/secret storage, and any Core settings facade are deferred and must be documented.
- Canonical runtime ids are kebab-case only:
  - `ai.cleanup-inbox`
  - `ai.turn-text-into-task`
  - `ai.suggest-tags`
  - `ai.suggest-due-date`
  - `ai.generate-subtasks`
  - `ai.generate-filter`
  - `ai.summarize-time-notes`
  - `ai.generate-weekly-review`
  - `ai.explain-prediction`
- Product-doc underscore ids such as `ai.cleanup_inbox`, `ai.turn_text_into_task`, `ai.suggest_tags`, `ai.suggest_due_date`, `ai.generate_subtasks`, `ai.generate_filter`, `ai.summarize_time_notes`, `ai.generate_weekly_review`, and `ai.explain_prediction` are stale and must not be registered as aliases.
- Canonical descriptors:
  - plugin id: `ai`;
  - provider id: `openai`;
  - settings panel descriptor: `ai.provider-settings`;
  - views: `ai.suggestion-panel` and `ai.review-panel`;
  - metadata descriptors: `ai.summary`, `ai.suggestedTags`, and `ai.suggestedEstimate`;
  - events: `ai.suggestion-generated` and `ai.summary-generated`.
- OpenAI provider boundary:
  - provider code stays under `src/plugins/ai/**`;
  - default model guidance is `gpt-5.5`;
  - adapter maps to Responses-style request shape with `model`, `instructions`, `input`, `store: false`, and `text.format`;
  - transport is injected and mocked in tests;
  - no Chat Completions, `response_format`, Assistants API, Agents SDK orchestration, streaming, hosted tools, SDK dependency, raw `fetch`, or live network call in this slice.
- AI commands consume exact bounded caller-provided projections and return advisory DTOs only. They must not mutate pages, metadata, events, filters, Task/Tag/Timer private data, or ML internals in this task.
- Test writer should add focused red tests in `src/test/ai-plugin-provider-abstraction.test.tsx` for registration, stale-id absence, command input validation, fake provider request shaping, unconfigured provider behavior, redaction, fail-closed output validation, views, static architecture guards, and no package/native/Tauri/Rust/schema/capability diffs.

## Current Next Action

- Commit pre-test guidance decisions, then delegate failing acceptance tests to `test_writer`.

## Test Writer Handoff

- Noether the 2nd (`test_writer`) started at 2026-05-25 14:37 CST.
- Scope: add failing TASK-031 acceptance tests only, likely in `src/test/ai-plugin-provider-abstraction.test.tsx`.
- Required coverage:
  - built-in `ai` registration with canonical commands, views, metadata/event descriptors, inert settings panel descriptor, and provider boundary expectations;
  - stale underscore id absence;
  - command execution through the real Command Registry/runtime path;
  - fake provider and injected settings request shaping for OpenAI Responses-style `model`, `instructions`, `input`, `store: false`, and `text.format`;
  - exact bounded plain command DTO validation and rejection of secret/provider override fields;
  - unconfigured provider fail-closed behavior with no mutations;
  - redacted provider/settings errors and no public secret echo;
  - malformed/oversized/injection-like provider output rejection;
  - inert/fail-closed `ai.suggestion-panel` and `ai.review-panel` rendering;
  - static guards for Core isolation, sibling/private imports, execution/rendering/storage/network/native/package sinks, and no package/native/Tauri/Rust/schema/capability diffs.
- Constraints: do not edit production files, docs, progress, package/native/Tauri/Rust/schema/capability files; do not commit, merge, or push.
- Parent next action: wait for Noether the 2nd, validate the expected red signal, and commit the test-only patch.

## Test Writer Outcome

- Noether the 2nd (`test_writer`) added `src/test/ai-plugin-provider-abstraction.test.tsx`.
- Coverage added:
  - AI built-in registration with canonical command, view, metadata, event, settings, and provider descriptors.
  - Stale underscore id absence.
  - Real Command Registry execution path for AI commands.
  - Fake provider/settings request shaping into Responses-style provider requests with `gpt-5.5`, `store: false`, top-level `instructions` / `input`, and `text.format`.
  - Exact bounded command DTO validation, forbidden secret/provider override fields, and no store mutations.
  - Unconfigured provider and provider failure redaction.
  - Malformed/oversized/wrong-kind/injection-like provider output fail-closed behavior.
  - Inert accessible `ai.suggestion-panel` and `ai.review-panel` rendering.
  - Static guards for Core isolation, sibling/private imports, HTML/code execution sinks, storage/network/native/package sinks, native surface diffs, and real-looking secrets.
- Parent red validation:
  - `bun run test:frontend -- src/test/ai-plugin-provider-abstraction.test.tsx` failed as expected with 8 failed / 1 passed.
  - Failure symptoms: missing `ai` built-in registration, missing `src/plugins/ai/test-support`, missing `ai.suggestion-panel`, and missing `src/plugins/ai/index.ts`.
- Parent static validation passed:
  - `bun run typecheck`.
  - `./node_modules/.bin/eslint src/test/ai-plugin-provider-abstraction.test.tsx --max-warnings=0`.
  - `git diff --check`.
  - `.skip/.only` scan found no matches.
  - Changed-file guard showed only `src/test/ai-plugin-provider-abstraction.test.tsx`.
  - Package/native/Tauri/Rust/schema/capability diff guard was empty.
- Test commit: `fd2c9c8 Noether(test)(Implement AI Plugin provider abstraction): add ai provider acceptance tests`; post-commit auto-push succeeded.

## Current Next Action

- Commit red validation record, then delegate minimum production implementation to `implementer`.

## Implementation Handoff

- Wegener the 2nd (`implementer`) started at 2026-05-25 14:51 CST.
- Scope: production code only for the TASK-031 AI Plugin provider abstraction.
- Expected changed files: `src/bootstrap/built-in-plugins.ts` and `src/plugins/ai/**`.
- Required result:
  - built-in `ai` plugin registration;
  - canonical kebab-case commands and descriptors only;
  - plugin-local provider/settings abstraction;
  - injected/mockable OpenAI Responses adapter boundary with `gpt-5.5`, `store: false`, top-level `instructions` / `input`, and `text.format`;
  - command DTO validation and advisory non-mutating results;
  - redacted unconfigured/provider failure behavior;
  - provider output validation and fail-closed handling;
  - inert accessible suggestion/review views;
  - no package/native/Tauri/Rust/schema/capability changes.
- Constraints: do not edit tests, docs, progress, package/native/Tauri/Rust/schema/capability files; do not commit, merge, or push.
- Parent next action: wait for Wegener the 2nd, validate focused green checks, and commit implementation separately.

## Implementation Outcome

- Wegener the 2nd (`implementer`) completed the TASK-031 production baseline.
- Changed files:
  - `src/bootstrap/built-in-plugins.ts`
  - `src/plugins/ai/index.ts`
  - `src/plugins/ai/plugin.ts`
  - `src/plugins/ai/settings.ts`
  - `src/plugins/ai/test-support.ts`
  - `src/plugins/ai/providers/modelProvider.ts`
  - `src/plugins/ai/providers/openAIProvider.ts`
  - `src/plugins/ai/views/AiSuggestionPanel.tsx`
  - `src/plugins/ai/views/AiReviewPanel.tsx`
- Delivered:
  - built-in `ai` plugin registration;
  - canonical AI commands, metadata/event/settings/view descriptors;
  - plugin-local provider/settings abstraction with OpenAI Responses-style request shaping;
  - injected test provider/settings support;
  - strict command input and provider output validation;
  - redacted unconfigured/provider-failure handling;
  - advisory non-mutating command results;
  - inert accessible AI suggestion/review views.
- Parent validation after implementation:
  - `bun run test:frontend -- src/test/ai-plugin-provider-abstraction.test.tsx` passed with 9 tests.
  - `bun run test:frontend -- src/test/ai-plugin-provider-abstraction.test.tsx src/test/plugin-api-contracts.test.ts src/test/plugin-host-lifecycle.test.ts src/test/core-architecture-boundary.test.ts src/test/ml-plugin-baseline-predictions.test.tsx` passed with 5 files / 99 tests.
  - `bun run typecheck` passed.
  - `bun run lint` passed.
  - `git diff --check` passed.
  - `.skip/.only` scan found no matches.
  - Source secret/sink/import static scans found no matches.
  - Package/native/Tauri/Rust/schema/capability diff guard was empty.
- Implementation commit: `5461921 Wegener(implementation)(Implement AI Plugin provider abstraction): implement ai provider boundary`; post-commit auto-push succeeded.

## Current Next Action

- Commit implementation result record, then delegate review wave.

## Review Wave Handoff

- Jason the 2nd (`pr_explorer`) started at 2026-05-25 15:06 CST.
- Anscombe the 2nd (`reviewer`) started at 2026-05-25 15:06 CST.
- Nash the 2nd (`deprecation_auditor`) started at 2026-05-25 15:06 CST.
- Parfit the 2nd (`security_reviewer`) started at 2026-05-25 15:06 CST.
- Schrodinger the 2nd (`docs_researcher`) started at 2026-05-25 15:06 CST.
- Franklin the 2nd (`test_quality_reviewer`) started at 2026-05-25 15:06 CST.
- All review agents are read-only and must not edit files, commit, merge, or push.
- Parent next action: wait for review findings, then fix P0/P1 findings before docs sync and final branch gate.

## Review Wave Outcomes

- Jason the 2nd (`pr_explorer`) mapped TASK-031 changes and found no scope drift or package/native/Tauri/Rust/schema/capability broadening. Review surfaces:
  - persistent settings acceptance remains deferred;
  - test-only hooks live under `src/plugins/ai/**`;
  - `src/plugins/ai/test-support.ts` has an unusual operation-changing getter;
  - `sanitizePublicJson` mutates successful result text by rewriting `persist*` strings;
  - Structured Output schemas are broad;
  - formal docs still contain stale underscore AI ids.
- Parfit the 2nd (`security_reviewer`) found no P0 and two P1s:
  - unguarded production test hooks/global provider-settings setters can override the AI provider/settings from production import paths;
  - validated command payloads are passed to provider calls by reference, so callers can mutate nested fields after validation and before async provider serialization.
- Franklin the 2nd (`test_quality_reviewer`) found P1 test gaps:
  - hostile or secret-like strings nested inside JSON advisory fields such as `suggestedMetadata` / `metadata` are not tested;
  - forbidden `apiKey` / `token` / `provider` / `model` command fields are only tested on `ai.cleanup-inbox`, not all commands;
  - provider output accessor non-execution is not tested;
  - the OpenAI provider adapter itself is not directly exercised with mocked transport.
- Schrodinger the 2nd (`docs_researcher`) found a P1 current-doc issue:
  - the mocked OpenAI Responses request shape sends an object envelope as top-level `input`, while recorded OpenAI Responses docs use string or message/item-list inputs. It recommended either making the boundary Responses-compatible now or clearly documenting the current shape as an internal envelope before a later adapter step.
- Anscombe the 2nd (`reviewer`) found no P0 and confirmed the P1 post-validation mutation bug. It also found P2s:
  - generated filter validation does not match Core filter contract for `neq` and `exists`;
  - AI tag suggestions do not mirror Tag Plugin lowercase ASCII slug grammar;
  - nested provider JSON can carry public `apiKey` / `token` / `secret` / `providerId` / `model` keys.
- Nash the 2nd (`deprecation_auditor`) found no P0 and two P1s:
  - the OpenAI boundary is not live-compatible with current Responses API shape because it types `input` as `unknown`, sends an object envelope, and does not parse raw Responses output/refusal/error shapes;
  - Structured Outputs schemas are too underspecified because each property schema is `{}` while `strict: true` is set.

## Parent Decisions After Review

- Add review-fix tests first for all P1 findings.
- Required review-fix test coverage:
  - production callers cannot import or use unguarded provider/settings/test-support hooks to override AI provider or settings;
  - no operation-changing getter behavior in test support or provider request handling;
  - command input is snapshotted before async provider use, proven by mutating the original payload after `execute()` starts;
  - provider output accessors at top-level, nested object fields, and array elements are not executed;
  - nested provider JSON rejects hostile strings, unsafe URLs, raw SQL, prompt-injection text, and secret/provider-shaped keys;
  - forbidden secret/provider override fields are rejected across all nine AI commands;
  - OpenAI provider adapter is directly tested with mocked transport for unavailable/error/raw Responses success/refusal/invalid response behavior;
  - provider request `input` is Responses-compatible, not an opaque object envelope;
  - Structured Output schemas contain meaningful property type definitions, not `{}`.
- Required implementation fix direction:
  - remove, move, or hard-gate test-only provider/settings hooks from production import paths and remove the operation-changing getter;
  - build sanitized deep DTO snapshots for validated command inputs and provider outputs before async boundaries;
  - shape the OpenAI boundary around Responses-compatible `instructions`, string/message-list `input`, `store: false`, and `text.format`;
  - parse/normalize raw Responses-like output/refusal/error results into AI-owned outputs/errors without leaking raw provider data;
  - generate stricter JSON Schemas for command outputs.
- Defer P2 fixes until after P1 review-fix unless cheap while touching the same code: Core filter `neq` / `exists` parity, Tag Plugin grammar, loading-state view coverage, and production-source secret scanning.

## Current Next Action

- Commit review findings record, then delegate review-fix tests to `test_writer`.

## Review-Fix Test Handoff

- Tesla the 2nd (`test_writer`) started at 2026-05-25 15:25 CST.
- Scope: tests only in `src/test/ai-plugin-provider-abstraction.test.tsx` unless an additional test-only helper file is clearly necessary.
- Required P1 coverage:
  - production public AI exports do not expose provider/settings override functions, and test-support does not contain operation-changing getter behavior;
  - async provider sees sanitized snapshots even if the caller mutates the original command payload after `execute()` starts;
  - provider request `input` is Responses-compatible string or message/item-list shape, not an opaque object envelope;
  - direct `createOpenAIProvider` mocked-transport tests cover unavailable transport, thrown transport error, raw success, refusal, incomplete/error response, and invalid raw response shape;
  - Structured Output schemas contain meaningful property type definitions for required keys, not `{}`;
  - nested provider JSON rejects hostile strings, unsafe URLs, raw SQL, prompt-injection text, and secret/provider-shaped keys;
  - provider output accessors are not executed at top-level, nested object fields, or array elements;
  - forbidden secret/provider override fields are rejected across all nine public AI commands before provider execution.
- Optional if cheap: filter `neq` / `exists` parity, Tag Plugin slug grammar, loading-state view coverage, and production-source secret scan.
- Constraints: do not edit production files, docs, progress, package/native/Tauri/Rust/schema/capability files; do not commit, merge, or push.
- Parent next action: wait for Tesla the 2nd, validate the expected red signal, and commit review-fix tests separately.

## Review-Fix Test Outcome

- Tesla the 2nd (`test_writer`) extended `src/test/ai-plugin-provider-abstraction.test.tsx`.
- Added coverage:
  - static guards for unguarded provider/settings test hooks and operation-changing getters in AI test support;
  - async payload snapshot regression proving provider input must not observe caller mutations after command execution starts;
  - Responses-compatible provider input shape instead of opaque object envelopes;
  - direct `createOpenAIProvider` mocked-transport coverage for raw success, refusal, incomplete/error/invalid responses, unavailable transport, and thrown transport errors;
  - Structured Output schemas with meaningful property definitions and strict `json_schema` / `additionalProperties: false`;
  - nested hostile/secret provider JSON output rejection;
  - provider output accessor non-execution for top-level, nested, and array fields;
  - forbidden secret/provider override fields across all nine AI commands.
- Parent red validation:
  - `bun run test:frontend -- src/test/ai-plugin-provider-abstraction.test.tsx` failed as expected with 5 failed / 9 passed.
  - Failure symptoms: unguarded production test hooks, opaque Responses input object envelope, caller mutation visible after validation, raw OpenAI Responses pass-through, and nested unsafe provider JSON accepted.
- Parent static validation passed:
  - `bun run typecheck`.
  - `./node_modules/.bin/eslint src/test/ai-plugin-provider-abstraction.test.tsx --max-warnings=0`.
  - `git diff --check`.
  - `.skip/.only` scan found no matches.
  - Changed-file guard showed only `src/test/ai-plugin-provider-abstraction.test.tsx`.
  - Package/native/Tauri/Rust/schema/capability diff guard was empty.
- Test-fix commit: `9f36d38 Tesla(test-fix)(Implement AI Plugin provider abstraction): cover ai review regressions`; post-commit auto-push succeeded.

## Current Next Action

- Commit review-fix test record, then delegate production fixes to `implementer`.

## Review-Fix Implementation Handoff

- Rawls the 2nd (`implementer`) started at 2026-05-25 15:33 CST.
- Scope: production changes only for TASK-031 P1 review fixes.
- Expected changed files: `src/plugins/ai/**`.
- Required fixes:
  - harden or move test-only provider/settings hooks so production public AI exports and production paths cannot override provider/settings;
  - remove operation-changing getter behavior from test support;
  - snapshot validated command input before async provider use;
  - make provider request `input` Responses-compatible instead of an opaque object envelope;
  - parse raw OpenAI Responses-like success/refusal/error/incomplete/invalid shapes into AI-owned results/errors;
  - generate meaningful strict `json_schema` property definitions;
  - reject nested hostile/secret provider output and avoid executing output accessors.
- Constraints: do not edit tests, docs, progress, package/native/Tauri/Rust/schema/capability files; do not commit, merge, or push.
- Parent next action: wait for Rawls the 2nd, validate focused green checks, and commit review-fix implementation separately.

## Review-Fix Implementation Outcome

- Rawls the 2nd (`implementer`) completed the TASK-031 P1 production fixes.
- Changed files:
  - `src/plugins/ai/plugin.ts`
  - `src/plugins/ai/providers/modelProvider.ts`
  - `src/plugins/ai/providers/openAIProvider.ts`
  - `src/plugins/ai/settings.ts`
  - `src/plugins/ai/test-support.ts`
- Delivered:
  - hard-gated `src/plugins/ai/test-support.ts` to `import.meta.env.MODE === "test"`;
  - renamed production-adjacent provider/settings runtime seams away from public test-hook names;
  - removed the operation-changing getter behavior from test-support request wrapping;
  - snapshotted validated command inputs before async provider calls;
  - changed provider request `input` to a Responses-compatible framed text string;
  - parsed raw OpenAI Responses-like success/refusal/error/incomplete/invalid shapes into AI-owned outputs or redacted failures;
  - added meaningful strict JSON Schema property definitions for Structured Outputs;
  - rejected nested hostile strings, unsafe URLs, SQL/prompt-injection text, secret/provider-shaped keys, and accessor-backed provider outputs.
- Parent validation after review-fix implementation:
  - `bun run test:frontend -- src/test/ai-plugin-provider-abstraction.test.tsx` passed with 14 tests.
  - `bun run test:frontend -- src/test/ai-plugin-provider-abstraction.test.tsx src/test/plugin-api-contracts.test.ts src/test/plugin-host-lifecycle.test.ts src/test/core-architecture-boundary.test.ts src/test/ml-plugin-baseline-predictions.test.tsx` passed with 5 files / 104 tests.
  - `bun run typecheck` passed.
  - `bun run lint` passed.
  - `git diff --check` passed.
  - `.skip/.only` scan found no matches.
  - Source secret/sink/import scan found no matches.
  - Sibling plugin import guard found no matches.
  - Core AI/provider leakage guard found no matches.
  - Package/native/Tauri/Rust/schema/capability diff guard was empty.
- Review-fix commit: `9aa398f Rawls(review-fix)(Implement AI Plugin provider abstraction): harden ai provider boundary`; post-commit auto-push succeeded.

## Current Next Action

- Commit this review-fix implementation record, then delegate narrow re-review for security, correctness/current API shape, and test-quality confirmation before formal docs sync.

## Narrow Re-Review Handoff

- Bacon the 2nd (`security_reviewer`) started at 2026-05-25 15:35 CST.
- Leibniz the 2nd (`reviewer`) started at 2026-05-25 15:35 CST.
- Feynman the 2nd (`deprecation_auditor`) started at 2026-05-25 15:35 CST.
- James the 2nd (`test_quality_reviewer`) started at 2026-05-25 15:35 CST.
- All agents are read-only and must not edit files, commit, merge, or push.
- Review focus:
  - security boundaries for provider/settings/test-support seams, secrets, native/package/storage drift, async payload snapshotting, provider output validation, and Core/sibling boundaries;
  - correctness of prior P1 fixes for post-validation mutation, Responses-compatible input, raw Responses normalization, strict schemas, test-support getter hardening, and accessor-safe output validation;
  - current OpenAI Responses / Structured Outputs alignment and absence of stale underscore AI aliases;
  - review-fix test coverage for production hook hardening, payload snapshotting, Responses-compatible input, raw Responses paths, schema specificity, nested hostile output, accessor non-execution, and forbidden secret/provider fields across all commands.
- Parent next action: wait for narrow re-review results, record findings, and fix any remaining P0/P1 before formal docs sync.

## Narrow Re-Review Outcomes

- Bacon the 2nd (`security_reviewer`) found no P0 and one remaining P1:
  - test-only AI provider/settings override seams are still live in production modules because `src/plugins/ai/plugin.ts` exports `replaceAiProviderForTestRuntime` / `clearAiProviderForTestRuntime`, `src/plugins/ai/settings.ts` exports `replaceAiProviderSettingsForTestRuntime`, and `getAiProviderSettings()` exposes settings including `apiKey`.
  - The guard in `src/plugins/ai/test-support.ts` protects `configureAiPluginForTests()` but does not protect direct production-module imports.
  - It also noted as residual risk that `test-support.ts` still installs an operation-changing getter through `Object.defineProperty`.
- Leibniz the 2nd (`reviewer`) found no P0 and three remaining P1s:
  - valid OpenAI Responses successes with `error: null` are normalized as provider failures;
  - strict Structured Output schemas are meaningful but OpenAI-incompatible because they use unsupported JSON Schema keywords such as `maximum`, `minimum`, `maxItems`, and `maxLength`;
  - test-support / override hardening remains incomplete due the operation-changing getter and directly importable provider/settings override functions.
  - It also carried one P2: generated-filter output does not yet match Core `neq` / `exists` semantics.
- Feynman the 2nd (`deprecation_auditor`) found no P0 and one current-API P1:
  - normal Responses success payloads containing `status: "completed"`, `error: null`, `incomplete_details: null`, and output content are rejected.
  - It confirmed production registration uses canonical dashed `ai.*` ids only; stale underscore ids are only tested/docs-referenced as rejected aliases.
  - It found no Chat Completions, `response_format`, Assistants/threads/runs, SDK import, live `fetch`, or stale underscore alias registration.
- James the 2nd (`test_quality_reviewer`) found no P0 and P1 test gaps:
  - production test-hook hardening tests miss the renamed override seams;
  - the operation-getter guard misses `Object.defineProperty`;
  - the all-nine-command forbidden-field matrix omits `providerId`.
- Parent official-doc check:
  - OpenAI Structured Outputs docs confirm `strict: true` requests with unsupported JSON Schema keywords are rejected.
  - Unsupported keywords include string length keywords, numeric min/max keywords, array min/max item keywords, and composition / conditional / dependent-schema keywords.
- Interim full gate:
  - `bun run check:quick` passed with typecheck, lint, 36 frontend test files / 560 tests, Rust fmt, Rust clippy, and Rust tests.
- Parent decisions:
  - Add second review-fix tests first, then delegate production fixes to `implementer`.
  - Required test coverage:
    - direct production-module import/source guard against provider/settings override seams and settings secret exposure;
    - no `Object.defineProperty` operation getter or operation-changing wrapper in AI test support;
    - `providerId` forbidden across all public AI commands;
    - raw OpenAI Responses success fixture includes `error: null` and `incomplete_details: null`;
    - strict Structured Output schemas remain meaningful but do not use unsupported OpenAI JSON Schema keywords (`maxLength`, `minLength`, `pattern`, `format`, `minimum`, `maximum`, `multipleOf`, `minItems`, `maxItems`, `allOf`, `not`, `if`, `then`, `else`, `dependentRequired`, `dependentSchemas`, `patternProperties`).

## Current Next Action

- Commit this narrow re-review record, then delegate second review-fix tests to `test_writer`.

## Second Review-Fix Test Handoff

- Hypatia the 2nd (`test_writer`) started at 2026-05-25 15:40 CST.
- Scope: tests only, expected in `src/test/ai-plugin-provider-abstraction.test.tsx`.
- Required red coverage:
  - production override seam hardening must fail while `src/plugins/ai/plugin.ts` exports `replaceAiProviderForTestRuntime` / `clearAiProviderForTestRuntime` and `src/plugins/ai/settings.ts` exports `replaceAiProviderSettingsForTestRuntime` or exposes provider settings/secrets to production imports;
  - AI test support must fail while it uses `Object.defineProperty` or any `operation` getter / operation-changing wrapper;
  - `providerId` must be included in the forbidden-field matrix across all public AI commands;
  - direct `createOpenAIProvider` success fixture must include `error: null` and `incomplete_details: null`;
  - strict Structured Output schemas must stay meaningful while excluding unsupported OpenAI JSON Schema keywords.
- Constraints: do not edit production files, docs, progress, package/native/Tauri/Rust/schema/capability files; do not commit, merge, or push.
- Parent next action: wait for Hypatia the 2nd, validate the expected red signal, and commit second review-fix tests separately.

## Second Review-Fix Test Outcome

- Hypatia the 2nd (`test_writer`) extended `src/test/ai-plugin-provider-abstraction.test.tsx`.
- Added coverage:
  - production AI module export guards for `replaceAiProviderForTestRuntime`, `clearAiProviderForTestRuntime`, `replaceAiProviderSettingsForTestRuntime`, `getAiProviderSettings`, and broader `ForTestRuntime` / provider-settings override exports;
  - static and behavioral guards proving AI test support must not use `Object.defineProperty` / operation getters or change provider request operations while wrapping test providers;
  - `providerId` in the all-command forbidden-field matrix;
  - raw OpenAI Responses success fixture with `status: "completed"`, `error: null`, `incomplete_details: null`, and output message `output_text`;
  - strict Structured Output schema guard excluding unsupported OpenAI JSON Schema keywords while preserving meaningful schema assertions.
- Parent red validation:
  - `bun run test:frontend -- src/test/ai-plugin-provider-abstraction.test.tsx` failed as expected with 4 failed / 11 passed.
  - Failure symptoms: production override exports still visible, test support changes `cleanup-inbox` to `generate-subtasks` on a second `operation` read, strict schemas still include unsupported keywords, and OpenAI `error: null` success is still treated as provider unavailable.
- Parent static validation passed:
  - `./node_modules/.bin/eslint src/test/ai-plugin-provider-abstraction.test.tsx --max-warnings=0`.
  - `git diff --check`.
  - `.skip/.only` scan found no matches.
  - Changed-file guard showed only `src/test/ai-plugin-provider-abstraction.test.tsx`.
  - Package/native/Tauri/Rust/schema/capability diff guard was empty.
- Test-fix commit: `8d37679 Hypatia(test-fix)(Implement AI Plugin provider abstraction): cover remaining ai provider regressions`; post-commit auto-push succeeded.

## Current Next Action

- Commit this second test outcome record, then delegate production fixes to `implementer`.

## Second Review-Fix Implementation Handoff

- Dirac the 2nd (`implementer`) started at 2026-05-25 15:45 CST.
- Scope: production code only, expected under `src/plugins/ai/**`.
- Required fixes:
  - remove production-module provider/settings override exports and settings secret exposure while preserving test-mode configuration through `src/plugins/ai/test-support.ts`;
  - remove `Object.defineProperty` / operation getter behavior and any operation-changing wrapper from test support;
  - treat OpenAI Responses `error: null` and `incomplete_details: null` as acceptable completed-success fields while keeping non-null errors and incomplete/non-completed responses fail-closed;
  - remove unsupported OpenAI strict JSON Schema keywords from generated Structured Output schemas while preserving meaningful schemas and runtime validation.
- Constraints: do not edit tests, docs, progress files, package/native/Tauri/Rust/schema/capability files; do not commit, merge, or push.
- Parent next action: wait for Dirac the 2nd, validate focused green checks, and commit second review-fix implementation separately.

## Second Review-Fix Implementation Outcome

- Dirac the 2nd (`implementer`) completed the remaining TASK-031 P1 production fixes.
- Changed production files:
  - `src/plugins/ai/plugin.ts`
  - `src/plugins/ai/providers/openAIProvider.ts`
  - `src/plugins/ai/settings.ts`
  - `src/plugins/ai/test-support.ts`
- Delivered:
  - removed production-module provider/settings override exports and settings secret exposure;
  - moved test configuration behind a test-mode global hook used by `src/plugins/ai/test-support.ts`;
  - removed `Object.defineProperty` / operation-changing behavior from test support;
  - accepted completed OpenAI Responses success payloads with `error: null` and `incomplete_details: null` while keeping non-null error/incomplete responses fail-closed;
  - removed unsupported OpenAI strict JSON Schema keywords from generated Structured Output schemas while preserving runtime bounds and validation.
- Parent integration note:
  - Parent rejected the first green implementation attempt because `test-support.ts` used a brittle `provider.generate.toString()` / output-substitution branch.
  - Dirac removed that branch. The cleanup exposed a test helper bug where explicit `null` provider outputs fell back to default fixtures.
  - Lagrange the 2nd (`test_writer`) fixed only `src/test/ai-plugin-provider-abstraction.test.tsx` so `outputForOperation` results are used as-is, including explicit `null`.
- Parent validation after the combined test-helper and production fixes:
  - `bun run test:frontend -- src/test/ai-plugin-provider-abstraction.test.tsx` passed with 15 tests.
  - `bun run test:frontend -- src/test/ai-plugin-provider-abstraction.test.tsx src/test/plugin-api-contracts.test.ts src/test/plugin-host-lifecycle.test.ts src/test/core-architecture-boundary.test.ts src/test/ml-plugin-baseline-predictions.test.tsx` passed with 5 files / 105 tests.
  - `bun run typecheck` passed.
  - `bun run lint` passed.
  - `git diff --check` passed.
  - `.skip/.only` scan found no matches.
  - Source secret/sink/native/storage/package scan found no matches.
  - Provider seam / unsupported schema keyword scan found no production override seams or schema keywords; remaining `maxItems` matches are runtime validator parameter names only.
  - Package/native/Tauri/Rust/schema/capability diff guard was empty.
- Test-helper commit: `6988af6 Lagrange(test-fix)(Implement AI Plugin provider abstraction): preserve explicit null provider fixtures`; post-commit auto-push succeeded.
- Production review-fix commit: `05d84db Dirac(review-fix)(Implement AI Plugin provider abstraction): close provider seam regressions`; post-commit auto-push succeeded.

## Current Next Action

- Commit this second review-fix implementation record, then delegate final narrow re-review for remaining P0/P1 confirmation.
