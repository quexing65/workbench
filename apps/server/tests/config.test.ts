import { describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('uses safe loopback defaults', () => {
    expect(loadConfig({})).toMatchObject({
      host: '127.0.0.1',
      port: 8790,
      timeZone: 'Asia/Shanghai',
      dataDirectory: expect.stringMatching(/[\\/]\.local$/u),
      biliSyncEnabled: false,
    });
  });

  it('resolves an explicit data directory', () => {
    expect(loadConfig({ WORKBENCH_DATA_DIR: './test-data' }).dataDirectory).toMatch(
      /[\\/]test-data$/u,
    );
  });

  it('rejects a non-loopback bind', () => {
    expect(() => loadConfig({ HOST: '0.0.0.0' })).toThrow();
  });

  it('accepts only an explicit true value for automatic Bili sync', () => {
    expect(loadConfig({ BILI_SYNC_ENABLED: 'true' }).biliSyncEnabled).toBe(true);
    expect(() => loadConfig({ BILI_SYNC_ENABLED: '1' })).toThrow();
  });
});
