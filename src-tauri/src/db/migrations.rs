use rusqlite::{params, OptionalExtension};

use super::{Database, DbResult};

pub const LATEST_SCHEMA_VERSION: i64 = 1;

const MIGRATION_001_NAME: &str = "001_core_schema";
const MIGRATION_001_CHECKSUM: &str = "mirabilis-core-schema-v1";

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AppliedMigration {
    pub version: i64,
    pub name: String,
    pub checksum: String,
    pub applied_at: String,
}

pub fn apply_migrations(database: &Database) -> DbResult<()> {
    database
        .connection()
        .execute_batch(CORE_SCHEMA_LEDGER_SQL)?;
    database
        .connection()
        .execute_batch(CORE_SCHEMA_MIGRATION_SQL)?;
    database.connection().execute(
        "INSERT OR IGNORE INTO core_schema_migrations (version, name, checksum, applied_at)
         VALUES (?1, ?2, ?3, datetime('now'))",
        params![
            LATEST_SCHEMA_VERSION,
            MIGRATION_001_NAME,
            MIGRATION_001_CHECKSUM
        ],
    )?;
    database
        .connection()
        .pragma_update(None, "user_version", LATEST_SCHEMA_VERSION)?;
    Ok(())
}

pub fn applied_migrations(database: &Database) -> DbResult<Vec<AppliedMigration>> {
    let mut statement = database.connection().prepare(
        "SELECT version, name, checksum, applied_at
         FROM core_schema_migrations
         ORDER BY version ASC",
    )?;
    let rows = statement.query_map([], |row| {
        Ok(AppliedMigration {
            version: row.get(0)?,
            name: row.get(1)?,
            checksum: row.get(2)?,
            applied_at: row.get(3)?,
        })
    })?;

    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

pub fn schema_version(database: &Database) -> DbResult<i64> {
    database
        .connection()
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .optional()?
        .map_or(Ok(0), Ok)
}

const CORE_SCHEMA_LEDGER_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS core_schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  checksum TEXT NOT NULL,
  applied_at TEXT NOT NULL
);
"#;

const CORE_SCHEMA_MIGRATION_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS core_pages (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  parent_page_id TEXT REFERENCES core_pages(id) ON DELETE SET NULL,
  body_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_core_pages_parent_page_id
  ON core_pages (parent_page_id);

CREATE TABLE IF NOT EXISTS core_metadata (
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_core_metadata_page_namespace_key
  ON core_metadata (page_id, namespace, key);

CREATE TABLE IF NOT EXISTS core_events (
  id TEXT PRIMARY KEY,
  page_id TEXT REFERENCES core_pages(id) ON DELETE SET NULL,
  namespace TEXT NOT NULL,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  source_plugin_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_core_events_page_created_id
  ON core_events (page_id, created_at, id);

CREATE INDEX IF NOT EXISTS idx_core_events_namespace_type_created_id
  ON core_events (namespace, type, created_at, id);

CREATE TABLE IF NOT EXISTS core_filters (
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

CREATE INDEX IF NOT EXISTS idx_core_filters_source_view_name_id
  ON core_filters (source_plugin_id, view_type, name, id);

CREATE TABLE IF NOT EXISTS core_plugins (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  manifest_json TEXT NOT NULL,
  settings_json TEXT,
  installed_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_core_plugins_enabled_name_id
  ON core_plugins (enabled, name, id);

CREATE TABLE IF NOT EXISTS core_commands (
  id TEXT PRIMARY KEY,
  plugin_id TEXT NOT NULL REFERENCES core_plugins(id) ON DELETE CASCADE,
  command_id TEXT NOT NULL,
  title TEXT NOT NULL,
  shortcut TEXT,
  context TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_core_commands_plugin_command
  ON core_commands (plugin_id, command_id);

CREATE TABLE IF NOT EXISTS core_views (
  id TEXT PRIMARY KEY,
  plugin_id TEXT NOT NULL REFERENCES core_plugins(id) ON DELETE CASCADE,
  view_type TEXT NOT NULL,
  name TEXT NOT NULL,
  accepted_data_shape_json TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_core_views_plugin_view_name
  ON core_views (plugin_id, view_type, name);

CREATE TABLE IF NOT EXISTS core_plugin_indexes (
  id TEXT PRIMARY KEY,
  plugin_id TEXT NOT NULL,
  index_name TEXT NOT NULL,
  table_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_core_plugin_indexes_plugin_index
  ON core_plugin_indexes (plugin_id, index_name);
"#;
