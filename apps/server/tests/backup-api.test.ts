import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import { openWorkbenchDatabase, type WorkbenchDatabase } from '../src/db/connection.js';
import { extractBackupArchive } from '../src/modules/backups/archive.js';
import type { BackupService } from '../src/modules/backups/service.js';
import { allowedHost, makeApp } from './test-app.js';

const fixtures: { root: string; database: WorkbenchDatabase }[] = [];

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'workbench-backup-api-'));
  const database = openWorkbenchDatabase({ dataDirectory: root });
  fixtures.push({ root, database });
  return {
    root,
    database,
    app: makeApp({ database: database.connection, dataDirectory: root, mountBackups: true }),
  };
}

afterEach(() => {
  for (const value of fixtures.splice(0)) {
    value.database.close();
    rmSync(value.root, { recursive: true, force: false });
  }
});

describe('backup API', () => {
  it('downloads a valid .pwbk and removes the temporary archive after transfer', async () => {
    const { app, root } = fixture();
    const response = await request(app)
      .post('/api/v1/data/backups')
      .set('Host', allowedHost)
      .set('X-Workbench-Request', '1')
      .send({})
      .buffer(true)
      .parse((incoming, callback) => {
        const chunks: Buffer[] = [];
        incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
        incoming.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(response.headers['content-disposition']).toMatch(/personal-workbench-.*\.pwbk/u);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(String(response.headers['content-disposition'])).not.toContain(root);
    const archive = join(root, 'download.pwbk');
    writeFileSync(archive, response.body as Buffer);
    const extracted = await extractBackupArchive(archive, join(root, 'extracted'));
    expect(extracted.manifest).toMatchObject({ schemaVersion: 4, secretIncluded: false });
    expect(readdirSync(join(root, 'backups'))).toEqual([]);
  });

  it('requires the write marker and JSON content type', async () => {
    const { app } = fixture();
    await request(app).post('/api/v1/data/backups').set('Host', allowedHost).send({}).expect(403);
    await request(app)
      .post('/api/v1/data/backups')
      .set('Host', allowedHost)
      .set('X-Workbench-Request', '1')
      .set('Content-Type', 'text/plain')
      .send('backup')
      .expect(415);
  });

  it('rejects concurrent creation and releases the mutex after a failure', async () => {
    const { database, root } = fixture();
    let release: (() => void) | undefined;
    let announce: (() => void) | undefined;
    let block = true;
    let createCalls = 0;
    const started = new Promise<void>((resolve) => {
      announce = resolve;
    });
    const service: Pick<BackupService, 'create'> = {
      create: async () => {
        createCalls += 1;
        announce?.();
        if (block) {
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        }
        throw new Error('synthetic backup failure');
      },
    };
    const app = makeApp({
      database: database.connection,
      dataDirectory: root,
      mountBackups: true,
      backupService: service,
    });
    const post = () =>
      request(app)
        .post('/api/v1/data/backups')
        .set('Host', allowedHost)
        .set('X-Workbench-Request', '1')
        .send({});

    const first = post().then((response) => response);
    await started;
    const concurrent = await post();
    expect(concurrent.status).toBe(409);
    expect(concurrent.body.error.code).toBe('BACKUP_ALREADY_RUNNING');
    block = false;
    release?.();
    expect((await first).status).toBe(500);

    expect((await post()).status).toBe(500);
    expect(createCalls).toBe(2);
  });
});
