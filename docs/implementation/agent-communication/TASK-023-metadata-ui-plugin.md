# TASK-023 Agent Communication - Metadata UI Plugin

## Task

- Task ID: TASK-023.
- Task name: Implement Metadata UI Plugin.
- Branch: `feat/task-023-metadata-ui-plugin`.
- Parent role: orchestration only.
- Started: 2026-05-21 21:32 CST.

## Source Docs Read By Parent

- `.codex/skills/mirabilis-dev-runner/SKILL.md`.
- `docs/implementation/progress.md`.
- `docs/implementation/task-index.md#task-023-implement-metadata-ui-plugin`.
- `docs/product/04-editor-and-workflows.md#14-metadata-图形化展示`.
- `docs/development/02-implementation-roadmap-and-constraints.md#phase-4metadata-ui`.
- `docs/development/01-data-roadmap-and-mvp.md#phase-4metadata-ui-plugin`.
- `docs/product/03-plugin-platform.md#94-metadata-registry`.
- Related `page.header.metadata` slot references in `docs/product/06-view-slots.md`, `docs/architecture/04-slots-editor-task.md`, `docs/architecture/05-plugin-implementations.md`, and existing TASK-021/TASK-022 docs.

## Initial Scope

- Implement the first unified Metadata UI Plugin slice after Task, Tag, and Filter foundations.
- Acceptance criteria:
  - `page.header.metadata` slot renders plugin-contributed metadata fields.
  - Task, Tag, and Timer placeholder fields can contribute display/edit components.
  - Field editors update metadata through command/service boundaries.
  - Metadata UI remains plugin-driven.
- Test plan from task index:
  - Component tests for metadata bar rendering and editing.
  - Slot ordering tests.

## Initial Out Of Scope

- Native/Tauri/package changes.
- Persistence/schema rewiring.
- Broad rich-editor migration.
- Automatic save-time scanning/indexing.
- Timer runtime behavior beyond placeholder field contribution.
- Calendar, Habit, Stats, ML, AI, Sync, or release behavior.
- Core business behavior beyond generic plugin metadata UI and slot primitives.

## Known Risks For Agents

- Current `metadataFields` are manifest descriptors; renderer/editor runtime contracts may need a narrow generic bridge without pretending all future metadata registry features are done.
- TASK-021 already has a narrow Tag Plugin `page.header.metadata` slot contribution; TASK-023 should either compose with it or define a migration path without regressing tag add/remove behavior.
- TASK-022 added metadata owner reservations from manifest fields; Metadata UI edits must preserve plugin ownership and command/service boundaries.
- Timer fields are placeholders only at this stage unless agents identify a documented acceptance dependency.
- The UI must remain plugin-driven and must not hard-code Task/Tag/Timer business behavior into Core.

## Parent Start Decision

- Select TASK-023 because it is the first unblocked `[ ]` task after TASK-022 completed and merged.
- Start from `master` at final TASK-022 progress commit `5ab2471`.
- Use branch `feat/task-023-metadata-ui-plugin`.
- Delegate planning, current-doc guidance, deprecation/API review, security review, tests, implementation, review, and docs sync to agents.

## Agent/Config Validation

- `.codex/agents/*.toml` parsed successfully with 11 files.
- `codex --strict-config doctor --summary --ascii` reported configuration/auth/MCP/network/WebSocket/reachability OK.
- Non-blocking notes: unrestricted sandbox/network, known `TERM=dumb` terminal failure, and available Codex update.

## Current Next Action

- Boyle (`planner`), Pasteur (`docs_researcher`), Curie (`deprecation_auditor`), and Sartre (`security_reviewer`) are running read-only pre-test guidance.
