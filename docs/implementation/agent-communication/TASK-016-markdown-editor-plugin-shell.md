# TASK-016 Agent Communication - Markdown Editor Plugin Shell

## Task

- Task ID: TASK-016.
- Task name: Implement Markdown Editor Plugin shell.
- Branch: `feat/task-016-markdown-editor-plugin-shell`.
- Worktree: `/home/aac6fef/Developer/Mirabilis`.
- Parent role: orchestration only.

## Source Docs

- `docs/product/04-editor-and-workflows.md#12-markdown-first-编辑器`.
- `docs/architecture/04-slots-editor-task.md#8-markdown-editor-plugin`.
- `docs/implementation/task-index.md#task-016-implement-markdown-editor-plugin-shell`.
- `docs/testing/strategy.md`.

## Acceptance Criteria

- Markdown Editor Plugin registers a page editor view, insert text command, and mobile toolbar slot.
- Editor supports heading, paragraph, list, task syntax text, tag text, and page-link text at baseline.
- Documents save and reopen through Core/NativeBridge.
- Editor collects markdown extensions from runtime.

## Initial Parent Interpretation

- TASK-016 should introduce the first editor plugin shell, not the Task Plugin or full rich editor system.
- The editor must integrate through the existing Plugin Host context, View Registry, Command Registry, Slot Registry, and TASK-015 runtime/provider boundaries.
- Baseline markdown support can be textual and user-visible first; task/tag/page-link semantics remain plugin extension points unless agents find current-doc minimum behavior.
- Save/reopen should use the existing Core/runtime/native boundary from prior tasks without adding new Tauri commands or capabilities unless agents identify a strict requirement.
- The parent thread remains orchestration-only; tests, implementation, docs, and review work will be delegated.

## Agent/Config Checks

- `.codex/agents/*.toml` parsed successfully with 11 agent config files.
- `codex --strict-config doctor --summary --ascii` reported configuration/auth/MCP/network/WebSocket/reachability OK, plus the known desktop-terminal `TERM=dumb` failure. Parent treats this as non-blocking for repository agent work.

## Current Status

- Status: pre-test guidance handoff.
- Active agents: none.
- Next parent step: spawn read-only planner, docs/current-guidance, deprecation/API, and security-boundary agents before red tests.

## Agent Handoffs

### Pre-test Guidance Round

- Status: pending.
- Planned agents:
  - `planner` for TASK-016 scope, design slices, test split, dependencies, and risks.
  - `docs_researcher` for current Tiptap/ProseMirror/React integration guidance if an editor framework is selected, plus local-doc alignment.
  - `deprecation_auditor` for React/editor-library/Vite/Vitest/API risks.
  - `security_reviewer` for plugin boundary, editor input handling, persistence/native exposure, and command/slot/view registration boundaries.
