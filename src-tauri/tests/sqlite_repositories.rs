use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use mirabilis_lib::db::{
    migrations::{applied_migrations, apply_migrations, schema_version, LATEST_SCHEMA_VERSION},
    repositories::{
        CommandDescriptorRepository, EventRepository, FilterRepository, MetadataRepository,
        PageRepository, PluginRepository, ViewDescriptorRepository,
    },
    types::{
        EventListOptions, FilterListOptions, NewEvent, NewPage, PageListOptions, UpdatePage,
        UpsertCommandDescriptor, UpsertFilter, UpsertMetadata, UpsertPlugin, UpsertViewDescriptor,
    },
    Database, DbError,
};
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};
use tempfile::TempDir;

type TestResult<T = ()> = Result<T, Box<dyn std::error::Error>>;

const SQL_INJECTION_TEXT: &str = "x'); DROP TABLE core_pages; --";

#[test]
fn sqlite_migrations_are_repeatable_versioned_and_create_expected_schema() -> TestResult {
    let db_file = TempDatabase::new()?;

    {
        let database = Database::open(db_file.path())?;
        apply_migrations(&database)?;
        assert_eq!(schema_version(&database)?, LATEST_SCHEMA_VERSION);
        assert!(database.foreign_keys_enabled()?);
    }

    let raw = Connection::open(db_file.path())?;
    raw.execute(
        "INSERT INTO core_pages (id, title, parent_page_id, body_json, created_at, updated_at, archived_at)
         VALUES (?1, ?2, NULL, ?3, ?4, ?5, NULL)",
        params![
            "page-preserved",
            "Preserved page",
            rich_json().to_string(),
            "2026-05-21T00:00:00Z",
            "2026-05-21T00:00:00Z"
        ],
    )?;
    drop(raw);

    {
        let database = Database::open(db_file.path())?;
        apply_migrations(&database)?;
        apply_migrations(&database)?;

        assert_eq!(schema_version(&database)?, LATEST_SCHEMA_VERSION);
        assert_eq!(
            applied_migrations(&database)?
                .into_iter()
                .map(|migration| (migration.version, migration.name))
                .collect::<Vec<_>>(),
            vec![(1, "001_core_schema".to_string())]
        );
        assert!(database.foreign_keys_enabled()?);
    }

    let raw = Connection::open(db_file.path())?;
    assert_eq!(
        raw.query_row(
            "SELECT title FROM core_pages WHERE id = ?1",
            params!["page-preserved"],
            |row| row.get::<_, String>(0),
        )?,
        "Preserved page"
    );

    assert_eq!(pragma_user_version(&raw)?, LATEST_SCHEMA_VERSION);
    assert_table_columns(
        &raw,
        "core_schema_migrations",
        &[
            ("version", "INTEGER"),
            ("name", "TEXT"),
            ("checksum", "TEXT"),
            ("applied_at", "TEXT"),
        ],
    )?;
    assert_table_columns(
        &raw,
        "core_pages",
        &[
            ("id", "TEXT"),
            ("title", "TEXT"),
            ("parent_page_id", "TEXT"),
            ("body_json", "TEXT"),
            ("created_at", "TEXT"),
            ("updated_at", "TEXT"),
            ("archived_at", "TEXT"),
        ],
    )?;
    assert_table_columns(
        &raw,
        "core_metadata",
        &[
            ("id", "TEXT"),
            ("page_id", "TEXT"),
            ("namespace", "TEXT"),
            ("key", "TEXT"),
            ("value_json", "TEXT"),
            ("value_type", "TEXT"),
            ("source_plugin_id", "TEXT"),
            ("created_at", "TEXT"),
            ("updated_at", "TEXT"),
        ],
    )?;
    assert_table_columns(
        &raw,
        "core_events",
        &[
            ("id", "TEXT"),
            ("page_id", "TEXT"),
            ("namespace", "TEXT"),
            ("type", "TEXT"),
            ("payload_json", "TEXT"),
            ("source_plugin_id", "TEXT"),
            ("created_at", "TEXT"),
        ],
    )?;
    assert_table_columns(
        &raw,
        "core_filters",
        &[
            ("id", "TEXT"),
            ("name", "TEXT"),
            ("query_json", "TEXT"),
            ("sort_json", "TEXT"),
            ("group_json", "TEXT"),
            ("view_type", "TEXT"),
            ("source_plugin_id", "TEXT"),
            ("created_at", "TEXT"),
            ("updated_at", "TEXT"),
        ],
    )?;
    assert_table_columns(
        &raw,
        "core_plugins",
        &[
            ("id", "TEXT"),
            ("name", "TEXT"),
            ("version", "TEXT"),
            ("enabled", "INTEGER"),
            ("manifest_json", "TEXT"),
            ("settings_json", "TEXT"),
            ("installed_at", "TEXT"),
            ("updated_at", "TEXT"),
        ],
    )?;
    assert_table_columns(
        &raw,
        "core_commands",
        &[
            ("id", "TEXT"),
            ("plugin_id", "TEXT"),
            ("command_id", "TEXT"),
            ("title", "TEXT"),
            ("shortcut", "TEXT"),
            ("context", "TEXT"),
        ],
    )?;
    assert_table_columns(
        &raw,
        "core_views",
        &[
            ("id", "TEXT"),
            ("plugin_id", "TEXT"),
            ("view_type", "TEXT"),
            ("name", "TEXT"),
            ("accepted_data_shape_json", "TEXT"),
        ],
    )?;
    assert_table_columns(
        &raw,
        "core_plugin_indexes",
        &[
            ("id", "TEXT"),
            ("plugin_id", "TEXT"),
            ("index_name", "TEXT"),
            ("table_name", "TEXT"),
            ("created_at", "TEXT"),
            ("updated_at", "TEXT"),
        ],
    )?;

    assert_index_covering(&raw, "core_pages", &["parent_page_id"], false)?;
    assert_index_covering(
        &raw,
        "core_metadata",
        &["page_id", "namespace", "key"],
        true,
    )?;
    assert_index_covering(&raw, "core_events", &["page_id", "created_at", "id"], false)?;
    assert_index_covering(
        &raw,
        "core_events",
        &["namespace", "type", "created_at", "id"],
        false,
    )?;
    assert_index_covering(
        &raw,
        "core_filters",
        &["source_plugin_id", "view_type", "name", "id"],
        false,
    )?;
    assert_index_covering(&raw, "core_plugins", &["enabled", "name", "id"], false)?;
    assert_index_covering(&raw, "core_commands", &["plugin_id", "command_id"], true)?;
    assert_index_covering(
        &raw,
        "core_views",
        &["plugin_id", "view_type", "name"],
        true,
    )?;
    assert_index_covering(
        &raw,
        "core_plugin_indexes",
        &["plugin_id", "index_name"],
        true,
    )?;
    assert_foreign_key(
        &raw,
        "core_plugin_indexes",
        "plugin_id",
        "core_plugins",
        "id",
    )?;

    assert_eq!(
        raw.query_row(
            "SELECT version, name FROM core_schema_migrations ORDER BY version",
            [],
            |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?)),
        )?,
        (1, "001_core_schema".to_string())
    );

    Ok(())
}

#[test]
fn sqlite_migrations_reject_ledger_drift() -> TestResult {
    let db_file = migrated_temp_database()?;

    {
        let raw = Connection::open(db_file.path())?;
        raw.execute(
            "UPDATE core_schema_migrations
             SET name = '001_core_schema_renamed',
                 checksum = 'wrong-checksum'
             WHERE version = 1",
            [],
        )?;
    }

    let database = Database::open(db_file.path())?;
    let result = apply_migrations(&database);

    assert!(
        result.is_err(),
        "migration version 1 with a changed name/checksum must not be accepted"
    );

    Ok(())
}

#[test]
fn sqlite_migrations_reject_future_user_version_without_downgrading() -> TestResult {
    let db_file = TempDatabase::new()?;
    let future_version = LATEST_SCHEMA_VERSION + 1;

    {
        let raw = Connection::open(db_file.path())?;
        raw.pragma_update(None, "user_version", future_version)?;
    }

    {
        let database = Database::open(db_file.path())?;
        let result = apply_migrations(&database);
        assert!(
            result.is_err(),
            "a database from a newer schema version must not be migrated by an older binary"
        );
    }

    let raw = Connection::open(db_file.path())?;
    assert_eq!(
        pragma_user_version(&raw)?,
        future_version,
        "failed future-version migrations must not downgrade PRAGMA user_version"
    );

    Ok(())
}

#[test]
fn sqlite_pages_repository_cruds_archives_json_and_orders_lists() -> TestResult {
    let db_file = migrated_temp_database()?;
    let database = Database::open(db_file.path())?;
    apply_migrations(&database)?;
    let pages = PageRepository::new(&database);

    pages.create(NewPage {
        id: s("page-b"),
        title: s("Second"),
        parent_page_id: None,
        body: rich_json(),
        created_at: s("2026-05-21T00:00:02Z"),
        updated_at: s("2026-05-21T00:00:02Z"),
    })?;
    pages.create(NewPage {
        id: s("page-a"),
        title: s("x'); DROP TABLE core_pages; --"),
        parent_page_id: Some(s("page-b")),
        body: json!({"text": "literal x'); DROP TABLE core_pages; --", "null": null}),
        created_at: s("2026-05-21T00:00:01Z"),
        updated_at: s("2026-05-21T00:00:01Z"),
    })?;

    let page = pages.get("page-a")?.expect("page-a should exist");
    assert_eq!(page.title, "x'); DROP TABLE core_pages; --");
    assert_eq!(page.parent_page_id, Some(s("page-b")));
    assert_eq!(
        page.body,
        json!({"text": "literal x'); DROP TABLE core_pages; --", "null": null})
    );

    pages.update(UpdatePage {
        id: s("page-a"),
        title: s("Renamed"),
        parent_page_id: None,
        body: rich_json(),
        updated_at: s("2026-05-21T00:00:03Z"),
    })?;
    pages.archive("page-a", "2026-05-21T00:00:04Z")?;

    assert_eq!(
        pages
            .get("page-a")?
            .expect("archived page remains readable")
            .archived_at,
        Some(s("2026-05-21T00:00:04Z"))
    );
    assert_eq!(
        ids(pages.list(PageListOptions {
            include_archived: true,
            parent_page_id: None,
        })?),
        vec!["page-a", "page-b"]
    );
    assert_eq!(
        ids(pages.list(PageListOptions {
            include_archived: false,
            parent_page_id: None,
        })?),
        vec!["page-b"]
    );
    assert_table_queryable(db_file.path(), "core_pages")?;

    Ok(())
}

#[test]
fn sqlite_metadata_repository_upserts_deletes_json_and_orders_lists() -> TestResult {
    let db_file = migrated_temp_database()?;
    let database = Database::open(db_file.path())?;
    apply_migrations(&database)?;
    seed_page(&database, "page-a")?;
    let metadata = MetadataRepository::new(&database);

    metadata.upsert(UpsertMetadata {
        id: s("meta-b"),
        page_id: s("page-a"),
        namespace: s("plugin.timer"),
        key: s("duration"),
        value: json!({"minutes": 25, "source": SQL_INJECTION_TEXT}),
        value_type: s("object"),
        source_plugin_id: s("plugin.timer"),
        created_at: s("2026-05-21T00:00:02Z"),
        updated_at: s("2026-05-21T00:00:02Z"),
    })?;
    metadata.upsert(UpsertMetadata {
        id: s("meta-a"),
        page_id: s("page-a"),
        namespace: s("plugin.core"),
        key: s("frontmatter"),
        value: rich_json(),
        value_type: s("object"),
        source_plugin_id: s("plugin.core"),
        created_at: s("2026-05-21T00:00:01Z"),
        updated_at: s("2026-05-21T00:00:01Z"),
    })?;
    metadata.upsert(UpsertMetadata {
        id: s("meta-a"),
        page_id: s("page-a"),
        namespace: s("plugin.core"),
        key: s("frontmatter"),
        value: json!(null),
        value_type: s("null"),
        source_plugin_id: s("plugin.core"),
        created_at: s("2026-05-21T00:00:01Z"),
        updated_at: s("2026-05-21T00:00:03Z"),
    })?;

    assert_eq!(
        metadata
            .get("meta-a")?
            .expect("metadata should exist")
            .value,
        json!(null)
    );
    assert_eq!(
        metadata
            .get("meta-b")?
            .expect("metadata with injection-shaped value should exist")
            .value,
        json!({"minutes": 25, "source": SQL_INJECTION_TEXT})
    );
    assert_eq!(
        ids(metadata.list_for_page("page-a")?),
        vec!["meta-a", "meta-b"]
    );

    metadata.delete("meta-b")?;
    assert!(metadata.get("meta-b")?.is_none());
    assert_table_queryable(db_file.path(), "core_metadata")?;

    Ok(())
}

#[test]
fn sqlite_metadata_repository_uses_page_namespace_key_as_identity() -> TestResult {
    let db_file = migrated_temp_database()?;
    let database = Database::open(db_file.path())?;
    apply_migrations(&database)?;
    seed_page(&database, "page-a")?;
    let metadata = MetadataRepository::new(&database);

    metadata.upsert(UpsertMetadata {
        id: s("meta-original"),
        page_id: s("page-a"),
        namespace: s("plugin.core"),
        key: s("frontmatter"),
        value: json!({"title": "Original"}),
        value_type: s("object"),
        source_plugin_id: s("plugin.core"),
        created_at: s("2026-05-21T00:00:01Z"),
        updated_at: s("2026-05-21T00:00:01Z"),
    })?;

    metadata.upsert(UpsertMetadata {
        id: s("meta-replacement"),
        page_id: s("page-a"),
        namespace: s("plugin.core"),
        key: s("frontmatter"),
        value: json!({"title": "Updated", "literal": SQL_INJECTION_TEXT}),
        value_type: s("object"),
        source_plugin_id: s("plugin.core"),
        created_at: s("2026-05-21T00:00:09Z"),
        updated_at: s("2026-05-21T00:00:02Z"),
    })?;

    let record = metadata
        .get_by_logical_key("page-a", "plugin.core", "frontmatter")?
        .expect("metadata should be fetched by page_id/namespace/key");
    assert_eq!(record.id, "meta-original");
    assert_eq!(record.page_id, "page-a");
    assert_eq!(record.namespace, "plugin.core");
    assert_eq!(record.key, "frontmatter");
    assert_eq!(
        record.value,
        json!({"title": "Updated", "literal": SQL_INJECTION_TEXT})
    );
    assert_eq!(record.source_plugin_id, "plugin.core");
    assert_eq!(record.created_at, "2026-05-21T00:00:01Z");
    assert_eq!(record.updated_at, "2026-05-21T00:00:02Z");
    assert!(metadata.get("meta-replacement")?.is_none());
    assert_eq!(
        ids(metadata.list_for_page("page-a")?),
        vec!["meta-original"]
    );

    metadata.delete_by_logical_key("page-a", "plugin.core", "frontmatter")?;
    assert!(
        metadata
            .get_by_logical_key("page-a", "plugin.core", "frontmatter")?
            .is_none(),
        "delete_by_logical_key should remove the logical metadata record"
    );
    assert!(metadata.get("meta-original")?.is_none());

    Ok(())
}

#[test]
fn sqlite_events_repository_appends_reads_json_and_orders_lists() -> TestResult {
    let db_file = migrated_temp_database()?;
    let database = Database::open(db_file.path())?;
    apply_migrations(&database)?;
    seed_page(&database, "page-a")?;
    let events = EventRepository::new(&database);

    events.append(NewEvent {
        id: s("event-b"),
        page_id: Some(s("page-a")),
        namespace: s("plugin.timer"),
        event_type: s("stop"),
        payload: json!({"reason": SQL_INJECTION_TEXT, "elapsed": 1500}),
        source_plugin_id: s("plugin.timer"),
        created_at: s("2026-05-21T00:00:02Z"),
    })?;
    events.append(NewEvent {
        id: s("event-a"),
        page_id: Some(s("page-a")),
        namespace: s("plugin.timer"),
        event_type: s("start"),
        payload: rich_json(),
        source_plugin_id: s("plugin.timer"),
        created_at: s("2026-05-21T00:00:01Z"),
    })?;

    assert_eq!(
        events.get("event-a")?.expect("event should exist").payload,
        rich_json()
    );
    assert_eq!(
        events
            .get("event-b")?
            .expect("event with injection-shaped payload should exist")
            .payload,
        json!({"reason": SQL_INJECTION_TEXT, "elapsed": 1500})
    );
    assert_eq!(
        ids(events.list(EventListOptions {
            page_id: Some(s("page-a")),
            namespace: Some(s("plugin.timer")),
            event_type: None,
        })?),
        vec!["event-a", "event-b"]
    );
    assert_table_queryable(db_file.path(), "core_events")?;

    Ok(())
}

#[test]
fn sqlite_filters_repository_cruds_optional_json_nulls_and_orders_lists() -> TestResult {
    let db_file = migrated_temp_database()?;
    let database = Database::open(db_file.path())?;
    apply_migrations(&database)?;
    let filters = FilterRepository::new(&database);

    filters.upsert(UpsertFilter {
        id: s("filter-b"),
        name: s("Timer filter"),
        query: json!({"op": "eq", "field": "status", "value": SQL_INJECTION_TEXT}),
        sort: Some(json!(null)),
        group: None,
        view_type: s("list"),
        source_plugin_id: Some(s("plugin.timer")),
        created_at: s("2026-05-21T00:00:02Z"),
        updated_at: s("2026-05-21T00:00:02Z"),
    })?;
    filters.upsert(UpsertFilter {
        id: s("filter-a"),
        name: s("All open"),
        query: rich_json(),
        sort: Some(json!([{"field": "createdAt", "direction": "asc"}])),
        group: Some(json!({"field": "project", "empty": null})),
        view_type: s("board"),
        source_plugin_id: None,
        created_at: s("2026-05-21T00:00:01Z"),
        updated_at: s("2026-05-21T00:00:01Z"),
    })?;

    let filter_b = filters.get("filter-b")?.expect("filter-b should exist");
    assert_eq!(
        filter_b.query,
        json!({"op": "eq", "field": "status", "value": SQL_INJECTION_TEXT})
    );
    assert_eq!(filter_b.sort, Some(json!(null)));
    assert_eq!(filter_b.group, None);
    assert_eq!(
        raw_optional_text(
            db_file.path(),
            "SELECT sort_json FROM core_filters WHERE id = 'filter-b'"
        )?,
        Some("null".to_string())
    );
    assert_eq!(
        raw_optional_text(
            db_file.path(),
            "SELECT group_json FROM core_filters WHERE id = 'filter-b'"
        )?,
        None
    );
    assert_eq!(
        ids(filters.list(FilterListOptions {
            source_plugin_id: None,
            view_type: None,
        })?),
        vec!["filter-a", "filter-b"]
    );

    filters.delete("filter-a")?;
    assert!(filters.get("filter-a")?.is_none());
    assert_table_queryable(db_file.path(), "core_filters")?;

    Ok(())
}

#[test]
fn sqlite_plugins_repository_cruds_settings_nulls_enabled_state_and_orders_lists() -> TestResult {
    let db_file = migrated_temp_database()?;
    let database = Database::open(db_file.path())?;
    apply_migrations(&database)?;
    let plugins = PluginRepository::new(&database);

    plugins.upsert(UpsertPlugin {
        id: s("plugin-b"),
        name: s("Timer"),
        version: s("1.0.0"),
        enabled: true,
        manifest: json!({"name": "Timer", "commands": ["start", SQL_INJECTION_TEXT]}),
        settings: Some(json!(null)),
        installed_at: s("2026-05-21T00:00:02Z"),
        updated_at: s("2026-05-21T00:00:02Z"),
    })?;
    plugins.upsert(UpsertPlugin {
        id: s("plugin-a"),
        name: s("Core"),
        version: s("1.0.0"),
        enabled: true,
        manifest: rich_json(),
        settings: None,
        installed_at: s("2026-05-21T00:00:01Z"),
        updated_at: s("2026-05-21T00:00:01Z"),
    })?;

    assert_eq!(
        plugins
            .get("plugin-b")?
            .expect("plugin-b should exist")
            .settings,
        Some(json!(null))
    );
    assert_eq!(
        plugins
            .get("plugin-b")?
            .expect("plugin-b should exist")
            .manifest,
        json!({"name": "Timer", "commands": ["start", SQL_INJECTION_TEXT]})
    );
    assert_eq!(
        raw_optional_text(
            db_file.path(),
            "SELECT settings_json FROM core_plugins WHERE id = 'plugin-b'"
        )?,
        Some("null".to_string())
    );
    assert_eq!(
        raw_optional_text(
            db_file.path(),
            "SELECT settings_json FROM core_plugins WHERE id = 'plugin-a'"
        )?,
        None
    );

    plugins.upsert(UpsertPlugin {
        id: s("plugin-b"),
        name: s("Timer Updated"),
        version: s("1.1.0"),
        enabled: true,
        manifest: json!({"name": "Timer Updated", "literal": SQL_INJECTION_TEXT}),
        settings: Some(json!({"mode": "compact", "literal": SQL_INJECTION_TEXT})),
        installed_at: s("2026-05-21T00:00:09Z"),
        updated_at: s("2026-05-21T00:00:04Z"),
    })?;
    let updated_plugin = plugins
        .get("plugin-b")?
        .expect("plugin upsert should replace existing plugin fields");
    assert_eq!(updated_plugin.name, "Timer Updated");
    assert_eq!(updated_plugin.version, "1.1.0");
    assert!(updated_plugin.enabled);
    assert_eq!(
        updated_plugin.manifest,
        json!({"name": "Timer Updated", "literal": SQL_INJECTION_TEXT})
    );
    assert_eq!(
        updated_plugin.settings,
        Some(json!({"mode": "compact", "literal": SQL_INJECTION_TEXT}))
    );

    plugins.set_enabled("plugin-b", false, "2026-05-21T00:00:05Z")?;
    assert!(
        !plugins
            .get("plugin-b")?
            .expect("plugin-b should exist")
            .enabled
    );
    assert_eq!(ids(plugins.list()?), vec!["plugin-a", "plugin-b"]);

    plugins.delete("plugin-a")?;
    assert!(plugins.get("plugin-a")?.is_none());
    assert_table_queryable(db_file.path(), "core_plugins")?;

    Ok(())
}

#[test]
fn sqlite_upserts_preserve_creation_timestamps_when_replacing_records() -> TestResult {
    let db_file = migrated_temp_database()?;
    let database = Database::open(db_file.path())?;
    apply_migrations(&database)?;
    seed_page(&database, "page-a")?;

    let metadata = MetadataRepository::new(&database);
    metadata.upsert(UpsertMetadata {
        id: s("meta-a"),
        page_id: s("page-a"),
        namespace: s("plugin.core"),
        key: s("frontmatter"),
        value: json!({"title": "Original"}),
        value_type: s("object"),
        source_plugin_id: s("plugin.core"),
        created_at: s("2026-05-21T00:00:01Z"),
        updated_at: s("2026-05-21T00:00:01Z"),
    })?;
    metadata.upsert(UpsertMetadata {
        id: s("meta-a"),
        page_id: s("page-a"),
        namespace: s("plugin.core"),
        key: s("frontmatter"),
        value: json!({"title": "Updated"}),
        value_type: s("object"),
        source_plugin_id: s("plugin.core"),
        created_at: s("2026-05-21T00:00:09Z"),
        updated_at: s("2026-05-21T00:00:02Z"),
    })?;

    let filters = FilterRepository::new(&database);
    filters.upsert(UpsertFilter {
        id: s("filter-a"),
        name: s("Open"),
        query: json!({"status": "open"}),
        sort: None,
        group: None,
        view_type: s("list"),
        source_plugin_id: Some(s("plugin.core")),
        created_at: s("2026-05-21T00:00:03Z"),
        updated_at: s("2026-05-21T00:00:03Z"),
    })?;
    filters.upsert(UpsertFilter {
        id: s("filter-a"),
        name: s("Open updated"),
        query: json!({"status": "open", "literal": SQL_INJECTION_TEXT}),
        sort: Some(json!([{"field": "updatedAt"}])),
        group: None,
        view_type: s("board"),
        source_plugin_id: Some(s("plugin.core")),
        created_at: s("2026-05-21T00:00:09Z"),
        updated_at: s("2026-05-21T00:00:04Z"),
    })?;

    let plugins = PluginRepository::new(&database);
    plugins.upsert(UpsertPlugin {
        id: s("plugin-a"),
        name: s("Core"),
        version: s("1.0.0"),
        enabled: true,
        manifest: json!({"name": "Core"}),
        settings: None,
        installed_at: s("2026-05-21T00:00:05Z"),
        updated_at: s("2026-05-21T00:00:05Z"),
    })?;
    plugins.upsert(UpsertPlugin {
        id: s("plugin-a"),
        name: s("Core updated"),
        version: s("1.1.0"),
        enabled: false,
        manifest: json!({"name": "Core updated"}),
        settings: Some(json!({"literal": SQL_INJECTION_TEXT})),
        installed_at: s("2026-05-21T00:00:09Z"),
        updated_at: s("2026-05-21T00:00:06Z"),
    })?;

    let metadata_record = metadata.get("meta-a")?.expect("metadata should exist");
    assert_eq!(metadata_record.created_at, "2026-05-21T00:00:01Z");
    assert_eq!(metadata_record.updated_at, "2026-05-21T00:00:02Z");
    assert_eq!(metadata_record.value, json!({"title": "Updated"}));

    let filter_record = filters.get("filter-a")?.expect("filter should exist");
    assert_eq!(filter_record.created_at, "2026-05-21T00:00:03Z");
    assert_eq!(filter_record.updated_at, "2026-05-21T00:00:04Z");
    assert_eq!(
        filter_record.query,
        json!({"status": "open", "literal": SQL_INJECTION_TEXT})
    );

    let plugin_record = plugins.get("plugin-a")?.expect("plugin should exist");
    assert_eq!(plugin_record.installed_at, "2026-05-21T00:00:05Z");
    assert_eq!(plugin_record.updated_at, "2026-05-21T00:00:06Z");
    assert_eq!(plugin_record.name, "Core updated");
    assert_eq!(
        plugin_record.settings,
        Some(json!({"literal": SQL_INJECTION_TEXT}))
    );

    Ok(())
}

#[test]
fn sqlite_command_descriptors_repository_cruds_json_and_orders_lists() -> TestResult {
    let db_file = migrated_temp_database()?;
    let database = Database::open(db_file.path())?;
    apply_migrations(&database)?;
    seed_plugin(&database, "plugin-a")?;
    let commands = CommandDescriptorRepository::new(&database);

    commands.upsert(UpsertCommandDescriptor {
        id: s("command-b"),
        plugin_id: s("plugin-a"),
        command_id: s("timer.stop"),
        title: s("Stop timer"),
        shortcut: Some(s("Cmd+Shift+X'); DROP TABLE core_pages; --")),
        context: json!({"scope": ["page", null], "enabled": true}),
    })?;
    commands.upsert(UpsertCommandDescriptor {
        id: s("command-a"),
        plugin_id: s("plugin-a"),
        command_id: s("timer.start"),
        title: s("Start timer"),
        shortcut: None,
        context: rich_json(),
    })?;

    assert_eq!(
        commands
            .get("command-a")?
            .expect("command-a should exist")
            .context,
        rich_json()
    );
    let command_b = commands
        .get("command-b")?
        .expect("command with injection-shaped shortcut should exist");
    assert_eq!(
        command_b.shortcut,
        Some("Cmd+Shift+X'); DROP TABLE core_pages; --".to_string())
    );
    assert_eq!(
        command_b.context,
        json!({"scope": ["page", null], "enabled": true})
    );

    commands.upsert(UpsertCommandDescriptor {
        id: s("command-b"),
        plugin_id: s("plugin-a"),
        command_id: s("timer.stop"),
        title: s("Stop timer now"),
        shortcut: Some(s("Cmd+Alt+S")),
        context: json!({"scope": ["active-page"], "literal": SQL_INJECTION_TEXT}),
    })?;
    let updated_command = commands
        .get("command-b")?
        .expect("command upsert should replace descriptor fields");
    assert_eq!(updated_command.title, "Stop timer now");
    assert_eq!(updated_command.shortcut, Some("Cmd+Alt+S".to_string()));
    assert_eq!(
        updated_command.context,
        json!({"scope": ["active-page"], "literal": SQL_INJECTION_TEXT})
    );
    assert_eq!(ids(commands.list()?), vec!["command-a", "command-b"]);

    commands.delete("command-b")?;
    assert!(commands.get("command-b")?.is_none());
    assert_table_queryable(db_file.path(), "core_commands")?;

    Ok(())
}

#[test]
fn sqlite_view_descriptors_repository_cruds_json_and_orders_lists() -> TestResult {
    let db_file = migrated_temp_database()?;
    let database = Database::open(db_file.path())?;
    apply_migrations(&database)?;
    seed_plugin(&database, "plugin-a")?;
    let views = ViewDescriptorRepository::new(&database);

    views.upsert(UpsertViewDescriptor {
        id: s("view-b"),
        plugin_id: s("plugin-a"),
        view_type: s("timer.detail"),
        name: s("Timer x'); DROP TABLE core_pages; --"),
        accepted_data_shape: json!({"type": "timer", "optional": null, "fields": ["id", "elapsed"]}),
    })?;
    views.upsert(UpsertViewDescriptor {
        id: s("view-a"),
        plugin_id: s("plugin-a"),
        view_type: s("timer.list"),
        name: s("Timer List"),
        accepted_data_shape: rich_json(),
    })?;

    assert_eq!(
        views
            .get("view-a")?
            .expect("view-a should exist")
            .accepted_data_shape,
        rich_json()
    );
    let view_b = views
        .get("view-b")?
        .expect("view with injection-shaped name should exist");
    assert_eq!(view_b.name, "Timer x'); DROP TABLE core_pages; --");
    assert_eq!(
        view_b.accepted_data_shape,
        json!({"type": "timer", "optional": null, "fields": ["id", "elapsed"]})
    );

    views.upsert(UpsertViewDescriptor {
        id: s("view-b"),
        plugin_id: s("plugin-a"),
        view_type: s("timer.detail"),
        name: s("Timer Detail Updated"),
        accepted_data_shape: json!({"type": "timer", "literal": SQL_INJECTION_TEXT}),
    })?;
    let updated_view = views
        .get("view-b")?
        .expect("view upsert should replace descriptor fields");
    assert_eq!(updated_view.name, "Timer Detail Updated");
    assert_eq!(
        updated_view.accepted_data_shape,
        json!({"type": "timer", "literal": SQL_INJECTION_TEXT})
    );
    assert_eq!(ids(views.list()?), vec!["view-a", "view-b"]);

    views.delete("view-b")?;
    assert!(views.get("view-b")?.is_none());
    assert_table_queryable(db_file.path(), "core_views")?;

    Ok(())
}

#[test]
fn sqlite_repositories_return_typed_errors_for_corrupt_json_rows() -> TestResult {
    let db_file = migrated_temp_database()?;
    let database = Database::open(db_file.path())?;
    apply_migrations(&database)?;
    drop(database);

    let raw = Connection::open(db_file.path())?;
    raw.execute(
        "INSERT INTO core_pages (id, title, parent_page_id, body_json, created_at, updated_at, archived_at)
         VALUES ('valid-page', 'Valid', NULL, '{}', '2026-05-21T00:00:00Z', '2026-05-21T00:00:00Z', NULL)",
        [],
    )?;
    raw.execute(
        "INSERT INTO core_pages (id, title, parent_page_id, body_json, created_at, updated_at, archived_at)
         VALUES ('bad-page', 'Bad', NULL, '{not valid json', '2026-05-21T00:00:00Z', '2026-05-21T00:00:00Z', NULL)",
        [],
    )?;
    raw.execute(
        "INSERT INTO core_metadata (id, page_id, namespace, key, value_json, value_type, source_plugin_id, created_at, updated_at)
         VALUES ('bad-meta', 'valid-page', 'plugin.core', 'broken', '{not valid json', 'object', 'plugin.core', '2026-05-21T00:00:00Z', '2026-05-21T00:00:00Z')",
        [],
    )?;
    raw.execute(
        "INSERT INTO core_events (id, page_id, namespace, type, payload_json, source_plugin_id, created_at)
         VALUES ('bad-event', 'valid-page', 'plugin.core', 'broken', '{not valid json', 'plugin.core', '2026-05-21T00:00:00Z')",
        [],
    )?;
    raw.execute(
        "INSERT INTO core_filters (id, name, query_json, sort_json, group_json, view_type, source_plugin_id, created_at, updated_at)
         VALUES ('bad-filter-query', 'Broken query', '{not valid json', NULL, NULL, 'list', NULL, '2026-05-21T00:00:00Z', '2026-05-21T00:00:00Z')",
        [],
    )?;
    raw.execute(
        "INSERT INTO core_filters (id, name, query_json, sort_json, group_json, view_type, source_plugin_id, created_at, updated_at)
         VALUES ('bad-filter-sort', 'Broken sort', '{}', '{not valid json', NULL, 'list', NULL, '2026-05-21T00:00:00Z', '2026-05-21T00:00:00Z')",
        [],
    )?;
    raw.execute(
        "INSERT INTO core_plugins (id, name, version, enabled, manifest_json, settings_json, installed_at, updated_at)
         VALUES ('bad-plugin-manifest', 'Broken manifest', '1.0.0', 1, '{not valid json', NULL, '2026-05-21T00:00:00Z', '2026-05-21T00:00:00Z')",
        [],
    )?;
    raw.execute(
        "INSERT INTO core_plugins (id, name, version, enabled, manifest_json, settings_json, installed_at, updated_at)
         VALUES ('bad-plugin-settings', 'Broken settings', '1.0.0', 1, '{}', '{not valid json', '2026-05-21T00:00:00Z', '2026-05-21T00:00:00Z')",
        [],
    )?;
    raw.execute(
        "INSERT INTO core_commands (id, plugin_id, command_id, title, shortcut, context)
         VALUES ('bad-command', 'bad-plugin-settings', 'broken', 'Broken', NULL, '{not valid json')",
        [],
    )?;
    raw.execute(
        "INSERT INTO core_views (id, plugin_id, view_type, name, accepted_data_shape_json)
         VALUES ('bad-view', 'bad-plugin-settings', 'broken', 'Broken', '{not valid json')",
        [],
    )?;
    drop(raw);

    let database = Database::open(db_file.path())?;
    apply_migrations(&database)?;

    assert_invalid_json(
        PageRepository::new(&database)
            .get("bad-page")
            .expect_err("bad page JSON must error"),
        "core_pages",
        "body_json",
        "bad-page",
    );
    assert_invalid_json(
        MetadataRepository::new(&database)
            .get("bad-meta")
            .expect_err("bad metadata JSON must error"),
        "core_metadata",
        "value_json",
        "bad-meta",
    );
    assert_invalid_json(
        EventRepository::new(&database)
            .get("bad-event")
            .expect_err("bad event JSON must error"),
        "core_events",
        "payload_json",
        "bad-event",
    );
    assert_invalid_json(
        FilterRepository::new(&database)
            .get("bad-filter-query")
            .expect_err("bad filter query JSON must error"),
        "core_filters",
        "query_json",
        "bad-filter-query",
    );
    assert_invalid_json(
        FilterRepository::new(&database)
            .get("bad-filter-sort")
            .expect_err("bad filter sort JSON must error"),
        "core_filters",
        "sort_json",
        "bad-filter-sort",
    );
    assert_invalid_json(
        PluginRepository::new(&database)
            .get("bad-plugin-manifest")
            .expect_err("bad plugin manifest JSON must error"),
        "core_plugins",
        "manifest_json",
        "bad-plugin-manifest",
    );
    assert_invalid_json(
        PluginRepository::new(&database)
            .get("bad-plugin-settings")
            .expect_err("bad plugin settings JSON must error"),
        "core_plugins",
        "settings_json",
        "bad-plugin-settings",
    );
    assert_invalid_json(
        CommandDescriptorRepository::new(&database)
            .get("bad-command")
            .expect_err("bad command context JSON must error"),
        "core_commands",
        "context",
        "bad-command",
    );
    assert_invalid_json(
        ViewDescriptorRepository::new(&database)
            .get("bad-view")
            .expect_err("bad view shape JSON must error"),
        "core_views",
        "accepted_data_shape_json",
        "bad-view",
    );

    Ok(())
}

struct TempDatabase {
    _dir: TempDir,
    path: PathBuf,
}

impl TempDatabase {
    fn new() -> TestResult<Self> {
        let dir = tempfile::tempdir()?;
        let path = dir.path().join("mirabilis.sqlite3");
        Ok(Self { _dir: dir, path })
    }

    fn path(&self) -> &Path {
        &self.path
    }
}

fn migrated_temp_database() -> TestResult<TempDatabase> {
    let db_file = TempDatabase::new()?;
    let database = Database::open(db_file.path())?;
    apply_migrations(&database)?;
    drop(database);
    Ok(db_file)
}

fn seed_page(database: &Database, id: &str) -> TestResult {
    PageRepository::new(database).create(NewPage {
        id: s(id),
        title: s("Seed page"),
        parent_page_id: None,
        body: json!({}),
        created_at: s("2026-05-21T00:00:00Z"),
        updated_at: s("2026-05-21T00:00:00Z"),
    })?;
    Ok(())
}

fn seed_plugin(database: &Database, id: &str) -> TestResult {
    PluginRepository::new(database).upsert(UpsertPlugin {
        id: s(id),
        name: s("Seed plugin"),
        version: s("1.0.0"),
        enabled: true,
        manifest: json!({}),
        settings: None,
        installed_at: s("2026-05-21T00:00:00Z"),
        updated_at: s("2026-05-21T00:00:00Z"),
    })?;
    Ok(())
}

fn assert_invalid_json(error: DbError, table: &str, column: &str, record_id: &str) {
    match error {
        DbError::InvalidJson {
            table: actual_table,
            column: actual_column,
            record_id: actual_record_id,
            ..
        } => {
            assert_eq!(actual_table, table);
            assert_eq!(actual_column, column);
            assert_eq!(actual_record_id, record_id);
        }
        other => panic!("expected InvalidJson for {table}.{column}/{record_id}, got {other:?}"),
    }
}

fn rich_json() -> Value {
    json!({
        "object": {
            "array": [
                true,
                false,
                null,
                42,
                3.5,
                "text",
                {"nested": ["x'); DROP TABLE core_pages; --"]}
            ]
        },
        "boolean": true,
        "number": 123.45,
        "string": "literal",
        "null": null
    })
}

fn ids<T: HasId>(records: Vec<T>) -> Vec<String> {
    records
        .into_iter()
        .map(|record| record.id().to_string())
        .collect()
}

trait HasId {
    fn id(&self) -> &str;
}

impl HasId for mirabilis_lib::db::types::PageRecord {
    fn id(&self) -> &str {
        &self.id
    }
}

impl HasId for mirabilis_lib::db::types::MetadataRecord {
    fn id(&self) -> &str {
        &self.id
    }
}

impl HasId for mirabilis_lib::db::types::EventRecord {
    fn id(&self) -> &str {
        &self.id
    }
}

impl HasId for mirabilis_lib::db::types::FilterRecord {
    fn id(&self) -> &str {
        &self.id
    }
}

impl HasId for mirabilis_lib::db::types::PluginRecord {
    fn id(&self) -> &str {
        &self.id
    }
}

impl HasId for mirabilis_lib::db::types::CommandDescriptorRecord {
    fn id(&self) -> &str {
        &self.id
    }
}

impl HasId for mirabilis_lib::db::types::ViewDescriptorRecord {
    fn id(&self) -> &str {
        &self.id
    }
}

fn s(value: &str) -> String {
    value.to_string()
}

fn pragma_user_version(connection: &Connection) -> rusqlite::Result<i64> {
    connection.query_row("PRAGMA user_version", [], |row| row.get(0))
}

fn assert_table_columns(
    connection: &Connection,
    table: &str,
    expected_columns: &[(&str, &str)],
) -> TestResult {
    let mut statement = connection.prepare(&format!("PRAGMA table_info({table})"))?;
    let rows = statement.query_map([], |row| {
        Ok((
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?.to_uppercase(),
        ))
    })?;
    let actual = rows.collect::<rusqlite::Result<BTreeMap<_, _>>>()?;

    for (name, column_type) in expected_columns {
        assert_eq!(
            actual.get(*name).map(String::as_str),
            Some(*column_type),
            "expected {table}.{name} to have type {column_type}; actual columns: {actual:?}",
        );
    }

    Ok(())
}

fn assert_index_covering(
    connection: &Connection,
    table: &str,
    expected_columns: &[&str],
    require_unique: bool,
) -> TestResult {
    let mut index_statement = connection.prepare(&format!("PRAGMA index_list({table})"))?;
    let index_rows = index_statement.query_map([], |row| {
        Ok((row.get::<_, String>(1)?, row.get::<_, i64>(2)? == 1))
    })?;
    let indexes = index_rows.collect::<rusqlite::Result<Vec<_>>>()?;

    for (index_name, unique) in indexes {
        if require_unique && !unique {
            continue;
        }

        let mut columns_statement =
            connection.prepare(&format!("PRAGMA index_info({index_name})"))?;
        let columns = columns_statement
            .query_map([], |row| row.get::<_, String>(2))?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        if columns
            .iter()
            .map(String::as_str)
            .take(expected_columns.len())
            .eq(expected_columns.iter().copied())
        {
            return Ok(());
        }
    }

    panic!(
        "expected {table} to have {}index covering prefix {expected_columns:?}",
        if require_unique { "unique " } else { "" }
    );
}

fn assert_foreign_key(
    connection: &Connection,
    table: &str,
    from_column: &str,
    target_table: &str,
    target_column: &str,
) -> TestResult {
    let mut statement = connection.prepare(&format!("PRAGMA foreign_key_list({table})"))?;
    let rows = statement.query_map([], |row| {
        Ok((
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, String>(4)?,
        ))
    })?;
    let foreign_keys = rows.collect::<rusqlite::Result<Vec<_>>>()?;

    assert!(
        foreign_keys.iter().any(|(actual_table, actual_from, actual_to)| {
            actual_table == target_table
                && actual_from == from_column
                && actual_to == target_column
        }),
        "expected {table}.{from_column} to reference {target_table}({target_column}); actual foreign keys: {foreign_keys:?}"
    );

    Ok(())
}

fn raw_optional_text(path: &Path, sql: &str) -> TestResult<Option<String>> {
    let connection = Connection::open(path)?;
    Ok(connection
        .query_row(sql, [], |row| row.get::<_, Option<String>>(0))
        .optional()?
        .flatten())
}

fn assert_table_queryable(path: &Path, table: &str) -> TestResult {
    let connection = Connection::open(path)?;
    let count: i64 = connection.query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| {
        row.get(0)
    })?;
    assert!(count >= 0);
    Ok(())
}
