CREATE TABLE source_contributions (
  source_system TEXT NOT NULL CHECK (source_system IN ('personal-json', 'qoder-sqlite')),
  source_kind TEXT NOT NULL,
  source_id TEXT NOT NULL,
  canonical_key TEXT,
  target_kind TEXT NOT NULL,
  target_id TEXT NOT NULL,
  source_updated_at_ms INTEGER NOT NULL CHECK (source_updated_at_ms >= 0),
  created_target INTEGER NOT NULL DEFAULT 0 CHECK (created_target IN (0, 1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= 0),
  import_run_id TEXT NOT NULL,
  PRIMARY KEY (source_system, source_kind, source_id),
  FOREIGN KEY (import_run_id) REFERENCES import_runs(id)
) STRICT;

CREATE INDEX source_contributions_target
ON source_contributions(target_kind, target_id, active);

CREATE INDEX source_contributions_canonical
ON source_contributions(source_system, source_kind, canonical_key)
WHERE canonical_key IS NOT NULL;

ALTER TABLE deletion_markers RENAME TO deletion_markers_v1;

CREATE TABLE deletion_markers (
  source_system TEXT NOT NULL CHECK (source_system = 'personal-json'),
  entity_kind TEXT NOT NULL,
  source_id TEXT NOT NULL,
  canonical_key TEXT NOT NULL DEFAULT '',
  deleted_at_ms INTEGER NOT NULL CHECK (deleted_at_ms >= 0),
  import_run_id TEXT NOT NULL,
  PRIMARY KEY (source_system, entity_kind, source_id, canonical_key),
  FOREIGN KEY (import_run_id) REFERENCES import_runs(id)
) STRICT;

INSERT INTO deletion_markers (
  source_system, entity_kind, source_id, canonical_key, deleted_at_ms, import_run_id
)
SELECT source_system, entity_kind, source_id, COALESCE(canonical_key, ''),
  deleted_at_ms, import_run_id
FROM deletion_markers_v1;

DROP TABLE deletion_markers_v1;

ALTER TABLE import_runs ADD COLUMN logical_checksum_sha256 TEXT
CHECK (logical_checksum_sha256 IS NULL OR length(logical_checksum_sha256) = 64);
