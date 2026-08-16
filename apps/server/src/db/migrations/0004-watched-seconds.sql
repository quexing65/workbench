ALTER TABLE learning_part_progress
  ADD COLUMN watched_seconds INTEGER NOT NULL DEFAULT 0 CHECK (watched_seconds >= 0);

ALTER TABLE learning_part_progress
  ADD COLUMN last_seconds INTEGER NOT NULL DEFAULT 0 CHECK (last_seconds >= 0);

CREATE TABLE learning_watch_daily (
  part_id TEXT NOT NULL,
  watch_date TEXT NOT NULL,
  watched_seconds INTEGER NOT NULL CHECK (watched_seconds >= 0),
  PRIMARY KEY (part_id, watch_date),
  FOREIGN KEY (part_id) REFERENCES learning_parts(id) ON DELETE CASCADE
) STRICT;

CREATE INDEX learning_watch_daily_date
ON learning_watch_daily(watch_date);
