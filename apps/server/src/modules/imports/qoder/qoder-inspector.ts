import { statSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import { isBusinessDate, type TaskStatus } from '@workbench/shared';

import type { ParsedImportSource, SourceEntity } from '../contracts.js';
import { hashValue } from '../source-hash.js';
import { qoderLocalTimeToEpoch, validateTimeZone } from './local-time.js';
import { parseQoderPages } from './pages-parser.js';
import { hasSqliteMagic, MAX_QODER_FILE_BYTES, verifyQoderDatabase } from './qoder-safety.js';

type Row = Record<string, unknown>;

function text(value: unknown, maximum: number, label: string, allowEmpty = false): string {
  if (
    typeof value !== 'string' ||
    value.length > maximum ||
    (!allowEmpty && value.trim().length === 0)
  ) {
    throw new RangeError(`${label} 无效`);
  }
  return allowEmpty ? value : value.trim();
}

function integer(value: unknown, label: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum)
    throw new RangeError(`${label} 无效`);
  return Number(value);
}

function sourceEntity(
  sourceKind: string,
  sourceId: string,
  targetKind: string,
  payload: SourceEntity['payload'],
): SourceEntity {
  return { sourceKind, sourceId, targetKind, sourceHash: hashValue(payload), payload };
}

function fatal(code: string, message: string, timeZone?: string): ParsedImportSource {
  return {
    sourceType: 'qoder-sqlite',
    sourceSchema: 'qoder-unknown',
    ...(timeZone === undefined ? {} : { sourceTimezone: timeZone }),
    entities: [],
    tombstones: [],
    warnings: [],
    fatal: [{ code, message }],
    credentialsDetected: false,
  };
}

function inspectOpen(database: DatabaseSync, timeZone: string): ParsedImportSource {
  const columns = verifyQoderDatabase(database);

  const entities: SourceEntity[] = [];
  const seriesIds = new Set<string>();
  const seriesRows = database
    .prepare('SELECT id, name, created_at FROM bili_series ORDER BY id')
    .all() as unknown as Row[];
  for (const row of seriesRows) {
    const sourceId = String(integer(row['id'], 'series id', 1));
    seriesIds.add(sourceId);
    const payload = {
      kind: 'series' as const,
      name: text(row['name'], 200, 'series name'),
      createdAtMs: qoderLocalTimeToEpoch(
        text(row['created_at'], 30, 'series created_at'),
        timeZone,
      ),
    };
    entities.push(sourceEntity('series', sourceId, 'series', payload));
  }
  const taskRows = database
    .prepare(
      'SELECT id, title, note, task_date, status, created_at, completed_at FROM tasks ORDER BY id',
    )
    .all() as unknown as Row[];
  for (const row of taskRows) {
    const sourceId = String(integer(row['id'], 'task id', 1));
    const taskDate = text(row['task_date'], 10, 'task date');
    const sourceStatus = text(row['status'], 20, 'task status');
    const status: TaskStatus | null =
      sourceStatus === 'pending'
        ? 'active'
        : sourceStatus === 'done'
          ? 'completed'
          : sourceStatus === 'cancelled'
            ? 'cancelled'
            : null;
    if (status === null || !isBusinessDate(taskDate))
      throw new RangeError('qoder 任务状态或日期无效');
    const createdAtMs = qoderLocalTimeToEpoch(
      text(row['created_at'], 30, 'task created_at'),
      timeZone,
    );
    const completedAtMs =
      row['completed_at'] === null
        ? null
        : qoderLocalTimeToEpoch(text(row['completed_at'], 30, 'task completed_at'), timeZone);
    const payload = {
      kind: 'task' as const,
      title: text(row['title'], 500, 'task title'),
      description: text(row['note'], 20_000, 'task note', true),
      date: taskDate,
      status,
      createdAtMs,
      updatedAtMs: completedAtMs ?? createdAtMs,
      completedAtMs: status === 'completed' ? (completedAtMs ?? createdAtMs) : null,
      cancelledAtMs: status === 'cancelled' ? (completedAtMs ?? createdAtMs) : null,
    };
    entities.push(sourceEntity('task', sourceId, 'task', payload));
  }
  const noteRows = database
    .prepare('SELECT id, content, created_at FROM notes ORDER BY id')
    .all() as unknown as Row[];
  for (const row of noteRows) {
    const sourceId = String(integer(row['id'], 'note id', 1));
    const createdAtMs = qoderLocalTimeToEpoch(
      text(row['created_at'], 30, 'note created_at'),
      timeZone,
    );
    const payload = {
      kind: 'note' as const,
      content: text(row['content'], 20_000, 'note content'),
      pinned: false,
      createdAtMs,
      updatedAtMs: createdAtMs,
    };
    entities.push(sourceEntity('note', sourceId, 'note', payload));
  }

  const hasResumePage = columns.bili_videos.has('resume_page');
  const hasResumeSec = columns.bili_videos.has('resume_sec');
  const hasOverride = columns.bili_videos.has('override_at');
  const optional = `${hasResumePage ? ', resume_page' : ''}${hasResumeSec ? ', resume_sec' : ''}${hasOverride ? ', override_at' : ''}`;
  const videoRows = database
    .prepare(
      `SELECT id, bvid, title, cover, owner, duration, pages_json, series_id, progress_sec, progress_page, finished, last_view_at, imported_at${optional} FROM bili_videos ORDER BY id`,
    )
    .all() as unknown as Row[];
  const warnings: ParsedImportSource['warnings'][number][] = [];
  for (const row of videoRows) {
    const sourceId = String(integer(row['id'], 'video id', 1));
    const seriesSourceId =
      row['series_id'] === null ? null : String(integer(row['series_id'], 'video series_id', 1));
    if (seriesSourceId !== null && !seriesIds.has(seriesSourceId))
      throw new RangeError('qoder 视频引用孤儿系列');
    const parts = parseQoderPages(text(row['pages_json'], 2 * 1024 * 1024, 'pages_json'));
    const furthestPage = integer(row['progress_page'], 'progress_page', 1);
    const furthestPart = parts.find((part) => part.partNumber === furthestPage);
    if (furthestPart === undefined) throw new RangeError('qoder progress_page 不存在');
    const rawFurthest = integer(row['progress_sec'], 'progress_sec');
    const furthestSeconds = Math.min(rawFurthest, furthestPart.durationSeconds);
    if (rawFurthest > furthestPart.durationSeconds)
      warnings.push({
        code: 'QODER_PROGRESS_CLAMPED',
        entity: 'video',
        sourceId,
        message: '最远进度超过分P时长，已安全截断',
      });
    const resumePage = hasResumePage ? integer(row['resume_page'], 'resume_page', 1) : furthestPage;
    const resumePart = parts.find((part) => part.partNumber === resumePage);
    if (resumePart === undefined) throw new RangeError('qoder resume_page 不存在');
    const rawResume = hasResumeSec ? integer(row['resume_sec'], 'resume_sec') : furthestSeconds;
    const resumeSeconds = Math.min(rawResume, resumePart.durationSeconds);
    if (rawResume > resumePart.durationSeconds)
      warnings.push({
        code: 'QODER_RESUME_CLAMPED',
        entity: 'video',
        sourceId,
        message: '续播进度超过分P时长，已安全截断',
      });
    const lastViewSeconds = integer(row['last_view_at'], 'last_view_at');
    const overrideSeconds = hasOverride ? integer(row['override_at'], 'override_at') : 0;
    const bvid = text(row['bvid'], 20, 'bvid');
    if (!/^BV[0-9A-Za-z]{10}$/u.test(bvid)) throw new RangeError('qoder BVID 无效');
    const finished = integer(row['finished'], 'finished');
    if (finished !== 0 && finished !== 1) throw new RangeError('qoder finished 无效');
    const payload = {
      kind: 'qoder-video' as const,
      bvid,
      title:
        row['title'] === null
          ? text(row['bvid'], 20, 'bvid')
          : text(row['title'], 500, 'video title'),
      coverUrl:
        row['cover'] === null || row['cover'] === '' ? null : text(row['cover'], 2_048, 'cover'),
      uploaderName:
        row['owner'] === null || row['owner'] === '' ? null : text(row['owner'], 500, 'owner'),
      durationSeconds: integer(row['duration'], 'duration'),
      seriesSourceId,
      parts,
      furthestPage,
      furthestSeconds,
      resumePage,
      resumeSeconds,
      completed: finished === 1,
      lastObservedAtMs: lastViewSeconds === 0 ? null : lastViewSeconds * 1_000,
      manualOverrideAtMs: overrideSeconds === 0 ? null : overrideSeconds * 1_000,
      importedAtMs: qoderLocalTimeToEpoch(text(row['imported_at'], 30, 'imported_at'), timeZone),
    };
    entities.push(sourceEntity('video', sourceId, 'learning', payload));
  }

  const sessdata = database
    .prepare(
      "SELECT EXISTS(SELECT 1 FROM settings WHERE key = 'bili_sessdata' AND value IS NOT NULL AND length(value) > 0) AS present",
    )
    .get() as Row;
  const browser = database
    .prepare("SELECT value FROM settings WHERE key = 'bili_browser'")
    .get() as Row | undefined;
  if (browser !== undefined) {
    const value = browser['value'];
    if (value === 'edge' || value === 'chrome') {
      entities.push(
        sourceEntity('setting', 'bili_browser', 'setting', {
          kind: 'setting',
          key: 'bili_browser',
          value,
        }),
      );
    } else {
      warnings.push({
        code: 'QODER_BROWSER_SETTING_REJECTED',
        entity: 'setting',
        sourceId: 'bili_browser',
        message: '浏览器设置不在 allowlist，已忽略',
      });
    }
  }
  return {
    sourceType: 'qoder-sqlite',
    sourceSchema: hasResumePage && hasResumeSec && hasOverride ? 'qoder-current' : 'qoder-legacy',
    sourceTimezone: timeZone,
    entities,
    tombstones: [],
    warnings,
    fatal: [],
    credentialsDetected: Number(sessdata['present']) === 1,
  };
}

export function inspectQoderFile(path: string, timeZone: string): ParsedImportSource {
  try {
    validateTimeZone(timeZone);
    if (statSync(path).size > MAX_QODER_FILE_BYTES)
      return fatal('QODER_FILE_TOO_LARGE', 'qoder SQLite 超过 50MB 上限', timeZone);
    if (!hasSqliteMagic(path))
      return fatal('QODER_SQLITE_MAGIC_INVALID', 'qoder 文件不是 SQLite 数据库', timeZone);
    const database = new DatabaseSync(path, {
      readOnly: true,
      allowExtension: false,
      enableDoubleQuotedStringLiterals: false,
    });
    try {
      return inspectOpen(database, timeZone);
    } finally {
      database.close();
    }
  } catch {
    return fatal('QODER_INSPECTION_FAILED', 'qoder SQLite 未通过只读安全检查', timeZone);
  }
}
