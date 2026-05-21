# Core Kernel 设计

从代码层定义 Core Kernel 的 Store、Registry、Command 和 View 约束。

## 4. Core Kernel 设计

Core Kernel 只做下面这些。

```text
Markdown Page
Metadata
Event
Filter
View Registry
Command Registry
Plugin Host
```

### 4.1 Markdown Page Store

```ts
export interface MarkdownPage {
  id: string;
  title: string;
  parentPageId?: string;
  body: StructuredMarkdownDocument;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
}
```

TASK-017 当前的 `body` 是过渡期的结构化 Markdown 文档，不是 Tiptap / ProseMirror JSON。Core 暴露三个公共 helper：

```ts
importMarkdownToStructuredDocument(markdown, options);
exportStructuredDocumentToMarkdown(document);
validateStructuredMarkdownDocument(document, options);
```

`importMarkdownToStructuredDocument()` 以 line-oriented 方式导入 Markdown：输入里的每一行都会成为一个 `markdown.line` block，包括空行。每个 block 都有非空、稳定的 `blockId`。`exportStructuredDocumentToMarkdown()` 把这些 blocks 按行导回编辑器 Markdown；TASK-017 的测试覆盖当前 textarea 支持样例的可见 Markdown 文本保持不变。`validateStructuredMarkdownDocument()` 在 Core 边界检查 `doc` root、array content、唯一非空 `blockId`、深度/数量限制，以及 `attrs` / `marks` 里的 executable-like 值。

后续 rich editor 可以把这个结构迁移或适配到 Tiptap / ProseMirror schema，但 TASK-017 没有引入 rich editor、CommonMark AST round-tripping 或原生文件系统导入导出。

页面中的内容可以长这样：

```markdown
文本123

- [ ] 任务1

文本456

- [ ] 任务2
```

系统内部应存为结构化 block：

```ts
type StructuredMarkdownDocument = {
  type: "doc";
  content: BlockNode[];
};
```

每个 block 必须有稳定 `blockId`。
当前 TASK-017 导入后的顶层 block 形状是：

```ts
{
  blockId: "block_...",
  type: "markdown.line",
  text: "原始 Markdown 行"
}
```

空行也会保留为 `text: ""` 的 `markdown.line` block。编辑时，导入器会结合上一版文档保留既有 block ID，覆盖普通编辑、插入、删除、重复文本、deleted-ID collision 和相似插入行场景。

---

### 4.2 Metadata Store

Metadata 是所有结构化字段的统一存储。

```ts
export interface MetadataRecord {
  id: string;
  pageId: string;
  namespace: string;
  key: string;
  value: unknown;
  valueType: MetadataValueType;
  sourcePluginId: string;
  createdAt: string;
  updatedAt: string;
}
```

示例：

```ts
{
  pageId: "page_123",
  namespace: "task",
  key: "status",
  value: "todo",
  sourcePluginId: "task"
}
```

```ts
{
  pageId: "page_123",
  namespace: "timer",
  key: "totalTrackedTime",
  value: 7200,
  sourcePluginId: "timer"
}
```

关系类信息也放在 Metadata 里，例如：

```ts
{
  pageId: "task_page_123",
  namespace: "task",
  key: "sourceBlockId",
  value: "block_abc"
}
```

这样 Core 不需要单独的 Relation 模型。

---

### 4.3 Event Store

Event 是事实记录。

```ts
export interface AppEvent {
  id: string;
  pageId?: string;
  namespace: string;
  type: string;
  payload: unknown;
  sourcePluginId: string;
  createdAt: string;
}
```

示例：

```ts
{
  namespace: "timer",
  type: "time_segment_created",
  pageId: "task_page_123",
  payload: {
    startAt: "2026-05-19T10:00:00+08:00",
    endAt: "2026-05-19T10:47:00+08:00",
    durationSeconds: 2820,
    notePageId: "page_note_456"
  },
  sourcePluginId: "timer"
}
```

所有插件都通过 Event Store 记录事实。

---

### 4.4 Filter Store

Filter 是保存的查询。

```ts
export interface FilterDefinition {
  id: string;
  name: string;
  query: FilterQuery;
  sort?: FilterSort[];
  group?: FilterGroup;
  viewType: string;
  sourcePluginId?: string;
  createdAt: string;
  updatedAt: string;
}
```

示例：

```ts
{
  id: "task.filter.all-tasks",
  name: "All Tasks",
  query: {
    where: [
      { field: "metadata.task.enabled", op: "eq", value: true }
    ]
  },
  viewType: "page.list",
  sourcePluginId: "task"
}
```

Core 保存 Filter。
TASK-022 当前还导出 data-only `executeFilterQuery`，用于对 current pages 和 metadata records 执行受限 query subset。它不读取 Filter Store、不会 mutation stores、不会执行插件代码，并排除 archived pages。当前 subset 覆盖 metadata field paths、`eq` / `neq` / `gt` / `lt` / `includes` / `exists`、`and` / `or`；`within` 仍是 legal AST/store operator，但当前 executor 不实现 Event/plugin-index 语义并 fail closed。Filter 的高级 UI、排序/分组、JS filters、Event/plugin-index execution 和 app-shell route wiring 仍由后续 Filter Plugin / App Shell 扩展。

---

### 4.5 View Registry

插件注册 View。

```ts
export interface ViewDefinition {
  id: string;
  pluginId: string;
  type: string;
  title: string;
  component: React.ComponentType<ViewProps>;
  accepts: ViewDataShape;
}
```

示例：

```ts
viewRegistry.register({
  id: "task.page-list",
  pluginId: "task",
  type: "page.list",
  title: "Task page list",
  component: TaskPageListView,
  accepts: {
    kind: "filter-results.markdown-pages"
  }
});
```

`page.list` 是当前 canonical filter result list view type。Task Plugin 的 All Tasks / Today filters 和 Tag Plugin 的 `tag.create-filter` saved filters 都使用 `viewType: "page.list"`，避免把 generic page results 绑定到 task-only view type。

---

### 4.6 Command Registry

所有用户动作都通过 Command 注册。

```ts
export interface CommandDefinition<Input = unknown, Output = unknown> {
  id: string;
  pluginId: string;
  title: string;
  description?: string;
  defaultShortcut?: string;
  context?: CommandContextMatcher;
  handler: CommandHandler<Input, Output>;
}
```

示例：

```ts
commandRegistry.register({
  id: "task.insert-task-syntax",
  pluginId: "task",
  title: "Insert task",
  handler: async ({ editor }) => {
    editor.insertText("- [ ] ");
  }
});
```

UI 不直接调用业务函数。
UI 调用 command。

```ts
runtime.commands.execute("timer.start", { pageId });
```

---
