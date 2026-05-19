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
- When steps depend on each other, make the dependency explicit: for example, `implementer` starts only after `test_writer` reports the failing test files and expected failure.
- If an agent becomes unavailable, hangs without output, or writes in the wrong worktree, stop the agent, clean the unintended changes, record the failure, and debug agent configuration before falling back to parent-thread work.
- Keep the parent thread responsible for integration: review changed files, run checks, stage focused commits, update progress, merge, and report.

## Branch Flow

`master` is the integration branch for this repository. Treat any prompt that says `main` as `master`.

```bash
git switch master
git pull
git worktree add ../mirabilis-task-014 -b feat/task-014-project-creation
cd ../mirabilis-task-014
codex
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

For multi-day development, prefer Codex App Automations with a project worktree. Each run should be durable and restartable:

- Read `AGENTS.md`.
- Activate `$mirabilis-dev-runner`.
- Read `docs/implementation/progress.md`.
- Pick the next unblocked `[ ]` task.
- Mark it `[~]`.
- Complete the task through TDD, implementation, review, local gate, commits, merge, push.
- Mark it `[x]` only after merge to `master`.
- If blocked, mark `[!]` with a Run Log entry and continue only when the blocker is isolated.

Use a recurring automation rather than one enormous continuous turn. Codex App automations can run in the background, and Git repositories can use worktrees so automation changes stay separate from local edits.

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
git commit -m "test: add <feature> acceptance tests"
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
git commit -m "feat: implement <feature>"
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
- Wait for all agents.
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

Good history:

```text
test: add failing tests for project creation
feat: implement project creation command and UI flow
refactor: simplify project creation validation
docs: document project creation IPC contract
fix: address review findings for project creation
```

Bad history:

```text
feat: implement everything
```
