# TASK-021 Agent Communication - Tag Plugin Baseline

## Task

- Task ID: TASK-021.
- Task name: Implement Tag Plugin baseline.
- Branch: `feat/task-021-tag-plugin-baseline`.
- Parent role: orchestration only.
- Started: 2026-05-21 15:27 CST.

## Source Docs Read By Parent

- `.codex/skills/mirabilis-dev-runner/SKILL.md`.
- `docs/implementation/progress.md`.
- `docs/implementation/task-index.md#task-021-implement-tag-plugin-baseline`.
- `docs/product/05-built-in-plugins.md#15-tag-plugin`.
- `docs/product/04-editor-and-workflows.md#12-markdown-first-编辑器`.
- `docs/architecture/04-slots-editor-task.md` metadata bar / Tag Plugin notes.
- `docs/product/03-plugin-platform.md#94-metadata-field-registry`.
- Related Tag references in `docs/architecture/06-filter-native-database.md`, `docs/development/01-data-roadmap-and-mvp.md`, and `docs/development/02-implementation-roadmap-and-constraints.md`.

## Initial Scope

- Implement the first Tag Plugin baseline after the Markdown editor and Task Plugin foundation.
- Acceptance criteria:
  - `#tag` text is recognized as tag metadata.
  - Tags render in metadata bar through slot contribution.
  - Tag picker can add/remove tags through commands.
  - Tag filters can query pages by tag.
- Test plan from task index:
  - Plugin tests for tag extraction and metadata updates.
  - UI tests for tag display and editing.

## Initial Out Of Scope

- Rich editor autocomplete or token UI.
- Date token or page-link semantic behavior.
- Task save-time scanning/indexing beyond what agents identify as required for tag recognition.
- All Tasks / Today task views.
- Timer, Calendar, Habit, Stats, ML, or AI tag aggregation.
- Native/Tauri commands, permissions, filesystem behavior, package/Cargo dependencies, broad persistence/schema changes, packaging, or release work.

## Known Risks For Agents

- Product docs describe both Markdown `#tag` recognition and tag picker behavior, but existing Markdown editor currently treats tag text as inert Markdown text.
- Metadata field UI renderer/editor capabilities may be partially future-facing; agents should map the current slot/view/metadata APIs before choosing the narrow TASK-021 surface.
- Tag filters should use existing Filter Store / Query AST primitives from TASK-006 where possible; avoid creating business logic in Core.
- If tag extraction happens from Markdown source, agents must define whether it is command-driven, save/load driven, or explicit UI-driven for this baseline and test the selected contract.
- Keep unsafe tag text inert; do not render Markdown/HTML from user tag input.

## Parent Start Decision

- Select TASK-021 because it is the first unblocked `[ ]` task after TASK-020 completed and merged.
- Start from `master` at merge commit `c42fa5f`.
- Use branch `feat/task-021-tag-plugin-baseline`.
- Delegate planning, current-doc guidance, deprecation/API review, security review, tests, implementation, review, and docs sync to agents.

## Agent/Config Validation

- `.codex/agents/*.toml` parsed successfully with 11 files.
- `codex --strict-config doctor --summary --ascii` reported configuration/auth/MCP/network/WebSocket/reachability OK.
- Non-blocking notes: unrestricted sandbox/network, known `TERM=dumb` terminal failure, and available Codex update.

## Current Next Action

- Commit TASK-021 start orchestration state, then spawn pre-test planning/current-doc/API/security agents.
