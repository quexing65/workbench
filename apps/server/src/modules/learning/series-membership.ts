import type { DatabaseSync } from 'node:sqlite';

export function removeResourceFromSeries(
  database: DatabaseSync,
  resourceId: string,
  now: number,
): void {
  const affected = database
    .prepare('SELECT DISTINCT series_id FROM learning_series_items WHERE resource_id = ?')
    .all(resourceId) as Array<{ series_id: string }>;
  database.prepare('DELETE FROM learning_series_items WHERE resource_id = ?').run(resourceId);
  const listItems = database.prepare(
    'SELECT resource_id FROM learning_series_items WHERE series_id = ? ORDER BY position',
  );
  const moveTemporary = database.prepare(
    'UPDATE learning_series_items SET position = position + 1000000 WHERE series_id = ?',
  );
  const setPosition = database.prepare(
    'UPDATE learning_series_items SET position = ? WHERE series_id = ? AND resource_id = ?',
  );
  const touchSeries = database.prepare(
    `UPDATE learning_series SET updated_at_ms = ?, revision = revision + 1
     WHERE id = ? AND deleted_at_ms IS NULL`,
  );
  for (const { series_id } of affected) {
    const items = listItems.all(series_id) as Array<{ resource_id: string }>;
    moveTemporary.run(series_id);
    items.forEach(({ resource_id }, position) => setPosition.run(position, series_id, resource_id));
    touchSeries.run(now, series_id);
  }
}
