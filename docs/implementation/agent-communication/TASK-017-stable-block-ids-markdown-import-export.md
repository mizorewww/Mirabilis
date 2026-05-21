# TASK-017 Agent Communication - Stable Block IDs And Markdown Import/Export

## Task

- Task ID: TASK-017.
- Task name: Add stable block IDs and markdown import/export.
- Branch: `feat/task-017-stable-block-ids-markdown-import-export`.
- Worktree: `/home/aac6fef/Developer/Mirabilis`.
- Parent role: orchestration only.

## Source Docs

- `docs/architecture/02-core-kernel.md#41-markdown-page-store`.
- `docs/architecture/04-slots-editor-task.md#92-task-syntax`.
- `docs/implementation/task-index.md#task-017-add-stable-block-ids-and-markdown-importexport`.
- `docs/testing/strategy.md`.

## Acceptance Criteria

- Every structured block has a stable `blockId`.
- Markdown import creates structured documents with block IDs.
- Markdown export preserves user-visible content.
- Editing existing blocks does not unnecessarily replace block IDs.

## Initial Parent Interpretation

- TASK-017 should add stable block identity and Markdown conversion behavior after the TASK-016 textarea shell.
- Prefer a focused TypeScript core/editor conversion layer unless agents identify a strict need for a richer editor dependency.
- Markdown import/export should preserve user-visible Markdown content on round trip.
- Existing block IDs should be retained when an edit can be matched to the prior block identity.
- Task Plugin semantics, checkbox events, tag indexing, page-link navigation, `@date`, autocomplete, slash menu, sync, packaging, and rich editor migration remain out of scope unless agents find a hard acceptance dependency.
- New Tauri commands/capabilities, filesystem permissions, Rust changes, package dependencies, and native import/export behavior should not be added unless agents identify a TASK-017-specific requirement.
- The parent thread remains orchestration-only; tests, implementation, docs, and review work will be delegated.

## Agent/Config Checks

- `.codex/agents/*.toml` parsed successfully with 11 agent config files.
- `codex --strict-config doctor --summary --ascii` reported configuration/auth/MCP/network/WebSocket/reachability OK, plus the known desktop-terminal `TERM=dumb` failure. Parent treats this as non-blocking for repository agent work.

## Current Status

- Status: read-only pre-test guidance agents running.
- Active agents:
  - James the 3rd (`planner`): scope, design slices, test plan, implementation guidance, and risks.
  - Carver the 3rd (`docs_researcher`): current official docs guidance for Markdown conversion and test tooling.
  - Mill the 3rd (`deprecation_auditor`): API/dependency/deprecation risk audit.
  - Gauss the 3rd (`security_reviewer`): Markdown import/export and boundary security review.
- Completed agents: none.
- Next parent step: wait for guidance, summarize outcomes, and commit parent decisions before `test_writer`.

## Agent Handoffs

### Pre-test Guidance Round

- Status: running.
- Agents:
  - James the 3rd (`planner`): read-only scope, design slices, tests, dependencies, and risks.
  - Carver the 3rd (`docs_researcher`): read-only current official docs guidance for Markdown parsing/export choices and current React/Vitest/editor testing guidance if needed.
  - Mill the 3rd (`deprecation_auditor`): read-only API/dependency/deprecation risk audit for any proposed Markdown parsing/editor library path.
  - Gauss the 3rd (`security_reviewer`): read-only Markdown import/export and structured document security boundary review.

## Parent Decisions

- None yet. Parent will record decisions after pre-test guidance returns.

## Validation

- Start gate only:

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

## Risks And Open Questions

- Need agents to determine whether current `StructuredMarkdownDocument` / `DocumentBlock` shape is sufficient for import/export, or whether a small helper module is needed.
- Need tests to define how stable block IDs are retained across edits, insertions, deletions, duplicate text, task syntax blocks, and blank lines.
- Need security guidance for Markdown raw HTML, links, data URLs, body size, depth, and malformed structured document input.
