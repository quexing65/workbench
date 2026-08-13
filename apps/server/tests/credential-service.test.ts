import { describe, expect, it, vi } from 'vitest';

import type { BiliSessionClient } from '../src/modules/bili/session-client.js';
import type { BrowserCredentialAdapter } from '../src/modules/credentials/cdp-adapter.js';
import { CredentialService, isSafeCredential } from '../src/modules/credentials/service.js';
import { MemoryCredentialStore } from '../src/modules/credentials/store.js';
import { ExternalServiceError } from '../src/modules/domain-errors.js';

function dependencies(valid = true) {
  const store = new MemoryCredentialStore();
  const bili: BiliSessionClient = {
    verifyCredential: vi.fn().mockResolvedValue(valid),
    getHistory: vi.fn(),
  };
  const browser: BrowserCredentialAdapter = {
    fetch: vi.fn().mockResolvedValue({ kind: 'found', sessdata: 'browser-value' }),
  };
  return { store, bili, browser };
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
    const service = new CredentialService(valid.store, valid.bili, valid.browser);
    expect(await service.status()).toEqual({ present: false, valid: false, userLabel: '未连接' });
    await service.save({ sessdata: 'service-value' });
    expect(await service.status()).toEqual({ present: true, valid: true, userLabel: '已连接' });

    const invalid = dependencies(false);
    await invalid.store.write('expired-value');
    expect(
      await new CredentialService(invalid.store, invalid.bili, invalid.browser).status(),
    ).toEqual({
      present: true,
      valid: false,
      userLabel: '登录态已失效',
    });
  });

  it('does not write an invalid manually supplied value', async () => {
    const { store, bili, browser } = dependencies(false);
    const service = new CredentialService(store, bili, browser);
    await expect(service.save({ sessdata: 'invalid-value' })).rejects.toMatchObject({
      code: 'BILI_CREDENTIAL_INVALID',
    });
    expect(await store.has()).toBe(false);
  });

  it('requires the fixed second confirmation before force restart', async () => {
    const { store, bili, browser } = dependencies();
    const service = new CredentialService(store, bili, browser);
    await expect(service.fetch({ browser: 'edge', forceRestart: true })).rejects.toMatchObject({
      code: 'BROWSER_RESTART_CONFIRMATION_REQUIRED',
    });
    expect(browser.fetch).not.toHaveBeenCalled();
  });

  it('turns a passive discovery miss into a restart-required conflict', async () => {
    const { store, bili } = dependencies();
    const browser: BrowserCredentialAdapter = {
      fetch: vi.fn().mockResolvedValue({ kind: 'restartRequired' }),
    };
    const service = new CredentialService(store, bili, browser);
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
    await expect(
      new CredentialService(
        invalidRemote.store,
        invalidRemote.bili,
        invalidRemote.browser,
      ).status(),
    ).resolves.toEqual({ present: true, valid: false, userLabel: '登录态已失效' });

    const unsafe = dependencies();
    vi.mocked(unsafe.browser.fetch).mockResolvedValue({
      kind: 'found',
      sessdata: 'bad;injected-cookie',
    });
    await expect(
      new CredentialService(unsafe.store, unsafe.bili, unsafe.browser).fetch({
        browser: 'edge',
        forceRestart: false,
      }),
    ).rejects.toMatchObject({ code: 'BILI_CREDENTIAL_INVALID' });
    expect(unsafe.bili.verifyCredential).not.toHaveBeenCalled();

    await unsafe.store.write('bad;stored-cookie');
    await expect(
      new CredentialService(unsafe.store, unsafe.bili, unsafe.browser).status(),
    ).resolves.toEqual({ present: true, valid: false, userLabel: '登录态已失效' });

    await expect(
      new CredentialService(unsafe.store, unsafe.bili, unsafe.browser).save({ sessdata: '' }),
    ).rejects.toMatchObject({ code: 'BILI_CREDENTIAL_INVALID' });
    vi.mocked(unsafe.bili.verifyCredential).mockRejectedValue(new Error('network detail'));
    await unsafe.store.write('safe-stored-value');
    await expect(
      new CredentialService(unsafe.store, unsafe.bili, unsafe.browser).status(),
    ).rejects.toThrow('network detail');
  });
});
