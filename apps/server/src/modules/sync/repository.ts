import type { LearningSyncRun } from '@workbench/shared';
import type { DatabaseSync } from 'node:sqlite';

import { epochMillisecondsToIso } from '@workbench/shared';

interface SyncRunRow {
  id: string;
  status: LearningSyncRun['status'];
  requested_pages: number;
  history_count: number;
  updated_count: number;
  safe_error_code: string | null;
  started_at_ms: number | null;
  finished_at_ms: number | null;
  created_at_ms: number;
}

export class SyncRunRepository {
  public constructor(private readonly database: DatabaseSync) {}

  public recoverInterrupted(now: number): number {
    const result = this.database
      .prepare(
        `UPDATE sync_runs SET status = 'failed', safe_error_code = 'SYNC_INTERRUPTED',
           finished_at_ms = ? WHERE provider = 'bilibili' AND status IN ('queued', 'running')`,
      )
      .run(now);
    return Number(result.changes);
  }

  public create(id: string, pages: number, now: number): LearningSyncRun {
    this.database
      .prepare(
        `INSERT INTO sync_runs
         (id, provider, status, requested_pages, created_at_ms)
         VALUES (?, 'bilibili', 'queued', ?, ?)`,
      )
      .run(id, pages, now);
    return this.findRequired(id);
  }

  public markRunning(id: string, now: number): void {
    this.database
      .prepare(`UPDATE sync_runs SET status = 'running', started_at_ms = ? WHERE id = ?`)
      .run(now, id);
  }

  public succeed(id: string, historyCount: number, updatedCount: number, now: number): void {
    this.database
      .prepare(
        `UPDATE sync_runs SET status = 'succeeded', history_count = ?, updated_count = ?,
           safe_error_code = NULL, finished_at_ms = ? WHERE id = ?`,
      )
      .run(historyCount, updatedCount, now, id);
  }

  public fail(id: string, safeErrorCode: string, now: number): void {
    this.database
      .prepare(
        `UPDATE sync_runs SET status = 'failed', safe_error_code = ?, finished_at_ms = ?
         WHERE id = ?`,
      )
      .run(safeErrorCode, now, id);
  }

  public find(id: string): LearningSyncRun | undefined {
    const row = this.database
      .prepare(
        `SELECT id, status, requested_pages, history_count, updated_count, safe_error_code,
                started_at_ms, finished_at_ms, created_at_ms
         FROM sync_runs WHERE id = ? AND provider = 'bilibili'`,
      )
      .get(id) as unknown as SyncRunRow | undefined;
    return row === undefined ? undefined : mapRow(row);
  }

  private findRequired(id: string): LearningSyncRun {
    const run = this.find(id);
    if (run === undefined) throw new Error('Sync run write did not produce an entity');
    return run;
  }
}

function mapRow(row: SyncRunRow): LearningSyncRun {
  return {
    id: row.id,
    status: row.status,
    requestedPages: row.requested_pages,
    historyCount: row.history_count,
    updatedCount: row.updated_count,
    safeErrorCode: row.safe_error_code,
    startedAt: row.started_at_ms === null ? null : epochMillisecondsToIso(row.started_at_ms),
    finishedAt: row.finished_at_ms === null ? null : epochMillisecondsToIso(row.finished_at_ms),
    createdAt: epochMillisecondsToIso(row.created_at_ms),
  };
}
