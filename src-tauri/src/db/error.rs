use std::error::Error;
use std::fmt;

pub type DbResult<T> = Result<T, DbError>;

#[derive(Debug)]
pub enum DbError {
    Sqlite(Box<rusqlite::Error>),
    Json(Box<serde_json::Error>),
    FutureSchemaVersion {
        current_version: i64,
        latest_supported_version: i64,
    },
    MigrationDrift {
        version: i64,
        expected_name: &'static str,
        expected_checksum: &'static str,
        actual_name: String,
        actual_checksum: String,
    },
    InvalidJson {
        table: &'static str,
        column: &'static str,
        record_id: String,
        source: Box<serde_json::Error>,
    },
}

impl DbError {
    pub(crate) fn invalid_json(
        table: &'static str,
        column: &'static str,
        record_id: impl Into<String>,
        source: serde_json::Error,
    ) -> Self {
        Self::InvalidJson {
            table,
            column,
            record_id: record_id.into(),
            source: Box::new(source),
        }
    }
}

impl fmt::Display for DbError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Sqlite(_) => formatter.write_str("database operation failed"),
            Self::Json(_) => formatter.write_str("database JSON serialization failed"),
            Self::FutureSchemaVersion { .. } => {
                formatter.write_str("database schema version is newer than this application")
            }
            Self::MigrationDrift { .. } => {
                formatter.write_str("database migration metadata does not match this application")
            }
            Self::InvalidJson {
                table,
                column,
                record_id,
                ..
            } => write!(
                formatter,
                "invalid JSON in {table}.{column} for record {record_id}"
            ),
        }
    }
}

impl Error for DbError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Sqlite(source) => Some(source.as_ref()),
            Self::Json(source) => Some(source.as_ref()),
            Self::FutureSchemaVersion { .. } | Self::MigrationDrift { .. } => None,
            Self::InvalidJson { source, .. } => Some(source.as_ref()),
        }
    }
}

impl From<rusqlite::Error> for DbError {
    fn from(source: rusqlite::Error) -> Self {
        Self::Sqlite(Box::new(source))
    }
}

impl From<serde_json::Error> for DbError {
    fn from(source: serde_json::Error) -> Self {
        Self::Json(Box::new(source))
    }
}
