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
- Use one focused branch or worktree per task.
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
- The main Codex thread is the orchestration agent. It selects tasks, creates branches/worktrees, delegates to focused agents, waits for their outputs, integrates results, validates, commits, and merges.
- The main thread must not take over test writing, implementation, or review work that has been delegated unless the delegated agent fails, is unavailable, or is explicitly cancelled; in that case, stop and record the reason before continuing.
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

Recommended sequence:

- `test: add failing tests for <feature>`
- `feat: implement <feature>`
- `refactor: simplify <feature>`
- `docs: document <feature>`
- `fix: address review findings for <feature>`

Do not mix tests, implementation, refactors, docs, and review fixes into one catch-all commit.

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
