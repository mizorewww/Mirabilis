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

### 15.3 TASK-013 Rust persistence boundary

TASK-013 adds a private Rust-only SQLite layer under `src-tauri/src/db`:

```text
Database
migrations
repositories
types
DbError
```

The implementation uses `rusqlite` directly. It does not use `tauri-plugin-sql`, `sqlx`, or frontend-provided SQL. `Database::open(path)` opens a file-backed SQLite database and enables `PRAGMA foreign_keys = ON` for that connection. Raw `rusqlite::Connection` access stays crate-private through `Database::connection()`.

Core persistence is exposed to Rust code through table-specific repositories:

```text
PageRepository
MetadataRepository
EventRepository
FilterRepository
PluginRepository
CommandDescriptorRepository
ViewDescriptorRepository
```

Repositories accept typed Rust DTOs, serialize JSON fields through `serde_json::Value`, use static SQL with bound parameters, and parse corrupt stored JSON into typed `DbError::InvalidJson` errors. Frontend code and plugins do not receive a database connection, raw SQL executor, or SQL-shaped DTO.

TASK-013 intentionally does not add Rust IPC command handlers. `db_execute` and `db_transaction` remain NativeBridge command names for TASK-014 to implement through reviewed operation allowlists. TASK-013 also does not change Tauri capabilities, wire app bootstrap/providers, resolve the app data database path, add frontend NativeBridge operation allowlisting, or add WAL / `busy_timeout` / `trusted_schema` hardening. Those belong to TASK-014/bootstrap work.

---

## 16. SQLite Schema

Core 表保持极少。TASK-013 schema version is `1`, migration name is `001_core_schema`, and `apply_migrations` records it in `core_schema_migrations` before setting `PRAGMA user_version = 1`. Reapplying migrations is idempotent and must not drop existing user data.

### 16.1 core_schema_migrations

```sql
CREATE TABLE core_schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  checksum TEXT NOT NULL,
  applied_at TEXT NOT NULL
);
```

### 16.2 core_pages

```sql
CREATE TABLE core_pages (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  parent_page_id TEXT REFERENCES core_pages(id) ON DELETE SET NULL,
  body_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);
```

Important index:

```text
idx_core_pages_parent_page_id(parent_page_id)
```

### 16.3 core_metadata

```sql
CREATE TABLE core_metadata (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL REFERENCES core_pages(id) ON DELETE CASCADE,
  namespace TEXT NOT NULL,
  key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  value_type TEXT NOT NULL,
  source_plugin_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

Important index:

```text
idx_core_metadata_page_namespace_key(page_id, namespace, key) UNIQUE
```

### 16.4 core_events

```sql
CREATE TABLE core_events (
  id TEXT PRIMARY KEY,
  page_id TEXT REFERENCES core_pages(id) ON DELETE SET NULL,
  namespace TEXT NOT NULL,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  source_plugin_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
```

Important indexes:

```text
idx_core_events_page_created_id(page_id, created_at, id)
idx_core_events_namespace_type_created_id(namespace, type, created_at, id)
```

### 16.5 core_filters

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

Important index:

```text
idx_core_filters_source_view_name_id(source_plugin_id, view_type, name, id)
```

### 16.6 core_plugins

```sql
CREATE TABLE core_plugins (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  manifest_json TEXT NOT NULL,
  settings_json TEXT,
  installed_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

Important index:

```text
idx_core_plugins_enabled_name_id(enabled, name, id)
```

### 16.7 core_commands

`core_commands` stores inert command descriptors registered by plugins. It does not persist Rust handlers, JavaScript functions, dynamic imports, executable paths, or frontend components.

```sql
CREATE TABLE core_commands (
  id TEXT PRIMARY KEY,
  plugin_id TEXT NOT NULL REFERENCES core_plugins(id) ON DELETE CASCADE,
  command_id TEXT NOT NULL,
  title TEXT NOT NULL,
  shortcut TEXT,
  context TEXT NOT NULL
);
```

Important index:

```text
idx_core_commands_plugin_command(plugin_id, command_id) UNIQUE
```

### 16.8 core_views

`core_views` stores inert view descriptors and accepted data-shape metadata. It does not persist renderer components, executable code, or dynamic module paths.

```sql
CREATE TABLE core_views (
  id TEXT PRIMARY KEY,
  plugin_id TEXT NOT NULL REFERENCES core_plugins(id) ON DELETE CASCADE,
  view_type TEXT NOT NULL,
  name TEXT NOT NULL,
  accepted_data_shape_json TEXT NOT NULL
);
```

Important index:

```text
idx_core_views_plugin_view_name(plugin_id, view_type, name) UNIQUE
```

### 16.9 core_plugin_indexes

`core_plugin_indexes` is a neutral baseline registry for future plugin-owned index metadata. Each row belongs to the owning Core plugin through `plugin_id`, records the logical `index_name`, and records the backing `table_name`.

```sql
CREATE TABLE core_plugin_indexes (
  id TEXT PRIMARY KEY,
  plugin_id TEXT NOT NULL REFERENCES core_plugins(id) ON DELETE CASCADE,
  index_name TEXT NOT NULL,
  table_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

Important index:

```text
idx_core_plugin_indexes_plugin_index(plugin_id, index_name) UNIQUE
```

This table is not a task/timer/habit/stats/ml schema and does not allow plugins to submit dynamic DDL. Future plugin-owned indexes are rebuildable support data. Facts still live in:

```text
core_pages
core_metadata
core_events
core_filters
```

---
