import { describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('uses safe loopback defaults', () => {
    expect(loadConfig({})).toMatchObject({
      host: '127.0.0.1',
      port: 8790,
      timeZone: 'Asia/Shanghai',
    });
  });

  it('rejects a non-loopback bind', () => {
    expect(() => loadConfig({ HOST: '0.0.0.0' })).toThrow();
  });
});
