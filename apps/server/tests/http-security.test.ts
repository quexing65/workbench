import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { allowedHost, makeApp } from './test-app.js';

describe('loopback HTTP guard', () => {
  const rejectedRequests = [
    [
      'wrong Host',
      () => request(makeApp()).get('/api/v1/health').set('Host', 'localhost:8790'),
      403,
      'HOST_NOT_ALLOWED',
    ],
    [
      'wrong Origin',
      () =>
        request(makeApp())
          .get('/api/v1/health')
          .set('Host', allowedHost)
          .set('Origin', 'https://evil.example'),
      403,
      'ORIGIN_NOT_ALLOWED',
    ],
    [
      'missing marker',
      () =>
        request(makeApp())
          .post('/api/v1/missing')
          .set('Host', allowedHost)
          .set('Content-Type', 'application/json')
          .send({}),
      403,
      'REQUEST_HEADER_REQUIRED',
    ],
    [
      'non JSON',
      () =>
        request(makeApp())
          .post('/api/v1/missing')
          .set('Host', allowedHost)
          .set('X-Workbench-Request', '1')
          .set('Content-Type', 'text/plain')
          .send('x'),
      415,
      'UNSUPPORTED_MEDIA_TYPE',
    ],
  ] satisfies ReadonlyArray<readonly [string, () => Promise<request.Response>, number, string]>;

  it.each(rejectedRequests)('rejects %s', async (_name, send, status, code) => {
    const response = await send();
    expect(response.status).toBe(status);
    expect(response.body.error).toMatchObject({
      code,
      requestId: response.headers['x-request-id'],
      details: [],
    });
  });

  it('rejects cross-site writes', async () => {
    const response = await request(makeApp())
      .post('/api/v1/missing')
      .set('Host', allowedHost)
      .set('Origin', 'http://127.0.0.1:5190')
      .set('Sec-Fetch-Site', 'cross-site')
      .set('X-Workbench-Request', '1')
      .set('Content-Type', 'application/json')
      .send({});
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('CROSS_SITE_REQUEST');
  });
});
