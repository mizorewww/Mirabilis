use rusqlite::{params, OptionalExtension, Row};
use serde_json::Value;

use super::types::{
    CommandDescriptorRecord, EventListOptions, EventRecord, FilterListOptions, FilterRecord,
    MetadataRecord, NewEvent, NewPage, PageListOptions, PageRecord, PluginRecord, UpdatePage,
    UpsertCommandDescriptor, UpsertFilter, UpsertMetadata, UpsertPlugin, UpsertViewDescriptor,
    ViewDescriptorRecord,
};
use super::{Database, DbError, DbResult};

pub struct PageRepository<'db> {
    database: &'db Database,
}

impl<'db> PageRepository<'db> {
    pub fn new(database: &'db Database) -> Self {
        Self { database }
    }

    pub fn create(&self, input: NewPage) -> DbResult<()> {
        let body_json = json_to_text(&input.body)?;
        self.database.connection().execute(
            "INSERT INTO core_pages
             (id, title, parent_page_id, body_json, created_at, updated_at, archived_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL)",
            params![
                input.id.as_str(),
                input.title.as_str(),
                input.parent_page_id.as_deref(),
                body_json.as_str(),
                input.created_at.as_str(),
                input.updated_at.as_str()
            ],
        )?;
        Ok(())
    }

    pub fn get(&self, id: &str) -> DbResult<Option<PageRecord>> {
        let row = self
            .database
            .connection()
            .query_row(
                "SELECT id, title, parent_page_id, body_json, created_at, updated_at, archived_at
                 FROM core_pages
                 WHERE id = ?1",
                params![id],
                page_row,
            )
            .optional()?;
        row.map(PageRow::into_record).transpose()
    }

    pub fn list(&self, options: PageListOptions) -> DbResult<Vec<PageRecord>> {
        let include_archived = i64::from(options.include_archived);
        let parent_page_id = options.parent_page_id.as_deref();
        let mut statement = self.database.connection().prepare(
            "SELECT id, title, parent_page_id, body_json, created_at, updated_at, archived_at
             FROM core_pages
             WHERE (?1 = 1 OR archived_at IS NULL)
               AND (?2 IS NULL OR parent_page_id = ?2)
             ORDER BY created_at ASC, id ASC",
        )?;
        let rows = statement.query_map(params![include_archived, parent_page_id], page_row)?;
        collect_rows(rows, PageRow::into_record)
    }

    pub fn update(&self, input: UpdatePage) -> DbResult<()> {
        let body_json = json_to_text(&input.body)?;
        self.database.connection().execute(
            "UPDATE core_pages
             SET title = ?2,
                 parent_page_id = ?3,
                 body_json = ?4,
                 updated_at = ?5
             WHERE id = ?1",
            params![
                input.id.as_str(),
                input.title.as_str(),
                input.parent_page_id.as_deref(),
                body_json.as_str(),
                input.updated_at.as_str()
            ],
        )?;
        Ok(())
    }

    pub fn archive(&self, id: &str, archived_at: &str) -> DbResult<()> {
        self.database.connection().execute(
            "UPDATE core_pages
             SET archived_at = ?2,
                 updated_at = ?2
             WHERE id = ?1",
            params![id, archived_at],
        )?;
        Ok(())
    }
}

pub struct MetadataRepository<'db> {
    database: &'db Database,
}

impl<'db> MetadataRepository<'db> {
    pub fn new(database: &'db Database) -> Self {
        Self { database }
    }

    pub fn upsert(&self, input: UpsertMetadata) -> DbResult<()> {
        let value_json = json_to_text(&input.value)?;
        self.database.connection().execute(
            "INSERT INTO core_metadata
             (id, page_id, namespace, key, value_json, value_type, source_plugin_id, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
             ON CONFLICT(id) DO UPDATE SET
               page_id = excluded.page_id,
               namespace = excluded.namespace,
               key = excluded.key,
               value_json = excluded.value_json,
               value_type = excluded.value_type,
               source_plugin_id = excluded.source_plugin_id,
               created_at = excluded.created_at,
               updated_at = excluded.updated_at",
            params![
                input.id.as_str(),
                input.page_id.as_str(),
                input.namespace.as_str(),
                input.key.as_str(),
                value_json.as_str(),
                input.value_type.as_str(),
                input.source_plugin_id.as_str(),
                input.created_at.as_str(),
                input.updated_at.as_str()
            ],
        )?;
        Ok(())
    }

    pub fn get(&self, id: &str) -> DbResult<Option<MetadataRecord>> {
        let row = self
            .database
            .connection()
            .query_row(
                "SELECT id, page_id, namespace, key, value_json, value_type, source_plugin_id, created_at, updated_at
                 FROM core_metadata
                 WHERE id = ?1",
                params![id],
                metadata_row,
            )
            .optional()?;
        row.map(MetadataRow::into_record).transpose()
    }

    pub fn list_for_page(&self, page_id: &str) -> DbResult<Vec<MetadataRecord>> {
        let mut statement = self.database.connection().prepare(
            "SELECT id, page_id, namespace, key, value_json, value_type, source_plugin_id, created_at, updated_at
             FROM core_metadata
             WHERE page_id = ?1
             ORDER BY created_at ASC, id ASC",
        )?;
        let rows = statement.query_map(params![page_id], metadata_row)?;
        collect_rows(rows, MetadataRow::into_record)
    }

    pub fn delete(&self, id: &str) -> DbResult<()> {
        self.database
            .connection()
            .execute("DELETE FROM core_metadata WHERE id = ?1", params![id])?;
        Ok(())
    }
}

pub struct EventRepository<'db> {
    database: &'db Database,
}

impl<'db> EventRepository<'db> {
    pub fn new(database: &'db Database) -> Self {
        Self { database }
    }

    pub fn append(&self, input: NewEvent) -> DbResult<()> {
        let payload_json = json_to_text(&input.payload)?;
        self.database.connection().execute(
            "INSERT INTO core_events
             (id, page_id, namespace, type, payload_json, source_plugin_id, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                input.id.as_str(),
                input.page_id.as_deref(),
                input.namespace.as_str(),
                input.event_type.as_str(),
                payload_json.as_str(),
                input.source_plugin_id.as_str(),
                input.created_at.as_str()
            ],
        )?;
        Ok(())
    }

    pub fn get(&self, id: &str) -> DbResult<Option<EventRecord>> {
        let row = self
            .database
            .connection()
            .query_row(
                "SELECT id, page_id, namespace, type, payload_json, source_plugin_id, created_at
                 FROM core_events
                 WHERE id = ?1",
                params![id],
                event_row,
            )
            .optional()?;
        row.map(EventRow::into_record).transpose()
    }

    pub fn list(&self, options: EventListOptions) -> DbResult<Vec<EventRecord>> {
        let page_id = options.page_id.as_deref();
        let namespace = options.namespace.as_deref();
        let event_type = options.event_type.as_deref();
        let mut statement = self.database.connection().prepare(
            "SELECT id, page_id, namespace, type, payload_json, source_plugin_id, created_at
             FROM core_events
             WHERE (?1 IS NULL OR page_id = ?1)
               AND (?2 IS NULL OR namespace = ?2)
               AND (?3 IS NULL OR type = ?3)
             ORDER BY created_at ASC, id ASC",
        )?;
        let rows = statement.query_map(params![page_id, namespace, event_type], event_row)?;
        collect_rows(rows, EventRow::into_record)
    }
}

pub struct FilterRepository<'db> {
    database: &'db Database,
}

impl<'db> FilterRepository<'db> {
    pub fn new(database: &'db Database) -> Self {
        Self { database }
    }

    pub fn upsert(&self, input: UpsertFilter) -> DbResult<()> {
        let query_json = json_to_text(&input.query)?;
        let sort_json = optional_json_to_text(input.sort.as_ref())?;
        let group_json = optional_json_to_text(input.group.as_ref())?;
        self.database.connection().execute(
            "INSERT INTO core_filters
             (id, name, query_json, sort_json, group_json, view_type, source_plugin_id, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
             ON CONFLICT(id) DO UPDATE SET
               name = excluded.name,
               query_json = excluded.query_json,
               sort_json = excluded.sort_json,
               group_json = excluded.group_json,
               view_type = excluded.view_type,
               source_plugin_id = excluded.source_plugin_id,
               created_at = excluded.created_at,
               updated_at = excluded.updated_at",
            params![
                input.id.as_str(),
                input.name.as_str(),
                query_json.as_str(),
                sort_json.as_deref(),
                group_json.as_deref(),
                input.view_type.as_str(),
                input.source_plugin_id.as_deref(),
                input.created_at.as_str(),
                input.updated_at.as_str()
            ],
        )?;
        Ok(())
    }

    pub fn get(&self, id: &str) -> DbResult<Option<FilterRecord>> {
        let row = self
            .database
            .connection()
            .query_row(
                "SELECT id, name, query_json, sort_json, group_json, view_type, source_plugin_id, created_at, updated_at
                 FROM core_filters
                 WHERE id = ?1",
                params![id],
                filter_row,
            )
            .optional()?;
        row.map(FilterRow::into_record).transpose()
    }

    pub fn list(&self, options: FilterListOptions) -> DbResult<Vec<FilterRecord>> {
        let source_plugin_id = options.source_plugin_id.as_deref();
        let view_type = options.view_type.as_deref();
        let mut statement = self.database.connection().prepare(
            "SELECT id, name, query_json, sort_json, group_json, view_type, source_plugin_id, created_at, updated_at
             FROM core_filters
             WHERE (?1 IS NULL OR source_plugin_id = ?1)
               AND (?2 IS NULL OR view_type = ?2)
             ORDER BY created_at ASC, id ASC",
        )?;
        let rows = statement.query_map(params![source_plugin_id, view_type], filter_row)?;
        collect_rows(rows, FilterRow::into_record)
    }

    pub fn delete(&self, id: &str) -> DbResult<()> {
        self.database
            .connection()
            .execute("DELETE FROM core_filters WHERE id = ?1", params![id])?;
        Ok(())
    }
}

pub struct PluginRepository<'db> {
    database: &'db Database,
}

impl<'db> PluginRepository<'db> {
    pub fn new(database: &'db Database) -> Self {
        Self { database }
    }

    pub fn upsert(&self, input: UpsertPlugin) -> DbResult<()> {
        let manifest_json = json_to_text(&input.manifest)?;
        let settings_json = optional_json_to_text(input.settings.as_ref())?;
        let enabled = i64::from(input.enabled);
        self.database.connection().execute(
            "INSERT INTO core_plugins
             (id, name, version, enabled, manifest_json, settings_json, installed_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
             ON CONFLICT(id) DO UPDATE SET
               name = excluded.name,
               version = excluded.version,
               enabled = excluded.enabled,
               manifest_json = excluded.manifest_json,
               settings_json = excluded.settings_json,
               installed_at = excluded.installed_at,
               updated_at = excluded.updated_at",
            params![
                input.id.as_str(),
                input.name.as_str(),
                input.version.as_str(),
                enabled,
                manifest_json.as_str(),
                settings_json.as_deref(),
                input.installed_at.as_str(),
                input.updated_at.as_str()
            ],
        )?;
        Ok(())
    }

    pub fn get(&self, id: &str) -> DbResult<Option<PluginRecord>> {
        let row = self
            .database
            .connection()
            .query_row(
                "SELECT id, name, version, enabled, manifest_json, settings_json, installed_at, updated_at
                 FROM core_plugins
                 WHERE id = ?1",
                params![id],
                plugin_row,
            )
            .optional()?;
        row.map(PluginRow::into_record).transpose()
    }

    pub fn list(&self) -> DbResult<Vec<PluginRecord>> {
        let mut statement = self.database.connection().prepare(
            "SELECT id, name, version, enabled, manifest_json, settings_json, installed_at, updated_at
             FROM core_plugins
             ORDER BY name ASC, id ASC",
        )?;
        let rows = statement.query_map([], plugin_row)?;
        collect_rows(rows, PluginRow::into_record)
    }

    pub fn set_enabled(&self, id: &str, enabled: bool, updated_at: &str) -> DbResult<()> {
        self.database.connection().execute(
            "UPDATE core_plugins
             SET enabled = ?2,
                 updated_at = ?3
             WHERE id = ?1",
            params![id, i64::from(enabled), updated_at],
        )?;
        Ok(())
    }

    pub fn delete(&self, id: &str) -> DbResult<()> {
        self.database
            .connection()
            .execute("DELETE FROM core_plugins WHERE id = ?1", params![id])?;
        Ok(())
    }
}

pub struct CommandDescriptorRepository<'db> {
    database: &'db Database,
}

impl<'db> CommandDescriptorRepository<'db> {
    pub fn new(database: &'db Database) -> Self {
        Self { database }
    }

    pub fn upsert(&self, input: UpsertCommandDescriptor) -> DbResult<()> {
        let context = json_to_text(&input.context)?;
        self.database.connection().execute(
            "INSERT INTO core_commands
             (id, plugin_id, command_id, title, shortcut, context)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(id) DO UPDATE SET
               plugin_id = excluded.plugin_id,
               command_id = excluded.command_id,
               title = excluded.title,
               shortcut = excluded.shortcut,
               context = excluded.context",
            params![
                input.id.as_str(),
                input.plugin_id.as_str(),
                input.command_id.as_str(),
                input.title.as_str(),
                input.shortcut.as_deref(),
                context.as_str()
            ],
        )?;
        Ok(())
    }

    pub fn get(&self, id: &str) -> DbResult<Option<CommandDescriptorRecord>> {
        let row = self
            .database
            .connection()
            .query_row(
                "SELECT id, plugin_id, command_id, title, shortcut, context
                 FROM core_commands
                 WHERE id = ?1",
                params![id],
                command_descriptor_row,
            )
            .optional()?;
        row.map(CommandDescriptorRow::into_record).transpose()
    }

    pub fn list(&self) -> DbResult<Vec<CommandDescriptorRecord>> {
        let mut statement = self.database.connection().prepare(
            "SELECT id, plugin_id, command_id, title, shortcut, context
             FROM core_commands
             ORDER BY id ASC",
        )?;
        let rows = statement.query_map([], command_descriptor_row)?;
        collect_rows(rows, CommandDescriptorRow::into_record)
    }

    pub fn delete(&self, id: &str) -> DbResult<()> {
        self.database
            .connection()
            .execute("DELETE FROM core_commands WHERE id = ?1", params![id])?;
        Ok(())
    }
}

pub struct ViewDescriptorRepository<'db> {
    database: &'db Database,
}

impl<'db> ViewDescriptorRepository<'db> {
    pub fn new(database: &'db Database) -> Self {
        Self { database }
    }

    pub fn upsert(&self, input: UpsertViewDescriptor) -> DbResult<()> {
        let accepted_data_shape_json = json_to_text(&input.accepted_data_shape)?;
        self.database.connection().execute(
            "INSERT INTO core_views
             (id, plugin_id, view_type, name, accepted_data_shape_json)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(id) DO UPDATE SET
               plugin_id = excluded.plugin_id,
               view_type = excluded.view_type,
               name = excluded.name,
               accepted_data_shape_json = excluded.accepted_data_shape_json",
            params![
                input.id.as_str(),
                input.plugin_id.as_str(),
                input.view_type.as_str(),
                input.name.as_str(),
                accepted_data_shape_json.as_str()
            ],
        )?;
        Ok(())
    }

    pub fn get(&self, id: &str) -> DbResult<Option<ViewDescriptorRecord>> {
        let row = self
            .database
            .connection()
            .query_row(
                "SELECT id, plugin_id, view_type, name, accepted_data_shape_json
                 FROM core_views
                 WHERE id = ?1",
                params![id],
                view_descriptor_row,
            )
            .optional()?;
        row.map(ViewDescriptorRow::into_record).transpose()
    }

    pub fn list(&self) -> DbResult<Vec<ViewDescriptorRecord>> {
        let mut statement = self.database.connection().prepare(
            "SELECT id, plugin_id, view_type, name, accepted_data_shape_json
             FROM core_views
             ORDER BY id ASC",
        )?;
        let rows = statement.query_map([], view_descriptor_row)?;
        collect_rows(rows, ViewDescriptorRow::into_record)
    }

    pub fn delete(&self, id: &str) -> DbResult<()> {
        self.database
            .connection()
            .execute("DELETE FROM core_views WHERE id = ?1", params![id])?;
        Ok(())
    }
}

fn json_to_text(value: &Value) -> DbResult<String> {
    serde_json::to_string(value).map_err(Into::into)
}

fn optional_json_to_text(value: Option<&Value>) -> DbResult<Option<String>> {
    value.map(json_to_text).transpose()
}

fn parse_json(
    table: &'static str,
    column: &'static str,
    record_id: &str,
    text: &str,
) -> DbResult<Value> {
    serde_json::from_str(text)
        .map_err(|source| DbError::invalid_json(table, column, record_id, source))
}

fn parse_optional_json(
    table: &'static str,
    column: &'static str,
    record_id: &str,
    text: Option<String>,
) -> DbResult<Option<Value>> {
    text.map(|value| parse_json(table, column, record_id, &value))
        .transpose()
}

fn collect_rows<T, U>(
    rows: impl Iterator<Item = rusqlite::Result<T>>,
    into_record: impl Fn(T) -> DbResult<U>,
) -> DbResult<Vec<U>> {
    let mut records = Vec::new();
    for row in rows {
        records.push(into_record(row?)?);
    }
    Ok(records)
}

struct PageRow {
    id: String,
    title: String,
    parent_page_id: Option<String>,
    body_json: String,
    created_at: String,
    updated_at: String,
    archived_at: Option<String>,
}

impl PageRow {
    fn into_record(self) -> DbResult<PageRecord> {
        Ok(PageRecord {
            body: parse_json("core_pages", "body_json", &self.id, &self.body_json)?,
            id: self.id,
            title: self.title,
            parent_page_id: self.parent_page_id,
            created_at: self.created_at,
            updated_at: self.updated_at,
            archived_at: self.archived_at,
        })
    }
}

fn page_row(row: &Row<'_>) -> rusqlite::Result<PageRow> {
    Ok(PageRow {
        id: row.get(0)?,
        title: row.get(1)?,
        parent_page_id: row.get(2)?,
        body_json: row.get(3)?,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
        archived_at: row.get(6)?,
    })
}

struct MetadataRow {
    id: String,
    page_id: String,
    namespace: String,
    key: String,
    value_json: String,
    value_type: String,
    source_plugin_id: String,
    created_at: String,
    updated_at: String,
}

impl MetadataRow {
    fn into_record(self) -> DbResult<MetadataRecord> {
        Ok(MetadataRecord {
            value: parse_json("core_metadata", "value_json", &self.id, &self.value_json)?,
            id: self.id,
            page_id: self.page_id,
            namespace: self.namespace,
            key: self.key,
            value_type: self.value_type,
            source_plugin_id: self.source_plugin_id,
            created_at: self.created_at,
            updated_at: self.updated_at,
        })
    }
}

fn metadata_row(row: &Row<'_>) -> rusqlite::Result<MetadataRow> {
    Ok(MetadataRow {
        id: row.get(0)?,
        page_id: row.get(1)?,
        namespace: row.get(2)?,
        key: row.get(3)?,
        value_json: row.get(4)?,
        value_type: row.get(5)?,
        source_plugin_id: row.get(6)?,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
    })
}

struct EventRow {
    id: String,
    page_id: Option<String>,
    namespace: String,
    event_type: String,
    payload_json: String,
    source_plugin_id: String,
    created_at: String,
}

impl EventRow {
    fn into_record(self) -> DbResult<EventRecord> {
        Ok(EventRecord {
            payload: parse_json("core_events", "payload_json", &self.id, &self.payload_json)?,
            id: self.id,
            page_id: self.page_id,
            namespace: self.namespace,
            event_type: self.event_type,
            source_plugin_id: self.source_plugin_id,
            created_at: self.created_at,
        })
    }
}

fn event_row(row: &Row<'_>) -> rusqlite::Result<EventRow> {
    Ok(EventRow {
        id: row.get(0)?,
        page_id: row.get(1)?,
        namespace: row.get(2)?,
        event_type: row.get(3)?,
        payload_json: row.get(4)?,
        source_plugin_id: row.get(5)?,
        created_at: row.get(6)?,
    })
}

struct FilterRow {
    id: String,
    name: String,
    query_json: String,
    sort_json: Option<String>,
    group_json: Option<String>,
    view_type: String,
    source_plugin_id: Option<String>,
    created_at: String,
    updated_at: String,
}

impl FilterRow {
    fn into_record(self) -> DbResult<FilterRecord> {
        Ok(FilterRecord {
            query: parse_json("core_filters", "query_json", &self.id, &self.query_json)?,
            sort: parse_optional_json("core_filters", "sort_json", &self.id, self.sort_json)?,
            group: parse_optional_json("core_filters", "group_json", &self.id, self.group_json)?,
            id: self.id,
            name: self.name,
            view_type: self.view_type,
            source_plugin_id: self.source_plugin_id,
            created_at: self.created_at,
            updated_at: self.updated_at,
        })
    }
}

fn filter_row(row: &Row<'_>) -> rusqlite::Result<FilterRow> {
    Ok(FilterRow {
        id: row.get(0)?,
        name: row.get(1)?,
        query_json: row.get(2)?,
        sort_json: row.get(3)?,
        group_json: row.get(4)?,
        view_type: row.get(5)?,
        source_plugin_id: row.get(6)?,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
    })
}

struct PluginRow {
    id: String,
    name: String,
    version: String,
    enabled: i64,
    manifest_json: String,
    settings_json: Option<String>,
    installed_at: String,
    updated_at: String,
}

impl PluginRow {
    fn into_record(self) -> DbResult<PluginRecord> {
        Ok(PluginRecord {
            manifest: parse_json(
                "core_plugins",
                "manifest_json",
                &self.id,
                &self.manifest_json,
            )?,
            settings: parse_optional_json(
                "core_plugins",
                "settings_json",
                &self.id,
                self.settings_json,
            )?,
            id: self.id,
            name: self.name,
            version: self.version,
            enabled: self.enabled != 0,
            installed_at: self.installed_at,
            updated_at: self.updated_at,
        })
    }
}

fn plugin_row(row: &Row<'_>) -> rusqlite::Result<PluginRow> {
    Ok(PluginRow {
        id: row.get(0)?,
        name: row.get(1)?,
        version: row.get(2)?,
        enabled: row.get(3)?,
        manifest_json: row.get(4)?,
        settings_json: row.get(5)?,
        installed_at: row.get(6)?,
        updated_at: row.get(7)?,
    })
}

struct CommandDescriptorRow {
    id: String,
    plugin_id: String,
    command_id: String,
    title: String,
    shortcut: Option<String>,
    context: String,
}

impl CommandDescriptorRow {
    fn into_record(self) -> DbResult<CommandDescriptorRecord> {
        Ok(CommandDescriptorRecord {
            context: parse_json("core_commands", "context", &self.id, &self.context)?,
            id: self.id,
            plugin_id: self.plugin_id,
            command_id: self.command_id,
            title: self.title,
            shortcut: self.shortcut,
        })
    }
}

fn command_descriptor_row(row: &Row<'_>) -> rusqlite::Result<CommandDescriptorRow> {
    Ok(CommandDescriptorRow {
        id: row.get(0)?,
        plugin_id: row.get(1)?,
        command_id: row.get(2)?,
        title: row.get(3)?,
        shortcut: row.get(4)?,
        context: row.get(5)?,
    })
}

struct ViewDescriptorRow {
    id: String,
    plugin_id: String,
    view_type: String,
    name: String,
    accepted_data_shape_json: String,
}

impl ViewDescriptorRow {
    fn into_record(self) -> DbResult<ViewDescriptorRecord> {
        Ok(ViewDescriptorRecord {
            accepted_data_shape: parse_json(
                "core_views",
                "accepted_data_shape_json",
                &self.id,
                &self.accepted_data_shape_json,
            )?,
            id: self.id,
            plugin_id: self.plugin_id,
            view_type: self.view_type,
            name: self.name,
        })
    }
}

fn view_descriptor_row(row: &Row<'_>) -> rusqlite::Result<ViewDescriptorRow> {
    Ok(ViewDescriptorRow {
        id: row.get(0)?,
        plugin_id: row.get(1)?,
        view_type: row.get(2)?,
        name: row.get(3)?,
        accepted_data_shape_json: row.get(4)?,
    })
}
