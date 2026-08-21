import { readFile } from 'node:fs/promises';

import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { allowedHost, makeApp } from './test-app.js';
import { resolveServerVersion } from '../src/version.js';

describe('GET /api/v1/health', () => {
  it('returns stage 1 health and a server-generated request id', async () => {
    const response = await request(makeApp())
      .get('/api/v1/health')
      .set('Host', allowedHost)
      .set('X-Request-Id', 'caller-controlled');

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({
      status: 'ok',
      version: resolveServerVersion(),
      database: 'ok',
      schemaVersion: 5,
      timeZone: 'Asia/Shanghai',
    });
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/u);
    expect(response.headers['x-request-id']).not.toBe('caller-controlled');
  });

  it('reports the explicitly injected version', async () => {
    const response = await request(makeApp({ version: '9.9.9-test' }))
      .get('/api/v1/health')
      .set('Host', allowedHost);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ version: '9.9.9-test' });
  });

  it('resolves the version from the nearest package.json', async () => {
    const manifest = JSON.parse(
      await readFile(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { version: string };

    expect(resolveServerVersion(import.meta.url)).toBe(manifest.version);
  });
});
