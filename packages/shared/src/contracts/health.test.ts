import { describe, expect, it } from 'vitest';

import { healthResponseSchema } from './health.js';

describe('healthResponseSchema', () => {
  it('accepts only the stage 1 health fields', () => {
    const value = { status: 'ok', version: '0.1.0', timeZone: 'Asia/Shanghai' };
    expect(healthResponseSchema.parse(value)).toEqual(value);
    expect(healthResponseSchema.strict().safeParse({ ...value, schemaVersion: 1 }).success).toBe(
      false,
    );
  });
});
