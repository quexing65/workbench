import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it } from 'vitest';

import { inspectQoderFile } from '../src/modules/imports/qoder/qoder-inspector.js';
import { createSanitizedQoderSnapshot } from '../src/modules/imports/qoder/sanitized-snapshot.js';
import { createQoderFixture, TEST_SESSDATA } from './import-fixtures.js';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('qoder sanitized rehearsal snapshot', () => {
  it('copies allowlisted business data without selecting or persisting SESSDATA', () => {
    const root = mkdtempSync(join(tmpdir(), 'workbench-qoder-sanitize-'));
    roots.push(root);
    const source = join(root, 'source.sqlite');
    const output = join(root, 'sanitized.sqlite');
    createQoderFixture(source, { secret: true });

    const result = createSanitizedQoderSnapshot(source, output, 'Asia/Shanghai');
    expect(result.entityCount).toBeGreaterThan(0);
    expect(inspectQoderFile(output, 'Asia/Shanghai').credentialsDetected).toBe(false);
    expect(readFileSync(output).includes(Buffer.from(TEST_SESSDATA))).toBe(false);
    const database = new DatabaseSync(output, { readOnly: true });
    try {
      expect(
        database.prepare("SELECT 1 FROM settings WHERE key = 'bili_sessdata'").get(),
      ).toBeUndefined();
    } finally {
      database.close();
    }
  });

  it('supports the legacy column set and an absent browser setting', () => {
    const root = mkdtempSync(join(tmpdir(), 'workbench-qoder-sanitize-legacy-'));
    roots.push(root);
    const source = join(root, 'source.sqlite');
    const output = join(root, 'sanitized.sqlite');
    createQoderFixture(source, { legacy: true, finished: false });
    const sourceDatabase = new DatabaseSync(source);
    try {
      sourceDatabase.prepare("DELETE FROM settings WHERE key = 'bili_browser'").run();
      sourceDatabase
        .prepare('UPDATE bili_videos SET title = NULL, cover = NULL, owner = NULL')
        .run();
      sourceDatabase.prepare('UPDATE tasks SET completed_at = NULL').run();
    } finally {
      sourceDatabase.close();
    }

    expect(createSanitizedQoderSnapshot(source, output, 'Asia/Shanghai')).toMatchObject({
      sourceSchema: 'qoder-legacy',
    });
    const inspection = inspectQoderFile(output, 'Asia/Shanghai');
    expect(inspection.fatal).toEqual([]);
    expect(inspection.entities.some((entity) => entity.sourceKind === 'setting')).toBe(false);
  });

  it('preserves an existing destination and cleans a failed new snapshot', () => {
    const root = mkdtempSync(join(tmpdir(), 'workbench-qoder-sanitize-failure-'));
    roots.push(root);
    const source = join(root, 'source.sqlite');
    const existing = join(root, 'existing.sqlite');
    const failed = join(root, 'failed.sqlite');
    createQoderFixture(source, { invalidStatus: true });
    writeFileSync(existing, 'keep-existing');

    expect(() => createSanitizedQoderSnapshot(source, existing, 'Asia/Shanghai')).toThrow(
      'already exists',
    );
    expect(readFileSync(existing, 'utf8')).toBe('keep-existing');
    expect(() => createSanitizedQoderSnapshot(source, failed, 'Asia/Shanghai')).toThrow(
      'verification failed',
    );
    expect(existsSync(failed)).toBe(false);
  });
});
