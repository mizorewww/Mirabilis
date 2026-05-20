use serde_json::Value;

#[derive(Clone, Debug, PartialEq)]
pub struct PageRecord {
    pub id: String,
    pub title: String,
    pub parent_page_id: Option<String>,
    pub body: Value,
    pub created_at: String,
    pub updated_at: String,
    pub archived_at: Option<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct NewPage {
    pub id: String,
    pub title: String,
    pub parent_page_id: Option<String>,
    pub body: Value,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, PartialEq)]
pub struct UpdatePage {
    pub id: String,
    pub title: String,
    pub parent_page_id: Option<String>,
    pub body: Value,
    pub updated_at: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PageListOptions {
    pub include_archived: bool,
    pub parent_page_id: Option<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct MetadataRecord {
    pub id: String,
    pub page_id: String,
    pub namespace: String,
    pub key: String,
    pub value: Value,
    pub value_type: String,
    pub source_plugin_id: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, PartialEq)]
pub struct UpsertMetadata {
    pub id: String,
    pub page_id: String,
    pub namespace: String,
    pub key: String,
    pub value: Value,
    pub value_type: String,
    pub source_plugin_id: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, PartialEq)]
pub struct EventRecord {
    pub id: String,
    pub page_id: Option<String>,
    pub namespace: String,
    pub event_type: String,
    pub payload: Value,
    pub source_plugin_id: String,
    pub created_at: String,
}

#[derive(Clone, Debug, PartialEq)]
pub struct NewEvent {
    pub id: String,
    pub page_id: Option<String>,
    pub namespace: String,
    pub event_type: String,
    pub payload: Value,
    pub source_plugin_id: String,
    pub created_at: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct EventListOptions {
    pub page_id: Option<String>,
    pub namespace: Option<String>,
    pub event_type: Option<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct FilterRecord {
    pub id: String,
    pub name: String,
    pub query: Value,
    pub sort: Option<Value>,
    pub group: Option<Value>,
    pub view_type: String,
    pub source_plugin_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, PartialEq)]
pub struct UpsertFilter {
    pub id: String,
    pub name: String,
    pub query: Value,
    pub sort: Option<Value>,
    pub group: Option<Value>,
    pub view_type: String,
    pub source_plugin_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FilterListOptions {
    pub source_plugin_id: Option<String>,
    pub view_type: Option<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct PluginRecord {
    pub id: String,
    pub name: String,
    pub version: String,
    pub enabled: bool,
    pub manifest: Value,
    pub settings: Option<Value>,
    pub installed_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, PartialEq)]
pub struct UpsertPlugin {
    pub id: String,
    pub name: String,
    pub version: String,
    pub enabled: bool,
    pub manifest: Value,
    pub settings: Option<Value>,
    pub installed_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, PartialEq)]
pub struct CommandDescriptorRecord {
    pub id: String,
    pub plugin_id: String,
    pub command_id: String,
    pub title: String,
    pub shortcut: Option<String>,
    pub context: Value,
}

#[derive(Clone, Debug, PartialEq)]
pub struct UpsertCommandDescriptor {
    pub id: String,
    pub plugin_id: String,
    pub command_id: String,
    pub title: String,
    pub shortcut: Option<String>,
    pub context: Value,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ViewDescriptorRecord {
    pub id: String,
    pub plugin_id: String,
    pub view_type: String,
    pub name: String,
    pub accepted_data_shape: Value,
}

#[derive(Clone, Debug, PartialEq)]
pub struct UpsertViewDescriptor {
    pub id: String,
    pub plugin_id: String,
    pub view_type: String,
    pub name: String,
    pub accepted_data_shape: Value,
}
