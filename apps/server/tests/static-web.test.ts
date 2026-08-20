import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import { allowedHost, makeApp } from './test-app.js';

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function webBuild(): string {
  const directory = mkdtempSync(join(tmpdir(), 'workbench-web-'));
  directories.push(directory);
  writeFileSync(join(directory, 'index.html'), '<!doctype html><main>Personal Workbench</main>');
  writeFileSync(join(directory, 'asset.txt'), 'static asset');
  mkdirSync(join(directory, 'assets'));
  writeFileSync(join(directory, 'assets', 'index-Ab1Cd2Ef.js'), 'console.log("hashed");');
  return directory;
}

describe('production static hosting', () => {
  it('serves an asset and the SPA fallback', async () => {
    const app = makeApp({ serveWeb: true, webDistDirectory: webBuild() });
    const asset = await request(app).get('/asset.txt').set('Host', allowedHost);
    const route = await request(app).get('/overview').set('Host', allowedHost);
    expect(asset.text).toBe('static asset');
    expect(route.status).toBe(200);
    expect(route.text).toContain('Personal Workbench');
  });

  it('never returns HTML for an unknown API', async () => {
    const response = await request(makeApp({ serveWeb: true, webDistDirectory: webBuild() }))
      .get('/api/v1/missing')
      .set('Host', allowedHost);
    expect(response.status).toBe(404);
    expect(response.type).toContain('json');
    expect(response.body.error.code).toBe('API_NOT_FOUND');
  });

  it('caches fingerprinted assets immutably but always revalidates index.html', async () => {
    const app = makeApp({ serveWeb: true, webDistDirectory: webBuild() });
    const hashed = await request(app).get('/assets/index-Ab1Cd2Ef.js').set('Host', allowedHost);
    const fallback = await request(app).get('/overview').set('Host', allowedHost);
    expect(hashed.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(fallback.headers['cache-control']).toBe('no-cache');
  });

  it('sends defense-in-depth security headers on API and static responses', async () => {
    const app = makeApp({ serveWeb: true, webDistDirectory: webBuild() });
    const api = await request(app).get('/api/v1/health').set('Host', allowedHost);
    const page = await request(app).get('/overview').set('Host', allowedHost);
    for (const response of [api, page]) {
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['referrer-policy']).toBe('no-referrer');
      expect(response.headers['x-frame-options']).toBe('DENY');
    }
  });
});
