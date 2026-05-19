# Filter、Native 边界与 SQLite

整理 Filter Engine、Tauri/Rust NativeBridge 边界，以及 Core SQLite Schema。

## 14. Filter Engine 设计

Filter Engine 查询 Core Store + Plugin Index。

### 14.1 Query AST

```ts
type FilterQuery = {
  where: FilterCondition[];
  and?: FilterQuery[];
  or?: FilterQuery[];
};

type FilterCondition = {
  field: string;
  op: "eq" | "neq" | "gt" | "lt" | "includes" | "exists" | "within";
  value?: unknown;
};
```

示例：

```ts
{
  where: [
    { field: "metadata.task.enabled", op: "eq", value: true },
    { field: "metadata.task.status", op: "neq", value: "done" },
    { field: "metadata.tag.tags", op: "includes", value: "product" }
  ]
}
```

### 14.2 JS Filter

JS Filter 作为 Filter Plugin 的高级能力。

```ts
ctx.commands.register({
  id: "filter.create-js-filter",
  pluginId: "filter",
  title: "Create JavaScript filter",
  handler: createJsFilter
});
```

JS filter 输入对象：

```ts
type FilterItem = {
  page: MarkdownPage;
  metadata: Record<string, unknown>;
  events: AppEvent[];
  aggregates: Record<string, unknown>;
};
```

示例：

```js
item.metadata.task?.enabled &&
item.metadata.task?.status !== "done" &&
item.metadata.tag?.tags?.includes("product") &&
item.aggregates.timer?.lastTrackedWithinDays <= 7
```

---

## 15. Tauri / Rust 边界

### 15.1 Rust 负责

```text
SQLite connection
SQL migrations
File import / export
Global shortcut
Notifications
Window / tray
Native filesystem
Sync transport
App updater
```

Tauri 官方提供全局快捷键插件，前端和 Rust 都能使用；SQL、Store、文件系统等也属于 Tauri 插件生态中的常见 native 能力。([Tauri](https://v2.tauri.app/plugin/global-shortcut/ "Global Shortcut"))

### 15.2 TypeScript 通过 NativeBridge 访问 Rust

```ts
export interface NativeBridge {
  db: {
    execute<T>(query: DbQuery): Promise<T>;
    transaction<T>(queries: DbQuery[]): Promise<T>;
  };

  shortcuts: {
    register(shortcut: string, commandId: string): Promise<void>;
    unregister(shortcut: string): Promise<void>;
  };

  notifications: {
    notify(input: NotificationInput): Promise<void>;
  };

  files: {
    importMarkdown(path: string): Promise<string>;
    exportMarkdown(pageId: string, path: string): Promise<void>;
  };
}
```

前端插件不直接调用 Tauri API。
插件通过 Core Services。
Core Services 通过 NativeBridge。
NativeBridge 通过 Tauri commands。

---

## 16. SQLite Schema

Core 表保持极少。

### 16.1 core_pages

```sql
CREATE TABLE core_pages (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  parent_page_id TEXT,
  body_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);
```

### 16.2 core_metadata

```sql
CREATE TABLE core_metadata (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL,
  namespace TEXT NOT NULL,
  key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  value_type TEXT NOT NULL,
  source_plugin_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### 16.3 core_events

```sql
CREATE TABLE core_events (
  id TEXT PRIMARY KEY,
  page_id TEXT,
  namespace TEXT NOT NULL,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  source_plugin_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
```

### 16.4 core_filters

```sql
CREATE TABLE core_filters (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  query_json TEXT NOT NULL,
  sort_json TEXT,
  group_json TEXT,
  view_type TEXT NOT NULL,
  source_plugin_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### 16.5 core_plugins

```sql
CREATE TABLE core_plugins (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  enabled INTEGER NOT NULL,
  manifest_json TEXT NOT NULL,
  settings_json TEXT,
  installed_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### 16.6 plugin-owned indexes

插件可以拥有自己的 index 表：

```text
plugin_task_index
plugin_tag_index
plugin_timer_segments
plugin_habit_completion_index
plugin_stats_cache
plugin_ml_feature_store
```

这些表是可重建的。
事实数据仍然在：

```text
core_pages
core_metadata
core_events
core_filters
```

---
