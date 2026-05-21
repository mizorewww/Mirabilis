# Agent Communication Status

Last updated: 2026-05-21 09:15 CST.

## Current Task

- Task: TASK-017 - Add stable block IDs and markdown import/export.
- Branch: `feat/task-017-stable-block-ids-markdown-import-export`.
- Worktree: `/home/aac6fef/Developer/Mirabilis`.
- Parent role: orchestration only.
- Current phase: read-only pre-test guidance agents running.

## Active Agents

- James the 3rd (`planner`): read-only TASK-017 scope and plan.
- Carver the 3rd (`docs_researcher`): read-only current-doc guidance.
- Mill the 3rd (`deprecation_auditor`): read-only API/deprecation audit.
- Gauss the 3rd (`security_reviewer`): read-only security boundary review.

## Current TASK-017 State

- TASK-017 follows TASK-016 and owns the previously deferred stable block ID plus Markdown import/export behavior.
- Acceptance criteria from `docs/implementation/task-index.md`:
  - Every structured block has a stable `blockId`.
  - Markdown import creates structured documents with block IDs.
  - Markdown export preserves user-visible content.
  - Editing existing blocks does not unnecessarily replace block IDs.
- Initial parent interpretation:
  - Prefer a focused TypeScript core/editor conversion layer unless agents identify a strict need for richer editor dependencies.
  - Preserve user-visible Markdown text on round trip.
  - Keep Task Plugin semantics, checkbox events, tag indexing, page-link navigation, `@date`, autocomplete, slash menu, and rich editor behavior out of scope unless agents find a hard acceptance dependency.
  - Avoid new Tauri commands/capabilities and filesystem permissions unless agents identify a TASK-017-specific requirement.
- Agent/config checks passed for orchestration start: 11 agent TOML files parsed; `codex doctor` OK except the known `TERM=dumb` terminal note.

## Completed TASK-017 Agent Outcomes

- None yet. Pre-test guidance agents are running.

## Validation Already Reported By Parent

- TASK-017 has not yet produced tests or implementation.
- Agent/config validation for start:

```bash
python - <<'PY'
import glob, tomllib
paths = sorted(glob.glob('.codex/agents/*.toml'))
for path in paths:
    with open(path, 'rb') as f:
        tomllib.load(f)
print(f'parsed {len(paths)} agent toml files')
PY

codex --strict-config doctor --summary --ascii
```

## Next Actions

1. Wait for read-only pre-test guidance agents.
2. Summarize their guidance in this file and the TASK-017 communication file.
3. Delegate failing acceptance tests to `test_writer`.
