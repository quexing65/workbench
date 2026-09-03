import { describe, expect, it } from 'vitest';

import { healthResponseSchema } from './health.js';

describe('healthResponseSchema', () => {
  it('requires database and schema state', () => {
    const value = {
      status: 'ok',
      version: '0.1.0',
      database: 'ok',
      schemaVersion: 1,
      timeZone: 'Asia/Shanghai',
      dataDirectory: 'C:\\workbench-data',
    };
    expect(healthResponseSchema.parse(value)).toEqual(value);
    expect(healthResponseSchema.safeParse({ ...value, schemaVersion: -1 }).success).toBe(false);
    expect(healthResponseSchema.safeParse({ status: 'ok', version: '0.1.0' }).success).toBe(false);
    expect(healthResponseSchema.safeParse({ ...value, dataDirectory: '' }).success).toBe(false);
  });
});
