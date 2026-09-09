import { describe, expect, it } from 'vitest';

import { healthResponseSchema } from './health.js';

describe('healthResponseSchema', () => {
  const value = {
    status: 'ok',
    version: '0.1.0',
    database: 'ok',
    schemaVersion: 1,
    timeZone: 'Asia/Shanghai',
  };

  it('requires database and schema state and treats the data directory as optional', () => {
    expect(healthResponseSchema.parse(value)).toEqual(value);
    expect(healthResponseSchema.safeParse({ ...value, schemaVersion: -1 }).success).toBe(false);
    expect(healthResponseSchema.safeParse({ status: 'ok', version: '0.1.0' }).success).toBe(false);
    // 正式运行不返回 dataDirectory；开发/测试模式返回，字段可选。
    expect(healthResponseSchema.parse({ ...value, dataDirectory: 'C:\\workbench-data' })).toEqual({
      ...value,
      dataDirectory: 'C:\\workbench-data',
    });
  });
});
