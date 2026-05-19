# Autonomous Development Runbook

This runbook explains how to let Codex progress Mirabilis from the docs for long periods without relying on chat history.

## Persistent Sources Of Truth

- `AGENTS.md`: always-loaded project rules and short-command routing.
- `.agents/skills/mirabilis-dev-runner/SKILL.md`: the full autonomous development loop.
- `docs/implementation/task-index.md`: task definitions and acceptance criteria.
- `docs/implementation/progress.md`: task status ledger.
- `docs/testing/strategy.md`: local validation gates.
- `.codex/agents/*.toml`: auto-discovered focused custom agents.

## Human Command Surface

In Codex App, these short prompts are enough:

```text
继续开发
开发下一个 task
按 docs 开发
实现 TASK-018
无人值守继续
```

`AGENTS.md` requires Codex to load `mirabilis-dev-runner` for those prompts. If you want to be explicit, use:

```text
$mirabilis-dev-runner 继续开发
```

## One Task Loop

Each small task should go through:

```text
select next unblocked task from progress.md
mark task [~]
create feature branch or worktree
docs/deprecation research
test_writer writes failing tests
commit test red state
implementer writes minimal code
focused tests green
commit implementation
review agents
fix P0/P1
local gate
doc updates
mark task [x]
commit progress
merge to master
push branch and master
continue next task if autonomous mode is requested
```

## Recommended Automation Prompt

Use this for a Codex App project automation:

```text
$mirabilis-dev-runner

Run one autonomous Mirabilis development iteration.

Read AGENTS.md, docs/implementation/progress.md, docs/implementation/task-index.md, docs/implementation/agent-workflow.md, and docs/testing/strategy.md.

Pick the first unblocked [ ] task from docs/implementation/progress.md unless a [~] task exists. If a [~] task exists, resume it.

For software implementation tasks, follow the full TDD loop:
- mark [~]
- create/use a focused branch
- spawn docs_researcher and deprecation_auditor when APIs/tools may be version-sensitive
- spawn test_writer for failing tests
- commit tests
- spawn implementer for minimum implementation
- run focused tests
- spawn pr_explorer, reviewer, deprecation_auditor, security_reviewer, docs_researcher, test_quality_reviewer, and doc_writer
- fix P0/P1
- run the appropriate local gate
- update docs
- mark [x] only after merge to master
- commit and push

For config/docs-only tasks, use the light path from the skill.

If blocked, mark the task [!] with a Run Log entry explaining the blocker. Then stop if the blocker affects the roadmap order; otherwise continue to the next unblocked task.

Report only important results: task, branch, commits, checks, progress update, blockers.
```

## Scheduling

Use Codex App Automations for multi-day unattended work. Prefer:

- Execution environment: worktree.
- Cadence: hourly or every few hours.
- Prompt: the automation prompt above.
- Model: repo default `gpt-5.5`, `xhigh`, Fast mode from `.codex/config.toml`.

Worktree automations are safer for long runs because each run stays isolated from your local working tree.

## Stop Conditions

Stop and report instead of continuing when:

- A task requires an architectural decision not present in docs.
- Local checks fail for reasons unrelated to the current task.
- Git merge conflicts cannot be resolved confidently.
- Secrets, credentials, signing, paid API setup, or external accounts are required.
- The next task would require a destructive migration or irreversible filesystem operation.
