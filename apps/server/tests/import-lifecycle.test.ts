import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { openWorkbenchDatabase, type WorkbenchDatabase } from '../src/db/connection.js';
import { parseImportCli } from '../src/modules/imports/cli-arguments.js';
import { ImportService } from '../src/modules/imports/import-service.js';
import { writePersonalFile } from './import-fixtures.js';

const fixtures: { root: string; database: WorkbenchDatabase }[] = [];

function fixture(now: () => number) {
  const root = join(tmpdir(), `workbench-import-lifecycle-${randomUUID()}`);
  const database = openWorkbenchDatabase({ dataDirectory: root });
  fixtures.push({ root, database });
  return {
    root,
    database,
    service: new ImportService(
      database.connection,
      database.directories.imports,
      database.directories.backups,
      now,
    ),
  };
}

function upload(root: string, name: string): string {
  const directory = join(root, 'uploads', name);
  mkdirSync(directory, { recursive: true });
  return directory;
}

afterEach(() => {
  for (const value of fixtures.splice(0)) {
    value.database.close();
    rmSync(value.root, { recursive: true, force: false });
  }
});

describe('import lifecycle and CLI', () => {
  it('parses only the documented CLI shapes', () => {
    expect(parseImportCli(['personal', '--file', 'backup.json', '--dry-run'])).toEqual({
      command: 'personal',
      file: 'backup.json',
      dryRun: true,
    });
    expect(
      parseImportCli([
        'qoder',
        '--file',
        'qoder.db',
        '--source-timezone',
        'Asia/Shanghai',
        '--dry-run',
      ]),
    ).toMatchObject({ command: 'qoder', sourceTimezone: 'Asia/Shanghai' });
    expect(parseImportCli(['apply', '--run', '11111111-1111-4111-8111-111111111111'])).toEqual({
      command: 'apply',
      runId: '11111111-1111-4111-8111-111111111111',
      dryRun: false,
    });
    expect(() => parseImportCli(['qoder', '--file', 'qoder.db'])).toThrow();
    expect(() => parseImportCli(['personal', '--file', 'a', '--file', 'b'])).toThrow();
    expect(() => parseImportCli(['apply', '--run', 'id', '--dry-run'])).toThrow();
  });

  it('keeps active plans across restart and cleans expired plans and orphan uploads', async () => {
    let now = Date.parse('2026-08-13T12:00:00.000Z');
    const current = fixture(() => now);
    const preview = await current.service.preflight({
      sourceType: 'personal-json',
      temporaryPath: writePersonalFile(upload(current.root, 'active')),
      persistConfirmation: true,
    });
    const planDirectory = join(current.database.directories.imports, preview.report.runId);
    expect(existsSync(planDirectory)).toBe(true);
    new ImportService(
      current.database.connection,
      current.database.directories.imports,
      current.database.directories.backups,
      () => now,
    );
    expect(existsSync(planDirectory)).toBe(true);

    const orphan = join(current.database.directories.imports, 'uploads', 'orphan');
    mkdirSync(orphan, { recursive: true });
    writeFileSync(join(orphan, 'source.bin'), 'temporary');
    now += 16 * 60 * 1_000;
    await expect(
      current.service.apply(preview.report.runId, preview.confirmationToken!),
    ).rejects.toMatchObject({ code: 'IMPORT_CONFIRMATION_INVALID' });
    new ImportService(
      current.database.connection,
      current.database.directories.imports,
      current.database.directories.backups,
      () => now,
    );
    expect(existsSync(planDirectory)).toBe(false);
    expect(existsSync(orphan)).toBe(false);
  });
});
