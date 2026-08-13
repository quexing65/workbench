import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import { openWorkbenchDatabase } from '../src/db/connection.js';
import type { WorkbenchDatabase } from '../src/db/connection.js';
import { allowedHost, makeApp } from './test-app.js';
import { personalFixture, writePersonalFile } from './import-fixtures.js';

interface ApiFixture {
  readonly root: string;
  readonly database: WorkbenchDatabase;
}

const fixtures: ApiFixture[] = [];

function apiFixture() {
  const root = mkdtempSync(join(tmpdir(), 'workbench-import-api-'));
  const database = openWorkbenchDatabase({ dataDirectory: root });
  fixtures.push({ root, database });
  return {
    root,
    database,
    app: makeApp({
      database: database.connection,
      dataDirectory: root,
      mountImports: true,
    }),
  };
}

afterEach(() => {
  for (const value of fixtures.splice(0)) {
    value.database.close();
    rmSync(value.root, { recursive: true, force: false });
  }
});

function writeHeaders(agent: request.Test): request.Test {
  return agent.set('Host', allowedHost).set('X-Workbench-Request', '1');
}

describe('import API', () => {
  it('preflights multipart, applies by id/token and returns a stable report', async () => {
    const { app, root } = apiFixture();
    const source = writePersonalFile(join(root, 'source'));
    const preview = await writeHeaders(request(app).post('/api/v1/data/imports/preflight'))
      .field('sourceType', 'personal-json')
      .attach('file', source, 'personal.json')
      .expect(201);
    expect(preview.body.report).toMatchObject({
      sourceType: 'personal-json',
      sourceSchema: 'personal-v3',
      status: 'ready',
    });
    expect(preview.body.confirmationToken).toEqual(expect.any(String));
    expect(JSON.stringify(preview.body)).not.toContain(source);

    const applied = await writeHeaders(
      request(app)
        .post(`/api/v1/data/imports/${String(preview.body.report.runId)}/apply`)
        .send({ confirmationToken: preview.body.confirmationToken }),
    ).expect(200);
    expect(applied.body).toMatchObject({ mode: 'apply', status: 'succeeded' });

    const report = await request(app)
      .get(`/api/v1/data/imports/${String(applied.body.runId)}/report`)
      .set('Host', allowedHost)
      .expect(200);
    expect(report.body).toEqual(applied.body);
  });

  it('returns fatal preflight safely and rejects missing fields and path-based apply', async () => {
    const { app, root } = apiFixture();
    const invalid = personalFixture(3) as { tasks: { date: string }[] };
    invalid.tasks[0]!.date = '2026-02-30';
    const fatal = await writeHeaders(request(app).post('/api/v1/data/imports/preflight'))
      .field('sourceType', 'personal-json')
      .attach('file', writePersonalFile(join(root, 'bad'), invalid), 'bad.json')
      .expect(422);
    expect(fatal.body).toMatchObject({
      report: { status: 'failed', fatal: [{ code: 'PERSONAL_SCHEMA_INVALID' }] },
    });
    expect(fatal.body.confirmationToken).toBeUndefined();

    await writeHeaders(request(app).post('/api/v1/data/imports/preflight'))
      .field('sourceType', 'personal-json')
      .expect(400);
    await writeHeaders(
      request(app)
        .post('/api/v1/data/imports/11111111-1111-4111-8111-111111111111/apply')
        .send({ confirmationToken: 'x'.repeat(32), path: 'C:\\secret.db' }),
    )
      .expect(400)
      .expect(({ body }) => expect(body.error.code).toBe('VALIDATION_ERROR'));
  });

  it('rejects multipart on every non-import write route and missing write markers', async () => {
    const { app } = apiFixture();
    const multipart = 'multipart/form-data; boundary=workbench-test';
    await request(app)
      .post('/api/v1/data/imports/preflight')
      .set('Host', allowedHost)
      .set('Content-Type', multipart)
      .send('--workbench-test--')
      .expect(403);
    await writeHeaders(request(app).post('/api/v1/tasks'))
      .set('Content-Type', multipart)
      .send('--workbench-test--')
      .expect(415);
  });

  it('cleans the random upload directory after a Multer limit failure', async () => {
    const { app, root } = apiFixture();
    await writeHeaders(request(app).post('/api/v1/data/imports/preflight'))
      .field('sourceType', 'personal-json')
      .attach('file', Buffer.alloc(50 * 1024 * 1024 + 1), 'oversized.json')
      .expect(413);
    const uploadRoot = join(root, 'tmp', 'imports', 'uploads');
    const { readdirSync } = await import('node:fs');
    expect(readdirSync(uploadRoot)).toEqual([]);
  });
});
