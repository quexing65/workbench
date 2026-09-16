import { describe, expect, it, vi } from 'vitest';

import type { BiliPassportClient } from '../src/modules/bili/passport-client.js';
import type { BiliSessionClient } from '../src/modules/bili/session-client.js';
import type { BrowserCredentialAdapter } from '../src/modules/credentials/cdp-adapter.js';
import { CredentialService, isSafeCredential } from '../src/modules/credentials/service.js';
import { MemoryCredentialStore } from '../src/modules/credentials/store.js';
import { ExternalServiceError } from '../src/modules/domain-errors.js';

const QR_IMAGE = 'data:image/png;base64,QUJD';

function passport(): BiliPassportClient {
  return {
    createQrSession: vi.fn(),
    pollQrSession: vi.fn(),
    getCookieInfo: vi.fn(),
    getRefreshCsrf: vi.fn(),
    refreshCookie: vi.fn(),
    confirmRefresh: vi.fn(),
  };
}

function dependencies(valid = true) {
  const store = new MemoryCredentialStore();
  const bili: BiliSessionClient = {
    verifyCredential: vi.fn().mockResolvedValue(valid),
    getHistory: vi.fn(),
  };
  const browser: BrowserCredentialAdapter = {
    fetch: vi.fn().mockResolvedValue({ kind: 'found', sessdata: 'browser-value' }),
  };
  return { store, bili, browser, passport: passport() };
}

function makeService(deps: ReturnType<typeof dependencies>, now?: () => number) {
  return new CredentialService(deps.store, deps.bili, deps.browser, deps.passport, {
    renderQr: async () => QR_IMAGE,
    ...(now === undefined ? {} : { now }),
  });
}

describe('CredentialService', () => {
  it('accepts only bounded cookie-safe credential values', () => {
    expect(isSafeCredential('valid-value')).toBe(true);
    expect(isSafeCredential('')).toBe(false);
    expect(isSafeCredential('x'.repeat(4097))).toBe(false);
    expect(isSafeCredential('bad\nvalue')).toBe(false);
  });

  it('reports only generic absent, valid and invalid states', async () => {
    const valid = dependencies();
    const service = makeService(valid);
    expect(await service.status()).toEqual({ present: false, valid: false, userLabel: '未连接' });
    await service.save({ sessdata: 'service-value' });
    expect(await service.status()).toEqual({ present: true, valid: true, userLabel: '已连接' });

    const invalid = dependencies(false);
    await invalid.store.write('expired-value');
    expect(await makeService(invalid).status()).toEqual({
      present: true,
      valid: false,
      userLabel: '登录态已失效',
    });
  });

  it('does not write an invalid manually supplied value', async () => {
    const deps = dependencies(false);
    const service = makeService(deps);
    await expect(service.save({ sessdata: 'invalid-value' })).rejects.toMatchObject({
      code: 'BILI_CREDENTIAL_INVALID',
    });
    expect(await deps.store.has()).toBe(false);
  });

  it('requires the fixed second confirmation before force restart', async () => {
    const deps = dependencies();
    const service = makeService(deps);
    await expect(service.fetch({ browser: 'edge', forceRestart: true })).rejects.toMatchObject({
      code: 'BROWSER_RESTART_CONFIRMATION_REQUIRED',
    });
    expect(deps.browser.fetch).not.toHaveBeenCalled();
  });

  it('turns a passive discovery miss into a restart-required conflict', async () => {
    const deps = dependencies();
    const browser: BrowserCredentialAdapter = {
      fetch: vi.fn().mockResolvedValue({ kind: 'restartRequired' }),
    };
    const service = new CredentialService(deps.store, deps.bili, browser, deps.passport);
    await expect(service.fetch({ browser: 'edge', forceRestart: false })).rejects.toMatchObject({
      code: 'BROWSER_RESTART_REQUIRED',
    });
  });

  it('maps an explicit invalid remote status and rejects unsafe browser cookie material', async () => {
    const invalidRemote = dependencies();
    vi.mocked(invalidRemote.bili.verifyCredential).mockRejectedValue(
      new ExternalServiceError('BILI_CREDENTIAL_INVALID', 'B站登录态已失效', 401),
    );
    await invalidRemote.store.write('expired-value');
    await expect(makeService(invalidRemote).status()).resolves.toEqual({
      present: true,
      valid: false,
      userLabel: '登录态已失效',
    });

    const unsafe = dependencies();
    vi.mocked(unsafe.browser.fetch).mockResolvedValue({
      kind: 'found',
      sessdata: 'bad;injected-cookie',
    });
    await expect(
      makeService(unsafe).fetch({ browser: 'edge', forceRestart: false }),
    ).rejects.toMatchObject({ code: 'BILI_CREDENTIAL_INVALID' });
    expect(unsafe.bili.verifyCredential).not.toHaveBeenCalled();

    await unsafe.store.write('bad;stored-cookie');
    await expect(makeService(unsafe).status()).resolves.toEqual({
      present: true,
      valid: false,
      userLabel: '登录态已失效',
    });

    await expect(makeService(unsafe).save({ sessdata: '' })).rejects.toMatchObject({
      code: 'BILI_CREDENTIAL_INVALID',
    });
    vi.mocked(unsafe.bili.verifyCredential).mockRejectedValue(new Error('network detail'));
    await unsafe.store.write('safe-stored-value');
    await expect(makeService(unsafe).status()).rejects.toThrow('network detail');
  });
});

describe('CredentialService QR login', () => {
  it('starts a session and maps waiting and scanned states', async () => {
    const deps = dependencies();
    vi.mocked(deps.passport.createQrSession).mockResolvedValue({
      url: 'https://account.bilibili.com/scan',
      key: 'qr-key',
    });
    vi.mocked(deps.passport.pollQrSession).mockResolvedValue({ state: 'waiting' });
    const service = makeService(deps);

    await expect(service.startQrLogin()).resolves.toEqual({ qrImage: QR_IMAGE });
    await expect(service.pollQrLogin()).resolves.toEqual({ state: 'waiting' });
    vi.mocked(deps.passport.pollQrSession).mockResolvedValue({ state: 'scanned' });
    await expect(service.pollQrLogin()).resolves.toEqual({ state: 'scanned' });
    expect(deps.passport.pollQrSession).toHaveBeenCalledWith('qr-key');
  });

  it('reports absent before any session starts and after expiry', async () => {
    const deps = dependencies();
    let now = Date.parse('2026-09-16T00:00:00.000Z');
    const service = makeService(deps, () => now);
    await expect(service.pollQrLogin()).resolves.toEqual({ state: 'absent' });
    vi.mocked(deps.passport.createQrSession).mockResolvedValue({
      url: 'https://account.bilibili.com/scan',
      key: 'qr-key',
    });
    vi.mocked(deps.passport.pollQrSession).mockResolvedValue({ state: 'expired' });
    await service.startQrLogin();
    // 密钥仍在有效期内：B站的「已失效」不采信，继续按未扫码等待。
    await expect(service.pollQrLogin()).resolves.toEqual({ state: 'waiting' });
    now += 180_000;
    await expect(service.pollQrLogin()).resolves.toEqual({ state: 'expired' });
  });

  it('retries a transient poll failure once before surfacing the error', async () => {
    const deps = dependencies();
    vi.mocked(deps.passport.createQrSession).mockResolvedValue({
      url: 'https://account.bilibili.com/scan',
      key: 'qr-key',
    });
    vi.mocked(deps.passport.pollQrSession)
      .mockRejectedValueOnce(new ExternalServiceError('BILI_UNAVAILABLE', 'B站暂时不可用'))
      .mockResolvedValueOnce({ state: 'scanned' });
    const service = makeService(deps);
    await service.startQrLogin();

    await expect(service.pollQrLogin()).resolves.toEqual({ state: 'scanned' });
    expect(deps.passport.pollQrSession).toHaveBeenCalledTimes(2);
  });

  it('persists the full credential record on scan success without echoing it', async () => {
    const deps = dependencies();
    vi.mocked(deps.passport.createQrSession).mockResolvedValue({
      url: 'https://account.bilibili.com/scan',
      key: 'qr-key',
    });
    vi.mocked(deps.passport.pollQrSession).mockResolvedValue({
      state: 'succeeded',
      login: {
        sessdata: 'qr-sessdata-sentinel',
        biliJct: 'qr-bili-jct',
        dedeUserId: '10086',
        refreshToken: 'qr-refresh-token-sentinel',
      },
    });
    const service = makeService(deps);
    await service.startQrLogin();

    const result = await service.pollQrLogin();
    expect(result).toEqual({
      state: 'succeeded',
      credential: { present: true, valid: true, userLabel: '已连接' },
    });
    expect(JSON.stringify(result)).not.toContain('qr-sessdata-sentinel');
    expect(JSON.stringify(result)).not.toContain('qr-refresh-token-sentinel');
    const stored = await deps.store.read();
    expect(stored).toBe(
      JSON.stringify({
        sessdata: 'qr-sessdata-sentinel',
        biliJct: 'qr-bili-jct',
        refreshToken: 'qr-refresh-token-sentinel',
        dedeUserId: '10086',
      }),
    );
    // 会话结束后的轮询回到 absent。
    await expect(service.pollQrLogin()).resolves.toEqual({ state: 'absent' });
  });

  it('rejects unsafe scan material', async () => {
    const deps = dependencies();
    vi.mocked(deps.passport.createQrSession).mockResolvedValue({
      url: 'https://account.bilibili.com/scan',
      key: 'qr-key',
    });
    vi.mocked(deps.passport.pollQrSession).mockResolvedValue({
      state: 'succeeded',
      login: {
        sessdata: 'bad;sessdata',
        biliJct: 'qr-bili-jct',
        dedeUserId: null,
        refreshToken: 'qr-refresh-token',
      },
    });
    const service = makeService(deps);
    await service.startQrLogin();
    await expect(service.pollQrLogin()).rejects.toMatchObject({ code: 'BILI_CREDENTIAL_INVALID' });
    expect(await deps.store.has()).toBe(false);
  });
});

describe('CredentialService cookie refresh', () => {
  it('skips refresh when the record has no refresh material', async () => {
    const deps = dependencies();
    await deps.store.write('legacy-sessdata-value');
    await makeService(deps).ensureFreshCredential();
    expect(deps.passport.getCookieInfo).not.toHaveBeenCalled();
  });

  it('refreshes and rotates the stored record when bili asks for it', async () => {
    const deps = dependencies();
    await deps.store.write(
      JSON.stringify({
        sessdata: 'old-sessdata',
        biliJct: 'old-jct',
        refreshToken: 'old-refresh-token',
        dedeUserId: '10086',
      }),
    );
    vi.mocked(deps.passport.getCookieInfo).mockResolvedValue({ refresh: true, timestamp: 1 });
    vi.mocked(deps.passport.refreshCookie).mockResolvedValue({
      sessdata: 'new-sessdata',
      biliJct: 'new-jct',
      dedeUserId: null,
      refreshToken: 'new-refresh-token',
    });
    const service = makeService(deps);

    await service.ensureFreshCredential();
    expect(deps.passport.refreshCookie).toHaveBeenCalledWith(
      'SESSDATA=old-sessdata; bili_jct=old-jct; DedeUserID=10086',
      'old-refresh-token',
    );
    expect(deps.passport.confirmRefresh).toHaveBeenCalledWith(
      'SESSDATA=old-sessdata; bili_jct=old-jct; DedeUserID=10086',
      'new-jct',
      'old-refresh-token',
    );
    expect(await deps.store.read()).toBe(
      JSON.stringify({
        sessdata: 'new-sessdata',
        biliJct: 'new-jct',
        refreshToken: 'new-refresh-token',
      }),
    );
  });

  it('keeps the cooldown and skips when no refresh is needed', async () => {
    const deps = dependencies();
    await deps.store.write(
      JSON.stringify({ sessdata: 'old-sessdata', biliJct: 'jct', refreshToken: 'rt' }),
    );
    vi.mocked(deps.passport.getCookieInfo).mockResolvedValue({ refresh: false, timestamp: 1 });
    const service = makeService(deps);

    await service.ensureFreshCredential();
    await service.ensureFreshCredential();
    expect(deps.passport.getCookieInfo).toHaveBeenCalledTimes(1);
    expect(deps.passport.refreshCookie).not.toHaveBeenCalled();
  });

  it('swallows refresh failures and keeps the existing credential', async () => {
    const deps = dependencies();
    const record = JSON.stringify({
      sessdata: 'old-sessdata',
      biliJct: 'jct',
      refreshToken: 'rt',
    });
    await deps.store.write(record);
    vi.mocked(deps.passport.getCookieInfo).mockResolvedValue({ refresh: true, timestamp: 1 });
    vi.mocked(deps.passport.refreshCookie).mockRejectedValue(
      new ExternalServiceError('BILI_REFRESH_FAILED', 'B站登录态续期被拒绝'),
    );
    const service = makeService(deps);

    await expect(service.ensureFreshCredential()).resolves.toBeUndefined();
    expect(await deps.store.read()).toBe(record);
    // 冷却期内不再重试。
    await service.ensureFreshCredential();
    expect(deps.passport.refreshCookie).toHaveBeenCalledTimes(1);
  });

  it('does not replace a valid credential when the refreshed one fails verification', async () => {
    const deps = dependencies(false);
    const record = JSON.stringify({
      sessdata: 'old-sessdata',
      biliJct: 'jct',
      refreshToken: 'rt',
    });
    await deps.store.write(record);
    vi.mocked(deps.passport.getCookieInfo).mockResolvedValue({ refresh: true, timestamp: 1 });
    vi.mocked(deps.passport.refreshCookie).mockResolvedValue({
      sessdata: 'new-sessdata',
      biliJct: 'new-jct',
      dedeUserId: null,
      refreshToken: 'new-rt',
    });
    const service = makeService(deps);

    await service.ensureFreshCredential();
    expect(await deps.store.read()).toBe(record);
    expect(deps.passport.confirmRefresh).not.toHaveBeenCalled();
  });

  it('treats an expired bili login as no refresh needed', async () => {
    const deps = dependencies();
    await deps.store.write(
      JSON.stringify({ sessdata: 'old-sessdata', biliJct: 'jct', refreshToken: 'rt' }),
    );
    vi.mocked(deps.passport.getCookieInfo).mockResolvedValue(null);
    const service = makeService(deps);

    await service.ensureFreshCredential();
    expect(deps.passport.refreshCookie).not.toHaveBeenCalled();
  });
});
