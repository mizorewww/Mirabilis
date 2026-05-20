use std::path::Path;

use rusqlite::Connection;

use super::{DbError, DbResult};

pub struct Database {
    connection: Connection,
}

impl Database {
    pub fn open(path: impl AsRef<Path>) -> DbResult<Self> {
        let connection = Connection::open(path).map_err(DbError::from)?;
        connection.execute_batch("PRAGMA foreign_keys = ON;")?;
        Ok(Self { connection })
    }

    pub fn foreign_keys_enabled(&self) -> DbResult<bool> {
        let enabled = self
            .connection
            .query_row("PRAGMA foreign_keys", [], |row| row.get::<_, i64>(0))?;
        Ok(enabled == 1)
    }

    pub(crate) fn connection(&self) -> &Connection {
        &self.connection
    }

    pub(crate) fn transaction<T>(
        &self,
        operation: impl FnOnce(&Self) -> DbResult<T>,
    ) -> DbResult<T> {
        self.connection.execute_batch("BEGIN IMMEDIATE")?;

        match operation(self) {
            Ok(value) => {
                if let Err(source) = self.connection.execute_batch("COMMIT") {
                    let _ = self.connection.execute_batch("ROLLBACK");
                    return Err(source.into());
                }
                Ok(value)
            }
            Err(error) => {
                let _ = self.connection.execute_batch("ROLLBACK");
                Err(error)
            }
        }
    }
}
