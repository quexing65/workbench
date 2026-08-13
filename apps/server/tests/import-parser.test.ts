import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { parsePersonalFile } from '../src/modules/imports/personal/personal-parser.js';
import { qoderLocalTimeToEpoch } from '../src/modules/imports/qoder/local-time.js';
import { parseQoderPages } from '../src/modules/imports/qoder/pages-parser.js';
import { inspectQoderFile } from '../src/modules/imports/qoder/qoder-inspector.js';
import { hashFile } from '../src/modules/imports/source-hash.js';
import {
  createQoderFixture,
  personalFixture,
  QODER_BVID,
  TEST_SESSDATA,
  writePersonalFile,
} from './import-fixtures.js';

const roots: string[] = [];
function root(): string {
  const value = mkdtempSync(join(tmpdir(), 'workbench-import-parser-'));
  roots.push(value);
  return value;
}

afterEach(() => {
  for (const value of roots.splice(0)) rmSync(value, { recursive: true, force: false });
});

describe('Personal import parser', () => {
  it.each([1, 2, 3] as const)(
    'parses Personal v%s wrapper and bare data without writes',
    async (version) => {
      const directory = root();
      const wrapped = writePersonalFile(directory, personalFixture(version), true);
      const before = await hashFile(wrapped);
      const parsed = parsePersonalFile(wrapped);
      expect(parsed).toMatchObject({
        sourceType: 'personal-json',
        sourceSchema: `personal-v${version}`,
        fatal: [],
        credentialsDetected: false,
      });
      expect(parsed.entities.filter(({ sourceKind }) => sourceKind === 'task')).toHaveLength(1);
      expect(parsed.entities.some(({ payload }) => payload.kind === 'learning')).toBe(true);
      expect(parsed.entities.some(({ payload }) => payload.kind === 'unresolved')).toBe(true);
      expect(parsed.entities.some(({ payload }) => payload.kind === 'recurring')).toBe(
        version === 3,
      );
      expect(await hashFile(wrapped)).toBe(before);

      const bare = writePersonalFile(join(directory, 'bare'), personalFixture(version), false);
      expect(parsePersonalFile(bare).fatal).toEqual([]);
    },
  );

  it('rejects malformed, mismatched, invalid and oversized input safely', () => {
    const directory = root();
    const malformed = join(directory, 'bad.json');
    writeFileSync(malformed, '{bad');
    expect(parsePersonalFile(malformed).fatal[0]?.code).toBe('PERSONAL_INVALID_JSON');

    const mismatch = writePersonalFile(directory, personalFixture(3), true);
    const wrapper = JSON.parse(readFileSync(mismatch, 'utf8')) as Record<string, unknown>;
    wrapper['version'] = 2;
    writeFileSync(mismatch, JSON.stringify(wrapper));
    expect(parsePersonalFile(mismatch).fatal[0]?.code).toBe('PERSONAL_VERSION_MISMATCH');

    const invalid = personalFixture(3) as { tasks: { date: string }[] };
    invalid.tasks[0]!.date = '2026-02-30';
    expect(
      parsePersonalFile(writePersonalFile(join(directory, 'invalid'), invalid)).fatal[0]?.code,
    ).toBe('PERSONAL_SCHEMA_INVALID');

    const oversized = join(directory, 'large.json');
    writeFileSync(oversized, ' '.repeat(5 * 1024 * 1024 + 1));
    expect(parsePersonalFile(oversized).fatal[0]?.code).toBe('PERSONAL_FILE_TOO_LARGE');
  });

  it('fails closed on equal-time conflicting duplicates and keeps orphan days deterministic', () => {
    const directory = root();
    const duplicate = personalFixture(3) as {
      tasks: { id: string; title: string; updatedAt: string }[];
    };
    duplicate.tasks.push({ ...duplicate.tasks[0]!, title: '相同时间的不同内容' });
    expect(
      parsePersonalFile(writePersonalFile(join(directory, 'duplicate'), duplicate)).fatal[0]?.code,
    ).toBe('PERSONAL_AMBIGUOUS_DUPLICATE');

    const orphan = personalFixture(3) as {
      fixedTasks: unknown[];
      fixedTaskDays: { fixedTaskId: string }[];
    };
    orphan.fixedTasks = [];
    orphan.fixedTaskDays[0]!.fixedTaskId = 'missing-parent';
    const parsed = parsePersonalFile(writePersonalFile(join(directory, 'orphan'), orphan));
    expect(parsed.fatal).toEqual([]);
    expect(
      parsed.entities.find(({ sourceKind }) => sourceKind === 'fixed_task_day')?.sourceId,
    ).toBe('missing-parent:2026-08-13');
  });
});

describe('qoder read-only inspector', () => {
  it.each([false, true])(
    'maps current/legacy columns, timezone and secret presence (%s)',
    async (legacy) => {
      const path = createQoderFixture(join(root(), 'qoder.db'), { legacy, secret: true });
      const before = await hashFile(path);
      const parsed = inspectQoderFile(path, 'Asia/Shanghai');
      expect(parsed).toMatchObject({
        sourceSchema: legacy ? 'qoder-legacy' : 'qoder-current',
        sourceTimezone: 'Asia/Shanghai',
        fatal: [],
        credentialsDetected: true,
      });
      const video = parsed.entities.find(({ payload }) => payload.kind === 'qoder-video');
      expect(video?.payload).toMatchObject({
        bvid: QODER_BVID,
        furthestPage: 2,
        furthestSeconds: 120,
        resumePage: legacy ? 2 : 1,
        resumeSeconds: legacy ? 120 : 40,
      });
      expect(JSON.stringify(parsed)).not.toContain(TEST_SESSDATA);
      expect(await hashFile(path)).toBe(before);
    },
  );

  it('rejects bad SQLite, pages, orphan series and invalid timezone', () => {
    const directory = root();
    const text = join(directory, 'text.db');
    writeFileSync(text, 'not sqlite');
    expect(inspectQoderFile(text, 'Asia/Shanghai').fatal[0]?.code).toBe(
      'QODER_SQLITE_MAGIC_INVALID',
    );
    expect(
      inspectQoderFile(
        createQoderFixture(join(directory, 'bad-pages.db'), { badPages: true }),
        'Asia/Shanghai',
      ).fatal[0]?.code,
    ).toBe('QODER_INSPECTION_FAILED');
    expect(
      inspectQoderFile(
        createQoderFixture(join(directory, 'orphan.db'), { orphanSeries: true }),
        'Asia/Shanghai',
      ).fatal[0]?.code,
    ).toBe('QODER_INSPECTION_FAILED');
    expect(
      inspectQoderFile(createQoderFixture(join(directory, 'zone.db')), 'Invalid/Zone').fatal[0]
        ?.code,
    ).toBe('QODER_INSPECTION_FAILED');
    expect(
      inspectQoderFile(
        createQoderFixture(join(directory, 'invalid-status.db'), { invalidStatus: true }),
        'Asia/Shanghai',
      ).fatal[0]?.code,
    ).toBe('QODER_INSPECTION_FAILED');
  });

  it('reports and clamps progress outside part boundaries', () => {
    const parsed = inspectQoderFile(
      createQoderFixture(join(root(), 'clamped.db'), {
        progressSeconds: 999,
        resumeSeconds: 999,
      }),
      'Asia/Shanghai',
    );
    expect(parsed.fatal).toEqual([]);
    expect(parsed.warnings.map(({ code }) => code)).toEqual([
      'QODER_PROGRESS_CLAMPED',
      'QODER_RESUME_CLAMPED',
    ]);
    expect(
      parsed.entities.find(({ payload }) => payload.kind === 'qoder-video')?.payload,
    ).toMatchObject({ furthestSeconds: 200, resumeSeconds: 100 });
  });

  it('parses bounded pages and interprets qoder localtime in the confirmed timezone', () => {
    expect(parseQoderPages('[{"page":1,"cid":1,"part":"P1","duration":10}]')).toEqual([
      { partNumber: 1, externalPartId: '1', title: 'P1', durationSeconds: 10 },
    ]);
    expect(() => parseQoderPages('[{"page":1,"cid":1,"part":"P1","duration":-1}]')).toThrow();
    expect(
      new Date(qoderLocalTimeToEpoch('2026-08-13 08:00:00', 'Asia/Shanghai')).toISOString(),
    ).toBe('2026-08-13T00:00:00.000Z');
  });
});
