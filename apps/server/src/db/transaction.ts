import type { DatabaseSync } from 'node:sqlite';

export function withTransaction<T>(database: DatabaseSync, operation: () => T): T {
  if (database.isTransaction) {
    throw new Error('Nested repository transactions are not supported');
  }

  database.exec('BEGIN IMMEDIATE');
  try {
    const result = operation();
    database.exec('COMMIT');
    return result;
  } catch (error) {
    if (database.isTransaction) {
      database.exec('ROLLBACK');
    }
    throw error;
  }
}
