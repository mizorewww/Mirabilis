use std::path::PathBuf;

use mirabilis_lib::commands::db::{
    dispatch_db_execute, dispatch_db_transaction, DbCommandState, DbQuery, ALLOWED_DB_OPERATIONS,
};
use serde::Serialize;
use serde_json::{json, Value};
use tempfile::TempDir;

type TestResult<T = ()> = Result<T, Box<dyn std::error::Error>>;

const EXPECTED_DB_OPERATIONS: &[&str] = &[
    "core.pages.create",
    "core.pages.get",
    "core.pages.list",
    "core.pages.update",
    "core.pages.archive",
    "core.metadata.set",
    "core.metadata.get",
    "core.metadata.listForPage",
    "core.metadata.delete",
    "core.events.append",
    "core.events.list",
    "core.filters.save",
    "core.filters.get",
    "core.filters.list",
    "core.filters.delete",
];

const CREATED_AT: &str = "2026-05-21T01:00:00Z";
const UPDATED_AT: &str = "2026-05-21T01:05:00Z";
const ARCHIVED_AT: &str = "2026-05-21T01:10:00Z";

#[test]
fn db_operation_allowlist_and_query_dto_are_exact() -> TestResult {
    assert_eq!(ALLOWED_DB_OPERATIONS.as_ref(), EXPECTED_DB_OPERATIONS);

    let query: DbQuery = serde_json::from_value(json!({
        "operation": "core.pages.get",
        "payload": {"id": "page-1"}
    }))?;
    assert_eq!(
        serde_json::to_value(query)?,
        json!({"operation": "core.pages.get", "payload": {"id": "page-1"}})
    );

    for invalid in [
        json!({"operation": "core.pages.getById", "payload": {"id": "page-1"}}),
        json!({"operation": "core.tasks.create", "payload": {}}),
        json!({"operation": "select * from core_pages", "payload": {}}),
        json!({"operation": "core.pages.get", "payload": {"id": "page-1"}, "sql": "SELECT * FROM core_pages"}),
        json!({"operation": "core.pages.get", "payload": {"id": "page-1"}, "params": ["page-1"]}),
        json!({"operation": "core.pages.get", "payload": {"id": "page-1"}, "extra": true}),
    ] {
        assert!(
            serde_json::from_value::<DbQuery>(invalid).is_err(),
            "DbQuery must reject unknown operations and raw-SQL or extra top-level fields",
        );
    }

    Ok(())
}

#[test]
fn db_execute_round_trips_pages_metadata_events_and_filters() -> TestResult {
    let database = TempIpcDatabase::new()?;

    assert_eq!(
        dispatch_db_execute(database.state(), create_page_request("page-1", "Roadmap"))?,
        Value::Null
    );
    assert_eq!(
        dispatch_db_execute(
            database.state(),
            json!({"operation": "core.pages.get", "payload": {"id": "page-1"}}),
        )?,
        page_response("page-1", "Roadmap", UPDATED_AT, Value::Null)
    );
    assert_eq!(
        dispatch_db_execute(
            database.state(),
            json!({"operation": "core.pages.list", "payload": {"includeArchived": false}}),
        )?,
        json!([page_response("page-1", "Roadmap", UPDATED_AT, Value::Null)])
    );

    assert_eq!(
        dispatch_db_execute(
            database.state(),
            json!({
                "operation": "core.pages.update",
                "payload": {
                    "id": "page-1",
                    "title": "Roadmap updated",
                    "parentPageId": null,
                    "body": {"blocks": [{"type": "paragraph", "text": "Roadmap updated"}]},
                    "updatedAt": UPDATED_AT
                }
            }),
        )?,
        Value::Null
    );
    assert_eq!(
        dispatch_db_execute(
            database.state(),
            json!({
                "operation": "core.pages.archive",
                "payload": {"id": "page-1", "archivedAt": ARCHIVED_AT}
            }),
        )?,
        Value::Null
    );
    assert_eq!(
        dispatch_db_execute(
            database.state(),
            json!({"operation": "core.pages.get", "payload": {"id": "page-1"}}),
        )?,
        page_response("page-1", "Roadmap updated", ARCHIVED_AT, json!(ARCHIVED_AT),)
    );

    assert_eq!(
        dispatch_db_execute(
            database.state(),
            set_metadata_request("metadata-1", "page-1")
        )?,
        Value::Null
    );
    let metadata_record = metadata_response("metadata-1", "page-1");
    assert_eq!(
        dispatch_db_execute(
            database.state(),
            json!({"operation": "core.metadata.get", "payload": {"id": "metadata-1"}}),
        )?,
        metadata_record
    );
    assert_eq!(
        dispatch_db_execute(
            database.state(),
            json!({"operation": "core.metadata.listForPage", "payload": {"pageId": "page-1"}}),
        )?,
        json!([metadata_response("metadata-1", "page-1")])
    );
    assert_eq!(
        dispatch_db_execute(
            database.state(),
            json!({"operation": "core.metadata.delete", "payload": {"id": "metadata-1"}}),
        )?,
        Value::Null
    );
    assert_eq!(
        dispatch_db_execute(
            database.state(),
            json!({"operation": "core.metadata.get", "payload": {"id": "metadata-1"}}),
        )?,
        Value::Null
    );

    assert_eq!(
        dispatch_db_execute(database.state(), append_event_request("event-1", "page-1"))?,
        Value::Null
    );
    assert_eq!(
        dispatch_db_execute(
            database.state(),
            json!({
                "operation": "core.events.list",
                "payload": {
                    "pageId": "page-1",
                    "namespace": "timer",
                    "eventType": "timer.started"
                }
            }),
        )?,
        json!([event_response("event-1", "page-1")])
    );

    assert_eq!(
        dispatch_db_execute(database.state(), save_filter_request("filter-1"))?,
        Value::Null
    );
    assert_eq!(
        dispatch_db_execute(
            database.state(),
            json!({"operation": "core.filters.get", "payload": {"id": "filter-1"}}),
        )?,
        filter_response("filter-1")
    );
    assert_eq!(
        dispatch_db_execute(
            database.state(),
            json!({
                "operation": "core.filters.list",
                "payload": {"sourcePluginId": "core.search", "viewType": "list"}
            }),
        )?,
        json!([filter_response("filter-1")])
    );
    assert_eq!(
        dispatch_db_execute(
            database.state(),
            json!({"operation": "core.filters.delete", "payload": {"id": "filter-1"}}),
        )?,
        Value::Null
    );
    assert_eq!(
        dispatch_db_execute(
            database.state(),
            json!({"operation": "core.filters.get", "payload": {"id": "filter-1"}}),
        )?,
        Value::Null
    );

    Ok(())
}

#[test]
fn db_execute_rejects_malformed_or_unsafe_requests_with_redacted_typed_errors() -> TestResult {
    let database = TempIpcDatabase::new()?;
    let db_path = database.path().display().to_string();

    let path_like_cases = ["path", "dbPath", "databasePath"]
        .into_iter()
        .map(|field_name| {
            (
                format!("path-like payload field {field_name}"),
                request_with_path_like_payload_field(field_name, &db_path),
                vec![db_path.clone(), field_name.to_string()],
            )
        });
    let malformed_cases = vec![
        (
            "unknown operation".to_string(),
            json!({"operation": "core.pages.getById", "payload": {"id": "page-1"}}),
            vec!["core.pages.getById".to_string()],
        ),
        (
            "missing payload".to_string(),
            json!({"operation": "core.pages.create"}),
            vec!["core.pages.create".to_string()],
        ),
        (
            "wrong payload type".to_string(),
            json!({"operation": "core.pages.create", "payload": "page-1"}),
            vec!["page-1".to_string()],
        ),
        (
            "extra payload field".to_string(),
            json!({
                "operation": "core.pages.get",
                "payload": {"id": "page-1", "extra": "secret-token"}
            }),
            vec!["secret-token".to_string(), "extra".to_string()],
        ),
        (
            "raw sql field".to_string(),
            json!({
                "operation": "core.pages.list",
                "sql": "SELECT * FROM core_pages WHERE token = 'secret-token'"
            }),
            vec![
                "SELECT *".to_string(),
                "core_pages".to_string(),
                "secret-token".to_string(),
            ],
        ),
        (
            "raw params field".to_string(),
            json!({
                "operation": "core.pages.list",
                "params": ["secret-token"]
            }),
            vec!["secret-token".to_string(), "params".to_string()],
        ),
        (
            "injection-looking operation".to_string(),
            json!({
                "operation": "core.pages.list; DROP TABLE core_pages; --",
                "payload": {}
            }),
            vec!["DROP TABLE".to_string(), "core_pages".to_string()],
        ),
    ];

    for (label, request, forbidden) in malformed_cases.into_iter().chain(path_like_cases) {
        let error = dispatch_db_execute(database.state(), request)
            .expect_err(&format!("{label} should be rejected"));
        assert_redacted_ipc_error(&error, "INVALID_REQUEST", &forbidden)?;
    }

    Ok(())
}

#[test]
fn db_transaction_returns_ordered_results_and_rolls_back_validation_failures() -> TestResult {
    let database = TempIpcDatabase::new()?;

    let results = dispatch_db_transaction(
        database.state(),
        vec![
            create_page_request("tx-page-1", "Transactional page"),
            json!({"operation": "core.pages.get", "payload": {"id": "tx-page-1"}}),
            set_metadata_request("tx-metadata-1", "tx-page-1"),
            json!({
                "operation": "core.metadata.listForPage",
                "payload": {"pageId": "tx-page-1"}
            }),
        ],
    )?;

    assert_eq!(
        results,
        json!([
            null,
            page_response("tx-page-1", "Transactional page", UPDATED_AT, Value::Null),
            null,
            [metadata_response("tx-metadata-1", "tx-page-1")]
        ])
    );

    let error = dispatch_db_transaction(
        database.state(),
        vec![
            create_page_request("tx-rolled-back-validation", "Rolled back"),
            json!({
                "operation": "core.pages.get",
                "payload": {
                    "id": "tx-rolled-back-validation",
                    "databasePath": database.path().display().to_string()
                }
            }),
        ],
    )
    .expect_err("transaction should reject unsafe later operation and roll back earlier writes");
    assert_redacted_ipc_error(
        &error,
        "INVALID_REQUEST",
        &[
            "tx-rolled-back-validation".to_string(),
            database.path().display().to_string(),
            "databasePath".to_string(),
        ],
    )?;
    assert_eq!(
        dispatch_db_execute(
            database.state(),
            json!({
                "operation": "core.pages.get",
                "payload": {"id": "tx-rolled-back-validation"}
            }),
        )?,
        Value::Null
    );

    Ok(())
}

#[test]
fn db_transaction_rolls_back_repository_constraint_failures_and_redacts_errors() -> TestResult {
    let database = TempIpcDatabase::new()?;

    dispatch_db_execute(
        database.state(),
        create_page_request("existing-page", "Existing"),
    )?;

    let error = dispatch_db_transaction(
        database.state(),
        vec![
            create_page_request("tx-rolled-back-constraint", "Rolled back"),
            create_page_request("existing-page", "Duplicate"),
        ],
    )
    .expect_err("transaction should reject repository constraint failures");

    assert_redacted_ipc_error(
        &error,
        "PERSISTENCE_FAILED",
        &[
            "existing-page".to_string(),
            "tx-rolled-back-constraint".to_string(),
            "UNIQUE".to_string(),
            "constraint".to_string(),
            "core_pages".to_string(),
            "INSERT INTO".to_string(),
            database.path().display().to_string(),
        ],
    )?;
    assert_eq!(
        dispatch_db_execute(
            database.state(),
            json!({
                "operation": "core.pages.get",
                "payload": {"id": "tx-rolled-back-constraint"}
            }),
        )?,
        Value::Null
    );

    Ok(())
}

struct TempIpcDatabase {
    _dir: TempDir,
    path: PathBuf,
    state: DbCommandState,
}

impl TempIpcDatabase {
    fn new() -> TestResult<Self> {
        let dir = TempDir::new()?;
        let path = dir.path().join("mirabilis.sqlite3");
        let state = DbCommandState::open(&path)?;

        Ok(Self {
            _dir: dir,
            path,
            state,
        })
    }

    fn path(&self) -> &PathBuf {
        &self.path
    }

    fn state(&self) -> &DbCommandState {
        &self.state
    }
}

fn create_page_request(id: &str, title: &str) -> Value {
    json!({
        "operation": "core.pages.create",
        "payload": {
            "id": id,
            "title": title,
            "parentPageId": null,
            "body": {"blocks": [{"type": "paragraph", "text": title}]},
            "createdAt": CREATED_AT,
            "updatedAt": UPDATED_AT
        }
    })
}

fn set_metadata_request(id: &str, page_id: &str) -> Value {
    json!({
        "operation": "core.metadata.set",
        "payload": {
            "id": id,
            "pageId": page_id,
            "namespace": "task",
            "key": "status",
            "value": {"done": false},
            "valueType": "object",
            "sourcePluginId": "core.task",
            "createdAt": CREATED_AT,
            "updatedAt": UPDATED_AT
        }
    })
}

fn append_event_request(id: &str, page_id: &str) -> Value {
    json!({
        "operation": "core.events.append",
        "payload": {
            "id": id,
            "pageId": page_id,
            "namespace": "timer",
            "eventType": "timer.started",
            "payload": {"segmentId": "segment-1"},
            "sourcePluginId": "core.timer",
            "createdAt": CREATED_AT
        }
    })
}

fn save_filter_request(id: &str) -> Value {
    json!({
        "operation": "core.filters.save",
        "payload": {
            "id": id,
            "name": "Open tasks",
            "query": {"operator": "eq", "field": "task.done", "value": false},
            "sort": {"field": "createdAt", "direction": "asc"},
            "group": null,
            "viewType": "list",
            "sourcePluginId": "core.search",
            "createdAt": CREATED_AT,
            "updatedAt": UPDATED_AT
        }
    })
}

fn request_with_path_like_payload_field(field_name: &str, path: &str) -> Value {
    let mut payload = serde_json::Map::new();
    payload.insert("id".to_string(), json!("page-1"));
    payload.insert(field_name.to_string(), json!(path));

    json!({
        "operation": "core.pages.get",
        "payload": Value::Object(payload)
    })
}

fn page_response(id: &str, title: &str, updated_at: &str, archived_at: Value) -> Value {
    json!({
        "id": id,
        "title": title,
        "parentPageId": null,
        "body": {"blocks": [{"type": "paragraph", "text": title}]},
        "createdAt": CREATED_AT,
        "updatedAt": updated_at,
        "archivedAt": archived_at
    })
}

fn metadata_response(id: &str, page_id: &str) -> Value {
    json!({
        "id": id,
        "pageId": page_id,
        "namespace": "task",
        "key": "status",
        "value": {"done": false},
        "valueType": "object",
        "sourcePluginId": "core.task",
        "createdAt": CREATED_AT,
        "updatedAt": UPDATED_AT
    })
}

fn event_response(id: &str, page_id: &str) -> Value {
    json!({
        "id": id,
        "pageId": page_id,
        "namespace": "timer",
        "eventType": "timer.started",
        "payload": {"segmentId": "segment-1"},
        "sourcePluginId": "core.timer",
        "createdAt": CREATED_AT
    })
}

fn filter_response(id: &str) -> Value {
    json!({
        "id": id,
        "name": "Open tasks",
        "query": {"operator": "eq", "field": "task.done", "value": false},
        "sort": {"field": "createdAt", "direction": "asc"},
        "group": null,
        "viewType": "list",
        "sourcePluginId": "core.search",
        "createdAt": CREATED_AT,
        "updatedAt": UPDATED_AT
    })
}

fn assert_redacted_ipc_error(
    error: &impl Serialize,
    expected_code: &str,
    forbidden_fragments: &[String],
) -> TestResult {
    let error_json = serde_json::to_value(error)?;
    let error_object = error_json
        .as_object()
        .expect("IPC errors should serialize as JSON objects");
    let mut keys = error_object.keys().map(String::as_str).collect::<Vec<_>>();
    keys.sort_unstable();
    assert_eq!(keys, ["code", "message"]);
    assert_eq!(error_json.get("code"), Some(&json!(expected_code)));
    assert_eq!(
        error_json.get("message"),
        Some(&json!("Native command failed"))
    );

    let serialized_error = serde_json::to_string(&error_json)?;
    for fragment in forbidden_fragments {
        assert!(
            !serialized_error.contains(fragment),
            "IPC error DTO leaked forbidden fragment {fragment:?}: {serialized_error}",
        );
    }

    for generic_fragment in [
        "sqlite",
        "Sqlite",
        "rusqlite",
        "source",
        "backtrace",
        "payload",
        "SELECT",
        "INSERT",
        "UPDATE",
        "DELETE",
        "core_pages",
    ] {
        assert!(
            !serialized_error.contains(generic_fragment),
            "IPC error DTO leaked implementation detail {generic_fragment:?}: {serialized_error}",
        );
    }

    Ok(())
}
