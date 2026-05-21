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

## Pre-test Guidance

### Boole the 4th - Planner

- Status: completed read-only planning; no files edited, staged, committed, or pushed.
- Recommended scope:
  - Add a built-in `TagPlugin` only.
  - Keep recognition command-driven through a tag command that reads saved structured page body and writes plugin-owned metadata.
  - Do not add Core tag business logic, a generic indexer lifecycle, rich editor tokenization/autocomplete, native/Tauri/package changes, or filter result rendering.
- Recommended behavior:
  - A saved line such as `- [ ] Write Timer Plugin #architecture #timer` can refresh page tag metadata to `["architecture", "timer"]`.
  - The tag metadata slot renders tags as `#architecture #timer`.
  - The slot provides a small picker/editor that can add `product` and remove existing tags through commands.
- Recommended contracts:
  - Plugin id: `tag`.
  - Markdown syntax descriptor for `#tag`.
  - Metadata field descriptor for `tag.tags`.
  - Runtime slot on `page.header.metadata`.
  - Commands for refresh/extraction, add, remove, and filter creation.
  - Filter definitions should use `metadata.tag.tags includes <tag>` and leave filter result rendering to later tasks.
- Risks:
  - Product examples may eventually imply task source-line tags propagate to task pages, but TASK-021 should not trust `attrs.boundPageId` or read Task Plugin private metadata. Propagation needs a future Task Plugin command/event contract.
  - Metadata bar editing is partly TASK-023; TASK-021 should register and test a Tag Plugin-owned slot component, not build a global metadata UI layer.

### Boyle the 4th - Docs Researcher

- Status: completed read-only current-doc/test guidance; no files edited, staged, committed, pushed, or tests run.
- Local constraints:
  - Tag behavior belongs in the built-in `tag` plugin, not Core.
  - Use existing metadata, filters, commands, slots, and Plugin Host ownership facades.
  - Metadata field renderer/editor registry is future-facing; runtime commands/views/slots are available.
  - There is no general Filter Engine execution yet; TASK-022 owns filter result rendering/query execution.
- Testing guidance:
  - Add focused tests around a new built-in `TagPlugin` in `BUILT_IN_PLUGINS`.
  - Execute commands through `runtime.commands.execute`, not plugin internals.
  - Assert metadata writes as `namespace: "tag"`, `key: "tags"`, `valueType: "json"`, `value: string[]`, with Plugin Host-injected `sourcePluginId: "tag"`.
  - Cover dedupe, stable order, invalid payloads, missing pages, fenced-code inert text, headings versus tags, unsafe tag text rendered as plain text, and no caller-supplied ownership fields.
  - UI tests should use `userEvent.setup()`, role queries, labeled inputs/buttons, and `waitFor` for async command results.
- Docs ambiguity to fix later:
  - TASK-021 asks for metadata bar and tag picker, while TASK-023 owns the broader Metadata UI Plugin.
  - `#tag` recognition does not specify save-driven, command-driven, or background indexing semantics.
  - Tag grammar, case normalization, duplicate behavior, and empty metadata behavior are unspecified.
  - "Tag filters can query pages by tag" should likely mean creating tag-owned filter definitions now, with result execution/rendering later.
- External docs verified:
  - React controlled inputs and async effects, Testing Library/user-event v14, Vitest 4, Vite 7, and Tauri v2 capabilities/calling Rust guidance.

### Descartes the 4th - API/Deprecation Auditor

- Status: completed read-only API/deprecation audit; no files edited, staged, committed, pushed, or tests run.
- P0/P1 contract guidance:
  - Plugin id: `tag`.
  - Markdown syntax id: `tag.hashtag`.
  - Metadata field id: `tag.tags`.
  - Metadata namespace/key: `namespace: "tag"`, `key: "tags"`.
  - Metadata `valueType`: `json`; value is a normalized `string[]` without `#`.
  - Commands should be kebab-case.
  - Refresh semantics should be explicit: read current page body, extract hashtags from `markdown.line` blocks, and replace `tag.tags` with the normalized extracted list.
  - Filter query shape should be exactly `{ where: [{ field: "metadata.tag.tags", op: "includes", value: normalizedTag }] }`.
  - Slot contract should be `slot: "page.header.metadata"`, contribution id `tag.page-header-metadata.tags`, order `300`.
- Deprecation hazards:
  - Avoid Tauri v1 imports if native calls are touched; TASK-021 should avoid native calls entirely.
  - Avoid deprecated React `react-dom/test-utils`, `ReactDOM.render`, and `react-test-renderer`.
  - Use RTL role queries and `userEvent.setup()`.
  - Avoid removed Vitest v4 patterns.
- External docs verified:
  - Tauri v2 calling Rust/capabilities/migration, React 19 test-utils and StrictMode docs, Vite 7 migration, Vitest 4 migration, and Testing Library/user-event v14 docs.

### Rawls the 4th - Security Reviewer

- Status: completed read-only pre-implementation security guidance; no files edited, staged, committed, pushed, or tests run.
- Security guidance:
  - TASK-021 should stay TypeScript/plugin/UI only with no Tauri commands, capabilities, filesystem access, network/shell, Cargo deps, or package deps.
  - Define canonical tag grammar before tests.
  - Treat `pageId` and tag names in command payloads as untrusted.
  - Reject non-object payloads, arrays, extra trusted fields, spoofed `sourcePluginId`, unknown pages, blank page IDs, and invalid tags before mutation.
  - Verify page existence through `ctx.pages.get(pageId)` and wrap page/tag metadata updates in `ctx.transaction.run`.
  - Parse from validated structured Markdown text, not rendered HTML.
  - Keep filters static and plugin-owned; do not accept arbitrary fields/operators/query/sort/group/viewType from UI payloads.
  - Render tags as inert React text in buttons/chips; no `dangerouslySetInnerHTML`, `innerHTML`, tag-derived `href`, opener usage, or unsanitized tag-derived DOM IDs.
  - Slot components should receive controlled props only, not full runtime/native/registries.
- Required security tests:
  - Tag normalization and rejection of invalid/control/HTML-like/URL-like values.
  - Extraction safety for valid tags, fenced code, escaped tags, URLs/fragments, raw HTML, and malformed tokens.
  - Strict command payloads and no spoofed ownership fields.
  - Transaction safety.
  - Metadata boundary: writes only `tag.tags` with `sourcePluginId: "tag"`.
  - Filter boundary: plugin-owned static AST only.
  - XSS/inert rendering.
  - Native/package/Tauri surface guard.

## Parent Decisions After Pre-test Guidance

- TASK-021 will implement a built-in `TagPlugin` only. Core remains generic metadata/filter/command/slot infrastructure.
- Canonical names:
  - Plugin id: `tag`.
  - Markdown syntax descriptor id: `tag.hashtag`, syntax `#tag`.
  - Metadata field id: `tag.tags`, with `namespace: "tag"`, `key: "tags"`, `valueType: "json"`, and normalized `string[]` values without leading `#`.
  - Metadata slot contribution id: `tag.page-header-metadata.tags`, slot `page.header.metadata`, order `300`.
- Commands:
  - `tag.refresh-tags({ pageId }) -> { pageId, tags }`.
  - `tag.add-tag({ pageId, tag }) -> { pageId, tags }`.
  - `tag.remove-tag({ pageId, tag }) -> { pageId, tags }`.
  - `tag.create-filter({ tag }) -> { filterId }`.
- Parent decision on `tag.toggle-tag`: defer. `tag.add-tag` and `tag.remove-tag` directly satisfy the task's tag picker add/remove acceptance criteria with a smaller command surface.
- `tag.refresh-tags` is the recognition contract for this baseline. It reads the current saved structured page body through the plugin page facade, extracts tags from `markdown.line` text, and replaces `tag.tags` with the exact normalized extracted list. No save-time global scanner or background indexer is introduced.
- Tag grammar:
  - Strip one leading `#` from command input.
  - Trim and lowercase.
  - Accept only ASCII slug tags matching letters/digits plus `_` and `-`, with a leading alphanumeric character.
  - Cap tag length at 32 characters and page tag count at 32 unique tags.
  - Deduplicate by first-seen order.
  - Reject blank, whitespace-containing, control, HTML-like, URL-like, colon-containing, and non-ASCII tags for this baseline.
  - Markdown extraction recognizes inline hashtag tokens such as `#architecture`, ignores Markdown headings like `# Heading`, ignores escaped `\#tag`, ignores `foo#bar`, ignores URL fragments/link destinations, ignores raw HTML-looking fragments, and ignores fenced code blocks.
- Empty tag state: commands that produce no tags should store `tag.tags` as an empty JSON array for touched pages, keeping behavior simple and explicit for filters/UI.
- Filter behavior:
  - `tag.create-filter({ tag })` normalizes the tag and saves a plugin-owned filter definition named `#tag`.
  - Query shape: `{ where: [{ field: "metadata.tag.tags", op: "includes", value: tag }] }`.
  - View type: `page.list`.
  - This creates a stored Filter AST only; filter result execution/rendering remains out of scope for TASK-021/TASK-022.
- UI behavior:
  - TASK-021 should register a Tag Plugin-owned `page.header.metadata` slot component.
  - The component should render tag chips/buttons as inert text and expose a small labeled add input/button plus remove affordances.
  - Because no full app metadata bar outlet exists yet, tests may render the registered slot component directly or through a minimal test host.
- Security boundaries:
  - Commands use strict payload readers and reject extra trusted fields such as `sourcePluginId`, `pluginId`, `namespace`, `key`, caller-supplied `tags`, and raw Markdown.
  - Commands verify page existence and mutate metadata/filter state through plugin facades, preferably inside transactions.
  - Tag Plugin must not trust `attrs.boundPageId`, mutate Task Plugin metadata, or propagate source-line tags to task pages in TASK-021.
  - No native/Tauri/package/Cargo/capability/filesystem surface changes are in scope.

## Current Next Action

## Test Writer Handoff

- Status: completed by Carver the 4th (`test_writer`) on 2026-05-21 15:45 CST.
- Files changed:
  - `src/test/tag-plugin-baseline.test.tsx`.
- Coverage added:
  - Built-in `tag` plugin registration, `tag.hashtag` syntax descriptor, `tag.tags` metadata descriptor, canonical command registration, and `page.header.metadata` slot registration.
  - `tag.refresh-tags` extraction, normalization, ignored unsafe Markdown locations, empty array writes, and 32-tag cap.
  - `tag.add-tag` / `tag.remove-tag` strict payloads, invalid tag rejection, unknown page rejection, dedupe, idempotent remove, and no spoofed owner fields.
  - Slot UI inert tag rendering plus exact add/remove command payloads.
  - `tag.create-filter` plugin-owned static filter shape.
  - Native/package/Tauri surface guard plus no task metadata mutation / no `attrs.boundPageId` trust.
- Validation:

```bash
bun run test:frontend -- src/test/tag-plugin-baseline.test.tsx
bun run typecheck
bunx eslint src/test/tag-plugin-baseline.test.tsx --max-warnings=0
git diff --check
git diff --name-only master -- package.json bun.lock src-tauri/Cargo.lock src-tauri/Cargo.toml src-tauri/build.rs src-tauri/capabilities src-tauri/permissions src-tauri/src/commands src-tauri/src/lib.rs src-tauri/src/main.rs src-tauri/tauri.conf.json
```

- Result: expected red signal. Focused test file ran 8 tests and all 8 failed because the Tag Plugin surfaces are not implemented yet: `tag` is not in `BUILT_IN_PLUGINS`, `tag.hashtag` / `tag.tags` are missing, tag command/slot registrations are empty, `tag.refresh-tags`, `tag.add-tag`, and `tag.create-filter` fail with `COMMAND_NOT_FOUND`, and `tag.page-header-metadata.tags` is missing. `bun run typecheck`, focused eslint, and `git diff --check` passed. Native/package/Tauri surface diff was empty.
- Test writer concern: the slot component prop shape is an inferred baseline contract: `{ pageId, tags, commands }`.

## Current Next Action

- Commit Carver the 4th's failing acceptance tests, then delegate implementation to `implementer`.
