# TASK-033 Agent Communication - Release Packaging And Local Full Gate

## Task

- ID: TASK-033.
- Name: Add release packaging and local full gate.
- Branch: `feat/task-033-release-packaging-local-full-gate`.
- Started: 2026-05-25 21:03 CST.
- Parent role: orchestration only. Parent delegates planning, current-doc research, deprecation/security review, test writing, implementation, docs sync, and release readiness review to specialized agents.

## Source Docs Read By Parent

- `docs/implementation/task-index.md#task-033-add-release-packaging-and-local-full-gate`.
- `docs/testing/strategy.md`.
- `docs/development/02-implementation-roadmap-and-constraints.md#21-最终代码架构总结`.
- Current `package.json` scripts.
- Current `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`.

## Initial Parent Interpretation

- TASK-033 should finish the local release gate for the current project phase.
- Acceptance criteria require:
  - `bun run check:full` runs quick checks and Tauri build;
  - packaging changes are documented;
  - `release_checker` can verify local readiness without GitHub CI;
  - version/changelog expectations are clear.
- Current `package.json` already defines `check:full` as `bun run check:quick && bun run tauri build`.
- Current Tauri config bundles `targets = "all"`, and an earlier TASK-014 full-gate exploration found local AppImage bundling failures in the Arch environment. Agents must determine whether TASK-033 should change local full-gate behavior, Tauri bundle configuration, docs, release-checker procedure, or a combination.
- The parent will not write tests, implementation, review findings, release readiness assessment, or formal docs sync unless a delegated agent fails or is explicitly cancelled and the fallback reason is recorded.

## Validation At Start

- `.codex/agents/*.toml` parsed successfully with 11 files.
- `codex --strict-config doctor --summary --ascii` reported config/auth/MCP/WebSocket/reachability OK with known non-blocking notes: unrestricted sandbox/network and `TERM=dumb` terminal failure.
- `master` was up to date with `origin/master` before branching.

## Parent Decisions

- Start from `master` commit `dfe0e91`, after TASK-032 merge validation.
- Use branch `feat/task-033-release-packaging-local-full-gate`.
- Delegate pre-test planning/current-doc guidance, deprecation/API audit, and security review before writing tests because TASK-033 touches Tauri release packaging and local full-gate behavior.
- Keep all agent recommendations, parent decisions, blockers, checks, and release-readiness outcomes in this file and `docs/implementation/agent-communication/status.md`.

## Current Next Action

- Delegate pre-test guidance:
  - `planner` to define the smallest safe TASK-033 slice, acceptance criteria, expected files, local gate semantics, release readiness workflow, and deferred scope.
  - `docs_researcher` to verify current Tauri v2 build/bundle guidance and any Bun/Vite/release docs needed for a local `check:full`.
  - `deprecation_auditor` to audit stale packaging assumptions, scripts, bundle targets, CLI flags, version/changelog conventions, and known local AppImage failure context.
  - `security_reviewer` to define release/build security constraints around bundle targets, capabilities, signing/updater absence, filesystem/network permissions, and artifact leakage.

## Pre-Test Guidance Handoff

- Boole (`planner`) started at 2026-05-25 21:04 CST.
- Mendel (`docs_researcher`) started at 2026-05-25 21:04 CST.
- Parfit (`deprecation_auditor`) started at 2026-05-25 21:04 CST.
- Descartes (`security_reviewer`) started at 2026-05-25 21:04 CST.
- All agents are read-only and must not edit files, commit, merge, or push.
- Parent next action: wait for guidance, record parent decisions, then delegate failing tests or a release-gate validation plan as appropriate.

## Pre-Test Guidance Outcomes

- Boole (`planner`) recommended the smallest safe TASK-033 slice:
  - release-gate/config/docs only, with no Core/plugin/IPC/permission/SQLite/app behavior changes;
  - tests first for `check:full` ordering, version synchronization, bundle target policy, referenced packaging assets, release docs, changelog expectations, release_checker readiness, and AppImage decision;
  - make the gate honest by validating explicit local targets, likely deb/rpm, while documenting AppImage as deferred or controlled-environment-only if not fixed now.
- Mendel (`docs_researcher`) verified current official docs:
  - Tauri v2 `tauri build` is current and uses `frontendDist`, `beforeBuildCommand`, configured bundles, and optional `beforeBundleCommand`;
  - current Linux `--bundles` values include `deb`, `rpm`, and `appimage`; `--ci` is current; `--ignore-version-mismatches` exists but should not be used as a normal release gate;
  - `bundle.targets = "all"` is current, but actual outputs are platform/toolchain dependent;
  - Tauri recommends managing app version in `tauri.conf.json`, and the current package/Tauri/Cargo versions all read `0.1.0`;
  - Linux package compatibility depends on host packages and glibc baseline, with Ubuntu 22.04 / Debian 12 named as suitable old-base examples for Linux package builds;
  - updater/signing is not configured and should remain deferred unless explicitly added with secret-safe signing policy.
- Parfit (`deprecation_auditor`) found no P0 and three P1s:
  - current `check:full` uses valid Tauri API but is stale as a reliable local full gate because `bundle.targets = "all"` includes the known-failing AppImage path;
  - release metadata is not ready because `src-tauri/Cargo.toml` still has placeholder `description = "A Tauri App"` and `authors = ["you"]`;
  - version/changelog expectations are acceptance criteria but not guarded or documented beyond the task text.
- Descartes (`security_reviewer`) found release-gate P1s:
  - TASK-033 must not fake release readiness using `--no-bundle`, `|| true`, hidden env workarounds, or skipped bundle checks;
  - signing/updater absence must be explicitly scoped as local-only developer artifacts;
  - capabilities, Rust invoke handlers, dormant native bridge commands, CSP-null status, and bundle resources/files must not broaden accidentally;
  - tracked release artifacts, `.env`, signing keys, packaged databases, logs, `dist`, or `src-tauri/target` would be P0.
- Parent baseline validation:
  - `bun run check:full` passed `check:quick`, frontend production build, Rust release build, deb bundling, and rpm bundling.
  - It failed at AppImage bundling with `failed to run linuxdeploy`, matching the prior TASK-014 local AppImage failure pattern.
  - Generated deb/rpm artifacts were under ignored `src-tauri/target/release/bundle/**`; the git working tree remained clean except orchestration docs.

## Parent Decisions After Guidance

- Use a local release-gate/config/docs slice for TASK-033.
- Keep `check:quick` unchanged.
- Change or wrap `check:full` so it is explicit, unattended, and honest:
  - it must run `bun run check:quick` first;
  - it must run Tauri build in CI mode;
  - the default local bundle targets should be explicit local Linux targets expected to pass here, currently `deb,rpm`;
  - it must not use `--no-bundle`, `|| true`, hidden env workarounds, or `--ignore-version-mismatches`.
- AppImage is not validated by the default local gate in this Arch environment. Document it as deferred to a controlled Linux builder, such as Ubuntu 22.04 or Debian 12, and require release readiness review to state that AppImage has not passed locally unless a future branch adds that controlled path.
- Require tests for:
  - `package.json` script ordering and forbidden bypass flags/patterns;
  - Tauri bundle policy and referenced bundle files/templates/icons;
  - version synchronization across `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`;
  - non-placeholder Cargo release metadata;
  - changelog/release-notes presence and documented version/changelog expectations;
  - no updater/signing config or signing key material unless explicitly scoped;
  - no tracked release artifacts, secrets, logs, `dist`, or `src-tauri/target`;
  - no unexpected native capability, permission, IPC, package, Cargo dependency, Core, or plugin behavior drift.
- Parent next action: commit guidance decisions, then delegate failing tests to `test_writer`.

## Test Writer Handoff

- Hegel (`test_writer`) started at 2026-05-25 21:11 CST.
- Scope: tests only, expected file `src/test/release-packaging-full-gate.test.ts`.
- Required coverage:
  - `package.json` `check:full` must run `check:quick` before Tauri build, use unattended/CI mode, and use explicit local bundle targets `deb,rpm`;
  - `check:full` must not use `--no-bundle`, `--ignore-version-mismatches`, `|| true`, hidden env workarounds, upload/publish/curl/fetch/network commands, or skip quick checks;
  - Tauri build config must keep bundle active, local frontend dist, localhost-only dev URL, `bun run build` before build, and existing referenced desktop template/icon/custom files;
  - local gate must not hide AppImage status behind implicit `targets = "all"`;
  - versions must match across `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`;
  - Cargo release metadata must reject placeholder description/authors;
  - changelog or release-notes surface must exist and be referenced by release docs;
  - `release_checker` instructions must verify local gate result, bundle targets/artifacts, version/changelog policy, AppImage controlled-builder/deferred status, and no GitHub CI dependency;
  - static guards must prove no updater/signing config, tracked artifacts/secrets/logs/dist/target, broad permissions, or unexpected native commands.
- Expected red signal: current repo lacks explicit `--ci --bundles deb,rpm` in `check:full`, still relies on implicit `all`/AppImage, has placeholder Cargo metadata, has no changelog/release notes, and has a release_checker checklist that is too generic.
- Parent next action: wait for Hegel, validate red tests and static test-only scope, then commit the test-only patch.

## Test Writer Outcome

- Hegel (`test_writer`) added `src/test/release-packaging-full-gate.test.ts`.
- Coverage added:
  - `package.json` `check:full` ordering, `--ci`, explicit `deb,rpm` bundle targets, and forbidden bypass/network/upload patterns;
  - Tauri bundle config, local `frontendDist`, localhost `devUrl`, `bun run build`, referenced icons, desktop template, and custom bundle files;
  - explicit AppImage status in docs/release_checker instead of hiding behind implicit `targets = "all"`;
  - version sync across `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`;
  - non-placeholder Cargo release metadata;
  - changelog/release-notes surface plus release_checker checklist;
  - updater/signing/secret/artifact leak guards;
  - narrow capabilities and Rust invoke command exposure.
- Parent red validation:
  - `bun run test:frontend -- src/test/release-packaging-full-gate.test.ts` failed as expected with 5 failed / 4 passed.
  - Failure symptoms: missing `--ci`, missing explicit `deb,rpm` bundle targets, placeholder Cargo description, no release-notes/changelog surface, and missing release_checker checks for bundle targets/artifacts, version sync, release notes, and AppImage status.
- Parent static validation passed:
  - `git diff --check`.
  - `.skip/.only` scan found no matches.
  - Changed-file guard showed only `src/test/release-packaging-full-gate.test.ts`.
- Test commit: `b94eefb Hegel(test)(Add release packaging and local full gate): add release gate acceptance tests`; post-commit auto-push succeeded.
- Parent next action: commit this outcome record, then delegate implementation to `implementer`.

## Implementation Handoff

- Averroes (`implementer`) started at 2026-05-25 21:18 CST.
- Scope: minimum config, release metadata, release-checker, and docs changes needed to make `src/test/release-packaging-full-gate.test.ts` pass.
- Expected write surface:
  - `package.json` for explicit local `check:full` semantics;
  - `src-tauri/Cargo.toml` for non-placeholder release metadata;
  - `.codex/agents/release-checker.toml` for concrete local readiness checklist;
  - a changelog or release-notes surface;
  - relevant docs such as `docs/testing/strategy.md`, `docs/development/02-implementation-roadmap-and-constraints.md`, and `docs/implementation/task-index.md` if needed.
- Required implementation:
  - keep `check:quick` unchanged;
  - make `check:full` run `check:quick` first, then `tauri build --ci --bundles deb,rpm`;
  - do not use `--no-bundle`, `--ignore-version-mismatches`, `|| true`, hidden env workarounds, upload/publish/curl/fetch/network commands;
  - document AppImage as not validated by the default local Arch gate and deferred to a controlled Linux builder unless a future task adds that path;
  - keep versions synchronized at `0.1.0` unless a documented reason to bump appears;
  - make version/changelog expectations clear;
  - avoid any native/capability/IPC/updater/signing/dependency/Core/plugin behavior expansion.
- Constraints: do not edit tests, progress, agent-communication, commits, merges, or pushes.
- Parent next action: wait for Averroes, validate focused green tests and release-surface guards, then commit if green.

## Implementation Outcome

- Averroes (`implementer`) completed the focused TASK-033 release-gate implementation.
- Files changed:
  - `package.json`
  - `src-tauri/Cargo.toml`
  - `CHANGELOG.md`
  - `docs/testing/strategy.md`
  - `docs/development/02-implementation-roadmap-and-constraints.md`
  - `.codex/agents/release-checker.toml`
  - `tsconfig.json`
- Delivered:
  - `check:full` now runs `check:quick` before `tauri build --ci --bundles deb,rpm`;
  - Cargo release metadata is no longer placeholder and version remains `0.1.0`;
  - `CHANGELOG.md` is the release notes surface;
  - release docs document local deb/rpm gate, AppImage controlled-builder deferral, version sync, and changelog expectations;
  - `release_checker` instructions now verify local gate, artifacts, version/changelog policy, AppImage status, no GitHub CI dependency, no tracked artifacts/secrets, and no unexpected native/capability/IPC/updater/signing broadening.
- Parent validation:
  - `bun run test:frontend -- src/test/release-packaging-full-gate.test.ts` passed with 9 tests.
  - `bun run typecheck` passed.
  - `bun run lint` passed.
  - `git diff --check` passed.
  - `.codex/agents/release-checker.toml` parsed as TOML.
- Full-gate validation attempt:
  - `bun run check:full` ran `check:quick && tauri build --ci --bundles deb,rpm`.
  - It failed during the frontend test suite before Tauri build because 16 historical task tests still assert no package/Cargo/native-surface diff from `master`.
  - Failure symptoms: historical guards reported `package.json` and/or `src-tauri/Cargo.toml`, which are the reviewed TASK-033 release-surface files.

## Parent Decisions After Full-Gate Validation Failure

- Treat the full-gate failure as stale historical test-guard scope because TASK-033 intentionally changes `package.json` and `src-tauri/Cargo.toml`.
- Do not weaken native-surface checks broadly.
- Delegate a tests-only fix so historical guards pass when changed native-surface files are either `[]` after merge or a subset of the reviewed TASK-033 release files before merge, while still failing for Tauri config, capabilities, generated permissions, Rust commands, dependency changes, or other package/native drift.

## Historical Guard Test-Fix Handoff

- Poincare (`test_writer`) started at 2026-05-25 21:23 CST.
- Scope: tests only.
- Likely affected files: historical `listNativeSurfaceChangesFromMaster()` guards in plugin/core task tests that currently expect `[]`.
- Required behavior:
  - allow `[]`;
  - allow a subset of `package.json` and `src-tauri/Cargo.toml` for reviewed TASK-033 release metadata/script changes;
  - continue failing on any other native/package/Tauri config/capability/permission/Rust command/dependency drift.
- Constraints: do not edit production source, `package.json`, Cargo/Tauri config, docs, progress, agent-communication, release-checker config, commits, merges, or pushes.
- Parent next action: wait for Poincare, validate full frontend tests and static checks, then commit implementation and test-fix in atomic commits if green.

## Historical Guard Test-Fix Outcome

- Poincare (`test_writer`) completed the tests-only guard fix.
- Files changed:
  - added `src/test/native-surface-guard.ts`;
  - updated 16 historical native-surface guard tests to use the helper.
- Guard behavior:
  - accepts `[]`, which is the expected state after TASK-033 merges to `master`;
  - accepts the exact reviewed TASK-033 diffs in `package.json` and `src-tauri/Cargo.toml` before merge;
  - fails for unreviewed edits inside those allowed files;
  - fails for any other native/package/Tauri config/capability/permission/Rust command/lockfile drift.
- Poincare validation:
  - `bun run test:frontend -- <16 affected files>` passed with 16 files / 225 tests.
  - `bun run test:frontend` passed with 38 files / 587 tests.
  - `bun run typecheck` passed.
  - `bun run lint` passed.
  - `git diff --check` passed.

## Branch Validation After Implementation

- Parent validation:
  - `bun run check:full` passed after the implementation and guard test-fix.
  - The gate ran `check:quick`, then `tauri build --ci --bundles deb,rpm`.
  - Frontend tests passed with 38 files / 587 tests.
  - Rust fmt, Rust clippy, and Rust tests passed.
  - Tauri release build passed and produced:
    - `src-tauri/target/release/bundle/deb/mirabilis_0.1.0_amd64.deb`
    - `src-tauri/target/release/bundle/rpm/mirabilis-0.1.0-1.x86_64.rpm`
  - Tracked artifact/secret scan found no tracked release artifacts, secrets, logs, `dist`, or `src-tauri/target` output.
- Commits:
  - `b5629a5 Averroes(implementation)(Add release packaging and local full gate): implement local release gate`
  - `7149e5a Averroes(docs)(Add release packaging and local full gate): document local release readiness`
  - `1a83600 Poincare(test-fix)(Add release packaging and local full gate): allow reviewed release surface guards`
- Parent next action: commit this validation record, then run review agents, including `release_checker`.
