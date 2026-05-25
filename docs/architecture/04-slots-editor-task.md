# Slot、编辑器与 Task 插件架构

把 Slot Registry、Markdown Editor Plugin 和 Task Plugin 的实现结构放在一起，方便实现最早期闭环。

## 7. Slot 系统

Slot 是插件挂 UI 的地方。

### 7.1 SlotRegistry

Core 内部 `SlotRegistry` descriptor 会带 ownership：

```ts
export interface SlotContribution<Props = unknown> {
  id: string;
  pluginId: string;
  slot: string;
  order?: number;
  when?: SlotCondition<Props>;
  component: React.ComponentType<Props>;
}
```

但 TASK-010 的 plugin-facing `ctx.slots.register` 输入不允许插件传入 `pluginId`。
Plugin Host 会按当前插件身份注入 ownership。

```ts
export type PluginSlotDefinition<Props = unknown> = {
  id: string;
  slot: string;
  order?: number;
  when?: SlotCondition<Props>;
  component: RegistryComponent<Props>;
};
```

### 7.2 推荐 Slot

```text
editor.block.leading
editor.block.trailing
editor.block.hover_menu
editor.inline.autocomplete
editor.mobile.toolbar

page.header.metadata
page.header.actions
page.sidebar.panel
page.body.after
page.timeline

global.floating
global.command_palette
global.status_bar
global.left_sidebar

filter.toolbar
filter.result_item
filter.empty_state

view.calendar.block
view.heatmap.cell
view.chart.tooltip
```

### 7.3 MetadataBar / Slot rendering

```tsx
<MetadataBar
  pageId={pageId}
  metadata={metadataRecords}
  slots={runtime.registries.slots}
  commands={runtime.commands}
  pluginHost={runtime.pluginHost}
/>
```

TASK-023 交付 built-in `metadata-ui` plugin 导出的 reusable `MetadataBar`，但没有交付 generic app-wide `SlotRenderer` integration。TASK-024 后，Timer 的 metadata slot 已从 Start reservation 升级为 enabled Start control。TASK-025 后，`MetadataBar` command execution requires owner-aware command descriptor lookup and fails closed without it。`MetadataBar` 读取 `page.header.metadata` slot contributions 并按 SlotRegistry order 渲染，production app-shell/editor mounting 仍是后续 integration，除非调用方已经显式挂载它。

如果当前页面是任务页，Task Plugin 当前会在这里 read-only 渲染 existing current fields：

```text
enabled · status · sourcePageId · sourceBlockId · scheduled · due
```

Timer Plugin 当前渲染 enabled Start control：

```text
Start timer
```

Tag Plugin 当前渲染：

```text
#product #timer
```

TASK-025 当前 page-level contributions：

- `task.page-header-metadata.current-fields`，order `100`，read-only current fields only。
- `tag.page-header-metadata.tags`，order `300`，渲染 inert `#tag` 文本并提供 add/remove 控件，控件通过 `tag.add-tag` / `tag.remove-tag` command 写 `tag.tags` metadata，wrong-page command result 会被拒绝。
- `timer.page-header-metadata.placeholder`，order `400`，enabled Start control，through descriptor-owned scoped `commands.execute("timer.start", { pageId })`。
- `timer.page-timeline.segments`，order `100` on `page.timeline`，renders current-page Timer-owned segments and inert Note text with accessible Add Note / Edit Note controls.

TASK-025 也注册 `timer.global-active-bar` 到 `global.floating`，显示 active page title、elapsed time 和 Pause / Resume / Stop controls。该 bar 读取 Timer Plugin registration-scoped in-memory active timer state；Timer finalization 会追加 event-backed Time Segment。TASK-026 的 Calendar day/week view 可以在调用方显式挂载并传入 `calendar.time-segments` DTO 时渲染 Timer segment projection。TASK-028 的 Stats baseline 可以聚合调用方传入的 normalized Timer/Habit/Task/Tag DTO。TASK-030 的 ML baseline 可以在调用方显式传入 `ml.remaining-time-prediction` DTO 时通过 `ml.page-sidebar.prediction-panel` 渲染 prediction panel。Calendar app-shell route/feed、Timer-to-Stats feed normalization、trusted/persistent ML feed integration、Timer metadata totals、Recently Worked / Unnoted Sessions saved filters、manual segment editing、calendar drag/drop 和 native persistence/schema/Tauri/package/Rust changes 仍是后续范围。

`MetadataBar` 传给每个 slot component 的 props 是 narrow controlled props：`pageId`、contributing `pluginId`、trusted field descriptors、trusted values 和 scoped `commands.execute` facade。`MetadataBar` 自身要求 `MetadataBarCommandRegistry.get(commandId)` descriptor lookup；只有 descriptor id exactly matches requested command id 且 `descriptor.pluginId` 等于 contributing plugin 时才会 dispatch。缺少 Plugin Host ownership data、inactive/missing owner plugin、malformed descriptor、unsafe namespace/key、wrong `sourcePluginId`、mismatched `valueType` 或 unavailable command descriptor lookup 都会 fail closed。Manifest `metadataFields` 仍是 descriptors/reservation inputs，不是 renderer/editor declarations。

TASK-022 当前的 Task Plugin slot contribution 是 `task.filter-empty-state`，挂在 `filter.empty_state`，order 为 `100`。它接收最小 `{ filterName }` props 并渲染 generic page empty-state copy，不渲染 task-only 文案。

Habit Plugin 会渲染：

```text
habit daily
```

ML Plugin 可以渲染：

```text
ml.page-sidebar.prediction-panel on page.sidebar.panel
ml.prediction-panel view for kind ml.remaining-time-prediction
```

---

## 8. Markdown Editor Plugin

Markdown Editor Plugin 是 TASK-016/TASK-017 后的内置插件，manifest id 是 `markdown`。

它负责最小 Markdown 编辑体验。TASK-020 起，编辑器还提供一个窄的 Task Plugin 集成点：当 active markdown syntax extensions 包含 `- [ ]`，且当前 textarea Markdown 仍与结构化 body 快照一致时，结构化 task title 会渲染为按钮并通过 command bus 打开任务页，checkbox 会渲染为真实 checkbox 并通过 command bus 切换 source task line 状态。TASK-021 起，active markdown syntax extensions 还会包含 Tag Plugin 的 inert `tag.hashtag` / `#tag` descriptor，但 Markdown Editor 保存时仍不会自动扫描 tags。显式 `tag.refresh-tags({ pageId })` command 才会从已保存 `markdown.line` blocks 刷新 `tag.tags`。日期、页面链接、过滤视图和富编辑语义仍由后续插件或编辑器任务负责。

### 8.1 注册内容

```ts
export const MarkdownEditorPlugin: AppPlugin = {
  manifest: {
    id: "markdown",
    name: "Markdown Editor",
    version: "1.0.0",
    minAppVersion: "0.1.0"
  },
  register(ctx) {
    ctx.views.register({
      id: "markdown.page-editor",
      type: "page.editor",
      title: "Markdown page editor",
      component: MarkdownPageEditor,
      accepts: { kind: "markdown-page" }
    });

    ctx.commands.register({
      id: "markdown.insert-text",
      title: "Insert text",
      handler: insertTextHandler
    });

    ctx.slots.register({
      id: "markdown.editor-mobile-toolbar.base",
      slot: "editor.mobile.toolbar",
      component: BaseMarkdownToolbar
    });
  }
};
```

`markdown.page-editor` 是 `type: "page.editor"` 的 view，`markdown.insert-text` 是插入文本 command，`markdown.editor-mobile-toolbar.base` 挂到 `editor.mobile.toolbar` slot。

### 8.2 TASK-016/TASK-017 编辑器 shell

当前编辑器是受控 `<textarea>` shell，不是 Tiptap / ProseMirror / rich editor：

- `MarkdownPageEditor` 用 `value` + synchronous `onChange` 保存 textarea 状态，保留用户输入的 Markdown 文本。
- 基线输入覆盖 heading、paragraph、list、task syntax text、tag text 和 page-link text，但只按普通文本保存。
- `BaseMarkdownToolbar` 只插入三个 literal snippet：`- [ ] `、`#`、`[[ ]]`。
- 工具栏调用 editor 的 `insertText()`，editor 再通过 `commands.execute("markdown.insert-text", input)` 走 command bus。
- `markdown.insert-text` 归一化 selection offset；省略 `selectionEnd` 时使用归一化后的 `selectionStart`，返回新的 `markdown`、`selectionStart` 和 `selectionEnd`。
- 异步插入会在 await command 前 snapshot page id、当前 markdown、selection 和内容 generation。command 结果回来时，如果 page 或内容 generation 已变化，结果会被丢弃，避免慢 command 覆盖用户后续输入或页面切换。
- 通过 `pageFacade` 加载页面时，页面切换会进入 loading state 并禁用编辑/保存；save 完成后只有在仍是同一页面且内容 generation 未变化时才应用 saved markdown。
- TASK-017 保存时把 textarea Markdown 导入为带稳定 `blockId` 的 `markdown.line` blocks；每一行对应一个 block，包括空行。
- TASK-017 重新打开时把结构化 body 导出回 textarea Markdown。当前测试覆盖的 textarea-supported Markdown 样例会保持可见文本不变。
- TASK-019 在结构化 body 可用且 task syntax descriptor 存在时，从 `markdown.line` source block 派生 task-title 按钮。按钮调用 `task.open-task-page({ sourcePageId, sourceBlockId })`，并只把 command 返回的 `{ pageId }` 交给 `onOpenPage`。
- TASK-019 的 loaded `pageId/pageFacade` 模式会从 runtime Markdown page facade 保存 loaded/saved structured `body`，所以重新打开页面后仍能从结构化 body 渲染 task-title 按钮。
- TASK-019 的 task-title 按钮只在当前 textarea Markdown 与该 structured body 快照导出的 Markdown 完全一致时显示；未保存编辑删除或改名任务行后，旧 source block 按钮会隐藏。
- TASK-019 的 task open flow 在 await command 前 snapshot page id 和内容 generation；command 结果回来时，如果 page 或内容 generation 已变化，结果会被丢弃，避免慢 open result 导航到旧页面。
- TASK-020 在同一 structured-body 条件下渲染 task checkbox。checkbox 调用 `task.toggle-status({ sourcePageId, sourceBlockId })`，读取 `{ pageId, status }`，将 `todo` 显示为 unchecked、`done` 显示为 checked，并在页面切换或内容 generation 变化后丢弃慢 toggle result。
- TASK-020 对同一 source block 的 pending checkbox toggle 去重；pending 时 checkbox disabled，避免同一 source block 重复提交。
- TASK-037 后，App Shell 的 Home route 会创建/选择 session Home Markdown Page，并通过 `ViewHost` 挂载注册的 `markdown.page-editor` / `page.editor` view。这个挂载使用 providers 层的 Markdown workspace bridge，而不是把 raw runtime、NativeBridge、Core stores、registries 或 shell host internals 暴露给插件 UI。
- TASK-037 workspace bridge 只提供 current-page bounded `pages.load/save`、`collectEditorExtensions()`、`markdown.insert-text` / `task.open-task-page` / `task.toggle-status` exact command allowlist wrappers，以及受保护的 `openPage(pageId)`。hosted editor 对 foreign page 的 load/save/openPage self-authorization 会 fail closed。
- TASK-037 `openPage(pageId)` 只能消费由 trusted `task.open-task-page` command 返回的 page id，且授权绑定 command 的 source page 和当前 page generation。用户离开 Home 后才发生的 delayed hosted open 会被忽略，不会重新挂载 Home 或泄露 command-returned page body。

TASK-017 已实现稳定 block ID 与内部 Markdown import/export，TASK-019 已实现显式 task-title click/open navigation，TASK-020 已实现 checkbox status toggle，TASK-022 已实现 Task Plugin-owned All Tasks / Today filter definitions 和 `page.list` registered view rendering slice。TASK-038 已把 Home/recent page routes 和 Inbox/Today/All Tasks/public saved filters 接入当前 app-shell Drawer：page routes 继续经 `ViewHost` 挂载 editor，saved-filter routes 通过 public `FilterDefinition`、`executeFilterQuery`、`ViewHost` 和 `SlotHost` 渲染，并只传 `{ routeToken, title }` DTO。仍未实现 `@date`、autocomplete、slash menu、tag indexing、page-link navigation、保存时 task 自动扫描/索引、broader global/persistent saved-filter navigation、Calendar/Reports/ML/AI/Settings/Sync routes、rich editor behavior、Tiptap/ProseMirror adaptation、完整 CommonMark AST round-tripping、原生文件系统 Markdown import/export、以及用户可见的 load/save 错误 UX。

### 8.3 Markdown runtime facade

编辑器启动时从所有插件收集扩展：

```ts
const editorExtensions = runtime.markdown.collectEditorExtensions();
```

TASK-016 的 `collectEditorExtensions()` 只收集 active plugin manifest 里的 `contributes.markdownSyntax` descriptor：

```ts
type CollectedMarkdownSyntaxContribution = MarkdownSyntaxContribution & {
  pluginId: string;
};
```

这些 descriptor 是 inert JSON-like metadata，不是 executable Tiptap / ProseMirror extension。`pluginId` 由 Plugin Host 根据 manifest owner 写入；如果 contribution 对象里带有伪造的 `pluginId`，会被 host-owned `pluginId` 覆盖。deactivated plugin 的 descriptor 不会被收集。

`runtime.markdown.pages` 是一个 narrow page facade：

```ts
runtime.markdown.pages.load(pageId);
runtime.markdown.pages.save({ pageId, markdown });
```

它只通过 NativeBridge DB allowlist 调用 `core.pages.get` 和 `core.pages.update` DTO，不接受 raw SQL、SQL params、filesystem path 或 file DTO。TASK-017 后的 load/save 规则是：

- `load(pageId)` 调用 `core.pages.get`，如果 body 是结构化 `doc`，先用 `validateStructuredMarkdownDocument()` 校验，再用 `exportStructuredDocumentToMarkdown()` 导出为 textarea Markdown。
- `load(pageId)` 对 TASK-016 的旧 body 只保留一个 load-only exact fallback：`{ type: "doc", content: [{ type: "markdown.text", text }] }`。带 `blockId`、`attrs`、`marks`、child content 或多个 node 的 `markdown.text` 都不是合法 fallback。
- `save({ pageId, markdown })` 读取缓存或重新 `core.pages.get`，再用 `importMarkdownToStructuredDocument(markdown, { previousDocument })` 生成结构化 body，最后通过 `core.pages.update` 保存。新保存不会写 `markdown.text`。

```ts
{
  type: "doc",
  content: [
    { blockId: "block_...", type: "markdown.line", text: "# Heading" },
    { blockId: "block_...", type: "markdown.line", text: "" },
    { blockId: "block_...", type: "markdown.line", text: "- [ ] task text" }
  ]
}
```

这个 facade 也不表示 Core stores 已经整体改为 SQLite-backed；`storage.persistence` 仍是 `"in-memory-core"`，当前只为 Markdown editor save/reopen 提供 narrow NativeBridge page path。Markdown 里的 raw HTML、`javascript:`-like 链接文本、task syntax、tag text 和 page-link text 都停留在 textarea 文本里，不经过 HTML rendering sink。结构化 body 的 `attrs` / `marks` 校验会拒绝 event-handler-like keys、`javascript:` / `data:` URL-like 值和 malformed marks。

TASK-018 后，内置 Task Plugin 已提供 `task.checkbox` task block syntax descriptor，syntax 为 `- [ ]`。它和 Markdown Plugin 的 descriptor 一样只是 inert manifest metadata；编辑器保存时不会因为收集到 descriptor 而自动创建任务页。真正的 TASK-018 创建行为发生在 `task.resolve-task-block` command handler 中。TASK-020 后，编辑器使用该 descriptor 作为允许渲染 structured-body task-title buttons 和 checkbox 的信号；点击按钮执行 `task.open-task-page`，点击 checkbox 执行 `task.toggle-status`，仍不会在保存时自动扫描全部 task block。

TASK-021 后，内置 Tag Plugin 已提供 `tag.hashtag` descriptor，syntax 为 `#tag`。它同样只是 inert manifest metadata；不会创建 rich inline token，也不会触发 save-time scan。`tag.refresh-tags` 显式扫描 saved `markdown.line` source；`tag.add-tag` / `tag.remove-tag` 通过 command 更新当前 page metadata；`tag.create-filter` 只保存 filter definition。TASK-022 后，saved `page.list` filters 可被 generic executor 和 registered view path 执行/渲染。TASK-038 后，current app-shell 可从 Drawer 打开 public saved filters，使用 public filter definitions、owner checks、`executeFilterQuery`、`ViewHost` 和 `SlotHost`，并只把 route-token/title DTO 交给 view。Date Plugin 可以后续提供 date token descriptor，Page Link Plugin 可以提供 `[[page]]` descriptor。自动索引、broader global/persistent filter navigation、Event/plugin-index `within` behavior、Calendar/Reports/ML/AI/Settings/Sync routes 和 rich editor adaptation 仍未实现。

---

## 9. Task Plugin 代码架构

Task Plugin 是最重要的插件之一。
长期目录可能长这样；TASK-018/TASK-022 当前实现内置 `TaskPlugin` 的 syntax descriptor、resolver command、open command、checkbox status toggle command、default filters、`page.list` view 和 empty-state slot：

```text
plugins/task/
  src/
    manifest.ts
    plugin.ts
    syntax/
      taskSyntax.ts
      taskNodeExtension.ts
    commands/
      insertTaskSyntax.ts
      toggleTaskStatus.ts
      openTaskPage.ts
      resolveTaskBlocks.ts
    metadata/
      taskFields.ts
      taskFieldRenderers.tsx
      taskFieldEditors.tsx
    filters/
      allTasks.ts
      today.ts
      done.ts
      overdue.ts
      noEstimate.ts
      unlinkedTasks.ts
    views/
      TaskListItem.tsx
      TaskListView.tsx
    slots/
      TaskCheckboxSlot.tsx
      TaskHoverMenu.tsx
      TaskMetadataSlot.tsx
    indexers/
      taskIndexer.ts
```

### 9.1 Task Plugin 注册内容

TASK-018/TASK-022 当前实现位于 `src/plugins/task/plugin.ts`，并通过内置插件列表加载。

Task manifest 当前声明：

```ts
export const TaskPlugin: AppPlugin = {
  manifest: {
    id: "task",
    contributes: {
      markdownSyntax: [
        {
          id: "task.checkbox",
          name: "Checkbox task",
          syntax: "- [ ]"
        }
      ],
      metadataFields: [
        { id: "task.enabled", namespace: "task", key: "enabled", valueType: "boolean" },
        { id: "task.status", namespace: "task", key: "status", valueType: "string" },
        { id: "task.sourcePageId", namespace: "task", key: "sourcePageId", valueType: "string" },
        { id: "task.sourceBlockId", namespace: "task", key: "sourceBlockId", valueType: "string" },
        { id: "task.scheduled", namespace: "task", key: "scheduled", valueType: "date" },
        { id: "task.due", namespace: "task", key: "due", valueType: "date" }
      ]
    }
  },
  register(ctx) {
    registerTaskFilters(ctx);

    ctx.views.register({
      id: "task.page-list",
      type: "page.list",
      title: "Task page list",
      component: TaskPageListView,
      accepts: { kind: "filter-results.markdown-pages" }
    });

    ctx.slots.register({
      id: "task.filter-empty-state",
      slot: "filter.empty_state",
      order: 100,
      component: TaskFilterEmptyState
    });

    ctx.slots.register({
      id: "task.page-header-metadata.current-fields",
      slot: "page.header.metadata",
      order: 100,
      component: TaskMetadataSlot
    });

    ctx.commands.register({
      id: "task.resolve-task-block",
      title: "Resolve task block",
      handler: resolveTaskBlock
    });

    ctx.commands.register({
      id: "task.open-task-page",
      title: "Open task page",
      handler: openTaskPage
    });

    ctx.commands.register({
      id: "task.toggle-status",
      title: "Toggle task status",
      handler: toggleTaskStatus
    });
  }
};
```

当前没有注册 event type、metadata-field renderer 或 indexer。manifest syntax descriptor 只让 editor/runtime 能看到 `- [ ]` 语法贡献；它不会自动扫描正文或在保存时创建页面。manifest metadata fields 会让 Plugin Host 为 `task` namespace 派生 metadata owner reservation。

TASK-022 default filters：

```text
task.filter.all-tasks:
  name = All Tasks
  viewType = page.list
  query = metadata.task.enabled eq true

task.filter.today:
  name = Today
  viewType = page.list
  query =
    metadata.task.enabled eq true
    metadata.task.status neq "done"
    and (metadata.task.scheduled eq relative today
         or metadata.task.due eq relative today)
```

All Tasks includes done tasks and relies on the filter executor/listing path to exclude archived pages. Today compares date metadata with `valueType: "date"` and local `YYYY-MM-DD` values; `@date` parsing, date picker UI, `task.set_due` / `task.set-due`, Overdue / Done filters, and automatic save-time scanning/indexing are still deferred.

### 9.2 Task Syntax

用户输入：

```markdown
- [ ] 设计 Timer Plugin
```

TASK-017 把保存后的 textarea Markdown 表示为稳定 `blockId` 的 top-level `markdown.line` blocks。TASK-018 resolver 只接受 payload：

```ts
type ResolveTaskBlockInput = {
  sourcePageId: string;
  sourceBlockId: string;
};
```

由 app runtime / Command Service 执行命令；`ctx.commands` 不暴露 `execute`：

```ts
runtime.commands.execute("task.resolve-task-block", {
  sourcePageId,
  sourceBlockId
});
```

resolver 读取当前 source page，要求 `sourceBlockId` 在 top-level blocks 中唯一，且对应 block 是 `markdown.line`。任务标题从当前 source block 的文本派生，不接受调用方传入 title。当前识别未完成任务语法：

```text
0 到 3 个前导空格 + "- " + "[ ]" + 至少一个空白 + 非空标题
```

四个空格缩进、tab 缩进和 fenced code block 内的 task-looking line 都不是任务语法。`task.resolve-task-block` 仍只接受 unchecked `- [ ]` source task line；TASK-020 的 `task.open-task-page` 和 `task.toggle-status` 会读取 checked `- [x]` / `- [X]` source task line。

TASK-019 的 open command 输入与 resolver 相同：

```ts
type OpenTaskPageInput = {
  sourcePageId: string;
  sourceBlockId: string;
};
```

它调用同一 `resolveTaskPage` 路径，然后只返回：

```ts
type OpenTaskPageResult = {
  pageId: string;
};
```

UI/editor 不传 title 或 `boundPageId`，也不直接导航到 source block attrs 里的 page id。

TASK-020 的 toggle command 也只接受 source identity：

```ts
type ToggleTaskStatusInput = {
  sourcePageId: string;
  sourceBlockId: string;
};
```

它返回：

```ts
type ToggleTaskStatusResult = {
  pageId: string;
  status: "todo" | "done";
};
```

### 9.3 创建任务对应页面

```ts
async function resolveTaskBlock(input, context) {
  return context.transaction.run(tx => {
    const sourcePage = tx.pages.get(input.sourcePageId);
    const sourceBlock = findUniqueTopLevelBlock(sourcePage, input.sourceBlockId);
    const title = parseUncheckedTaskTitle(sourcePage.body.content, sourceBlock);

    const taskPage =
      findTaskPageByMetadata(tx, input) ??
      findVerifiedBoundPage(tx, sourceBlock, input) ??
      tx.pages.create({
        title,
        body: { type: "doc", content: [] }
      });

    ensureTaskMetadata(tx, taskPage.id, input);
    bindSourceBlockByCopyingPageBody(tx.pages, sourcePage, sourceBlock, {
      boundPageId: taskPage.id
    });

    return taskPage;
  });
}
```

TASK-018/TASK-020 当前写入 source relation/status metadata；TASK-022 manifest also declares date metadata:

```text
task.enabled = true
task.status = todo | done
task.sourcePageId = input.sourcePageId
task.sourceBlockId = input.sourceBlockId
task.scheduled = YYYY-MM-DD date metadata when seeded by caller/future UI
task.due = YYYY-MM-DD date metadata when seeded by caller/future UI
```

这些 metadata 写入通过 plugin-facing `metadata.set` 发生，`sourcePluginId` 由 Plugin Host 注入为 `task`。

重复检测使用 `(sourcePageId, sourceBlockId)` metadata relation。若 source block 已有 `attrs.boundPageId`，resolver 只有在该 bound page 的 `task.sourcePageId` 和 `task.sourceBlockId` 同时验证为同一 source relation 时才复用它；伪造、不匹配或 malformed `boundPageId` 不会被信任，按未绑定处理。Markdown save/import 当前不保留 block `attrs`，所以 resolver 也能从 metadata-only relation 恢复 source binding。

source binding 当前做法是复制 source page 的结构化 body，仅替换目标 block 的 `attrs.boundPageId`，再通过 `pages.update(sourcePage.id, { body })` 保存。创建任务页、写 task metadata、绑定 source block 必须在一个 transaction 中完成；任一步失败都不应留下部分页面或 metadata。

TASK-020 的 checkbox toggle 在同一个 transaction 中创建或复用 source relation task page、更新 source block checkbox marker、写 `task.status`，并 append event：

```text
- [ ] title -> - [x] title
  task.status = done
  event namespace = task
  event type = completed

- [x] title / - [X] title -> - [ ] title
  task.status = todo
  event namespace = task
  event type = reopened
```

event payload 包含 `taskPageId`、`sourcePageId`、`sourceBlockId`、`previousStatus` 和 `status`。`task.open-task-page` 可以为 unresolved checked source line 创建、绑定并打开 `done` task page，但这个 open 行为不是状态变化，不写 `completed` 或 `reopened` event。

---
