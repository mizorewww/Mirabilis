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

TASK-014 的 Rust IPC 命令必须匹配当前 `NATIVE_BRIDGE_COMMANDS` 合约：

| NativeBridge method | Tauri command | Payload envelope |
| --- | --- | --- |
| `db.execute(query)` | `db_execute` | `{ query }` |
| `db.transaction(queries)` | `db_transaction` | `{ queries }` |
| `shortcuts.register(shortcut, commandId)` | `shortcuts_register` | `{ shortcut, commandId }` |
| `shortcuts.unregister(shortcut)` | `shortcuts_unregister` | `{ shortcut }` |
| `notifications.notify(input)` | `notifications_notify` | `{ input }` |
| `files.importMarkdown(path)` | `files_import_markdown` | `{ path }` |
| `files.exportMarkdown(pageId, path)` | `files_export_markdown` | `{ pageId, path }` |

Payload envelope keys stay camelCase on the TypeScript side.

```ts
type DbValue =
  | string
  | number
  | boolean
  | null
  | readonly DbValue[]
  | { readonly [key: string]: DbValue };

type DbQuery = {
  operation: string;
  payload?: DbValue;
};

type NativeBridgeErrorCode =
  | "NATIVE_COMMAND_FAILED"
  | "NATIVE_RESPONSE_INVALID";
```

`DbQuery` is an operation DTO, not a raw SQL DTO. `operation` is the Rust allowlist key and `payload` is JSON-compatible data. TASK-014 must translate allowed operations to repositories / SQL on the Rust side; frontend SQL strings are not part of the contract.

Native command failures throw `NativeBridgeError` with `code: "NATIVE_COMMAND_FAILED"` and the command name. The public failure message is the stable redacted string `Native command failed`. `NATIVE_RESPONSE_INVALID` is reserved for bridge response validation failures before returning typed frontend values.

UI components and plugins do not call Tauri APIs directly. Plugins use Core Services; Core Services use NativeBridge; NativeBridge uses Tauri commands.

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
