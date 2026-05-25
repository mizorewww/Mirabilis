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
