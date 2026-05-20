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
    execute_request(&database, request).map_err(|_| IpcError::persistence_failed())
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

    database
        .transaction(|database| {
            requests
                .into_iter()
                .map(|request| execute_request(database, request))
                .collect::<DbResult<Vec<_>>>()
                .map(Value::Array)
        })
        .map_err(|_| IpcError::persistence_failed())
}

fn parse_request(query: Value) -> Result<DbOperationRequest, IpcError> {
    let query =
        serde_json::from_value::<DbQuery>(query).map_err(|_| IpcError::invalid_request())?;
    DbOperationRequest::from_query(query)
}

fn execute_request(database: &Database, request: DbOperationRequest) -> DbResult<Value> {
    match request {
        DbOperationRequest::PagesCreate(payload) => {
            PageRepository::new(database).create(NewPage {
                id: payload.id,
                title: payload.title,
                parent_page_id: payload.parent_page_id,
                body: payload.body,
                created_at: payload.created_at,
                updated_at: payload.updated_at,
            })?;
            Ok(Value::Null)
        }
        DbOperationRequest::PagesGet(payload) => response_value(
            PageRepository::new(database)
                .get(&payload.id)?
                .map(PageResponse::from),
        ),
        DbOperationRequest::PagesList(payload) => response_value(
            PageRepository::new(database)
                .list(PageListOptions {
                    include_archived: payload.include_archived,
                    parent_page_id: payload.parent_page_id,
                })?
                .into_iter()
                .map(PageResponse::from)
                .collect::<Vec<_>>(),
        ),
        DbOperationRequest::PagesUpdate(payload) => {
            PageRepository::new(database).update(UpdatePage {
                id: payload.id,
                title: payload.title,
                parent_page_id: payload.parent_page_id,
                body: payload.body,
                updated_at: payload.updated_at,
            })?;
            Ok(Value::Null)
        }
        DbOperationRequest::PagesArchive(payload) => {
            PageRepository::new(database).archive(&payload.id, &payload.archived_at)?;
            Ok(Value::Null)
        }
        DbOperationRequest::MetadataSet(payload) => {
            MetadataRepository::new(database).upsert(UpsertMetadata {
                id: payload.id,
                page_id: payload.page_id,
                namespace: payload.namespace,
                key: payload.key,
                value: payload.value,
                value_type: payload.value_type,
                source_plugin_id: payload.source_plugin_id,
                created_at: payload.created_at,
                updated_at: payload.updated_at,
            })?;
            Ok(Value::Null)
        }
        DbOperationRequest::MetadataGet(payload) => response_value(
            MetadataRepository::new(database)
                .get(&payload.id)?
                .map(MetadataResponse::from),
        ),
        DbOperationRequest::MetadataListForPage(payload) => response_value(
            MetadataRepository::new(database)
                .list_for_page(&payload.page_id)?
                .into_iter()
                .map(MetadataResponse::from)
                .collect::<Vec<_>>(),
        ),
        DbOperationRequest::MetadataDelete(payload) => {
            MetadataRepository::new(database).delete(&payload.id)?;
            Ok(Value::Null)
        }
        DbOperationRequest::EventsAppend(payload) => {
            EventRepository::new(database).append(NewEvent {
                id: payload.id,
                page_id: payload.page_id,
                namespace: payload.namespace,
                event_type: payload.event_type,
                payload: payload.payload,
                source_plugin_id: payload.source_plugin_id,
                created_at: payload.created_at,
            })?;
            Ok(Value::Null)
        }
        DbOperationRequest::EventsList(payload) => response_value(
            EventRepository::new(database)
                .list(EventListOptions {
                    page_id: payload.page_id,
                    namespace: payload.namespace,
                    event_type: payload.event_type,
                })?
                .into_iter()
                .map(EventResponse::from)
                .collect::<Vec<_>>(),
        ),
        DbOperationRequest::FiltersSave(payload) => {
            FilterRepository::new(database).upsert(UpsertFilter {
                id: payload.id,
                name: payload.name,
                query: payload.query,
                sort: payload.sort,
                group: payload.group,
                view_type: payload.view_type,
                source_plugin_id: payload.source_plugin_id,
                created_at: payload.created_at,
                updated_at: payload.updated_at,
            })?;
            Ok(Value::Null)
        }
        DbOperationRequest::FiltersGet(payload) => response_value(
            FilterRepository::new(database)
                .get(&payload.id)?
                .map(FilterResponse::from),
        ),
        DbOperationRequest::FiltersList(payload) => response_value(
            FilterRepository::new(database)
                .list(FilterListOptions {
                    source_plugin_id: payload.source_plugin_id,
                    view_type: payload.view_type,
                })?
                .into_iter()
                .map(FilterResponse::from)
                .collect::<Vec<_>>(),
        ),
        DbOperationRequest::FiltersDelete(payload) => {
            FilterRepository::new(database).delete(&payload.id)?;
            Ok(Value::Null)
        }
    }
}

fn response_value(value: impl Serialize) -> DbResult<Value> {
    serde_json::to_value(value).map_err(Into::into)
}

enum DbOperationRequest {
    PagesCreate(PageCreatePayload),
    PagesGet(IdPayload),
    PagesList(PageListPayload),
    PagesUpdate(PageUpdatePayload),
    PagesArchive(PageArchivePayload),
    MetadataSet(MetadataSetPayload),
    MetadataGet(IdPayload),
    MetadataListForPage(PageIdPayload),
    MetadataDelete(IdPayload),
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
            DbPersistenceOperation::PagesCreate => {
                Self::PagesCreate(required_payload(query.payload)?)
            }
            DbPersistenceOperation::PagesGet => Self::PagesGet(required_payload(query.payload)?),
            DbPersistenceOperation::PagesList => Self::PagesList(optional_payload(query.payload)?),
            DbPersistenceOperation::PagesUpdate => {
                Self::PagesUpdate(required_payload(query.payload)?)
            }
            DbPersistenceOperation::PagesArchive => {
                Self::PagesArchive(required_payload(query.payload)?)
            }
            DbPersistenceOperation::MetadataSet => {
                Self::MetadataSet(required_payload(query.payload)?)
            }
            DbPersistenceOperation::MetadataGet => {
                Self::MetadataGet(required_payload(query.payload)?)
            }
            DbPersistenceOperation::MetadataListForPage => {
                Self::MetadataListForPage(required_payload(query.payload)?)
            }
            DbPersistenceOperation::MetadataDelete => {
                Self::MetadataDelete(required_payload(query.payload)?)
            }
            DbPersistenceOperation::EventsAppend => {
                Self::EventsAppend(required_payload(query.payload)?)
            }
            DbPersistenceOperation::EventsList => {
                Self::EventsList(optional_payload(query.payload)?)
            }
            DbPersistenceOperation::FiltersSave => {
                Self::FiltersSave(required_payload(query.payload)?)
            }
            DbPersistenceOperation::FiltersGet => {
                Self::FiltersGet(required_payload(query.payload)?)
            }
            DbPersistenceOperation::FiltersList => {
                Self::FiltersList(optional_payload(query.payload)?)
            }
            DbPersistenceOperation::FiltersDelete => {
                Self::FiltersDelete(required_payload(query.payload)?)
            }
        })
    }
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PageIdPayload {
    page_id: String,
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

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PageListPayload {
    #[serde(default)]
    include_archived: bool,
    parent_page_id: Option<String>,
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PageArchivePayload {
    id: String,
    archived_at: String,
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

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct EventListPayload {
    page_id: Option<String>,
    namespace: Option<String>,
    event_type: Option<String>,
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

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct FilterListPayload {
    source_plugin_id: Option<String>,
    view_type: Option<String>,
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
