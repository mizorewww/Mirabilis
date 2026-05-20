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

- Status: review-fix implementation active.
- Active agents:
  - Newton (`implementer`, `019e4363-1be5-7d53-87cf-99074b612e81`): hide raw handler causes and fix `CommandRegistryError.cause` semantics.

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
- Sync throws and async rejections from handlers must become `COMMAND_HANDLER_FAILED` without exposing the original thrown value as public `cause`; do not string-coerce hostile thrown values. A later internal logging path may retain raw causes if needed.
- Use a typed `CommandRegistryError` and error-code union including not found, ID collision, identity/plugin/title/handler/shortcut/context validation, and handler failure.

## Next Action

Wait for Ohm's TASK-007 acceptance tests.

### Ohm (`test_writer`)

- Status: completed and closed.
- Agent id: `019e434b-8cf4-7f73-9970-16430e686965`.
- Ownership:
  - `src/test/core-command-registry.test.ts` only unless unavoidable test-only support is needed.
- Commit:
  - `65e8727 Ohm(test)(Add Command Registry and Command Bus): add command registry acceptance tests`.
- Assignment:
  - Add failing acceptance tests for public exports, command type shape, registration/listing, descriptor defensive copies, bus execution, duplicate rejection, unregister behavior, handler failure wrapping, runtime validation, inert context metadata, and in-flight handler snapshot behavior.
  - Keep examples business-neutral and avoid task/timer/habit/calendar/AI examples.
  - Do not edit production code, docs, or exports.
- Parent confirmed expected red signal:
  - `bun run typecheck` fails on missing `CommandRegistryError`, `createInMemoryCommandRegistry`, command types, and `../core/commands`.
  - `bun run test:frontend -- src/test/core-command-registry.test.ts` fails during import resolution for `../core/commands`, so no tests execute until production files are added.

## Next Action

Wait for Curie's implementation output.

### Curie (`implementer`)

- Status: completed and closed.
- Agent id: `019e4350-fd27-73d1-aeaa-7098934023cf`.
- Ownership:
  - `src/core/types/command.ts`.
  - `src/core/types/index.ts`.
  - `src/core/commands/command-registry.ts`.
  - `src/core/commands/index.ts`.
  - `src/core/index.ts`.
- Commit:
  - `883c1aa Curie(implementation)(Add Command Registry and Command Bus): implement command registry`.
- Assignment:
  - Implement the minimum production Command Registry and Command Bus to pass Ohm's acceptance tests.
  - Keep handlers private and expose handler-free descriptors.
  - Preserve Core-level `execute(commandId: string, input?: unknown): Promise<unknown>`.
  - Keep TASK-007 out of business commands, UI, shortcuts integration, plugin host lifecycle, IPC, permissions, persistence, and Tauri.
- Checks run by Curie and repeated by parent:
  - `bun run typecheck`.
  - `bun run test:frontend -- src/test/core-command-registry.test.ts` with 10 tests passing.
  - `bun run lint`.
- Parent note:
  - Curie initially committed with `Codex(implementation)` in the message. Parent amended the HEAD commit message to use the actual agent nickname and force-with-lease pushed the task branch.

### Review Round 1

- Status: completed with P2/P3 findings.
- Agents:
  - Lovelace (`pr_explorer`, `019e4357-000e-7652-91f6-71d67177c131`): map changed code paths and reviewer focus areas.
  - Einstein (`reviewer`, `019e4357-03b3-7452-9c02-64a950ca2c83`): review correctness and acceptance criteria.
  - Cicero (`security_reviewer`, `019e4357-0727-7262-aef2-5db1537d0787`): review handler exposure, descriptor mutation leaks, hostile context/raw-error paths, and native/permission boundary.
  - Turing (`deprecation_auditor`, `019e4357-0b34-7513-a981-ac57ffadcb71`): audit TypeScript/Vitest/API/deprecation risks.
  - Epicurus (`test_quality_reviewer`, `019e4357-0eeb-7cd0-b333-b09fdef9125e`): review test coverage quality.
  - Mencius (`docs_researcher`, `019e4357-130a-7e62-beab-801d450c4cec`): review local-doc and official-doc traceability.
- Outcomes:
  - Lovelace mapped branch diff and confirmed no `src-tauri`, package, lockfile, Cargo, Vite/Vitest/TypeScript/ESLint config, GitHub, `.codex`, or `AGENTS.md` changes.
  - Einstein found no P0/P1/P2/P3 correctness issues.
  - Cicero found two P2 security issues and one P3: raw handler failures are exposed as public `cause`; caller identity/capability scoped facades are needed before this service is passed into Plugin Host or UI/plugin contexts; proxy-specific context tests would be useful.
  - Turing found one P2: `CommandRegistryError.cause` does not match standard `Error.cause` optional/non-enumerable semantics.
  - Epicurus found one P2 and two P3 test-quality gaps: context invalid-value coverage is too thin; `get()` handler privacy should be asserted explicitly; `../core/commands` type-barrel coverage should include every public command type.
  - Mencius found one P3 docs issue: live status still had a stale TASK-006 Current Worktree State section.
- Selected fixes:
  - Add review-fix tests for sanitized/no public raw handler cause and standard `Error.cause` semantics.
  - Add broader invalid context coverage for nested `undefined`, non-finite numbers, bigint, symbol, `Date`, sparse arrays, accessors, symbol keys, non-enumerable properties, and proxy traps where practical.
  - Strengthen `get()` handler privacy assertions and `../core/commands` type-barrel assertions.
  - Update live status to TASK-007.
- Deferred risk:
  - Caller-aware authorization/scoped facades must be added before Plugin Host or UI/plugin contexts receive this service. TASK-007 remains Core-only and does not yet expose the registry to untrusted callers.

## Next Action

Wait for Popper's review-fix coverage.

### Popper (`test_writer`)

- Status: completed and closed.
- Agent id: `019e435e-8d92-7063-b01e-ea0dd6b3e6cc`.
- Ownership:
  - `src/test/core-command-registry.test.ts` only unless unavoidable test-only support is needed.
- Commit:
  - `1c6c6f3 Popper(test)(Add Command Registry and Command Bus): add review-fix coverage`.
- Assignment:
  - Add review-fix tests for sanitized/no public raw handler cause and standard `Error.cause` semantics.
  - Broaden invalid context coverage for JSON-compatible plain-data validation.
  - Strengthen `get()` handler privacy assertions and `../core/commands` type-barrel assertions.
  - Do not edit production code or docs.
- Parent confirmed expected red signal:
  - `bun run typecheck` passes.
  - `bun run test:frontend -- src/test/core-command-registry.test.ts` runs 11 tests with 5 passing and 6 failing because production `CommandRegistryError` instances still expose public own `cause`.

## Next Action

Wait for Newton's review-fix implementation.

### Newton (`implementer`)

- Status: active.
- Agent id: `019e4363-1be5-7d53-87cf-99074b612e81`.
- Ownership:
  - `src/core/commands/command-registry.ts` unless exports/types need unavoidable adjustment.
- Assignment:
  - Fix `CommandRegistryError.cause` visibility/privacy so handler failures do not expose raw thrown values and non-handler errors do not own `cause`.
  - Preserve existing registry behavior, error codes, and context validation.
  - Do not edit tests or docs unless unavoidable.
