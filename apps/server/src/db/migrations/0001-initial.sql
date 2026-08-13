CREATE TABLE schema_migrations (
  id TEXT PRIMARY KEY,
  checksum TEXT NOT NULL,
  applied_at_ms INTEGER NOT NULL CHECK (applied_at_ms >= 0)
) STRICT;

CREATE TABLE app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= 0)
) STRICT;

INSERT INTO app_meta (key, value, updated_at_ms)
VALUES ('app_id', 'personal-workbench-vnext', 0);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL CHECK (json_valid(value_json)),
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= 0)
) STRICT;

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 500),
  description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 20000),
  task_date TEXT NOT NULL CHECK (
    task_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
  ),
  status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'cancelled')),
  completed_at_ms INTEGER CHECK (completed_at_ms IS NULL OR completed_at_ms >= 0),
  cancelled_at_ms INTEGER CHECK (cancelled_at_ms IS NULL OR cancelled_at_ms >= 0),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= 0),
  deleted_at_ms INTEGER CHECK (deleted_at_ms IS NULL OR deleted_at_ms >= 0),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1)
) STRICT;

CREATE INDEX tasks_by_date
ON tasks(task_date, status, created_at_ms)
WHERE deleted_at_ms IS NULL;

CREATE TABLE recurring_task_templates (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 500),
  description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 20000),
  schedule_type TEXT NOT NULL DEFAULT 'daily' CHECK (schedule_type = 'daily'),
  start_date TEXT NOT NULL CHECK (
    start_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
  ),
  end_date TEXT CHECK (
    end_date IS NULL OR end_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
  ),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= 0),
  deleted_at_ms INTEGER CHECK (deleted_at_ms IS NULL OR deleted_at_ms >= 0),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  CHECK (end_date IS NULL OR end_date >= start_date)
) STRICT;

CREATE TABLE recurring_task_occurrences (
  template_id TEXT NOT NULL,
  occurrence_date TEXT NOT NULL CHECK (
    occurrence_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
  ),
  status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'cancelled')),
  completed_at_ms INTEGER CHECK (completed_at_ms IS NULL OR completed_at_ms >= 0),
  cancelled_at_ms INTEGER CHECK (cancelled_at_ms IS NULL OR cancelled_at_ms >= 0),
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= 0),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  PRIMARY KEY (template_id, occurrence_date),
  FOREIGN KEY (template_id) REFERENCES recurring_task_templates(id) ON DELETE CASCADE
) STRICT;

CREATE INDEX recurring_templates_by_range
ON recurring_task_templates(start_date, end_date)
WHERE deleted_at_ms IS NULL;

CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL CHECK (length(trim(content)) BETWEEN 1 AND 20000),
  pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= 0),
  deleted_at_ms INTEGER CHECK (deleted_at_ms IS NULL OR deleted_at_ms >= 0),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1)
) STRICT;

CREATE INDEX notes_by_pinned_and_updated
ON notes(pinned DESC, updated_at_ms DESC)
WHERE deleted_at_ms IS NULL;

CREATE TABLE learning_resources (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL CHECK (platform = 'bilibili'),
  external_id TEXT COLLATE BINARY,
  source_url TEXT NOT NULL CHECK (length(source_url) BETWEEN 1 AND 2048),
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 500),
  cover_url TEXT CHECK (cover_url IS NULL OR length(cover_url) <= 2048),
  uploader_name TEXT CHECK (uploader_name IS NULL OR length(uploader_name) <= 500),
  duration_seconds INTEGER NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
  metadata_updated_at_ms INTEGER CHECK (
    metadata_updated_at_ms IS NULL OR metadata_updated_at_ms >= 0
  ),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= 0),
  deleted_at_ms INTEGER CHECK (deleted_at_ms IS NULL OR deleted_at_ms >= 0),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1)
) STRICT;

CREATE UNIQUE INDEX learning_resources_external_id
ON learning_resources(platform, external_id)
WHERE external_id IS NOT NULL AND deleted_at_ms IS NULL;

CREATE TABLE learning_parts (
  id TEXT PRIMARY KEY,
  resource_id TEXT NOT NULL,
  external_part_id TEXT COLLATE BINARY,
  part_number INTEGER NOT NULL CHECK (part_number >= 1),
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 500),
  duration_seconds INTEGER NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= 0),
  deleted_at_ms INTEGER CHECK (deleted_at_ms IS NULL OR deleted_at_ms >= 0),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  FOREIGN KEY (resource_id) REFERENCES learning_resources(id) ON DELETE CASCADE
) STRICT;

CREATE UNIQUE INDEX learning_parts_number
ON learning_parts(resource_id, part_number)
WHERE deleted_at_ms IS NULL;

CREATE UNIQUE INDEX learning_parts_external_id
ON learning_parts(resource_id, external_part_id)
WHERE external_part_id IS NOT NULL AND deleted_at_ms IS NULL;

CREATE TABLE learning_resource_progress (
  resource_id TEXT PRIMARY KEY,
  furthest_part_id TEXT,
  furthest_seconds INTEGER NOT NULL DEFAULT 0 CHECK (furthest_seconds >= 0),
  resume_part_id TEXT,
  resume_seconds INTEGER NOT NULL DEFAULT 0 CHECK (resume_seconds >= 0),
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
  completed_at_ms INTEGER CHECK (completed_at_ms IS NULL OR completed_at_ms >= 0),
  last_observed_at_ms INTEGER CHECK (last_observed_at_ms IS NULL OR last_observed_at_ms >= 0),
  manual_override_at_ms INTEGER CHECK (
    manual_override_at_ms IS NULL OR manual_override_at_ms >= 0
  ),
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= 0),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  FOREIGN KEY (resource_id) REFERENCES learning_resources(id) ON DELETE CASCADE,
  FOREIGN KEY (furthest_part_id) REFERENCES learning_parts(id),
  FOREIGN KEY (resume_part_id) REFERENCES learning_parts(id)
) STRICT;

CREATE TABLE learning_part_progress (
  part_id TEXT PRIMARY KEY,
  furthest_seconds INTEGER NOT NULL DEFAULT 0 CHECK (furthest_seconds >= 0),
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
  completed_at_ms INTEGER CHECK (completed_at_ms IS NULL OR completed_at_ms >= 0),
  last_observed_at_ms INTEGER CHECK (last_observed_at_ms IS NULL OR last_observed_at_ms >= 0),
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= 0),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  FOREIGN KEY (part_id) REFERENCES learning_parts(id) ON DELETE CASCADE
) STRICT;

CREATE TABLE learning_series (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= 0),
  deleted_at_ms INTEGER CHECK (deleted_at_ms IS NULL OR deleted_at_ms >= 0),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1)
) STRICT;

CREATE TABLE learning_series_items (
  series_id TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 0),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  PRIMARY KEY (series_id, resource_id),
  FOREIGN KEY (series_id) REFERENCES learning_series(id) ON DELETE CASCADE,
  FOREIGN KEY (resource_id) REFERENCES learning_resources(id) ON DELETE CASCADE
) STRICT;

CREATE UNIQUE INDEX learning_series_item_position
ON learning_series_items(series_id, position);

CREATE TABLE unresolved_learning_links (
  id TEXT PRIMARY KEY,
  normalized_url TEXT NOT NULL UNIQUE CHECK (length(normalized_url) <= 2048),
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 500),
  requested_part_number INTEGER NOT NULL DEFAULT 1 CHECK (requested_part_number >= 1),
  position_seconds INTEGER NOT NULL DEFAULT 0 CHECK (position_seconds >= 0),
  status TEXT NOT NULL CHECK (status IN ('not_started', 'learning', 'completed')),
  last_opened_at_ms INTEGER CHECK (last_opened_at_ms IS NULL OR last_opened_at_ms >= 0),
  resolved_resource_id TEXT,
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= 0),
  deleted_at_ms INTEGER CHECK (deleted_at_ms IS NULL OR deleted_at_ms >= 0),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  FOREIGN KEY (resolved_resource_id) REFERENCES learning_resources(id)
) STRICT;

CREATE TABLE sync_runs (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider = 'bilibili'),
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
  requested_pages INTEGER NOT NULL CHECK (requested_pages BETWEEN 1 AND 5),
  history_count INTEGER NOT NULL DEFAULT 0 CHECK (history_count >= 0),
  updated_count INTEGER NOT NULL DEFAULT 0 CHECK (updated_count >= 0),
  safe_error_code TEXT,
  started_at_ms INTEGER,
  finished_at_ms INTEGER,
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0)
) STRICT;

CREATE TABLE import_runs (
  id TEXT PRIMARY KEY,
  preflight_run_id TEXT,
  source_system TEXT NOT NULL CHECK (source_system IN ('personal-json', 'qoder-sqlite')),
  source_sha256 TEXT NOT NULL,
  source_schema TEXT NOT NULL,
  source_timezone TEXT,
  importer_version TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('preflight', 'apply')),
  status TEXT NOT NULL CHECK (status IN ('running', 'ready', 'succeeded', 'failed')),
  counts_json TEXT NOT NULL CHECK (json_valid(counts_json)),
  warnings_json TEXT NOT NULL CHECK (json_valid(warnings_json)),
  plan_sha256 TEXT,
  expires_at_ms INTEGER CHECK (expires_at_ms IS NULL OR expires_at_ms >= 0),
  confirmation_token_hash TEXT,
  confirmation_consumed_at_ms INTEGER CHECK (
    confirmation_consumed_at_ms IS NULL OR confirmation_consumed_at_ms >= 0
  ),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  finished_at_ms INTEGER CHECK (finished_at_ms IS NULL OR finished_at_ms >= 0),
  FOREIGN KEY (preflight_run_id) REFERENCES import_runs(id),
  CHECK (
    (mode = 'preflight' AND preflight_run_id IS NULL) OR
    (mode = 'apply' AND preflight_run_id IS NOT NULL)
  )
) STRICT;

CREATE TABLE source_refs (
  source_system TEXT NOT NULL CHECK (source_system IN ('personal-json', 'qoder-sqlite')),
  source_kind TEXT NOT NULL,
  source_id TEXT NOT NULL,
  target_kind TEXT NOT NULL,
  target_id TEXT NOT NULL,
  last_source_hash TEXT NOT NULL,
  last_imported_target_hash TEXT NOT NULL,
  last_imported_at_ms INTEGER NOT NULL CHECK (last_imported_at_ms >= 0),
  import_run_id TEXT NOT NULL,
  PRIMARY KEY (source_system, source_kind, source_id),
  FOREIGN KEY (import_run_id) REFERENCES import_runs(id)
) STRICT;

CREATE INDEX source_refs_target
ON source_refs(target_kind, target_id);

CREATE TABLE deletion_markers (
  source_system TEXT NOT NULL CHECK (source_system = 'personal-json'),
  entity_kind TEXT NOT NULL,
  source_id TEXT NOT NULL,
  canonical_key TEXT,
  deleted_at_ms INTEGER NOT NULL CHECK (deleted_at_ms >= 0),
  import_run_id TEXT NOT NULL,
  PRIMARY KEY (source_system, entity_kind, source_id),
  FOREIGN KEY (import_run_id) REFERENCES import_runs(id)
) STRICT;
