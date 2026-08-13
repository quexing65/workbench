import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { allowedHost, makeApp } from './test-app.js';

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
      version: '0.1.0',
      database: 'ok',
      schemaVersion: 1,
      timeZone: 'Asia/Shanghai',
    });
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/u);
    expect(response.headers['x-request-id']).not.toBe('caller-controlled');
  });
});
