use std::path::Path;

use rusqlite::{Connection, Transaction, TransactionBehavior};

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

    pub(crate) fn transaction<T, E>(
        &self,
        operation: impl FnOnce(&Self) -> Result<T, E>,
    ) -> Result<T, E>
    where
        E: From<DbError>,
    {
        let transaction =
            Transaction::new_unchecked(&self.connection, TransactionBehavior::Immediate)
                .map_err(DbError::from)?;

        match operation(self) {
            Ok(value) => {
                transaction.commit().map_err(DbError::from)?;
                Ok(value)
            }
            Err(error) => Err(error),
        }
    }
}
