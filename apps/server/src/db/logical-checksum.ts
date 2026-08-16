import type { DatabaseSync } from 'node:sqlite';

import { hashValue } from '../modules/imports/source-hash.js';

const BUSINESS_PROJECTIONS = {
  tasks: 'SELECT * FROM tasks ORDER BY id',
  recurringTaskTemplates: 'SELECT * FROM recurring_task_templates ORDER BY id',
  recurringTaskOccurrences:
    'SELECT * FROM recurring_task_occurrences ORDER BY template_id, occurrence_date',
  notes: 'SELECT * FROM notes ORDER BY id',
  learningSeries: 'SELECT * FROM learning_series ORDER BY id',
  learningResources: 'SELECT * FROM learning_resources ORDER BY id',
  learningParts: 'SELECT * FROM learning_parts ORDER BY id',
  learningSeriesItems:
    'SELECT * FROM learning_series_items ORDER BY series_id, position, resource_id',
  learningResourceProgress: 'SELECT * FROM learning_resource_progress ORDER BY resource_id',
  learningPartProgress: 'SELECT * FROM learning_part_progress ORDER BY part_id',
  learningWatchDaily: 'SELECT * FROM learning_watch_daily ORDER BY part_id, watch_date',
  unresolvedLearningLinks: 'SELECT * FROM unresolved_learning_links ORDER BY id',
  settings: 'SELECT * FROM settings ORDER BY key',
} as const;

export function logicalDatabaseChecksum(database: DatabaseSync): string {
  return hashValue(
    Object.fromEntries(
      Object.entries(BUSINESS_PROJECTIONS).map(([name, sql]) => [
        name,
        database.prepare(sql).all(),
      ]),
    ),
  );
}
