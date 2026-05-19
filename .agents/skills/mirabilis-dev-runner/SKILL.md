---
name: mirabilis-dev-runner
description: Automatically use for Mirabilis roadmap development, "continue development", "develop next task", "implement TASK-xxx", "work unattended", or any request to progress the project from docs/product, docs/architecture, docs/development, or docs/implementation. Orchestrates planner/docs/test/implement/review agents, atomic commits, progress marking, merging to master, and continuing to the next task.
---

# Mirabilis Dev Runner

Use this skill whenever the user asks to develop Mirabilis from the docs, continue the roadmap, implement a task, or run unattended progress. This skill is the durable workflow source; do not rely on conversation history.

## Required Files

Read these first:

- `AGENTS.md`
- `.codex/config.toml`
- `docs/implementation/progress.md`
- `docs/implementation/task-index.md`
- `docs/implementation/agent-workflow.md`
- `docs/testing/strategy.md`
- Relevant `docs/product`, `docs/architecture`, and `docs/development` files for the selected task.

## Command Interpretation

- If the user names `TASK-xxx`, run that task.
- If the user says "next", "continue", "按 docs 开发", "无人值守", or similar, choose the first unblocked `[ ]` task in `docs/implementation/progress.md`.
- If the request is config-only/docs-only/agent-setup, use the light path and do not run TDD implementation agents.
- If a task is blocked by missing product/architecture decisions, mark it `[!]` in `docs/implementation/progress.md`, add a Run Log entry, and continue to the next unblocked task only if the blocker is isolated.

## Autonomous Loop

For each selected task:

1. Mark the task `[~]` in `docs/implementation/progress.md` and add a Run Log entry.
2. Ensure work starts from `master`, pull latest, then create a focused branch named `feat/<task-id>-<slug>`, `fix/<task-id>-<slug>`, `test/<task-id>-<slug>`, or `docs/<task-id>-<slug>`.
3. Spawn `docs_researcher` and `deprecation_auditor` for current official docs when the task touches Tauri, React, Rust crates, Vite, Vitest, Testing Library, IPC, filesystem, permissions, or dependencies.
4. Spawn `test_writer` to write failing tests first. It must not write production code.
5. Run the focused failing-test command and confirm it fails for the expected reason.
6. Commit tests with `test: add <task-id> <feature> acceptance tests`.
7. Spawn `implementer` to write minimum production code.
8. Run focused tests until green.
9. Commit implementation with `feat: implement <task-id> <feature>` or the appropriate conventional prefix.
10. Refactor only if needed, without behavior changes, and commit separately.
11. Spawn review agents in parallel: `pr_explorer`, `reviewer`, `deprecation_auditor`, `security_reviewer`, `docs_researcher`, `test_quality_reviewer`, and `doc_writer`.
12. Fix P0/P1 findings. Commit fixes and docs separately.
13. Run the local gate from `docs/testing/strategy.md`; use `check:quick` once available and `check:full` for IPC, permissions, filesystem, persistence, packaging, or release changes.
14. Update `docs/implementation/progress.md`: change `[~]` to `[x]`, add branch, commits, checks, and risks to Run Log.
15. Commit progress update.
16. Push happens through `.githooks/post-commit`; verify the push did not fail.
17. Merge the task branch into `master` after local checks pass, then push `master`.
18. If the user asked for autonomous roadmap progress, continue to the next unblocked `[ ]` task.

## Light Path For Config Or Docs Only

Use this path for Codex config, AGENTS.md, agent TOML, hooks, workflow docs, or task-index/progress updates:

1. Read official Codex docs when config behavior is involved.
2. Patch only docs/config/hook files.
3. Validate TOML, shell syntax, and `codex --strict-config doctor --summary --ascii` when relevant.
4. Run `bun run build` only if repo behavior may have been touched.
5. Commit with `docs:` or `chore:`.
6. Update progress only if the change completes a tracked task.

## Task Selection Rules

- Dependencies listed as "preferred" do not block selection.
- Hard dependencies must be complete before selection.
- Prefer `TASK-001` first because it creates the test/lint substrate.
- Do not skip a blocked task silently; mark `[!]` and explain the blocker in Run Log.
- Do not start broad multi-task implementation in one branch unless the task index explicitly says the task is a bundle.

## Commit And Merge Rules

- One task may have many commits.
- One commit equals one explainable behavior change.
- Do not squash away useful TDD history.
- Do not merge into `master` until the task is `[x]`-ready.
- If a task cannot complete in the current run, leave it `[~]` with a Run Log entry that says exactly how to resume.

## Final Output

Report:

- Task worked.
- Branch and merge status.
- Files changed.
- Commits created.
- Checks run.
- Progress status update.
- Remaining risks or blockers.
