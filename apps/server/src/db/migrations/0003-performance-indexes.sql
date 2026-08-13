CREATE INDEX tasks_day_order
ON tasks(task_date, created_at_ms, id)
WHERE deleted_at_ms IS NULL;

CREATE INDEX tasks_active_overdue
ON tasks(task_date, created_at_ms, id)
WHERE deleted_at_ms IS NULL AND status = 'active';

CREATE INDEX notes_list_order
ON notes(pinned DESC, updated_at_ms DESC, id DESC)
WHERE deleted_at_ms IS NULL;

CREATE INDEX notes_recent
ON notes(updated_at_ms DESC, id DESC)
WHERE deleted_at_ms IS NULL;

CREATE INDEX learning_resources_recent
ON learning_resources(updated_at_ms DESC, id)
WHERE deleted_at_ms IS NULL;

CREATE INDEX learning_progress_resumable
ON learning_resource_progress(
  COALESCE(last_observed_at_ms, updated_at_ms) DESC,
  resource_id
)
WHERE completed = 0;

CREATE INDEX learning_part_progress_observed
ON learning_part_progress(last_observed_at_ms)
WHERE last_observed_at_ms IS NOT NULL;
