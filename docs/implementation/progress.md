# Implementation Progress

This file is the durable progress ledger for the Mirabilis roadmap. Agents must update it after every task transition so work can resume after history compaction, app restart, or scheduled automation runs.

Status markers:

- `[ ]` not started.
- `[~]` in progress.
- `[x]` complete and merged to `master`.
- `[!]` blocked and needs user input or a prerequisite not represented in the task index.

## Current Mode

- Mode: autonomous task-by-task development.
- Canonical branch: `master`.
- Task source: `docs/implementation/task-index.md`.
- Workflow source: `.agents/skills/mirabilis-dev-runner/SKILL.md`.
- Selection rule: choose the first `[ ]` task whose dependencies are `[x]` or only "preferred".
- Completion rule: all acceptance criteria met, focused tests pass, local gate appropriate to the change passes, P0/P1 findings fixed, task branch merged to `master`, and task line changed to `[x]`.

## Milestone M0: Agent and test substrate

- [ ] TASK-001: Establish local check scripts and test dependencies

## Milestone M1: Core data kernel

- [ ] TASK-002: Create TypeScript core domain types
- [ ] TASK-003: Add in-memory Page Store
- [ ] TASK-004: Add in-memory Metadata Store
- [ ] TASK-005: Add in-memory Event Store
- [ ] TASK-006: Add Filter Store and Query AST baseline
- [ ] TASK-007: Add Command Registry and Command Bus
- [ ] TASK-008: Add View Registry and Slot Registry
- [ ] TASK-009: Add Transaction Manager and Core Runtime composition

## Milestone M2: Native persistence boundary

- [ ] TASK-010: Define Plugin API contracts
- [ ] TASK-011: Implement Plugin Host lifecycle
- [ ] TASK-012: Add NativeBridge TypeScript boundary
- [ ] TASK-013: Add SQLite schema and Rust repositories
- [ ] TASK-014: Expose Tauri IPC commands for core persistence
- [ ] TASK-015: Build app bootstrap and runtime provider

## Milestone M3: Editor and plugin runtime

- [ ] TASK-016: Implement Markdown Editor Plugin shell
- [ ] TASK-017: Add stable block IDs and markdown import/export

## Milestone M4: Task and tag MVP

- [ ] TASK-018: Implement Task Plugin syntax and task page creation
- [ ] TASK-019: Implement task navigation and infinite nesting
- [ ] TASK-020: Implement checkbox toggle and task events
- [ ] TASK-021: Implement Tag Plugin baseline
- [ ] TASK-022: Implement All Tasks and Today filters

## Milestone M5: Metadata and timer loop

- [ ] TASK-023: Implement Metadata UI Plugin
- [ ] TASK-024: Implement Timer Plugin start/stop/pause/resume/switch
- [ ] TASK-025: Implement Time Segment and Time Segment Note

## Milestone M6: Calendar and reporting

- [ ] TASK-026: Implement Calendar Plugin baseline
- [ ] TASK-027: Implement Habit and Heatmap plugins
- [ ] TASK-028: Implement Stats and Chart plugins

## Milestone M7: Capture, search, ML, AI, sync, release

- [ ] TASK-029: Implement Quick Capture and Search plugins
- [ ] TASK-030: Implement ML Plugin baseline predictions
- [ ] TASK-031: Implement AI Plugin provider abstraction
- [ ] TASK-032: Implement Sync Plugin skeleton
- [ ] TASK-033: Add release packaging and local full gate

## Run Log

Add newest entries at the top.
