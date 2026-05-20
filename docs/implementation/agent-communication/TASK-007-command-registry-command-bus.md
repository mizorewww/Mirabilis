# TASK-007 Agent Communication - Command Registry and Command Bus

## Task

- Task ID: TASK-007.
- Task name: Add Command Registry and Command Bus.
- Branch: `feat/task-007-command-registry-command-bus`.
- Worktree: `/home/aac6fef/Developer/Mirabilis`.
- Parent role: orchestration only.

## Source Docs

- `docs/product/02-core-data-model.md#46-command-registry`.
- `docs/architecture/02-core-kernel.md#46-command-registry`.
- `docs/development/02-implementation-roadmap-and-constraints.md#203-所有用户动作走-command-registry`.
- `docs/implementation/task-index.md#task-007-add-command-registry-and-command-bus`.
- `docs/testing/strategy.md`.

## Acceptance Criteria

- Plugins can register and unregister commands.
- Commands expose id, plugin id, title, context, shortcut, and handler.
- UI and plugins execute commands through the command bus.
- Duplicate command IDs are rejected with typed errors.

## Initial Parent Interpretation

- TASK-007 implements Core-level command registration, discovery, unregistration, and execution only.
- Core must not implement business commands such as task, timer, AI, metadata, or page actions.
- Command handlers are plugin-provided functions; Command Bus is the single execution path for UI and plugins.
- The implementation should follow the hardened in-memory Core store style from TASK-003 through TASK-006 where it makes sense.
- Keep native persistence, Tauri IPC, shortcuts integration, command palette UI, plugin host lifecycle, and permission enforcement out of scope unless agents find a local-doc contradiction.

## Agent/Config Checks

- `.codex/agents/*.toml` parsed successfully.
- `codex --strict-config doctor --summary --ascii` reported configuration/auth/MCP/network OK and a desktop-terminal `TERM=dumb` failure, treated as non-blocking for repository agent work.

## Current Status

- Status: pre-test guidance complete.
- Active agents: none.

## Agent Handoffs

### Pre-test Guidance Round

- Status: completed.
- Agents:
  - Schrodinger (`planner`, `019e4346-6f25-7710-ba44-e7dc2aae5bb0`): propose focused Core Command Registry/Bus API, validation, error codes, execution semantics, and acceptance tests.
  - Bacon (`docs_researcher`, `019e4346-73ce-7851-b8b0-704b45d106eb`): verify current official TypeScript and Vitest guidance relevant to generic command definitions, async errors, and type tests.
  - Poincare (`deprecation_auditor`, `019e4346-77cc-7a41-b1a4-be8d337f3f13`): audit fragile API choices, handler error behavior, context/shortcut validation risks, unregister/list mutation risks, and architecture boundaries.
- Outcomes:
  - Schrodinger recommended `src/core/types/command.ts`, `src/core/commands/command-registry.ts`, `src/core/commands/index.ts`, public Core exports, and `src/test/core-command-registry.test.ts`.
  - Bacon confirmed TASK-007 is Core-only and does not need React, Tauri, IPC, shortcut-system, native-permission, or UI docs. Tests should use current Vitest async assertions and `expectTypeOf`; type assertions are enforced by `bun run typecheck`.
  - Poincare raised P1 risks around handler exposure, sync/async handler error wrapping, unsound dynamic generic `execute` outputs, identity validation, and avoiding whole-definition `structuredClone` because handlers are functions.
- External docs cited:
  - TypeScript generics: https://www.typescriptlang.org/docs/handbook/2/generics.html
  - TypeScript generic function guidance: https://www.typescriptlang.org/docs/handbook/2/functions.html#guidelines-for-writing-good-generic-functions
  - TypeScript `unknown`: https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-0.html#new-unknown-top-type
  - TypeScript type-only imports and exports: https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-8.html#type-only-imports-and-export
  - TypeScript module type-only imports and exports: https://www.typescriptlang.org/docs/handbook/modules/reference.html#type-only-imports-and-exports
  - TypeScript `satisfies`: https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-9.html#the-satisfies-operator
  - TypeScript declaration dos and don'ts: https://www.typescriptlang.org/docs/handbook/declaration-files/do-s-and-don-ts.html
  - Vitest async tests: https://vitest.dev/guide/learn/async
  - Vitest `expect`: https://vitest.dev/api/expect
  - Vitest `expectTypeOf`: https://vitest.dev/api/expect-typeof
  - Vitest type testing: https://vitest.dev/guide/testing-types.html

## Parent Decisions

- TASK-007 implements Core command registration, discovery, unregistration, and bus execution only.
- Do not implement business commands, command palette UI, shortcut binding, shortcut conflict detection, plugin host lifecycle, IPC, permissions, SQLite, persistence, or Tauri changes.
- Add command types in `src/core/types/command.ts`, command runtime in `src/core/commands/command-registry.ts`, barrel exports in `src/core/types/index.ts`, `src/core/commands/index.ts`, and `src/core/index.ts`, and focused tests in `src/test/core-command-registry.test.ts`.
- Public `CommandDefinition<Input = unknown, Output = unknown>` may relate handler input/output generics inside a definition, but Core dynamic execution should expose `execute(commandId: string, input?: unknown): Promise<unknown>` to avoid unsound caller-invented outputs.
- Use `CommandHandler<Input = unknown, Output = unknown> = (input: Input) => Output | Promise<Output>`.
- Expose `CommandDescriptor` metadata from `register`, `get`, `list`, and `unregister`; descriptors must not include `handler`.
- Keep handlers private in the registry and executable only through the command bus.
- Use `defaultShortcut` as the public shortcut metadata field, matching architecture docs. Treat it as optional nonblank metadata only.
- Treat `context` as inert command availability descriptor data for TASK-007. Validate and clone it as JSON-compatible plain data; do not implement matching semantics.
- Validate `id`, `pluginId`, and `title` as strings that are nonblank after trimming, but preserve exact provided strings instead of silently trimming stored identity.
- Validate `handler` is a function before storing.
- Duplicate command IDs are global collisions and must leave the original command unchanged.
- `unregister` is delete-like, not idempotent; missing commands return `COMMAND_NOT_FOUND`.
- Re-registering a command ID after unregister is allowed.
- `list()` returns descriptors in registration order, supports exact `pluginId` filtering, and returns defensive descriptor copies.
- Handler input is not validated or cloned by Core; plugin handlers may need editor/runtime objects. The handler receives the exact input reference.
- `execute` snapshots the handler before awaiting it. An in-flight command should complete against the captured handler even if the command is unregistered later.
- Sync throws and async rejections from handlers must become `COMMAND_HANDLER_FAILED` with the original thrown value retained as `cause`; do not string-coerce hostile thrown values.
- Use a typed `CommandRegistryError` and error-code union including not found, ID collision, identity/plugin/title/handler/shortcut/context validation, and handler failure.

## Next Action

Delegate failing acceptance tests to a `test_writer`.
