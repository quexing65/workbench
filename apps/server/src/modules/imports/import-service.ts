import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import { rmSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';

import type { ImportPreflightResponse, ImportReport, ImportSourceType } from '@workbench/shared';

import { withTransaction } from '../../db/transaction.js';
import { AppError } from '../../http/errors.js';
import type { ParsedImportSource, PersistedImportPlan } from './contracts.js';
import { ImportApplier, type ImportFaultPoint } from './import-applier.js';
import { ImportRepository } from './import-repository.js';
import { reportFromPlan } from './import-report.js';
import { ImportPlanStore } from './plan-store.js';
import { logicalDatabaseChecksum } from './logical-checksum.js';
import { parsePersonalFile } from './personal/personal-parser.js';
import { inspectQoderFile } from './qoder/qoder-inspector.js';
import { reconcileSource } from './reconciliation.js';
import { hashFile, hashValue } from './source-hash.js';
import { createPreImportSnapshot } from './snapshot.js';
import { targetProjectionHash } from './target-projection.js';

const TOKEN_TTL_MS = 15 * 60 * 1_000;

function tokenHash(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function sourceTypeParse(
  sourceType: ImportSourceType,
  path: string,
  sourceTimezone?: string,
): ParsedImportSource {
  if (sourceType === 'personal-json') return parsePersonalFile(path);
  if (sourceTimezone === undefined) {
    return {
      sourceType,
      sourceSchema: 'qoder-unknown',
      entities: [],
      tombstones: [],
      warnings: [],
      fatal: [{ code: 'SOURCE_TIMEZONE_REQUIRED', message: 'qoder 导入必须确认来源时区' }],
      credentialsDetected: false,
    };
  }
  return inspectQoderFile(path, sourceTimezone);
}

function currentBaseline(database: DatabaseSync, plan: PersistedImportPlan): string {
  return hashValue({
    entities: plan.entities.map(({ targetKind, targetId }) => ({
      targetKind,
      targetId,
      baselineTargetHash: targetProjectionHash(database, targetKind, targetId),
    })),
    tombstones: plan.tombstones.map(
      ({ entityKind, sourceId, canonicalKey, targetKind, targetId }) => {
        const row = database
          .prepare(
            `SELECT deleted_at_ms FROM deletion_markers
             WHERE source_system = 'personal-json' AND entity_kind = ? AND source_id = ?
               AND canonical_key = ?`,
          )
          .get(entityKind, sourceId, canonicalKey ?? '');
        return {
          entityKind,
          sourceId,
          canonicalKey,
          baselineDeletedAtMs: row === undefined ? null : Number(row['deleted_at_ms']),
          targetKind,
          targetId,
          baselineTargetHash:
            targetKind === null || targetId === null
              ? null
              : targetProjectionHash(database, targetKind, targetId),
        };
      },
    ),
  });
}

export class ImportService {
  private readonly repository: ImportRepository;
  private readonly plans: ImportPlanStore;

  public constructor(
    private readonly database: DatabaseSync,
    importsDirectory: string,
    private readonly backupDirectory: string,
    private readonly now: () => number = Date.now,
    private readonly createId: () => string = randomUUID,
    private readonly injectFault: (point: ImportFaultPoint) => void = () => undefined,
  ) {
    this.repository = new ImportRepository(database);
    this.plans = new ImportPlanStore(importsDirectory);
    this.plans.cleanup(this.repository.activePlanIds(this.now()));
  }

  public async preflight(input: {
    sourceType: ImportSourceType;
    sourceTimezone?: string;
    temporaryPath: string;
    persistConfirmation?: boolean;
  }): Promise<ImportPreflightResponse> {
    const runId = this.createId();
    const sourcePath = this.plans.moveSource(runId, input.temporaryPath);
    rmSync(dirname(input.temporaryPath), { recursive: true, force: true });
    const sourceSha256 = await hashFile(sourcePath);
    const parsed = sourceTypeParse(input.sourceType, sourcePath, input.sourceTimezone);
    const reconciliation = reconcileSource(this.database, parsed, this.createId);
    const createdAtMs = this.now();
    const draft = {
      runId,
      sourceType: parsed.sourceType,
      sourceSchema: parsed.sourceSchema,
      ...(parsed.sourceTimezone === undefined ? {} : { sourceTimezone: parsed.sourceTimezone }),
      entities: reconciliation.entities,
      tombstones: reconciliation.tombstones,
      warnings: reconciliation.warnings,
      fatal: parsed.fatal,
      credentialsDetected: parsed.credentialsDetected,
      sourceSha256,
      targetBaselineSha256: reconciliation.targetBaselineSha256,
      createdAtMs,
    };
    const plan: PersistedImportPlan = { ...draft, planSha256: this.plans.digest(draft) };
    this.plans.save(plan);
    const report = reportFromPlan(plan);
    const ready = report.status === 'ready';
    const token = ready ? randomBytes(32).toString('base64url') : undefined;
    const expiresAtMs = ready ? createdAtMs + TOKEN_TTL_MS : null;
    this.repository.createPreflight({
      id: runId,
      sourceType: input.sourceType,
      sourceSha256,
      sourceSchema: parsed.sourceSchema,
      ...(parsed.sourceTimezone === undefined ? {} : { sourceTimezone: parsed.sourceTimezone }),
      report,
      planSha256: ready ? plan.planSha256 : null,
      expiresAtMs,
      tokenHash: token === undefined ? null : tokenHash(token),
      now: createdAtMs,
    });
    if (!ready) this.plans.remove(runId);
    else if (input.persistConfirmation && token !== undefined) {
      this.plans.saveConfirmation(runId, token);
    }
    if (ready) {
      const cleanup = setTimeout(() => this.plans.remove(runId), TOKEN_TTL_MS + 1_000);
      cleanup.unref();
    }
    return {
      report,
      ...(token === undefined || expiresAtMs === null
        ? {}
        : { confirmationToken: token, expiresAt: new Date(expiresAtMs).toISOString() }),
    };
  }

  public applySaved(preflightId: string): Promise<ImportReport> {
    return this.apply(preflightId, this.plans.loadConfirmation(preflightId));
  }

  public async apply(preflightId: string, token: string): Promise<ImportReport> {
    const now = this.now();
    const hashedToken = tokenHash(token);
    if (!this.repository.confirmationEligible(preflightId, hashedToken, now)) {
      this.plans.cleanup(this.repository.activePlanIds(now));
      throw new AppError(409, 'IMPORT_CONFIRMATION_INVALID', '确认已过期、已使用或无效');
    }
    const plan = this.plans.load(preflightId);
    if (this.repository.planDigest(preflightId) !== plan.planSha256) {
      throw new AppError(409, 'IMPORT_PLAN_CHANGED', '导入计划已变化，请重新预检');
    }
    const sourcePath = this.plans.sourcePath(preflightId);
    if ((await hashFile(sourcePath)) !== plan.sourceSha256) {
      throw new AppError(409, 'IMPORT_SOURCE_CHANGED', '导入源已变化，请重新预检');
    }
    await createPreImportSnapshot(this.database, this.backupDirectory, preflightId);
    const applyId = this.createId();
    const preflightReport = reportFromPlan(plan);
    const report = withTransaction(this.database, () => {
      if (currentBaseline(this.database, plan) !== plan.targetBaselineSha256) {
        throw new AppError(409, 'IMPORT_TARGET_CHANGED', '目标数据已变化，请重新预检');
      }
      if (!this.repository.consumeConfirmation(preflightId, hashedToken, now)) {
        throw new AppError(409, 'IMPORT_CONFIRMATION_INVALID', '确认已过期、已使用或无效');
      }
      const running = {
        ...preflightReport,
        runId: applyId,
        mode: 'apply' as const,
        status: 'running' as const,
      };
      this.repository.createApply(applyId, preflightId, running, plan.planSha256, now);
      new ImportApplier(this.database, this.createId, this.injectFault).apply(plan, applyId, now);
      if (this.database.prepare('PRAGMA foreign_key_check').all().length !== 0) {
        throw new Error('Import foreign key reconciliation failed');
      }
      this.injectFault('before-commit');
      const completed: ImportReport = {
        ...running,
        status: 'succeeded',
        logicalChecksumSha256: logicalDatabaseChecksum(this.database),
      };
      this.repository.finishApply(applyId, completed, now);
      return completed;
    });
    this.plans.remove(preflightId);
    return report;
  }

  public report(id: string): ImportReport {
    const report = this.repository.report(id);
    if (report === undefined) throw new AppError(404, 'IMPORT_NOT_FOUND', '导入记录不存在');
    return report;
  }
}
