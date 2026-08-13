import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const TEST_SESSDATA = 'fixture-secret-must-never-migrate';
export const PERSONAL_BVID = 'BV1xx411c7mD';
export const QODER_BVID = 'BV1yy411c7mE';

export function personalFixture(version: 1 | 2 | 3 = 3) {
  const common = {
    version,
    revision: 4,
    updatedAt: '2026-08-13T12:00:00.000Z',
    tasks: [
      {
        id: 'task-old',
        title: '旧任务',
        date: '2026-08-13',
        status: 'completed',
        createdAt: '2026-08-10T01:00:00.000Z',
        updatedAt: '2026-08-13T02:00:00.000Z',
        completedAt: '2026-08-13T02:00:00.000Z',
      },
    ],
    notes: [
      {
        id: 'note-old',
        content: '旧小记',
        pinned: true,
        createdAt: '2026-08-11T01:00:00.000Z',
        updatedAt: '2026-08-12T01:00:00.000Z',
      },
    ],
    studyItems: [
      {
        id: 'study-old',
        title: '旧学习项',
        sourceUrl: `https://www.bilibili.com/video/${PERSONAL_BVID}/?p=2`,
        canonicalKey: `${PERSONAL_BVID}:p2`,
        status: 'completed',
        lastPositionSec: 30,
        lastOpenedAt: '2026-08-12T03:00:00.000Z',
        completedAt: '2026-08-12T03:00:00.000Z',
        createdAt: '2026-08-01T01:00:00.000Z',
        updatedAt: '2026-08-12T03:00:00.000Z',
      },
      {
        id: 'short-old',
        title: '待解析短链',
        sourceUrl: 'https://b23.tv/AbCd',
        canonicalKey: 'b23:/abcd',
        status: 'learning',
        lastPositionSec: 5,
        lastOpenedAt: '2026-08-12T04:00:00.000Z',
        createdAt: '2026-08-01T01:00:00.000Z',
        updatedAt: '2026-08-12T04:00:00.000Z',
      },
    ],
  };
  if (version === 1) return common;
  if (version === 2) return { ...common, tombstones: [] };
  return {
    ...common,
    fixedTasks: [
      {
        id: 'fixed-old',
        title: '每日复盘',
        startDate: '2026-08-01',
        endDate: '2026-08-31',
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-02T00:00:00.000Z',
      },
    ],
    fixedTaskDays: [
      {
        fixedTaskId: 'fixed-old',
        date: '2026-08-13',
        status: 'cancelled',
        updatedAt: '2026-08-13T05:00:00.000Z',
        cancelledAt: '2026-08-13T05:00:00.000Z',
      },
    ],
    tombstones: [],
  };
}

export function writePersonalFile(
  directory: string,
  data: unknown = personalFixture(),
  wrapped = true,
): string {
  mkdirSync(directory, { recursive: true });
  const path = join(directory, 'personal.json');
  const value = wrapped
    ? {
        app: 'personal-workbench',
        version: (data as { version: number }).version,
        exportedAt: '2026-08-13T12:00:00.000Z',
        data,
      }
    : data;
  writeFileSync(path, JSON.stringify(value));
  return path;
}

interface QoderFixtureOptions {
  readonly legacy?: boolean;
  readonly badPages?: boolean;
  readonly orphanSeries?: boolean;
  readonly secret?: boolean;
  readonly invalidStatus?: boolean;
  readonly progressSeconds?: number;
  readonly resumeSeconds?: number;
  readonly bvid?: string;
  readonly finished?: boolean;
  readonly overrideAt?: number;
}

export function createQoderFixture(path: string, options: QoderFixtureOptions = {}): string {
  mkdirSync(dirname(path), { recursive: true });
  const database = new DatabaseSync(path);
  try {
    database.exec(`
      CREATE TABLE tasks (
        id INTEGER PRIMARY KEY, title TEXT NOT NULL, note TEXT NOT NULL,
        task_date TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL,
        completed_at TEXT
      );
      CREATE TABLE notes (id INTEGER PRIMARY KEY, content TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE bili_series (id INTEGER PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE bili_videos (
        id INTEGER PRIMARY KEY, bvid TEXT NOT NULL, title TEXT, cover TEXT, owner TEXT,
        duration INTEGER NOT NULL, pages_json TEXT NOT NULL, series_id INTEGER,
        progress_sec INTEGER NOT NULL, progress_page INTEGER NOT NULL,
        finished INTEGER NOT NULL, last_view_at INTEGER NOT NULL,
        imported_at TEXT NOT NULL
        ${options.legacy ? '' : ', resume_page INTEGER NOT NULL, resume_sec INTEGER NOT NULL, override_at INTEGER NOT NULL'}
      );
      CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
    `);
    database
      .prepare('INSERT INTO tasks VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(
        1,
        'qoder 任务',
        '保留描述',
        '2026-08-13',
        options.invalidStatus ? 'mystery' : 'done',
        '2026-08-13 08:00:00',
        '2026-08-13 09:00:00',
      );
    database
      .prepare('INSERT INTO notes VALUES (?, ?, ?)')
      .run(1, 'qoder 小记', '2026-08-13 10:00:00');
    database
      .prepare('INSERT INTO bili_series VALUES (?, ?, ?)')
      .run(1, 'qoder 系列', '2026-08-13 07:00:00');
    const pages = options.badPages
      ? '{bad'
      : JSON.stringify([
          { page: 1, cid: 101, part: '第一P', duration: 100 },
          { page: 2, cid: 102, part: '第二P', duration: 200 },
        ]);
    const baseValues = [
      1,
      options.bvid ?? QODER_BVID,
      'qoder 视频',
      'https://i0.hdslb.com/test.jpg',
      'UP',
      300,
      pages,
      options.orphanSeries ? 999 : 1,
      options.progressSeconds ?? 120,
      2,
      options.finished === false ? 0 : 1,
      1_765_555_000,
      '2026-08-13 11:00:00',
    ];
    if (options.legacy) {
      database
        .prepare('INSERT INTO bili_videos VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(...baseValues);
    } else {
      database
        .prepare('INSERT INTO bili_videos VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(...baseValues, 1, options.resumeSeconds ?? 40, options.overrideAt ?? 1_765_555_100);
    }
    database.prepare('INSERT INTO settings VALUES (?, ?)').run('bili_browser', 'edge');
    if (options.secret) {
      database.prepare('INSERT INTO settings VALUES (?, ?)').run('bili_sessdata', TEST_SESSDATA);
    }
  } finally {
    database.close();
  }
  return path;
}
