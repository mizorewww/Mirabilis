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

Markdown Editor Plugin 是 TASK-016/TASK-017 后的内置插件，manifest id 是 `markdown`。

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

TASK-017 已实现稳定 block ID 与内部 Markdown import/export。仍未实现 `@date`、autocomplete、slash menu、task checkbox toggle、tag indexing、page-link navigation、semantic task/tag/page-link behavior、rich editor behavior、Tiptap/ProseMirror adaptation、完整 CommonMark AST round-tripping、原生文件系统 Markdown import/export、以及用户可见的 load/save 错误 UX。

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

TASK-018 后，内置 Task Plugin 已提供 `task.checkbox` task block syntax descriptor，syntax 为 `- [ ]`。它和 Markdown Plugin 的 descriptor 一样只是 inert manifest metadata；编辑器保存时不会因为收集到 descriptor 而自动创建任务页。真正的 TASK-018 创建行为发生在 `task.resolve-task-block` command handler 中。

后续 Tag Plugin 可以提供 tag token descriptor，Date Plugin 可以提供 date token descriptor，Page Link Plugin 可以提供 `[[page]]` descriptor。自动索引、点击导航、filter/view refresh 和 rich editor adaptation 仍未实现。

---

## 9. Task Plugin 代码架构

Task Plugin 是最重要的插件之一。
长期目录可能长这样；TASK-018 当前只实现内置 `TaskPlugin` 的 syntax descriptor 和 resolver command：

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

TASK-018 当前实现位于 `src/plugins/task/plugin.ts`，并通过内置插件列表加载。

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
      ]
    }
  },
  register(ctx) {
    ctx.commands.register({
      id: "task.resolve-task-block",
      title: "Resolve task block",
      handler: resolveTaskBlock
    });
  }
};
```

当前没有注册 task view、slot、filter、event type、metadata-field renderer、indexer 或 checkbox toggle command。manifest syntax descriptor 只让 editor/runtime 能看到 `- [ ]` 语法贡献；它不会自动解析正文或创建页面。

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

四个空格缩进、tab 缩进和 fenced code block 内的 task-looking line 都不是任务语法；`- [x]` 当前也不是 TASK-018 行为。

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

TASK-018 当前写入 metadata：

```text
task.enabled = true
task.status = todo
task.sourcePageId = input.sourcePageId
task.sourceBlockId = input.sourceBlockId
```

这些 metadata 写入通过 plugin-facing `metadata.set` 发生，`sourcePluginId` 由 Plugin Host 注入为 `task`。

重复检测使用 `(sourcePageId, sourceBlockId)` metadata relation。若 source block 已有 `attrs.boundPageId`，resolver 只有在该 bound page 的 `task.sourcePageId` 和 `task.sourceBlockId` 同时验证为同一 source relation 时才复用它；伪造或不匹配的 `boundPageId` 不会被信任。Markdown save/import 当前不保留 block `attrs`，所以 resolver 也能从 metadata-only relation 恢复 source binding。

source binding 当前做法是复制 source page 的结构化 body，仅替换目标 block 的 `attrs.boundPageId`，再通过 `pages.update(sourcePage.id, { body })` 保存。创建任务页、写 task metadata、绑定 source block 必须在一个 transaction 中完成；任一步失败都不应留下部分页面或 metadata。

---
