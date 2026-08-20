ALTER TABLE tasks RENAME TO tasks_v4;

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 500),
  description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 20000),
  task_date TEXT NOT NULL CHECK (
    task_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
  ),
  status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'cancelled', 'expired')),
  completed_at_ms INTEGER CHECK (completed_at_ms IS NULL OR completed_at_ms >= 0),
  cancelled_at_ms INTEGER CHECK (cancelled_at_ms IS NULL OR cancelled_at_ms >= 0),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= 0),
  deleted_at_ms INTEGER CHECK (deleted_at_ms IS NULL OR deleted_at_ms >= 0),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1)
) STRICT;

INSERT INTO tasks (
  id, title, description, task_date, status, completed_at_ms, cancelled_at_ms,
  created_at_ms, updated_at_ms, deleted_at_ms, revision
)
SELECT id, title, description, task_date, status, completed_at_ms, cancelled_at_ms,
  created_at_ms, updated_at_ms, deleted_at_ms, revision
FROM tasks_v4;

DROP TABLE tasks_v4;

CREATE INDEX tasks_by_date
ON tasks(task_date, status, created_at_ms)
WHERE deleted_at_ms IS NULL;

CREATE INDEX tasks_day_order
ON tasks(task_date, created_at_ms, id)
WHERE deleted_at_ms IS NULL;

CREATE INDEX tasks_active_overdue
ON tasks(task_date, created_at_ms, id)
WHERE deleted_at_ms IS NULL AND status = 'active';
