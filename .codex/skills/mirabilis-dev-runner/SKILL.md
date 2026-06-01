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

1. Validate `.codex/agents/*.toml` parses as TOML and that specialized agents can spawn. If agent types are unavailable, stop and debug configuration before coding.
2. Mark the task `[~]` in `docs/implementation/progress.md` and add a Run Log entry.
3. Ensure work starts from `master`, pull latest, then create or switch to a focused branch named `feat/<task-id>-<slug>`, `fix/<task-id>-<slug>`, `test/<task-id>-<slug>`, or `docs/<task-id>-<slug>`. Use the existing repository checkout by default; do not create sibling `../mirabilis-task-*` worktrees unless the user explicitly asks for worktree isolation.
4. Spawn `docs_researcher` and `deprecation_auditor` for current official docs when the task touches Tauri, React, Rust crates, Vite, Vitest, Testing Library, IPC, filesystem, permissions, or dependencies.
5. Spawn `test_writer` to write failing tests first. It must not write production code. Wait for its result before proceeding.
6. Run the focused failing-test command and confirm it fails for the expected reason.
7. Commit tests with `<agent-name>(test)(<task name>): add <feature> acceptance tests`.
8. Spawn `implementer` to write minimum production code. Wait for its result before taking over implementation work.
9. Run focused tests until green.
10. Commit implementation with `<agent-name>(implementation)(<task name>): implement <feature>` or the appropriate category.
11. Refactor only if needed, without behavior changes, and commit separately.
12. Spawn review agents in parallel: `pr_explorer`, `reviewer`, `deprecation_auditor`, `security_reviewer`, `docs_researcher`, `test_quality_reviewer`, and `doc_writer`.
13. Fix P0/P1 findings. Commit fixes and docs separately.
14. Run the local gate from `docs/testing/strategy.md`; use `check:quick` once available and `check:full` for IPC, permissions, filesystem, persistence, packaging, or release changes.
15. Update `docs/implementation/progress.md`: change `[~]` to `[x]`, add branch, commits, checks, and risks to Run Log.
16. Commit progress update.
17. Push happens through `.githooks/post-commit`; verify the push did not fail.
18. Merge the task branch into `master` after local checks pass, then push `master`.
19. If the user asked for autonomous roadmap progress, continue to the next unblocked `[ ]` task.

The parent thread is the orchestrator. It should delegate role work to agents, wait for blocking agent results, integrate outputs, validate, commit, and merge. It must not perform a delegated test-writing, implementation, or review step itself unless the assigned agent failed, became unavailable, wrote in the wrong branch/path, or was explicitly cancelled to protect the repository checkout, and that fallback reason is recorded first.

The parent thread cannot see a child agent's live, non-file streaming output. A `wait_agent` timeout only means no final status was returned to the parent in that wait window; it is not an agent status and must not be used to infer that the agent is idle, failed, output-free, or safe to replace.

## Mandatory Blocking-Agent Wait Protocol

Apply this protocol every time a spawned agent owns a blocking role such as planning, docs research, TDD tests, implementation, review, docs writing, or release checking:

1. Put the agent in "waiting for final status" state in the parent plan or agent-communication note.
2. Use the available wait tool in repeatable wait windows. If it times out, treat the result only as "no final status yet" and keep waiting.
3. Do not infer agent health from silence, elapsed time, a wait timeout, or partial file edits. Partial edits are not final deliverables.
4. If the run is unusually long, send exactly one concise queued status request: ask the agent to report a blocker/final failure or continue working until finished. After that, resume waiting; do not repeatedly ping.
5. Integrate the work, commit it, or move to a dependent step only after the child agent returns completion notification/final status.
6. Stop, replace, close, or take over the delegated role only if the agent reports a blocker/final failure, becomes unavailable, writes in the wrong branch or path, or must be cancelled to protect the repository checkout.
7. Before any stop, replacement, close, or takeover, record the concrete reason in `docs/implementation/agent-communication/status.md` and the task-specific communication file. Without that recorded reason, the required action is to keep waiting.

Every blocking child-agent prompt should include: "Return a final status when done or blocked. If asked for status before completion, either report a concrete blocker/final failure or continue working until finished."

If a worktree was explicitly created, remove/prune it after the task is merged so Git branches and commits remain the only durable version-management surface.

Persist agent coordination under `docs/implementation/agent-communication/`:

- Keep `docs/implementation/agent-communication/status.md` as the single live orchestration status document.
- Keep one task-specific communication file per active task, named from the task ID and slug.
- Summarize each agent's role, nickname, status, files changed, checks run, recommendations, parent decision, and next action.
- Keep `docs/implementation/progress.md` for durable roadmap status; use agent communication files for in-flight coordination and decisions.

## Light Path For Config Or Docs Only

Use this path for Codex config, AGENTS.md, agent TOML, hooks, workflow docs, or task-index/progress updates:

1. Read official Codex docs when config behavior is involved.
2. Patch only docs/config/hook files.
3. Validate TOML, shell syntax, specialized agent spawn health, and `codex --strict-config doctor --summary --ascii` when relevant.
4. Run `bun run build` only if repo behavior may have been touched.
5. Commit with `<agent-name>(docs)(<topic>): <specific change>` or `<agent-name>(chore)(<topic>): <specific change>`.
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
- Commit messages must use `<agent-name>(<category>)(<task name>): <specific change>`.
- Use the human-readable task name from `docs/implementation/task-index.md`, not only the task ID.
- Use the spawned agent nickname when an agent produced the patch; use `Codex(<category>)(<task name or topic>)` only for parent-thread commits.
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
