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
                    "body": page_body("page-1", "Roadmap updated"),
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
            json!({
                "operation": "core.metadata.get",
                "payload": metadata_logical_key_payload("page-1")
            }),
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
            json!({
                "operation": "core.metadata.delete",
                "payload": metadata_logical_key_payload("page-1")
            }),
        )?,
        Value::Null
    );
    assert_eq!(
        dispatch_db_execute(
            database.state(),
            json!({
                "operation": "core.metadata.get",
                "payload": metadata_logical_key_payload("page-1")
            }),
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
fn metadata_get_and_delete_use_core_logical_key_instead_of_row_id() -> TestResult {
    let database = TempIpcDatabase::new()?;
    dispatch_db_execute(database.state(), create_page_request("page-1", "Roadmap"))?;

    dispatch_db_execute(
        database.state(),
        set_metadata_request_with_key_value(
            "metadata-original",
            "page-1",
            "status",
            json!({"done": false}),
            "json",
        ),
    )?;
    dispatch_db_execute(
        database.state(),
        set_metadata_request_with_key_value(
            "metadata-replacement",
            "page-1",
            "status",
            json!("done"),
            "string",
        ),
    )?;

    let expected = metadata_response_with_value(
        "metadata-original",
        "page-1",
        "status",
        json!("done"),
        "string",
    );
    assert_eq!(
        dispatch_db_execute(
            database.state(),
            json!({
                "operation": "core.metadata.get",
                "payload": metadata_logical_key_payload("page-1")
            }),
        )?,
        expected
    );
    assert_eq!(
        dispatch_db_execute(
            database.state(),
            json!({
                "operation": "core.metadata.listForPage",
                "payload": {"pageId": "page-1"}
            }),
        )?,
        json!([expected])
    );

    for request in [
        json!({"operation": "core.metadata.get", "payload": {"id": "metadata-original"}}),
        json!({"operation": "core.metadata.delete", "payload": {"id": "metadata-original"}}),
    ] {
        let error = dispatch_db_execute(database.state(), request)
            .expect_err("metadata get/delete must reject row-id-only IPC payloads");
        assert_redacted_invalid_request(&error, &["metadata-original"])?;
    }

    assert_eq!(
        dispatch_db_execute(
            database.state(),
            json!({
                "operation": "core.metadata.delete",
                "payload": metadata_logical_key_payload("page-1")
            }),
        )?,
        Value::Null
    );
    assert_eq!(
        dispatch_db_execute(
            database.state(),
            json!({
                "operation": "core.metadata.get",
                "payload": metadata_logical_key_payload("page-1")
            }),
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
fn page_create_and_update_reject_malformed_structured_bodies_with_redacted_invalid_request(
) -> TestResult {
    let database = TempIpcDatabase::new()?;
    dispatch_db_execute(
        database.state(),
        create_page_request("valid-body-page", "Valid body"),
    )?;

    for (index, (label, body, forbidden_fragments)) in
        malformed_page_body_cases().into_iter().enumerate()
    {
        let page_id = format!("invalid-body-page-{index}");
        let create_error = dispatch_db_execute(
            database.state(),
            create_page_request_with_body(&page_id, label, body.clone()),
        )
        .expect_err(&format!("page create should reject malformed body: {label}"));
        assert_redacted_invalid_request(&create_error, &forbidden_fragments)?;
        assert_eq!(
            dispatch_db_execute(
                database.state(),
                json!({
                    "operation": "core.pages.get",
                    "payload": {"id": page_id}
                }),
            )?,
            Value::Null,
            "page create must reject {label} before writing body_json"
        );

        let update_error = dispatch_db_execute(
            database.state(),
            update_page_request_with_body("valid-body-page", "Valid body", body),
        )
        .expect_err(&format!("page update should reject malformed body: {label}"));
        assert_redacted_invalid_request(&update_error, &forbidden_fragments)?;
        assert_eq!(
            dispatch_db_execute(
                database.state(),
                json!({
                    "operation": "core.pages.get",
                    "payload": {"id": "valid-body-page"}
                }),
            )?,
            page_response("valid-body-page", "Valid body", UPDATED_AT, Value::Null),
            "page update must reject {label} before replacing body_json"
        );
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
fn page_transaction_rolls_back_earlier_valid_write_when_later_body_is_invalid() -> TestResult {
    let database = TempIpcDatabase::new()?;

    let error = dispatch_db_transaction(
        database.state(),
        vec![
            create_page_request("tx-valid-before-invalid-body", "Valid before invalid"),
            create_page_request_with_body(
                "tx-invalid-body",
                "Invalid body",
                json!({
                    "type": "doc",
                    "content": [
                        {"blockId": "tx-duplicate-block", "type": "markdown.line", "text": "One"},
                        {"blockId": "tx-duplicate-block", "type": "markdown.line", "text": "Two"}
                    ]
                }),
            ),
        ],
    )
    .expect_err("transaction should reject invalid later page body and roll back earlier writes");
    assert_redacted_invalid_request(
        &error,
        &["tx-valid-before-invalid-body", "tx-duplicate-block"],
    )?;

    assert_eq!(
        dispatch_db_execute(
            database.state(),
            json!({
                "operation": "core.pages.get",
                "payload": {"id": "tx-valid-before-invalid-body"}
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

#[test]
fn missing_target_mutations_return_typed_redacted_errors() -> TestResult {
    let database = TempIpcDatabase::new()?;

    let cases = vec![
        (
            "page update",
            json!({
                "operation": "core.pages.update",
                "payload": {
                    "id": "missing-page-update",
                    "title": "Missing",
                    "parentPageId": null,
                    "body": page_body("missing-page-update", "Missing"),
                    "updatedAt": UPDATED_AT
                }
            }),
            "missing-page-update",
        ),
        (
            "page archive",
            json!({
                "operation": "core.pages.archive",
                "payload": {"id": "missing-page-archive", "archivedAt": ARCHIVED_AT}
            }),
            "missing-page-archive",
        ),
        (
            "metadata delete",
            json!({
                "operation": "core.metadata.delete",
                "payload": {
                    "pageId": "missing-page",
                    "namespace": "task",
                    "key": "status"
                }
            }),
            "missing-page",
        ),
        (
            "filter delete",
            json!({
                "operation": "core.filters.delete",
                "payload": {"id": "missing-filter"}
            }),
            "missing-filter",
        ),
    ];

    for (label, request, forbidden_fragment) in cases {
        let error = dispatch_db_execute(database.state(), request)
            .expect_err(&format!("{label} should reject missing targets"));
        assert_redacted_persistence_failed(&error, &[forbidden_fragment])?;
    }

    Ok(())
}

#[test]
fn transaction_rolls_back_earlier_writes_when_later_missing_target_mutation_fails() -> TestResult {
    let database = TempIpcDatabase::new()?;

    let error = dispatch_db_transaction(
        database.state(),
        vec![
            create_page_request("tx-missing-target-rollback", "Rolled back"),
            json!({
                "operation": "core.pages.update",
                "payload": {
                    "id": "missing-page-in-transaction",
                    "title": "Missing",
                    "parentPageId": null,
                    "body": page_body("missing-page-in-transaction", "Missing"),
                    "updatedAt": UPDATED_AT
                }
            }),
        ],
    )
    .expect_err("missing-target mutation should fail the whole transaction");
    assert_redacted_persistence_failed(
        &error,
        &["tx-missing-target-rollback", "missing-page-in-transaction"],
    )?;

    assert_eq!(
        dispatch_db_execute(
            database.state(),
            json!({
                "operation": "core.pages.get",
                "payload": {"id": "tx-missing-target-rollback"}
            }),
        )?,
        Value::Null
    );

    Ok(())
}

#[test]
fn db_execute_rejects_semantically_invalid_payloads_for_every_operation() -> TestResult {
    let database = TempIpcDatabase::new()?;
    dispatch_db_execute(
        database.state(),
        create_page_request("validation-page", "Validation"),
    )?;
    dispatch_db_execute(database.state(), save_filter_request("validation-filter"))?;

    let cases = vec![
        (
            "core.pages.create",
            create_page_request("   ", "Blank page id"),
            "   ",
        ),
        (
            "core.pages.get",
            json!({"operation": "core.pages.get", "payload": {"id": ""}}),
            "",
        ),
        (
            "core.pages.list",
            json!({
                "operation": "core.pages.list",
                "payload": {"parentPageId": "\n\t"}
            }),
            "\n\t",
        ),
        (
            "core.pages.update",
            json!({
                "operation": "core.pages.update",
                "payload": {
                    "id": " ",
                    "title": "Blank id",
                    "parentPageId": null,
                    "body": page_body("blank-page-id", "Blank id"),
                    "updatedAt": UPDATED_AT
                }
            }),
            " ",
        ),
        (
            "core.pages.archive",
            json!({
                "operation": "core.pages.archive",
                "payload": {"id": "\t", "archivedAt": ARCHIVED_AT}
            }),
            "\t",
        ),
        (
            "core.metadata.set",
            set_metadata_request_with_key_value(
                "metadata-invalid-page",
                " ",
                "status",
                json!("open"),
                "string",
            ),
            " ",
        ),
        (
            "core.metadata.get",
            json!({
                "operation": "core.metadata.get",
                "payload": {"pageId": "", "namespace": "task", "key": "status"}
            }),
            "",
        ),
        (
            "core.metadata.listForPage",
            json!({
                "operation": "core.metadata.listForPage",
                "payload": {"pageId": " "}
            }),
            " ",
        ),
        (
            "core.metadata.delete",
            json!({
                "operation": "core.metadata.delete",
                "payload": {"pageId": "validation-page", "namespace": " ", "key": "status"}
            }),
            " ",
        ),
        (
            "core.events.append",
            json!({
                "operation": "core.events.append",
                "payload": {
                    "id": "event-invalid-namespace",
                    "pageId": "validation-page",
                    "namespace": " ",
                    "eventType": "timer.started",
                    "payload": {},
                    "sourcePluginId": "core.timer",
                    "createdAt": CREATED_AT
                }
            }),
            " ",
        ),
        (
            "core.events.list",
            json!({
                "operation": "core.events.list",
                "payload": {"namespace": " "}
            }),
            " ",
        ),
        (
            "core.filters.save",
            save_filter_request_with_parts(
                "",
                valid_filter_query(),
                Some(valid_filter_sort()),
                None,
            ),
            "",
        ),
        (
            "core.filters.get",
            json!({"operation": "core.filters.get", "payload": {"id": " "}}),
            " ",
        ),
        (
            "core.filters.list",
            json!({
                "operation": "core.filters.list",
                "payload": {"viewType": "\t"}
            }),
            "\t",
        ),
        (
            "core.filters.delete",
            json!({"operation": "core.filters.delete", "payload": {"id": ""}}),
            "",
        ),
    ];

    let covered_operations = cases
        .iter()
        .map(|(operation, _, _)| *operation)
        .collect::<Vec<_>>();
    assert_eq!(covered_operations.as_slice(), EXPECTED_DB_OPERATIONS);

    for (operation, request, forbidden_fragment) in cases {
        let error = dispatch_db_execute(database.state(), request).expect_err(&format!(
            "{operation} should reject semantic invalid payloads"
        ));
        assert_redacted_invalid_request(&error, &[forbidden_fragment])?;
    }

    Ok(())
}

#[test]
fn metadata_value_type_must_match_core_value_types() -> TestResult {
    let database = TempIpcDatabase::new()?;
    dispatch_db_execute(
        database.state(),
        create_page_request("metadata-validation-page", "Metadata validation"),
    )?;

    let valid_cases = vec![
        ("string", json!("open"), "string"),
        ("number", json!(3), "number"),
        ("boolean", json!(true), "boolean"),
        ("object json", json!({"done": false}), "json"),
        ("array json", json!(["task"]), "json"),
        ("date", json!("2026-05-21"), "date"),
        ("null", Value::Null, "null"),
    ];

    for (index, (label, value, value_type)) in valid_cases.into_iter().enumerate() {
        dispatch_db_execute(
            database.state(),
            set_metadata_request_with_key_value(
                &format!("metadata-core-value-type-{index}"),
                "metadata-validation-page",
                &format!("valid-{index}"),
                value.clone(),
                value_type,
            ),
        )
        .unwrap_or_else(|_| panic!("{label} should be accepted as a Core metadata value type"));

        assert_eq!(
            dispatch_db_execute(
                database.state(),
                json!({
                    "operation": "core.metadata.get",
                    "payload": metadata_logical_key_payload_for(
                        "metadata-validation-page",
                        "task",
                        &format!("valid-{index}"),
                    )
                }),
            )?
            .get("valueType")
            .and_then(Value::as_str),
            Some(value_type),
            "{label} should round-trip its valueType"
        );
    }

    let mismatch_cases = vec![
        ("string value as number", json!("open"), "number"),
        ("number value as string", json!(3), "string"),
        ("boolean value as json", json!(true), "json"),
        ("object value as boolean", json!({"done": false}), "boolean"),
        ("array value as date", json!(["task"]), "date"),
        ("null value as boolean", Value::Null, "boolean"),
    ];

    for (index, (label, value, value_type)) in mismatch_cases.into_iter().enumerate() {
        let error = dispatch_db_execute(
            database.state(),
            set_metadata_request_with_key_value(
                &format!("metadata-type-mismatch-{index}"),
                "metadata-validation-page",
                &format!("status-{index}"),
                value,
                value_type,
            ),
        )
        .expect_err(&format!("{label} should be rejected"));
        assert_redacted_invalid_request(&error, &[value_type])?;
    }

    for (value_type, value) in [
        ("object", json!({"done": false})),
        ("array", json!(["task"])),
    ] {
        let error = dispatch_db_execute(
            database.state(),
            set_metadata_request_with_key_value(
                &format!("metadata-unsupported-value-type-{value_type}"),
                "metadata-validation-page",
                &format!("unsupported-{value_type}"),
                value,
                value_type,
            ),
        )
        .expect_err(&format!(
            "{value_type} must be rejected because Core MetadataValueType uses json for structured values"
        ));
        assert_redacted_invalid_request(&error, &[value_type])?;
    }

    Ok(())
}

#[test]
fn filter_save_rejects_malformed_query_sort_and_group_shapes() -> TestResult {
    let database = TempIpcDatabase::new()?;

    let cases = vec![
        (
            "unsupported query operator",
            save_filter_request_with_parts(
                "filter-invalid-query",
                json!({"where": [{"field": "metadata.task.title", "op": "regex", "value": "^fix"}]}),
                Some(valid_filter_sort()),
                None,
            ),
            "regex",
        ),
        (
            "malformed sort direction",
            save_filter_request_with_parts(
                "filter-invalid-sort",
                valid_filter_query(),
                Some(json!([{"field": "createdAt", "direction": "sideways"}])),
                None,
            ),
            "sideways",
        ),
        (
            "malformed group field",
            save_filter_request_with_parts(
                "filter-invalid-group",
                valid_filter_query(),
                None,
                Some(json!({"field": " "})),
            ),
            " ",
        ),
    ];

    for (label, request, forbidden_fragment) in cases {
        let error = dispatch_db_execute(database.state(), request)
            .expect_err(&format!("{label} should be rejected"));
        assert_redacted_invalid_request(&error, &[forbidden_fragment])?;
    }

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
    create_page_request_with_body(id, title, page_body(id, title))
}

fn create_page_request_with_body(id: &str, title: &str, body: Value) -> Value {
    json!({
        "operation": "core.pages.create",
        "payload": {
            "id": id,
            "title": title,
            "parentPageId": null,
            "body": body,
            "createdAt": CREATED_AT,
            "updatedAt": UPDATED_AT
        }
    })
}

fn update_page_request_with_body(id: &str, title: &str, body: Value) -> Value {
    json!({
        "operation": "core.pages.update",
        "payload": {
            "id": id,
            "title": title,
            "parentPageId": null,
            "body": body,
            "updatedAt": UPDATED_AT
        }
    })
}

fn malformed_page_body_cases() -> Vec<(&'static str, Value, Vec<&'static str>)> {
    vec![
        (
            "legacy blocks object",
            json!({"blocks": [{"type": "paragraph", "text": "legacy body"}]}),
            vec!["blocks", "legacy body"],
        ),
        (
            "non-doc root",
            json!({"type": "markdown.line", "content": []}),
            vec!["markdown.line"],
        ),
        (
            "missing content",
            json!({"type": "doc"}),
            vec!["doc"],
        ),
        (
            "non-array content",
            json!({"type": "doc", "content": {"blockId": "content-object"}}),
            vec!["content-object"],
        ),
        (
            "non-object block",
            json!({"type": "doc", "content": ["not a block"]}),
            vec!["not a block"],
        ),
        (
            "missing blockId",
            json!({"type": "doc", "content": [{"type": "markdown.line", "text": "Missing"}]}),
            vec!["Missing"],
        ),
        (
            "blank blockId",
            json!({"type": "doc", "content": [{"blockId": "  ", "type": "markdown.line", "text": "Blank"}]}),
            vec!["Blank"],
        ),
        (
            "duplicate blockId",
            json!({
                "type": "doc",
                "content": [
                    {"blockId": "duplicate-block", "type": "markdown.line", "text": "One"},
                    {"blockId": "duplicate-block", "type": "markdown.line", "text": "Two"}
                ]
            }),
            vec!["duplicate-block"],
        ),
        (
            "nested duplicate blockId",
            json!({
                "type": "doc",
                "content": [
                    {
                        "blockId": "nested-duplicate-block",
                        "type": "container",
                        "content": [
                            {
                                "blockId": "nested-duplicate-block",
                                "type": "markdown.line",
                                "text": "Nested"
                            }
                        ]
                    }
                ]
            }),
            vec!["nested-duplicate-block"],
        ),
        (
            "excessive depth",
            nested_page_body(101),
            vec!["depth-101"],
        ),
        (
            "excessive block count",
            many_block_page_body(20_001),
            vec!["block-20001"],
        ),
        (
            "invalid type",
            json!({"type": "doc", "content": [{"blockId": "invalid-type", "type": 42, "text": "Invalid"}]}),
            vec!["invalid-type"],
        ),
        (
            "invalid text",
            json!({"type": "doc", "content": [{"blockId": "invalid-text", "type": "markdown.line", "text": 42}]}),
            vec!["invalid-text"],
        ),
        (
            "invalid content",
            json!({"type": "doc", "content": [{"blockId": "invalid-content", "type": "container", "content": {}}]}),
            vec!["invalid-content"],
        ),
        (
            "invalid attrs",
            json!({"type": "doc", "content": [{"blockId": "invalid-attrs", "type": "markdown.line", "text": "Attrs", "attrs": []}]}),
            vec!["invalid-attrs"],
        ),
        (
            "event handler attr",
            json!({"type": "doc", "content": [{"blockId": "onclick-attr", "type": "markdown.line", "text": "Click", "attrs": {"onClick": "alert(1)"}}]}),
            vec!["onclick-attr", "onClick", "alert(1)"],
        ),
        (
            "javascript attr",
            json!({"type": "doc", "content": [{"blockId": "javascript-attr", "type": "markdown.line", "text": "Link", "attrs": {"href": "javascript:alert(1)"}}]}),
            vec!["javascript-attr", "javascript:alert"],
        ),
        (
            "data attr",
            json!({"type": "doc", "content": [{"blockId": "data-attr", "type": "markdown.line", "text": "Data", "attrs": {"href": "data:text/html,<script>alert(1)</script>"}}]}),
            vec!["data-attr", "data:text/html"],
        ),
        (
            "normalized javascript attr",
            json!({"type": "doc", "content": [{"blockId": "normalized-javascript-attr", "type": "markdown.line", "text": "Link", "attrs": {"href": "java\u{0000}script:alert(1)"}}]}),
            vec!["normalized-javascript-attr", "script:alert"],
        ),
        (
            "malformed marks",
            json!({"type": "doc", "content": [{"blockId": "malformed-marks", "type": "markdown.line", "text": "Marks", "marks": {"bold": true}}]}),
            vec!["malformed-marks"],
        ),
        (
            "non-object mark",
            json!({"type": "doc", "content": [{"blockId": "non-object-mark", "type": "markdown.line", "text": "Marks", "marks": ["bold"]}]}),
            vec!["non-object-mark"],
        ),
        (
            "executable mark attrs",
            json!({
                "type": "doc",
                "content": [
                    {
                        "blockId": "executable-mark",
                        "type": "markdown.line",
                        "text": "Marked",
                        "marks": [
                            {
                                "type": "link",
                                "attrs": {
                                    "href": "javascript:alert(1)",
                                    "onClick": "alert(1)"
                                }
                            }
                        ]
                    }
                ]
            }),
            vec!["executable-mark", "javascript:alert", "onClick"],
        ),
    ]
}

fn nested_page_body(depth: usize) -> Value {
    let mut node = json!({
        "blockId": format!("depth-{depth}"),
        "type": "markdown.line",
        "text": "Leaf"
    });

    for level in (1..depth).rev() {
        node = json!({
            "blockId": format!("depth-{level}"),
            "type": "container",
            "content": [node]
        });
    }

    json!({
        "type": "doc",
        "content": [node]
    })
}

fn many_block_page_body(block_count: usize) -> Value {
    json!({
        "type": "doc",
        "content": (1..=block_count)
            .map(|index| {
                json!({
                    "blockId": format!("block-{index}"),
                    "type": "markdown.line",
                    "text": format!("Line {index}")
                })
            })
            .collect::<Vec<_>>()
    })
}

fn set_metadata_request(id: &str, page_id: &str) -> Value {
    set_metadata_request_with_key_value(id, page_id, "status", json!({"done": false}), "json")
}

fn set_metadata_request_with_key_value(
    id: &str,
    page_id: &str,
    key: &str,
    value: Value,
    value_type: &str,
) -> Value {
    json!({
        "operation": "core.metadata.set",
        "payload": {
            "id": id,
            "pageId": page_id,
            "namespace": "task",
            "key": key,
            "value": value,
            "valueType": value_type,
            "sourcePluginId": "core.task",
            "createdAt": CREATED_AT,
            "updatedAt": UPDATED_AT
        }
    })
}

fn metadata_logical_key_payload(page_id: &str) -> Value {
    metadata_logical_key_payload_for(page_id, "task", "status")
}

fn metadata_logical_key_payload_for(page_id: &str, namespace: &str, key: &str) -> Value {
    json!({
        "pageId": page_id,
        "namespace": namespace,
        "key": key
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
    save_filter_request_with_parts(id, valid_filter_query(), Some(valid_filter_sort()), None)
}

fn save_filter_request_with_parts(
    id: &str,
    query: Value,
    sort: Option<Value>,
    group: Option<Value>,
) -> Value {
    json!({
        "operation": "core.filters.save",
        "payload": {
            "id": id,
            "name": "Open tasks",
            "query": query,
            "sort": sort,
            "group": group,
            "viewType": "list",
            "sourcePluginId": "core.search",
            "createdAt": CREATED_AT,
            "updatedAt": UPDATED_AT
        }
    })
}

fn valid_filter_query() -> Value {
    json!({
        "where": [{"field": "metadata.task.done", "op": "eq", "value": false}]
    })
}

fn valid_filter_sort() -> Value {
    json!([{"field": "createdAt", "direction": "asc"}])
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
        "body": page_body(id, title),
        "createdAt": CREATED_AT,
        "updatedAt": updated_at,
        "archivedAt": archived_at
    })
}

fn page_body(page_id: &str, text: &str) -> Value {
    json!({
        "type": "doc",
        "content": [
            {
                "blockId": format!("{page_id}-block-1"),
                "type": "markdown.line",
                "text": text
            }
        ]
    })
}

fn metadata_response(id: &str, page_id: &str) -> Value {
    metadata_response_with_value(id, page_id, "status", json!({"done": false}), "json")
}

fn metadata_response_with_value(
    id: &str,
    page_id: &str,
    key: &str,
    value: Value,
    value_type: &str,
) -> Value {
    json!({
        "id": id,
        "pageId": page_id,
        "namespace": "task",
        "key": key,
        "value": value,
        "valueType": value_type,
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
        "query": valid_filter_query(),
        "sort": valid_filter_sort(),
        "group": null,
        "viewType": "list",
        "sourcePluginId": "core.search",
        "createdAt": CREATED_AT,
        "updatedAt": UPDATED_AT
    })
}

fn assert_redacted_invalid_request(
    error: &impl Serialize,
    forbidden_fragments: &[&str],
) -> TestResult {
    assert_redacted_ipc_error(
        error,
        "INVALID_REQUEST",
        &forbidden_fragments
            .iter()
            .filter(|fragment| !fragment.trim().is_empty())
            .map(|fragment| (*fragment).to_string())
            .collect::<Vec<_>>(),
    )
}

fn assert_redacted_persistence_failed(
    error: &impl Serialize,
    forbidden_fragments: &[&str],
) -> TestResult {
    assert_redacted_ipc_error(
        error,
        "PERSISTENCE_FAILED",
        &forbidden_fragments
            .iter()
            .filter(|fragment| !fragment.trim().is_empty())
            .map(|fragment| (*fragment).to_string())
            .collect::<Vec<_>>(),
    )
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
