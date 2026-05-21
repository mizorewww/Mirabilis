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

### 7.3 SlotRenderer

```tsx
<SlotRenderer
  slot="page.header.metadata"
  props={{ pageId }}
/>
```

如果当前页面是任务页，Task Plugin 会在这里渲染：

```text
todo · due · estimate
```

Timer Plugin 会渲染：

```text
tracked 2h10m · Start
```

Tag Plugin 会渲染：

```text
#product #timer
```

Habit Plugin 会渲染：

```text
habit daily
```

ML Plugin 可以渲染：

```text
预计剩余 6–9h
```

---

## 8. Markdown Editor Plugin

Markdown Editor Plugin 是 TASK-016 后的内置插件，manifest id 是 `markdown`。

它负责最小 Markdown 编辑体验，但任务、标签、日期、页面链接和富编辑语义仍由后续插件或编辑器任务负责。

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

### 8.2 TASK-016 编辑器 shell

当前编辑器是受控 `<textarea>` shell，不是 Tiptap / ProseMirror / rich editor：

- `MarkdownPageEditor` 用 `value` + synchronous `onChange` 保存 textarea 状态，保留用户输入的 Markdown 文本。
- 基线输入覆盖 heading、paragraph、list、task syntax text、tag text 和 page-link text，但只按普通文本保存。
- `BaseMarkdownToolbar` 只插入三个 literal snippet：`- [ ] `、`#`、`[[ ]]`。
- 工具栏调用 editor 的 `insertText()`，editor 再通过 `commands.execute("markdown.insert-text", input)` 走 command bus。
- `markdown.insert-text` 归一化 selection offset；省略 `selectionEnd` 时使用归一化后的 `selectionStart`，返回新的 `markdown`、`selectionStart` 和 `selectionEnd`。
- 异步插入会在 await command 前 snapshot page id、当前 markdown、selection 和内容 generation。command 结果回来时，如果 page 或内容 generation 已变化，结果会被丢弃，避免慢 command 覆盖用户后续输入或页面切换。
- 通过 `pageFacade` 加载页面时，页面切换会进入 loading state 并禁用编辑/保存；save 完成后只有在仍是同一页面且内容 generation 未变化时才应用 saved markdown。

TASK-016 明确不实现 `@date`、autocomplete、slash menu、task checkbox toggle、tag indexing、page-link navigation、semantic task/tag/page-link behavior、stable block IDs、Markdown import/export 或 rich editor behavior。

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

它只通过 NativeBridge DB allowlist 调用 `core.pages.get` 和 `core.pages.update` DTO，并把 Markdown 文本包装为当前窄结构：

```ts
{
  type: "doc",
  content: [{ type: "markdown.text", text: markdown }]
}
```

这个 facade 不接受 raw SQL、SQL params、filesystem path 或 file DTO。它也不表示 Core stores 已经整体改为 SQLite-backed；`storage.persistence` 仍是 `"in-memory-core"`，TASK-016 只为 Markdown editor save/reopen 提供 narrow NativeBridge page path。

后续 Task Plugin 可以提供 task block syntax descriptor，Tag Plugin 可以提供 tag token descriptor，Date Plugin 可以提供 date token descriptor，Page Link Plugin 可以提供 `[[page]]` descriptor。真正的解析、索引、导航和 rich editor adaptation 仍未实现。

---

## 9. Task Plugin 代码架构

Task Plugin 是最重要的插件之一。

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

Task manifest 声明 markdown syntax、metadata fields、event types、default filters 和 indexers 等 descriptor。
当前 `register(ctx)` 只注册 TASK-010 已暴露的 runtime facades：commands、views 和 slots。

```ts
export const TaskPlugin: AppPlugin = {
  manifest,

  register(ctx) {
    registerTaskCommands(ctx);
    registerTaskViews(ctx);
    registerTaskSlots(ctx);
  }
};
```

### 9.2 Task Syntax

用户输入：

```markdown
- [ ] 设计 Timer Plugin
```

Task Plugin 解析成：

```ts
type TaskBlock = {
  blockId: string;
  type: "task";
  checked: boolean;
  text: string;
  boundPageId?: string;
};
```

如果没有 `boundPageId`，由 app runtime / Command Service 执行命令；TASK-010 的 `PluginCommandRegistry` 不在 `ctx.commands` 上暴露 `execute`：

```ts
runtime.commands.execute("task.resolve-task-block", {
  sourcePageId,
  sourceBlockId,
  title: "设计 Timer Plugin"
});
```

### 9.3 创建任务对应页面

```ts
async function resolveTaskBlock(ctx, input) {
  await ctx.transaction.run(async tx => {
    const taskPage = await tx.pages.create({
      title: input.title,
      parentPageId: undefined,
      body: createEmptyMarkdownDoc()
    });

    await tx.metadata.set({
      pageId: taskPage.id,
      namespace: "task",
      key: "enabled",
      value: true,
      valueType: "boolean"
    });

    await tx.metadata.set({
      pageId: taskPage.id,
      namespace: "task",
      key: "status",
      value: "todo",
      valueType: "string"
    });

    await tx.metadata.set({
      pageId: taskPage.id,
      namespace: "task",
      key: "sourcePageId",
      value: input.sourcePageId,
      valueType: "string"
    });

    await tx.metadata.set({
      pageId: taskPage.id,
      namespace: "task",
      key: "sourceBlockId",
      value: input.sourceBlockId,
      valueType: "string"
    });

    await tx.pages.updateBlockAttrs(input.sourcePageId, input.sourceBlockId, {
      boundPageId: taskPage.id
    });
  });
}
```

以上 metadata 写入示例按当前 plugin-facing store 形状省略 `sourcePluginId`；Plugin Host 会注入来源插件身份。
`updateBlockAttrs` 是后续编辑器桥接能力的占位，不属于 TASK-010 当前 `PluginContext`。

开发时可以不照抄这段，但事务边界要保持：

```text
创建任务页面
写 task metadata
绑定 source block
更新编辑器 block attrs
```

这些必须在一个 transaction 中完成。

---
