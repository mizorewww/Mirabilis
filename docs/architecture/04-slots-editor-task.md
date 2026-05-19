# Slot、编辑器与 Task 插件架构

把 Slot Registry、Markdown Editor Plugin 和 Task Plugin 的实现结构放在一起，方便实现最早期闭环。

## 7. Slot 系统

Slot 是插件挂 UI 的地方。

### 7.1 SlotRegistry

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

Markdown Editor Plugin 是必需插件。

它负责编辑器体验，但任务语义仍由 Task Plugin 负责。

### 8.1 注册内容

```ts
export const MarkdownEditorPlugin: AppPlugin = {
  manifest,
  register(ctx) {
    ctx.views.register({
      id: "markdown.page-editor",
      pluginId: "markdown-editor",
      type: "page.editor",
      component: MarkdownPageEditor,
      accepts: { kind: "markdown-page" }
    });

    ctx.commands.register({
      id: "markdown.insert-text",
      pluginId: "markdown-editor",
      title: "Insert text",
      handler: insertTextHandler
    });

    ctx.slots.register({
      slot: "editor.mobile.toolbar",
      pluginId: "markdown-editor",
      component: BaseMarkdownToolbar
    });
  }
};
```

### 8.2 编辑器扩展收集

编辑器启动时从所有插件收集扩展：

```ts
const editorExtensions = runtime.markdown.collectEditorExtensions();
```

Task Plugin 提供 task block extension。
Tag Plugin 提供 tag token extension。
Date Plugin 提供 date token extension。
Page Link Plugin 提供 `[[page]]` extension。

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

```ts
export const TaskPlugin: AppPlugin = {
  manifest,

  register(ctx) {
    registerTaskSyntax(ctx);
    registerTaskMetadataFields(ctx);
    registerTaskCommands(ctx);
    registerTaskFilters(ctx);
    registerTaskViews(ctx);
    registerTaskSlots(ctx);
    registerTaskIndexers(ctx);
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

如果没有 `boundPageId`，执行：

```ts
ctx.commands.execute("task.resolve-task-block", {
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

    await tx.metadata.set(taskPage.id, {
      namespace: "task",
      key: "enabled",
      value: true,
      sourcePluginId: "task"
    });

    await tx.metadata.set(taskPage.id, {
      namespace: "task",
      key: "status",
      value: "todo",
      sourcePluginId: "task"
    });

    await tx.metadata.set(taskPage.id, {
      namespace: "task",
      key: "sourcePageId",
      value: input.sourcePageId,
      sourcePluginId: "task"
    });

    await tx.metadata.set(taskPage.id, {
      namespace: "task",
      key: "sourceBlockId",
      value: input.sourceBlockId,
      sourcePluginId: "task"
    });

    await tx.pages.updateBlockAttrs(input.sourcePageId, input.sourceBlockId, {
      boundPageId: taskPage.id
    });
  });
}
```

开发时可以不照抄这段，但事务边界要保持：

```text
创建任务页面
写 task metadata
绑定 source block
更新编辑器 block attrs
```

这些必须在一个 transaction 中完成。

---
