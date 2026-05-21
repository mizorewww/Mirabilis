use std::collections::HashSet;
use std::error::Error;
use std::fmt;
use std::path::Path;
use std::sync::{Mutex, MutexGuard};

use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::State;

use crate::db::migrations::apply_migrations;
use crate::db::repositories::{
    EventRepository, FilterRepository, MetadataRepository, PageRepository,
};
use crate::db::types::{
    EventListOptions, EventRecord, FilterListOptions, FilterRecord, MetadataRecord, NewEvent,
    NewPage, PageListOptions, PageRecord, UpdatePage, UpsertFilter, UpsertMetadata,
};
use crate::db::{Database, DbResult};

pub const ALLOWED_DB_OPERATIONS: [&str; 15] = [
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

const MAX_MARKDOWN_BODY_BLOCKS: usize = 20_000;
const MAX_MARKDOWN_BODY_DEPTH: usize = 100;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum DbPersistenceOperation {
    #[serde(rename = "core.pages.create")]
    PagesCreate,
    #[serde(rename = "core.pages.get")]
    PagesGet,
    #[serde(rename = "core.pages.list")]
    PagesList,
    #[serde(rename = "core.pages.update")]
    PagesUpdate,
    #[serde(rename = "core.pages.archive")]
    PagesArchive,
    #[serde(rename = "core.metadata.set")]
    MetadataSet,
    #[serde(rename = "core.metadata.get")]
    MetadataGet,
    #[serde(rename = "core.metadata.listForPage")]
    MetadataListForPage,
    #[serde(rename = "core.metadata.delete")]
    MetadataDelete,
    #[serde(rename = "core.events.append")]
    EventsAppend,
    #[serde(rename = "core.events.list")]
    EventsList,
    #[serde(rename = "core.filters.save")]
    FiltersSave,
    #[serde(rename = "core.filters.get")]
    FiltersGet,
    #[serde(rename = "core.filters.list")]
    FiltersList,
    #[serde(rename = "core.filters.delete")]
    FiltersDelete,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DbQuery {
    pub operation: DbPersistenceOperation,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payload: Option<Value>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct IpcError {
    code: &'static str,
    message: &'static str,
}

impl IpcError {
    fn invalid_request() -> Self {
        Self {
            code: "INVALID_REQUEST",
            message: "Native command failed",
        }
    }

    fn persistence_failed() -> Self {
        Self {
            code: "PERSISTENCE_FAILED",
            message: "Native command failed",
        }
    }
}

impl fmt::Display for IpcError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.message)
    }
}

impl Error for IpcError {}

impl From<crate::db::DbError> for IpcError {
    fn from(_: crate::db::DbError) -> Self {
        Self::persistence_failed()
    }
}

pub struct DbCommandState {
    database: Mutex<Database>,
}

impl DbCommandState {
    pub fn open(path: impl AsRef<Path>) -> Result<Self, IpcError> {
        let database = Database::open(path).map_err(|_| IpcError::persistence_failed())?;
        apply_migrations(&database).map_err(|_| IpcError::persistence_failed())?;

        Ok(Self {
            database: Mutex::new(database),
        })
    }

    fn database(&self) -> Result<MutexGuard<'_, Database>, IpcError> {
        self.database
            .lock()
            .map_err(|_| IpcError::persistence_failed())
    }
}

#[tauri::command]
pub fn db_execute(state: State<'_, DbCommandState>, query: Value) -> Result<Value, IpcError> {
    dispatch_db_execute(state.inner(), query)
}

#[tauri::command]
pub fn db_transaction(
    state: State<'_, DbCommandState>,
    queries: Vec<Value>,
) -> Result<Value, IpcError> {
    dispatch_db_transaction(state.inner(), queries)
}

pub fn dispatch_db_execute(state: &DbCommandState, query: Value) -> Result<Value, IpcError> {
    let request = parse_request(query)?;
    let database = state.database()?;
    execute_request(&database, request)
}

pub fn dispatch_db_transaction(
    state: &DbCommandState,
    queries: Vec<Value>,
) -> Result<Value, IpcError> {
    let requests = queries
        .into_iter()
        .map(parse_request)
        .collect::<Result<Vec<_>, _>>()?;
    let database = state.database()?;

    database.transaction(|database| {
        requests
            .into_iter()
            .map(|request| execute_request(database, request))
            .collect::<Result<Vec<_>, _>>()
            .map(Value::Array)
    })
}

fn parse_request(query: Value) -> Result<DbOperationRequest, IpcError> {
    let query =
        serde_json::from_value::<DbQuery>(query).map_err(|_| IpcError::invalid_request())?;
    DbOperationRequest::from_query(query)
}

fn execute_request(database: &Database, request: DbOperationRequest) -> Result<Value, IpcError> {
    match request {
        DbOperationRequest::PagesCreate(payload) => {
            persist(PageRepository::new(database).create(NewPage {
                id: payload.id,
                title: payload.title,
                parent_page_id: payload.parent_page_id,
                body: payload.body,
                created_at: payload.created_at,
                updated_at: payload.updated_at,
            }))?;
            Ok(Value::Null)
        }
        DbOperationRequest::PagesGet(payload) => response_value(
            persist(PageRepository::new(database).get(&payload.id))?.map(PageResponse::from),
        ),
        DbOperationRequest::PagesList(payload) => response_value(
            persist(PageRepository::new(database).list(PageListOptions {
                include_archived: payload.include_archived,
                parent_page_id: payload.parent_page_id,
            }))?
            .into_iter()
            .map(PageResponse::from)
            .collect::<Vec<_>>(),
        ),
        DbOperationRequest::PagesUpdate(payload) => {
            let repository = PageRepository::new(database);
            require_target(persist(repository.get(&payload.id))?)?;
            persist(repository.update(UpdatePage {
                id: payload.id,
                title: payload.title,
                parent_page_id: payload.parent_page_id,
                body: payload.body,
                updated_at: payload.updated_at,
            }))?;
            Ok(Value::Null)
        }
        DbOperationRequest::PagesArchive(payload) => {
            let repository = PageRepository::new(database);
            require_target(persist(repository.get(&payload.id))?)?;
            persist(repository.archive(&payload.id, &payload.archived_at))?;
            Ok(Value::Null)
        }
        DbOperationRequest::MetadataSet(payload) => {
            persist(MetadataRepository::new(database).upsert(UpsertMetadata {
                id: payload.id,
                page_id: payload.page_id,
                namespace: payload.namespace,
                key: payload.key,
                value: payload.value,
                value_type: payload.value_type,
                source_plugin_id: payload.source_plugin_id,
                created_at: payload.created_at,
                updated_at: payload.updated_at,
            }))?;
            Ok(Value::Null)
        }
        DbOperationRequest::MetadataGet(payload) => response_value(
            persist(MetadataRepository::new(database).get_by_logical_key(
                &payload.page_id,
                &payload.namespace,
                &payload.key,
            ))?
            .map(MetadataResponse::from),
        ),
        DbOperationRequest::MetadataListForPage(payload) => response_value(
            persist(MetadataRepository::new(database).list_for_page(&payload.page_id))?
                .into_iter()
                .map(MetadataResponse::from)
                .collect::<Vec<_>>(),
        ),
        DbOperationRequest::MetadataDelete(payload) => {
            let repository = MetadataRepository::new(database);
            require_target(persist(repository.get_by_logical_key(
                &payload.page_id,
                &payload.namespace,
                &payload.key,
            ))?)?;
            persist(repository.delete_by_logical_key(
                &payload.page_id,
                &payload.namespace,
                &payload.key,
            ))?;
            Ok(Value::Null)
        }
        DbOperationRequest::EventsAppend(payload) => {
            persist(EventRepository::new(database).append(NewEvent {
                id: payload.id,
                page_id: payload.page_id,
                namespace: payload.namespace,
                event_type: payload.event_type,
                payload: payload.payload,
                source_plugin_id: payload.source_plugin_id,
                created_at: payload.created_at,
            }))?;
            Ok(Value::Null)
        }
        DbOperationRequest::EventsList(payload) => response_value(
            persist(EventRepository::new(database).list(EventListOptions {
                page_id: payload.page_id,
                namespace: payload.namespace,
                event_type: payload.event_type,
            }))?
            .into_iter()
            .map(EventResponse::from)
            .collect::<Vec<_>>(),
        ),
        DbOperationRequest::FiltersSave(payload) => {
            persist(FilterRepository::new(database).upsert(UpsertFilter {
                id: payload.id,
                name: payload.name,
                query: payload.query,
                sort: payload.sort,
                group: payload.group,
                view_type: payload.view_type,
                source_plugin_id: payload.source_plugin_id,
                created_at: payload.created_at,
                updated_at: payload.updated_at,
            }))?;
            Ok(Value::Null)
        }
        DbOperationRequest::FiltersGet(payload) => response_value(
            persist(FilterRepository::new(database).get(&payload.id))?.map(FilterResponse::from),
        ),
        DbOperationRequest::FiltersList(payload) => response_value(
            persist(FilterRepository::new(database).list(FilterListOptions {
                source_plugin_id: payload.source_plugin_id,
                view_type: payload.view_type,
            }))?
            .into_iter()
            .map(FilterResponse::from)
            .collect::<Vec<_>>(),
        ),
        DbOperationRequest::FiltersDelete(payload) => {
            let repository = FilterRepository::new(database);
            require_target(persist(repository.get(&payload.id))?)?;
            persist(repository.delete(&payload.id))?;
            Ok(Value::Null)
        }
    }
}

fn response_value(value: impl Serialize) -> Result<Value, IpcError> {
    serde_json::to_value(value).map_err(|_| IpcError::persistence_failed())
}

fn persist<T>(result: DbResult<T>) -> Result<T, IpcError> {
    result.map_err(|_| IpcError::persistence_failed())
}

fn require_target<T>(target: Option<T>) -> Result<T, IpcError> {
    target.ok_or_else(IpcError::persistence_failed)
}

enum DbOperationRequest {
    PagesCreate(PageCreatePayload),
    PagesGet(IdPayload),
    PagesList(PageListPayload),
    PagesUpdate(PageUpdatePayload),
    PagesArchive(PageArchivePayload),
    MetadataSet(MetadataSetPayload),
    MetadataGet(MetadataLogicalKeyPayload),
    MetadataListForPage(PageIdPayload),
    MetadataDelete(MetadataLogicalKeyPayload),
    EventsAppend(EventAppendPayload),
    EventsList(EventListPayload),
    FiltersSave(FilterSavePayload),
    FiltersGet(IdPayload),
    FiltersList(FilterListPayload),
    FiltersDelete(IdPayload),
}

impl DbOperationRequest {
    fn from_query(query: DbQuery) -> Result<Self, IpcError> {
        Ok(match query.operation {
            DbPersistenceOperation::PagesCreate => Self::PagesCreate(valid_payload(query.payload)?),
            DbPersistenceOperation::PagesGet => Self::PagesGet(valid_payload(query.payload)?),
            DbPersistenceOperation::PagesList => {
                Self::PagesList(valid_optional_payload(query.payload)?)
            }
            DbPersistenceOperation::PagesUpdate => Self::PagesUpdate(valid_payload(query.payload)?),
            DbPersistenceOperation::PagesArchive => {
                Self::PagesArchive(valid_payload(query.payload)?)
            }
            DbPersistenceOperation::MetadataSet => Self::MetadataSet(valid_payload(query.payload)?),
            DbPersistenceOperation::MetadataGet => Self::MetadataGet(valid_payload(query.payload)?),
            DbPersistenceOperation::MetadataListForPage => {
                Self::MetadataListForPage(valid_payload(query.payload)?)
            }
            DbPersistenceOperation::MetadataDelete => {
                Self::MetadataDelete(valid_payload(query.payload)?)
            }
            DbPersistenceOperation::EventsAppend => {
                Self::EventsAppend(valid_payload(query.payload)?)
            }
            DbPersistenceOperation::EventsList => {
                Self::EventsList(valid_optional_payload(query.payload)?)
            }
            DbPersistenceOperation::FiltersSave => Self::FiltersSave(valid_payload(query.payload)?),
            DbPersistenceOperation::FiltersGet => Self::FiltersGet(valid_payload(query.payload)?),
            DbPersistenceOperation::FiltersList => {
                Self::FiltersList(valid_optional_payload(query.payload)?)
            }
            DbPersistenceOperation::FiltersDelete => {
                Self::FiltersDelete(valid_payload(query.payload)?)
            }
        })
    }
}

trait ValidatePayload {
    fn validate(&self) -> Result<(), IpcError>;
}

fn valid_payload<T>(payload: Option<Value>) -> Result<T, IpcError>
where
    T: DeserializeOwned + ValidatePayload,
{
    let payload: T = required_payload(payload)?;
    payload.validate()?;
    Ok(payload)
}

fn valid_optional_payload<T>(payload: Option<Value>) -> Result<T, IpcError>
where
    T: Default + DeserializeOwned + ValidatePayload,
{
    let payload: T = optional_payload(payload)?;
    payload.validate()?;
    Ok(payload)
}

fn required_payload<T: DeserializeOwned>(payload: Option<Value>) -> Result<T, IpcError> {
    let payload = payload.ok_or_else(IpcError::invalid_request)?;
    serde_json::from_value(payload).map_err(|_| IpcError::invalid_request())
}

fn optional_payload<T>(payload: Option<Value>) -> Result<T, IpcError>
where
    T: Default + DeserializeOwned,
{
    match payload {
        Some(payload) => serde_json::from_value(payload).map_err(|_| IpcError::invalid_request()),
        None => Ok(T::default()),
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct IdPayload {
    id: String,
}

impl ValidatePayload for IdPayload {
    fn validate(&self) -> Result<(), IpcError> {
        require_non_blank(&self.id)
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PageIdPayload {
    page_id: String,
}

impl ValidatePayload for PageIdPayload {
    fn validate(&self) -> Result<(), IpcError> {
        require_non_blank(&self.page_id)
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PageCreatePayload {
    id: String,
    title: String,
    parent_page_id: Option<String>,
    body: Value,
    created_at: String,
    updated_at: String,
}

impl ValidatePayload for PageCreatePayload {
    fn validate(&self) -> Result<(), IpcError> {
        require_non_blank(&self.id)?;
        require_optional_non_blank(self.parent_page_id.as_deref())?;
        validate_page_body(&self.body)
    }
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PageListPayload {
    #[serde(default)]
    include_archived: bool,
    parent_page_id: Option<String>,
}

impl ValidatePayload for PageListPayload {
    fn validate(&self) -> Result<(), IpcError> {
        require_optional_non_blank(self.parent_page_id.as_deref())
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PageUpdatePayload {
    id: String,
    title: String,
    parent_page_id: Option<String>,
    body: Value,
    updated_at: String,
}

impl ValidatePayload for PageUpdatePayload {
    fn validate(&self) -> Result<(), IpcError> {
        require_non_blank(&self.id)?;
        require_optional_non_blank(self.parent_page_id.as_deref())?;
        validate_page_body(&self.body)
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PageArchivePayload {
    id: String,
    archived_at: String,
}

impl ValidatePayload for PageArchivePayload {
    fn validate(&self) -> Result<(), IpcError> {
        require_non_blank(&self.id)
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct MetadataSetPayload {
    id: String,
    page_id: String,
    namespace: String,
    key: String,
    value: Value,
    value_type: String,
    source_plugin_id: String,
    created_at: String,
    updated_at: String,
}

impl ValidatePayload for MetadataSetPayload {
    fn validate(&self) -> Result<(), IpcError> {
        require_non_blank(&self.id)?;
        require_non_blank(&self.page_id)?;
        require_non_blank(&self.namespace)?;
        require_non_blank(&self.key)?;
        require_non_blank(&self.source_plugin_id)?;
        require_non_blank(&self.value_type)?;
        require_metadata_value_type(&self.value, &self.value_type)
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct MetadataLogicalKeyPayload {
    page_id: String,
    namespace: String,
    key: String,
}

impl ValidatePayload for MetadataLogicalKeyPayload {
    fn validate(&self) -> Result<(), IpcError> {
        require_non_blank(&self.page_id)?;
        require_non_blank(&self.namespace)?;
        require_non_blank(&self.key)
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct EventAppendPayload {
    id: String,
    page_id: Option<String>,
    namespace: String,
    event_type: String,
    payload: Value,
    source_plugin_id: String,
    created_at: String,
}

impl ValidatePayload for EventAppendPayload {
    fn validate(&self) -> Result<(), IpcError> {
        require_non_blank(&self.id)?;
        require_optional_non_blank(self.page_id.as_deref())?;
        require_non_blank(&self.namespace)?;
        require_non_blank(&self.event_type)?;
        require_non_blank(&self.source_plugin_id)
    }
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct EventListPayload {
    page_id: Option<String>,
    namespace: Option<String>,
    event_type: Option<String>,
}

impl ValidatePayload for EventListPayload {
    fn validate(&self) -> Result<(), IpcError> {
        require_optional_non_blank(self.page_id.as_deref())?;
        require_optional_non_blank(self.namespace.as_deref())?;
        require_optional_non_blank(self.event_type.as_deref())
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct FilterSavePayload {
    id: String,
    name: String,
    query: Value,
    sort: Option<Value>,
    group: Option<Value>,
    view_type: String,
    source_plugin_id: Option<String>,
    created_at: String,
    updated_at: String,
}

impl ValidatePayload for FilterSavePayload {
    fn validate(&self) -> Result<(), IpcError> {
        require_non_blank(&self.id)?;
        require_non_blank(&self.name)?;
        require_non_blank(&self.view_type)?;
        require_optional_non_blank(self.source_plugin_id.as_deref())?;
        validate_filter_query(&self.query)?;
        validate_filter_sort(self.sort.as_ref())?;
        validate_filter_group(self.group.as_ref())
    }
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct FilterListPayload {
    source_plugin_id: Option<String>,
    view_type: Option<String>,
}

impl ValidatePayload for FilterListPayload {
    fn validate(&self) -> Result<(), IpcError> {
        require_optional_non_blank(self.source_plugin_id.as_deref())?;
        require_optional_non_blank(self.view_type.as_deref())
    }
}

fn require_non_blank(value: &str) -> Result<(), IpcError> {
    if value.trim().is_empty() {
        return Err(IpcError::invalid_request());
    }

    Ok(())
}

fn require_optional_non_blank(value: Option<&str>) -> Result<(), IpcError> {
    if let Some(value) = value {
        require_non_blank(value)?;
    }

    Ok(())
}

fn require_metadata_value_type(value: &Value, value_type: &str) -> Result<(), IpcError> {
    let matches = match value_type {
        "string" | "date" => value.is_string(),
        "number" => value.is_number(),
        "boolean" => value.is_boolean(),
        "null" => value.is_null(),
        "json" => value.is_object() || value.is_array(),
        _ => false,
    };

    if matches {
        Ok(())
    } else {
        Err(IpcError::invalid_request())
    }
}

struct PageBodyValidationContext {
    block_ids: HashSet<String>,
    block_count: usize,
}

fn validate_page_body(value: &Value) -> Result<(), IpcError> {
    let object = value.as_object().ok_or_else(IpcError::invalid_request)?;

    if object.get("type").and_then(Value::as_str) != Some("doc") {
        return Err(IpcError::invalid_request());
    }

    let content = object
        .get("content")
        .and_then(Value::as_array)
        .ok_or_else(IpcError::invalid_request)?;
    let mut context = PageBodyValidationContext {
        block_ids: HashSet::new(),
        block_count: 0,
    };

    for block in content {
        validate_page_block(block, 1, &mut context)?;
    }

    Ok(())
}

fn validate_page_block(
    value: &Value,
    depth: usize,
    context: &mut PageBodyValidationContext,
) -> Result<(), IpcError> {
    if depth > MAX_MARKDOWN_BODY_DEPTH {
        return Err(IpcError::invalid_request());
    }

    let object = value.as_object().ok_or_else(IpcError::invalid_request)?;
    let block_id = object
        .get("blockId")
        .and_then(Value::as_str)
        .ok_or_else(IpcError::invalid_request)?;

    require_non_blank(block_id)?;

    if !context.block_ids.insert(block_id.to_string()) {
        return Err(IpcError::invalid_request());
    }

    context.block_count += 1;
    if context.block_count > MAX_MARKDOWN_BODY_BLOCKS {
        return Err(IpcError::invalid_request());
    }

    if object.get("type").is_some_and(|value| !value.is_string()) {
        return Err(IpcError::invalid_request());
    }

    if object.get("text").is_some_and(|value| !value.is_string()) {
        return Err(IpcError::invalid_request());
    }

    if let Some(attrs) = object.get("attrs") {
        validate_attrs(attrs)?;
    }

    if let Some(marks) = object.get("marks") {
        validate_marks(marks)?;
    }

    if let Some(content) = object.get("content") {
        let content = content.as_array().ok_or_else(IpcError::invalid_request)?;

        for child in content {
            validate_page_block(child, depth + 1, context)?;
        }
    }

    Ok(())
}

fn validate_attrs(value: &Value) -> Result<(), IpcError> {
    let object = value.as_object().ok_or_else(IpcError::invalid_request)?;
    validate_non_executable_object(object)
}

fn validate_marks(value: &Value) -> Result<(), IpcError> {
    let marks = value.as_array().ok_or_else(IpcError::invalid_request)?;

    for mark in marks {
        let object = mark.as_object().ok_or_else(IpcError::invalid_request)?;

        if object.get("type").is_some_and(|value| !value.is_string()) {
            return Err(IpcError::invalid_request());
        }

        if let Some(attrs) = object.get("attrs") {
            validate_attrs(attrs)?;
        }

        validate_non_executable_object(object)?;
    }

    Ok(())
}

fn validate_non_executable_object(object: &serde_json::Map<String, Value>) -> Result<(), IpcError> {
    for (key, value) in object {
        if key.to_ascii_lowercase().starts_with("on") {
            return Err(IpcError::invalid_request());
        }

        if key == "attrs" {
            validate_attrs(value)?;
        } else {
            validate_non_executable_value(value)?;
        }
    }

    Ok(())
}

fn validate_non_executable_value(value: &Value) -> Result<(), IpcError> {
    match value {
        Value::String(value) => {
            if is_executable_url_like(value) {
                Err(IpcError::invalid_request())
            } else {
                Ok(())
            }
        }
        Value::Array(values) => values.iter().try_for_each(validate_non_executable_value),
        Value::Object(object) => validate_non_executable_object(object),
        Value::Null | Value::Bool(_) | Value::Number(_) => Ok(()),
    }
}

fn is_executable_url_like(value: &str) -> bool {
    let normalized = value
        .chars()
        .filter(|character| !character.is_control() && !character.is_whitespace())
        .collect::<String>()
        .to_ascii_lowercase();

    normalized.starts_with("javascript:") || normalized.starts_with("data:")
}

fn validate_filter_query(value: &Value) -> Result<(), IpcError> {
    validate_filter_query_with_depth(value, 0)
}

fn validate_filter_query_with_depth(value: &Value, depth: usize) -> Result<(), IpcError> {
    if depth > 1_000 {
        return Err(IpcError::invalid_request());
    }

    let object = value.as_object().ok_or_else(IpcError::invalid_request)?;
    require_allowed_fields(object, &["where", "and", "or"])?;

    let where_conditions = object
        .get("where")
        .and_then(Value::as_array)
        .ok_or_else(IpcError::invalid_request)?;
    for condition in where_conditions {
        validate_filter_condition(condition)?;
    }

    for branch_name in ["and", "or"] {
        if let Some(branches) = object.get(branch_name) {
            let branches = branches.as_array().ok_or_else(IpcError::invalid_request)?;
            for branch in branches {
                validate_filter_query_with_depth(branch, depth + 1)?;
            }
        }
    }

    Ok(())
}

fn validate_filter_condition(value: &Value) -> Result<(), IpcError> {
    let object = value.as_object().ok_or_else(IpcError::invalid_request)?;
    require_allowed_fields(object, &["field", "op", "value"])?;

    let field = object
        .get("field")
        .and_then(Value::as_str)
        .ok_or_else(IpcError::invalid_request)?;
    require_non_blank(field)?;

    let operator = object
        .get("op")
        .and_then(Value::as_str)
        .ok_or_else(IpcError::invalid_request)?;
    if !matches!(
        operator,
        "eq" | "neq" | "gt" | "lt" | "includes" | "exists" | "within"
    ) {
        return Err(IpcError::invalid_request());
    }

    if operator == "exists" {
        if object.contains_key("value") {
            return Err(IpcError::invalid_request());
        }
    } else if !object.contains_key("value") {
        return Err(IpcError::invalid_request());
    }

    Ok(())
}

fn validate_filter_sort(value: Option<&Value>) -> Result<(), IpcError> {
    let Some(value) = value else {
        return Ok(());
    };
    let sort_items = value.as_array().ok_or_else(IpcError::invalid_request)?;
    for sort in sort_items {
        let object = sort.as_object().ok_or_else(IpcError::invalid_request)?;
        require_allowed_fields(object, &["field", "direction"])?;
        let field = object
            .get("field")
            .and_then(Value::as_str)
            .ok_or_else(IpcError::invalid_request)?;
        require_non_blank(field)?;
        match object.get("direction").and_then(Value::as_str) {
            Some("asc" | "desc") => {}
            _ => return Err(IpcError::invalid_request()),
        }
    }
    Ok(())
}

fn validate_filter_group(value: Option<&Value>) -> Result<(), IpcError> {
    let Some(value) = value else {
        return Ok(());
    };
    let object = value.as_object().ok_or_else(IpcError::invalid_request)?;
    require_allowed_fields(object, &["field"])?;
    let field = object
        .get("field")
        .and_then(Value::as_str)
        .ok_or_else(IpcError::invalid_request)?;
    require_non_blank(field)
}

fn require_allowed_fields(
    object: &serde_json::Map<String, Value>,
    allowed_fields: &[&str],
) -> Result<(), IpcError> {
    if object
        .keys()
        .any(|field| !allowed_fields.contains(&field.as_str()))
    {
        return Err(IpcError::invalid_request());
    }

    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PageResponse {
    id: String,
    title: String,
    parent_page_id: Option<String>,
    body: Value,
    created_at: String,
    updated_at: String,
    archived_at: Option<String>,
}

impl From<PageRecord> for PageResponse {
    fn from(record: PageRecord) -> Self {
        Self {
            id: record.id,
            title: record.title,
            parent_page_id: record.parent_page_id,
            body: record.body,
            created_at: record.created_at,
            updated_at: record.updated_at,
            archived_at: record.archived_at,
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MetadataResponse {
    id: String,
    page_id: String,
    namespace: String,
    key: String,
    value: Value,
    value_type: String,
    source_plugin_id: String,
    created_at: String,
    updated_at: String,
}

impl From<MetadataRecord> for MetadataResponse {
    fn from(record: MetadataRecord) -> Self {
        Self {
            id: record.id,
            page_id: record.page_id,
            namespace: record.namespace,
            key: record.key,
            value: record.value,
            value_type: record.value_type,
            source_plugin_id: record.source_plugin_id,
            created_at: record.created_at,
            updated_at: record.updated_at,
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EventResponse {
    id: String,
    page_id: Option<String>,
    namespace: String,
    event_type: String,
    payload: Value,
    source_plugin_id: String,
    created_at: String,
}

impl From<EventRecord> for EventResponse {
    fn from(record: EventRecord) -> Self {
        Self {
            id: record.id,
            page_id: record.page_id,
            namespace: record.namespace,
            event_type: record.event_type,
            payload: record.payload,
            source_plugin_id: record.source_plugin_id,
            created_at: record.created_at,
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FilterResponse {
    id: String,
    name: String,
    query: Value,
    sort: Option<Value>,
    group: Option<Value>,
    view_type: String,
    source_plugin_id: Option<String>,
    created_at: String,
    updated_at: String,
}

impl From<FilterRecord> for FilterResponse {
    fn from(record: FilterRecord) -> Self {
        Self {
            id: record.id,
            name: record.name,
            query: record.query,
            sort: record.sort,
            group: record.group,
            view_type: record.view_type,
            source_plugin_id: record.source_plugin_id,
            created_at: record.created_at,
            updated_at: record.updated_at,
        }
    }
}
