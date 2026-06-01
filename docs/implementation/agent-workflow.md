# Agent Workflow

This workflow is optimized for the current Mirabilis agent-development phase: all project agents have full access, human review is skipped, and local checks are the gate.

## Official Codex Patterns Used

- Project rules live in `AGENTS.md`.
- Project-scoped custom agents live as standalone TOML files in `.codex/agents/` and are auto-discovered by Codex.
- Do not duplicate standalone agents with `[agents.<name>] config_file = ...` entries in `.codex/config.toml`; keep `.codex/config.toml` to global defaults and `[agents]` limits.
- Each custom agent is narrow and opinionated.
- Subagents are used only when the parent prompt explicitly asks to spawn them.
- Global subagent limits live under `[agents]` in `.codex/config.toml`.
- Hooks and deterministic scripts are used for local automation where they reduce repeated work.
- The default model/service profile for this repo is `gpt-5.5`, `model_reasoning_effort = "xhigh"`, and `service_tier = "fast"` with `[features].fast_mode = true`.
- Before relying on project agents, validate that `.codex/agents/*.toml` files parse as TOML. Duplicate keys such as two `sandbox_mode` entries can make specialized agent types unavailable even when `default` agents still spawn.

Reference docs:

- [Codex subagents](https://developers.openai.com/codex/subagents)
- [Codex best practices](https://developers.openai.com/codex/learn/best-practices)
- [Codex hooks](https://developers.openai.com/codex/hooks)
- [Codex skills](https://developers.openai.com/codex/skills)

## Agents

| Agent | Responsibility |
| --- | --- |
| `planner` | Split docs into milestones, tasks, dependencies, acceptance criteria, risks, and unknowns. |
| `docs_researcher` | Verify current official docs for Tauri, React, Rust crates, Vite, Vitest, testing, and Codex workflows. |
| `test_writer` | TDD: write failing tests first and avoid production code. |
| `implementer` | Write the minimum production code needed to pass focused tests. |
| `reviewer` | Find correctness, regression, edge-case, and missing-test risks. |
| `deprecation_auditor` | Find deprecated APIs, stale patterns, and migration risks. |
| `security_reviewer` | Review Tauri permissions, filesystem, IPC, SQLite, and plugin boundaries. |
| `doc_writer` | Update user docs, developer docs, architecture docs, ADRs, API/IPC docs, and security notes. |
| `release_checker` | Verify local release readiness before merging to `master`. |
| `pr_explorer` | Map changed paths and gather evidence for review. |
| `test_quality_reviewer` | Verify tests are meaningful, behavior-focused, and not implementation-coupled. |

## Short Commands

The durable trigger for this workflow is the repo skill:

```text
.codex/skills/mirabilis-dev-runner/SKILL.md
```

`AGENTS.md` requires Codex to use that skill whenever the user asks to develop, continue, run the roadmap, implement `TASK-xxx`, or work unattended. This means the user can type short commands such as:

```text
开发下一个 task
继续开发
按 docs 开发
实现 TASK-018
无人值守继续
```

The main Codex thread should then load `mirabilis-dev-runner`, read `docs/implementation/progress.md`, select the next task, and follow the task loop below.

For explicit invocation, type:

```text
$mirabilis-dev-runner 继续开发下一个 unblocked task
```

## Agent Discovery And Model Defaults

Codex discovers the project agents from these standalone files:

```text
.codex/agents/planner.toml
.codex/agents/docs-researcher.toml
.codex/agents/test-writer.toml
.codex/agents/implementer.toml
.codex/agents/reviewer.toml
.codex/agents/deprecation-auditor.toml
.codex/agents/security-reviewer.toml
.codex/agents/doc-writer.toml
.codex/agents/release-checker.toml
.codex/agents/pr-explorer.toml
.codex/agents/test-quality-reviewer.toml
```

Each file defines its own `name`, `description`, and `developer_instructions`. The `name` field is the spawn name; the filename is only the storage location.

Each project agent is configured with:

```toml
model = "gpt-5.5"
model_reasoning_effort = "xhigh"
service_tier = "fast"
sandbox_mode = "danger-full-access"
approval_policy = "never"
web_search = "live"
```

## Parent Orchestration Contract

The main Codex thread is the parent orchestration agent. Its job is to route work, not to perform every role itself.

- Delegate planning, docs research, TDD tests, implementation, review, security, docs, and release checks to the corresponding project agents.
- Give each agent a concrete prompt with worktree path, task ID, write scope, read-only/write permission, expected checks, and exact output format.
- After spawning an agent that owns a blocking step, wait for that agent or use `send_input` to clarify. Do not implement the same step in the parent thread while the delegated agent owns it.
- The parent thread cannot see a child agent's live, non-file streaming output. A `wait_agent` timeout is only a parent-side wait-window expiry, not evidence that the child agent is idle, failed, or done producing useful work.
- Do not assume a quiet agent has stopped. For a long-running blocking step, wait for the completion notification/final status; if the wait exceeds the expected window, send exactly one short queued status request such as "report blocked or keep working, and return when finished", then keep waiting.
- Treat partial file edits by a child agent as in-progress evidence only. Do not integrate, commit, or build on them as final work until the child agent returns final status.
- When steps depend on each other, make the dependency explicit: for example, `implementer` starts only after `test_writer` reports the failing test files and expected failure.
- Stop, replace, close, or take over an agent only when it reports a blocker/final failure, becomes unavailable, writes in the wrong branch/path, or must be cancelled to protect the task. Record the concrete reason in `docs/implementation/agent-communication/status.md` and the task-specific communication file before taking that action.
- Keep the parent thread responsible for integration: review changed files, run checks, stage focused commits, update progress, merge, and report.

## Agent Communication State

Agent outputs must not live only in chat. Persist the parts needed for orchestration in `docs/implementation/agent-communication/`.

- `docs/implementation/agent-communication/status.md` is the single live status document for current orchestration state.
- Each active task gets one task-specific note file, for example `docs/implementation/agent-communication/TASK-002-core-domain-types.md`.
- Record agent nickname, role, status, write scope, files changed, checks run, recommendations, parent decision, and next action.
- When an agent is quiet, record whether the parent is waiting, has sent a status ping, or has stopped/replaced it. Do not mark silence as failure until the wait-and-ping sequence has happened.
- Keep full transcripts out of these files. Write concise summaries and decisions.
- `docs/implementation/progress.md` tracks durable roadmap completion; agent communication files track in-flight coordination and why decisions were made.

## Branch Flow

`master` is the integration branch for this repository. Treat any prompt that says `main` as `master`.

Use one focused Git branch per task in the repository checkout by default. Do not create sibling `../mirabilis-task-*` worktree directories unless the user explicitly asks for worktree isolation. If a worktree is explicitly used, remove/prune it after merge so Git remains the only durable version-management surface.

```bash
git switch master
git pull
git switch -c feat/task-014-project-creation
```

Branch naming:

```text
feat/<milestone>-<feature>
fix/<issue>
test/<feature>
docs/<topic>
```

## Auto Push

The repository uses `.githooks/post-commit` to push every branch after each commit:

```bash
git config core.hooksPath .githooks
```

The hook runs:

```bash
git push -u origin <current-branch>
```

Temporary opt-out for one shell:

```bash
MIRABILIS_AUTO_PUSH=0 git commit -m "..."
```

Use `MIRABILIS_AUTO_PUSH_REMOTE=<remote>` to push somewhere other than `origin`.

## Autonomous Mode

For multi-day development, prefer Codex App Automations on a focused project branch. Each run should be durable and restartable:

- Read `AGENTS.md`.
- Activate `$mirabilis-dev-runner`.
- Read `docs/implementation/progress.md`.
- Pick the next unblocked `[ ]` task.
- Mark it `[~]`.
- Complete the task through TDD, implementation, review, local gate, commits, merge, push.
- Mark it `[x]` only after merge to `master`.
- If blocked, mark `[!]` with a Run Log entry and continue only when the blocker is isolated.

Use a recurring automation rather than one enormous continuous turn. Use worktree automation only when the user explicitly asks for that isolation; prune it after merge.

## Task Planning Prompt

```text
Read docs/product and docs/architecture.
Do not write implementation code.
Spawn planner and docs_researcher.
Goal: Convert the development documentation into an implementation task index.
Output:
- milestones
- task list
- dependencies between tasks
- acceptance criteria per task
- recommended test type per task
- risks and unknowns
- which docs need to be verified before implementation
Constraints:
- Each task must be small enough for one focused branch.
- Do not invent architecture beyond the provided docs.
- If the docs are ambiguous, mark ambiguity instead of deciding silently.
```

## Per-Task Docs Research Prompt

```text
Spawn docs_researcher and deprecation_auditor.
Task: <TASK-ID> from docs/implementation/task-index.md.
Check:
- Tauri command/API usage
- React version-specific patterns
- Vite/Vitest config
- Rust crate APIs involved
- Tauri permission/capability implications
Do not modify files.
Output:
- relevant docs
- version-specific notes
- deprecated or risky APIs
- recommendations for test_writer and implementer
```

## TDD Prompt

```text
Spawn test_writer.
Task: <TASK-ID> from docs/implementation/task-index.md.
Goal: Write the minimal failing tests for the acceptance criteria.
Rules:
- Do not implement production code.
- Do not change architecture.
- Do not weaken existing tests.
- Prefer behavior tests over implementation tests.
- After writing tests, run the most focused test command.
- Confirm the tests fail for the expected reason.
Output:
- test files changed
- acceptance criteria covered
- command run
- failing output summary
- criteria not yet covered and why
```

Commit after the expected red test:

```bash
git add .
git commit -m "<test-agent-name>(test)(<task name>): add <feature> acceptance tests"
```

## Implementation Prompt

```text
Spawn implementer.
Task: Make the tests added in the previous commit pass.
Rules:
- Read AGENTS.md.
- Read the assigned task.
- Read the failing tests.
- Implement the minimum production code required.
- Do not edit tests unless there is a clear error in the test; if so, explain first.
- Do not add unrelated refactors.
- Do not invent architecture beyond docs/architecture.
- Run focused tests after implementation.
```

Commit after green focused tests:

```bash
git add .
git commit -m "<implementer-agent-name>(implementation)(<task name>): implement <feature>"
```

## Review Prompt

```text
Review this branch against master.
Spawn in parallel:
1. pr_explorer
2. reviewer
3. deprecation_auditor
4. security_reviewer
5. docs_researcher
6. test_quality_reviewer
7. doc_writer
Rules:
- pr_explorer, reviewer, deprecation_auditor, security_reviewer, docs_researcher, and test_quality_reviewer are read-only unless explicitly asked to patch.
- doc_writer may update docs only.
- Do not modify implementation code.
- Wait for all agents' completion notifications or final statuses. A `wait_agent` timeout is not completion, failure, or permission for the parent to take over.
- If an agent is unusually long-running, send exactly one queued status request asking it to report a blocker/final failure or continue until finished, then keep waiting.
- Deduplicate findings.
- Group findings by severity.
- Provide fix plan before applying fixes.
```

Severity handling:

```text
P0/P1: fix before merge.
P2: fix in this branch or create follow-up task.
P3: optional, document if useful.
```

## Local Gate

Baseline gate:

```bash
bun run build
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --all-features
```

Target gate after scripts exist:

```bash
bun run check:quick
```

Run the full gate for Tauri IPC, permission, filesystem, persistence, packaging, or release changes:

```bash
bun run check:full
```

## Commit Shape

Commit messages must identify the producing agent, work category, human-readable task name, and concrete change:

```text
<agent-name>(<category>)(<task name>): <specific change>
```

Use the spawned agent nickname when an agent produced the patch. If no nickname is available, use the role name such as `test_writer`, `implementer`, or `doc_writer`. Use `Codex(<category>)(<task name or topic>)` only for parent-thread orchestration, progress, merge, or docs/config-only commits made directly by the parent.

Use the task name from `docs/implementation/task-index.md`, for example `Create TypeScript core domain types`, instead of relying on `TASK-002` alone.

Good history:

```text
Plato(test)(Create project command): add project creation acceptance tests
Newton(implementation)(Create project command): implement command and UI flow
Curie(refactor)(Create project command): simplify validation
Hooke(docs)(Create project command): document IPC contract
Turing(review-fix)(Create project command): address review findings
Codex(progress)(Create project command): mark task complete
```

Bad history:

```text
feat: implement everything
fix: address review findings
```
