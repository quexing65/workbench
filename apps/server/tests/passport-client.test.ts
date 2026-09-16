import { describe, expect, it, vi } from 'vitest';

import { BiliPassportHttpClient, correspondPath } from '../src/modules/bili/passport-client.js';
import { ExternalServiceError } from '../src/modules/domain-errors.js';

const TIMESTAMP = 1_684_446_082_562;

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

function qrPollBody(code: number, extra: Record<string, unknown> = {}): Response {
  return jsonResponse({
    code: 0,
    message: 'OK',
    ttl: 1,
    data: { url: '', refresh_token: '', timestamp: 0, code, message: '', ...extra },
  });
}

const SUCCESS_LOGIN_URL =
  'https://passport.biligame.com/x/passport-login/web/crossDomain?DedeUserID=10086&DedeUserID__ckMd5=hash&Expires=1&SESSDATA=scan-sessdata&bili_jct=scan-jct&gourl=';

describe('correspondPath', () => {
  it('produces a lowercase hex string for the fixed public key', () => {
    const path = correspondPath(TIMESTAMP);
    expect(path).toMatch(/^[0-9a-f]{256}$/u);
  });
});

describe('BiliPassportHttpClient', () => {
  it('creates a qr session from generate', async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({ code: 0, data: { url: 'https://scan.example/', qrcode_key: 'key-1' } }),
    );
    const client = new BiliPassportHttpClient({ fetcher });
    await expect(client.createQrSession()).resolves.toEqual({
      url: 'https://scan.example/',
      key: 'key-1',
    });
  });

  it('maps poll codes to waiting, scanned and expired', async () => {
    for (const [code, state] of [
      [86_101, 'waiting'],
      [86_090, 'scanned'],
      [86_038, 'expired'],
    ] as const) {
      const fetcher = vi.fn(async () => qrPollBody(code));
      const client = new BiliPassportHttpClient({ fetcher });
      await expect(client.pollQrSession('key')).resolves.toEqual({ state });
    }
  });

  it('parses the login material from a successful poll', async () => {
    const fetcher = vi.fn(async () =>
      qrPollBody(0, { url: SUCCESS_LOGIN_URL, refresh_token: 'scan-refresh-token' }),
    );
    const client = new BiliPassportHttpClient({ fetcher });
    await expect(client.pollQrSession('key')).resolves.toEqual({
      state: 'succeeded',
      login: {
        sessdata: 'scan-sessdata',
        biliJct: 'scan-jct',
        dedeUserId: '10086',
        refreshToken: 'scan-refresh-token',
      },
    });
  });

  it('falls back to set-cookie headers when the success url is empty', async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse(
        {
          code: 0,
          message: '0',
          ttl: 1,
          data: {
            url: '',
            refresh_token: 'scan-refresh-token',
            timestamp: 0,
            code: 0,
            message: '',
          },
        },
        {
          headers: [
            ['Content-Type', 'application/json'],
            ['set-cookie', 'SESSDATA=cookie-sessdata; Path=/'],
            ['set-cookie', 'bili_jct=cookie-jct; Path=/'],
            ['set-cookie', 'DedeUserID=10086; Path=/'],
          ],
        },
      ),
    );
    const client = new BiliPassportHttpClient({ fetcher });
    await expect(client.pollQrSession('key')).resolves.toEqual({
      state: 'succeeded',
      login: {
        sessdata: 'cookie-sessdata',
        biliJct: 'cookie-jct',
        dedeUserId: '10086',
        refreshToken: 'scan-refresh-token',
      },
    });
  });

  it('rejects a successful poll without sessdata or bili_jct', async () => {
    for (const url of [
      'https://passport.biligame.com/crossDomain?bili_jct=jct',
      'https://passport.biligame.com/crossDomain?SESSDATA=sess',
      'not-a-url',
    ]) {
      const fetcher = vi.fn(async () => qrPollBody(0, { url, refresh_token: 'rt' }));
      const client = new BiliPassportHttpClient({ fetcher });
      await expect(client.pollQrSession('key')).rejects.toMatchObject({
        code: 'BILI_INVALID_RESPONSE',
      });
    }
  });

  it('reads cookie info and maps missing login to null', async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({ code: 0, data: { refresh: true, timestamp: TIMESTAMP } }),
    );
    const client = new BiliPassportHttpClient({ fetcher });
    await expect(client.getCookieInfo('SESSDATA=s; bili_jct=j')).resolves.toEqual({
      refresh: true,
      timestamp: TIMESTAMP,
    });
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining('csrf=j'),
      expect.objectContaining({
        headers: expect.objectContaining({ Cookie: 'SESSDATA=s; bili_jct=j' }),
      }),
    );

    const loggedOut = vi.fn(async () => jsonResponse({ code: -101, data: undefined }));
    await expect(
      new BiliPassportHttpClient({ fetcher: loggedOut }).getCookieInfo('SESSDATA=s'),
    ).resolves.toBeNull();
  });

  it('runs the full refresh chain and parses set-cookie headers', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('cookie/info')) {
        return jsonResponse({ code: 0, data: { refresh: true, timestamp: TIMESTAMP } });
      }
      if (url.includes('/correspond/1/')) {
        expect(url).toMatch(/\/correspond\/1\/[0-9a-f]{256}$/u);
        return new Response('<html><body><div id="1-name">refresh-csrf</div></body></html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });
      }
      if (url.includes('cookie/refresh')) {
        expect(url).toContain('csrf=old-jct');
        expect(url).toContain('refresh_csrf=refresh-csrf');
        expect(url).toContain('source=main_web');
        expect(url).toContain('refresh_token=old-rt');
        return jsonResponse(
          { code: 0, data: { status: 0, refresh_token: 'new-rt' } },
          {
            headers: [
              ['Content-Type', 'application/json'],
              [
                'set-cookie',
                'SESSDATA=new-sessdata; Expires=Fri, 01 Jan 2027 00:00:00 GMT; Path=/',
              ],
              ['set-cookie', 'bili_jct=new-jct; Path=/'],
              ['set-cookie', 'DedeUserID=10086; Path=/'],
            ],
          },
        );
      }
      throw new Error(`unexpected url ${url}`);
    });
    const client = new BiliPassportHttpClient({ fetcher });
    await expect(
      client.refreshCookie('SESSDATA=old-sessdata; bili_jct=old-jct', 'old-rt'),
    ).resolves.toEqual({
      sessdata: 'new-sessdata',
      biliJct: 'new-jct',
      dedeUserId: '10086',
      refreshToken: 'new-rt',
    });
  });

  it('maps a rejected refresh to BILI_REFRESH_FAILED', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('cookie/info')) {
        return jsonResponse({ code: 0, data: { refresh: true, timestamp: TIMESTAMP } });
      }
      if (url.includes('/correspond/1/')) {
        return new Response('<div id="1-name">refresh-csrf</div>', { status: 200 });
      }
      return jsonResponse({ code: 86_095, message: 'fresh check failed' });
    });
    const client = new BiliPassportHttpClient({ fetcher });
    await expect(client.refreshCookie('SESSDATA=s; bili_jct=j', 'rt')).rejects.toMatchObject({
      code: 'BILI_REFRESH_FAILED',
    });
  });

  it('confirms a refresh with the new csrf and old token', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toContain('csrf=new-jct');
      expect(String(input)).toContain('refresh_token=old-rt');
      return jsonResponse({ code: 0 });
    });
    const client = new BiliPassportHttpClient({ fetcher });
    await expect(
      client.confirmRefresh('SESSDATA=old; bili_jct=old', 'new-jct', 'old-rt'),
    ).resolves.toBeUndefined();
  });

  it('surfaces rate limits and timeouts with mapped codes', async () => {
    const rateLimited = vi.fn(async () => new Response('slow down', { status: 429 }));
    await expect(
      new BiliPassportHttpClient({ fetcher: rateLimited }).pollQrSession('key'),
    ).rejects.toMatchObject({ code: 'BILI_RATE_LIMITED' });

    const timeout = vi.fn(async () => {
      throw Object.assign(new Error('aborted'), { name: 'TimeoutError' });
    });
    await expect(
      new BiliPassportHttpClient({ fetcher: timeout }).pollQrSession('key'),
    ).rejects.toMatchObject({ code: 'BILI_TIMEOUT' });
  });

  it('fails closed on malformed payloads', async () => {
    const malformed = vi.fn(async () => jsonResponse({ unexpected: true }));
    const client = new BiliPassportHttpClient({ fetcher: malformed });
    await expect(client.createQrSession()).rejects.toBeInstanceOf(ExternalServiceError);
  });
});
