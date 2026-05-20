# Mirabilis Agent Rules

This file contains long-lived rules for Codex and custom agents working in this repository.

## Project Shape

Mirabilis is a Tauri v2 + React + Vite local-first desktop app. The product direction is a Markdown-first time-management system where Core stays small and all advanced behavior is provided by plugins.

Read these docs before implementation work:

- `docs/product/README.md`
- `docs/architecture/README.md`
- `docs/development/README.md`
- `docs/implementation/task-index.md`
- `docs/implementation/progress.md`
- `docs/testing/strategy.md`
- `docs/implementation/agent-workflow.md`
- `docs/implementation/autonomous-development.md`
- `.codex/skills/mirabilis-dev-runner/SKILL.md`

If implementation details are unclear, search the local docs first. If local docs do not answer the question, look up current official documentation before coding.

## Short Command Routing

When the user asks to develop, continue, build, implement, run the next task, run the roadmap, work unattended, or otherwise progress Mirabilis from the docs, automatically activate and follow the `mirabilis-dev-runner` repo skill. Do this even if the user does not mention the skill by name.

Examples that must trigger `mirabilis-dev-runner`:

- "开发下一个 task"
- "继续开发"
- "按 docs 开发"
- "跑完整开发计划"
- "无人值守继续"
- "实现 TASK-018"
- "继续 Mirabilis roadmap"

Config-only, docs-only, or agent-setup changes may use the lighter config/documentation path in the skill instead of the full TDD implementation path.

## Branch Rules

- `master` is the canonical integration branch for this repository. If any prompt or upstream document says `main`, treat it as `master` here.
- Do not implement feature code directly on `master`.
- Use one focused Git branch per task in the repository checkout by default.
- Do not create sibling `../mirabilis-task-*` worktree directories unless the user explicitly asks for worktree isolation.
- If a worktree is explicitly used, remove/prune it after the task is merged so Git remains the only durable version-management surface.
- Branch names:
  - `feat/<milestone>-<feature>` for feature work.
  - `fix/<issue>` for bug fixes.
  - `test/<feature>` for test-only changes.
  - `docs/<topic>` for documentation-only changes.
- Every branch is expected to auto-push to GitHub after commits through `.githooks/post-commit`.

## Agent Permissions

- Project agents are intentionally configured with full filesystem and network access.
- Project agents are standalone `.codex/agents/*.toml` files that Codex auto-discovers; do not mirror them with `[agents.<name>] config_file` entries.
- Project agents default to `gpt-5.5`, `model_reasoning_effort = "xhigh"`, and `service_tier = "fast"`.
- Project agents must not wait for human approval during normal agent-development work.
- Human review is skipped for this phase; local tests and agent review are the release gate.
- Review-oriented agents may have full access, but they should stay read-only unless the parent task explicitly asks them to edit files.
- The main Codex thread is the orchestration agent. It selects tasks, creates branches, delegates to focused agents, waits for their outputs, integrates results, validates, commits, and merges.
- The main thread must not take over test writing, implementation, or review work that has been delegated unless the delegated agent fails, is unavailable, or is explicitly cancelled; in that case, stop and record the reason before continuing.
- Do not treat agent silence as failure by itself. For a blocking agent step, wait first; if it runs unusually long, send one concise status request and give it another wait window before stopping it. Stop only when the agent reports a blocker, writes in the wrong branch or path, produces no edits/output after the status request, or must be cancelled to protect the repository checkout.
- If a specialized agent type is unavailable, stop all running agents and debug `.codex/agents/*.toml` validity, project trust/config loading, and `features.multi_agent` before doing more development work.

## Development Order

1. Start from detailed docs and the task index.
2. Use `docs/implementation/progress.md` to select the next unblocked task unless the user names a task.
3. Split work into one small task per branch.
4. Run `docs_researcher` before writing tests when a task touches Tauri, React, Rust crates, Vite, Vitest, filesystem, IPC, or permissions.
5. Run `test_writer` first. It writes failing tests and does not write production code.
6. Run `implementer` second. It writes the minimum production code needed to pass focused tests.
7. Run focused local validation.
8. Run review agents for correctness, deprecated APIs, security, docs, and test quality.
9. Fix P0/P1 findings before merge.
10. Commit in atomic steps.
11. Mark task status in `docs/implementation/progress.md`.
12. Merge back to `master` only after local checks pass.
13. Continue to the next unblocked task when running in autonomous roadmap mode.

## Atomic Commit Rules

One commit should represent one explainable behavior change.

Commit messages must identify who produced the change, the work category, the plain-English task name, and the concrete change:

```text
<agent-name>(<category>)(<task name>): <specific change>
```

Use the actual agent nickname when a spawned agent produced the patch, for example `Plato(test)(Create TypeScript core domain types): add core domain type tests`, `Newton(implementation)(Create TypeScript core domain types): add core type exports`, or `Turing(test-fix)(Create TypeScript core domain types): strengthen core type coverage`. Use `Codex(orchestration)(<task name>)` or `Codex(docs)(<topic>)` for parent-thread-only commits. If an agent nickname is unavailable, use the agent role name such as `test_writer(test)(<task name>)`.

Use the task's human-readable name from `docs/implementation/task-index.md`, not just `TASK-xxx`. The task ID may appear in the specific change text when useful, but it is not a substitute for the task name.

Recommended sequence:

- `<test-agent>(test)(<task name>): add failing tests for <feature>`
- `<implementer-agent>(implementation)(<task name>): implement <feature>`
- `<agent-or-codex>(refactor)(<task name>): simplify <feature>`
- `<doc-agent>(docs)(<task name>): document <feature>`
- `<fix-agent>(review-fix)(<task name>): address review findings for <feature>`

Do not mix tests, implementation, refactors, docs, and review fixes into one catch-all commit.

## Agent Communication State

- Store durable agent summaries, recommendations, blocker notes, and parent decisions under `docs/implementation/agent-communication/`.
- Keep `docs/implementation/agent-communication/status.md` as the single current orchestration status document. Update it when starting a task, receiving major agent findings, stopping or replacing an agent, completing review fixes, and before merging.
- Use one task-specific communication file per active task, named from the task ID and slug, for example `docs/implementation/agent-communication/TASK-002-core-domain-types.md`.
- Do not rely on chat history alone for agent recommendations. Summarize what each agent advised, whether the parent accepted or rejected it, the reason, and the next action.
- `docs/implementation/progress.md` remains the durable roadmap ledger; `agent-communication/status.md` is the live orchestration state, and task-specific communication files hold detailed agent notes.

## Architecture Rules

- Core may own Markdown Page, Metadata, Event, Filter, View Registry, Command Registry, Plugin Host, and Plugin Registry.
- Core must not contain business implementations for task, habit, timer, calendar, heatmap, stats, chart, ml, or ai behavior.
- All user actions must go through Command Registry.
- Cross-plugin collaboration must go through Event, Metadata, Query, or registered commands.
- Plugins must not directly mutate another plugin's private data.
- Tauri/Rust owns SQLite, filesystem, global shortcuts, notifications, window/tray, updater, and sync transport.

## Testing Rules

- TDD is preferred: write tests before implementation.
- Tests must cover observable behavior and acceptance criteria, not implementation details.
- Do not delete, skip, or weaken tests to make checks pass.
- UI tests should use the user's perspective.
- Rust tests should exercise domain/service behavior directly.
- IPC tests should verify request/response/error contracts where practical.
- Security-sensitive changes must include focused review of Tauri capabilities, filesystem access, IPC boundaries, and permission changes.

## Local Checks

Current baseline checks:

```bash
bun run build
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --all-features
```

Target check names after the test/lint toolchain task lands:

```bash
bun run check:quick
bun run check:full
```

Run focused tests before each implementation commit. Run the full local gate before merging to `master`.

## Done Definition

The final response for agent work must list:

- Files changed.
- Tests or checks run.
- Remaining risks or gaps.
- Any docs that were verified externally.
