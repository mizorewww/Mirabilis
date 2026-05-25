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
