import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createLogger } from '../src/http/logger.js';
import { allowedHost, makeApp, testConfig } from './test-app.js';

describe('safe errors and logs', () => {
  it('normalizes malformed JSON', async () => {
    const response = await request(makeApp())
      .post('/api/v1/missing')
      .set('Host', allowedHost)
      .set('X-Workbench-Request', '1')
      .set('Content-Type', 'application/json')
      .send('{"broken":');
    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({
      code: 'INVALID_JSON',
      requestId: response.headers['x-request-id'],
    });
    expect(JSON.stringify(response.body)).not.toContain('SyntaxError');
  });

  it('logs request ids without header, body, or query secrets', async () => {
    const chunks: string[] = [];
    const logger = createLogger(
      { ...testConfig, logLevel: 'info' },
      { write: (chunk: string) => chunks.push(chunk) },
    );
    const secret = 'TEST_SECRET_63f6b57d';
    const response = await request(makeApp({ logger }))
      .post(`/api/v1/missing?token=${secret}`)
      .set('Host', allowedHost)
      .set('X-Workbench-Request', '1')
      .set('Authorization', secret)
      .set('Cookie', `SESSDATA=${secret}`)
      .set('Content-Type', 'application/json')
      .send({ sessdata: secret });
    const logs = chunks.join('');
    expect(response.status).toBe(404);
    expect(logs).toContain(response.headers['x-request-id'] as string);
    expect(logs).not.toContain(secret);
  });
});
