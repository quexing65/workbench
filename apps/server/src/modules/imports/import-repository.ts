import type { ImportReport, ImportSourceType } from '@workbench/shared';
import type { DatabaseSync } from 'node:sqlite';

type Row = Record<string, unknown>;

interface CreatePreflightInput {
  readonly id: string;
  readonly sourceType: ImportSourceType;
  readonly sourceSha256: string;
  readonly sourceSchema: string;
  readonly sourceTimezone?: string;
  readonly report: ImportReport;
  readonly planSha256: string | null;
  readonly expiresAtMs: number | null;
  readonly tokenHash: string | null;
  readonly now: number;
}

function reportDetails(report: ImportReport): string {
  return JSON.stringify({
    conflicts: report.conflicts,
    warnings: report.warnings,
    fatal: report.fatal,
    credentials: report.credentials,
  });
}

export class ImportRepository {
  public constructor(private readonly database: DatabaseSync) {}

  public createPreflight(input: CreatePreflightInput): void {
    this.database
      .prepare(
        `INSERT INTO import_runs (
          id, preflight_run_id, source_system, source_sha256, source_schema,
          source_timezone, importer_version, mode, status, counts_json, warnings_json,
          plan_sha256, expires_at_ms, confirmation_token_hash, created_at_ms, finished_at_ms
        ) VALUES (?, NULL, ?, ?, ?, ?, '1', 'preflight', ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.id,
        input.sourceType,
        input.sourceSha256,
        input.sourceSchema,
        input.sourceTimezone ?? null,
        input.report.status,
        JSON.stringify(input.report.counts),
        reportDetails(input.report),
        input.planSha256,
        input.expiresAtMs,
        input.tokenHash,
        input.now,
        input.now,
      );
  }

  public consumeConfirmation(runId: string, tokenHash: string, now: number): boolean {
    return (
      this.database
        .prepare(
          `UPDATE import_runs SET confirmation_consumed_at_ms = ?
           WHERE id = ? AND mode = 'preflight' AND status = 'ready'
             AND confirmation_token_hash = ? AND confirmation_consumed_at_ms IS NULL
             AND expires_at_ms > ?`,
        )
        .run(now, runId, tokenHash, now).changes === 1
    );
  }

  public confirmationEligible(runId: string, tokenHash: string, now: number): boolean {
    return (
      this.database
        .prepare(
          `SELECT 1 AS eligible FROM import_runs
           WHERE id = ? AND mode = 'preflight' AND status = 'ready'
             AND confirmation_token_hash = ? AND confirmation_consumed_at_ms IS NULL
             AND expires_at_ms > ?`,
        )
        .get(runId, tokenHash, now) !== undefined
    );
  }

  public activePlanIds(now: number): Set<string> {
    return new Set(
      this.database
        .prepare(
          `SELECT id FROM import_runs
           WHERE mode = 'preflight' AND status = 'ready'
             AND confirmation_consumed_at_ms IS NULL AND expires_at_ms > ?`,
        )
        .all(now)
        .map((row) => String(row['id'])),
    );
  }

  public planDigest(runId: string): string | null {
    const row = this.database
      .prepare("SELECT plan_sha256 FROM import_runs WHERE id = ? AND mode = 'preflight'")
      .get(runId);
    return row === undefined || row['plan_sha256'] === null ? null : String(row['plan_sha256']);
  }

  public createApply(
    id: string,
    preflightId: string,
    report: ImportReport,
    planSha256: string,
    now: number,
  ): void {
    this.database
      .prepare(
        `INSERT INTO import_runs (
          id, preflight_run_id, source_system, source_sha256, source_schema,
          source_timezone, importer_version, mode, status, counts_json, warnings_json,
          plan_sha256, created_at_ms, finished_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, '1', 'apply', 'running', ?, ?, ?, ?, NULL)`,
      )
      .run(
        id,
        preflightId,
        report.sourceType,
        report.sourceSha256,
        report.sourceSchema,
        report.sourceTimezone ?? null,
        JSON.stringify(report.counts),
        reportDetails(report),
        planSha256,
        now,
      );
  }

  public finishApply(id: string, report: ImportReport, now: number): void {
    this.database
      .prepare(
        `UPDATE import_runs SET status = 'succeeded', counts_json = ?, warnings_json = ?,
          logical_checksum_sha256 = ?, finished_at_ms = ?
         WHERE id = ? AND mode = 'apply' AND status = 'running'`,
      )
      .run(
        JSON.stringify(report.counts),
        reportDetails(report),
        report.logicalChecksumSha256 ?? null,
        now,
        id,
      );
  }

  public report(id: string): ImportReport | undefined {
    const row = this.database.prepare('SELECT * FROM import_runs WHERE id = ?').get(id) as
      Row | undefined;
    if (row === undefined) return undefined;
    const details = JSON.parse(String(row['warnings_json'])) as {
      conflicts: ImportReport['conflicts'];
      warnings: ImportReport['warnings'];
      fatal: ImportReport['fatal'];
      credentials: ImportReport['credentials'];
    };
    return {
      runId: String(row['id']),
      sourceType: row['source_system'] as ImportSourceType,
      sourceSha256: String(row['source_sha256']),
      sourceSchema: String(row['source_schema']),
      ...(row['source_timezone'] === null
        ? {}
        : { sourceTimezone: String(row['source_timezone']) }),
      mode: row['mode'] as ImportReport['mode'],
      status: row['status'] as ImportReport['status'],
      ...(row['logical_checksum_sha256'] === null
        ? {}
        : { logicalChecksumSha256: String(row['logical_checksum_sha256']) }),
      counts: JSON.parse(String(row['counts_json'])) as ImportReport['counts'],
      ...details,
    };
  }
}
