# Testing Strategy

This strategy is the local release gate for Mirabilis. GitHub CI is intentionally not required during the current agent-development phase.

## Current Stack

- Tauri v2 desktop app.
- React 19 frontend.
- Vite 7 build pipeline.
- Vite 7 requires Node.js 20.19+ or 22.12+ when Vite/Vitest tooling runs through Node-based environments; keep local Node on a matching version even though package scripts are launched with Bun. See [Vite 7 Node.js support](https://v7.vite.dev/guide/migration#node-js-support).
- TypeScript 5.8.
- Bun lockfile and Bun-based Tauri commands.
- Rust 2021 crate under `src-tauri`.

## Test Principles

- Write failing tests before production implementation when a task has acceptance criteria.
- Test observable behavior instead of internal implementation details.
- Do not delete, skip, or weaken tests to make a branch pass.
- Prefer the smallest test that proves the acceptance criterion.
- Keep architecture assertions close to the boundary they protect.
- When docs or APIs are unclear, run `docs_researcher` before writing tests.

## Recommended Layers

| Layer | What It Tests | Tooling |
| --- | --- | --- |
| React component | Forms, command UI, editor affordances, visible errors, user interaction | Vitest + React Testing Library |
| Frontend API wrapper | Tauri invoke wrapper behavior and typed errors | Vitest with boundary mocks |
| Core kernel | stores, registries, command bus, event bus, filter engine | Vitest unit tests |
| Plugin runtime | manifest parsing, lifecycle ordering, registration, dependency handling | Vitest integration tests |
| Rust domain/service | SQLite repositories, DTO validation, filesystem-safe helpers | `cargo test` |
| Tauri IPC contract | command names, request DTOs, response DTOs, error shape | Rust integration tests or mock runtime where practical |
| E2E smoke | real app path for Markdown page -> task page -> timer -> note | Tauri WebDriver later |
| Security review | Tauri capabilities, filesystem, IPC, local data, plugin boundaries | `security_reviewer` + targeted tests |

## Current Baseline Commands

These commands should work before the test stack lands:

```bash
bun run build
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --all-features
```

## Local Package Scripts

Use these Bun scripts for local validation:

```json
{
  "scripts": {
    "typecheck": "tsc --noEmit && tsc --noEmit -p tsconfig.node.json",
    "lint": "eslint . --max-warnings=0",
    "test:frontend": "NODE_ENV=test vitest run",
    "test:rust": "cargo test --manifest-path src-tauri/Cargo.toml --all-features",
    "fmt:rust": "cargo fmt --manifest-path src-tauri/Cargo.toml --check",
    "clippy": "cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings",
    "check:quick": "bun run typecheck && bun run lint && bun run test:frontend && bun run fmt:rust && bun run clippy && bun run test:rust",
    "check:full": "bun run check:quick && bun run tauri build"
  }
}
```

Frontend tests use Vitest with the project-level `jsdom` environment and `src/test/setup.ts` for `@testing-library/jest-dom/vitest` matchers. React Testing Library 16+ requires the `@testing-library/dom` peer dependency to be installed explicitly. ESLint uses flat config presets for React Hooks, Vite React Refresh, Testing Library, and jest-dom, with Testing Library and jest-dom rules scoped to test files. Run tests with `bun run test:frontend`; do not use `bun test` for this app.

## Focused Test Guidance

For each task in `docs/implementation/task-index.md`:

- `test_writer` writes the smallest failing tests for the task acceptance criteria.
- `implementer` makes those focused tests pass with minimum production code.
- `test_quality_reviewer` checks whether tests cover behavior instead of implementation details.
- `reviewer` checks for missing edge cases.
- `security_reviewer` runs for IPC, permission, filesystem, SQLite, or plugin-boundary changes.
- `deprecation_auditor` runs for dependency, framework, or API changes.

## Merge Gate

Before merging to `master`:

1. Run focused tests for the changed behavior.
2. Run the current baseline commands or `bun run check:quick` once available.
3. Run `bun run check:full` for changes touching Tauri IPC, permissions, filesystem, persistence, packaging, or release behavior.
4. Fix P0/P1 review findings.
5. Record remaining P2/P3 findings as follow-up tasks when not fixed in the branch.
