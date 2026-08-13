import { describe, expect, it } from 'vitest';

import { applyImportSchema, importPreflightResponseSchema, importReportSchema } from './imports.js';

const report = {
  runId: '11111111-1111-4111-8111-111111111111',
  sourceType: 'personal-json',
  sourceSha256: 'a'.repeat(64),
  sourceSchema: 'personal-v3',
  mode: 'preflight',
  status: 'ready',
  counts: {
    tasks: { read: 1, add: 1, update: 0, unchanged: 0, conflict: 0, reject: 0 },
  },
  conflicts: [],
  warnings: [],
  fatal: [],
  credentials: { detected: false, migrated: false },
} as const;

describe('import contracts', () => {
  it('accepts a bounded machine-readable report and preflight token', () => {
    expect(importReportSchema.parse(report)).toEqual(report);
    expect(
      importPreflightResponseSchema.parse({
        report,
        confirmationToken: 'x'.repeat(32),
        expiresAt: '2026-08-13T12:00:00.000Z',
      }).confirmationToken,
    ).toHaveLength(32);
  });

  it('rejects secret-like extras and malformed apply inputs', () => {
    expect(() => applyImportSchema.parse({ confirmationToken: 'short' })).toThrow();
    expect(() =>
      applyImportSchema.parse({ confirmationToken: 'x'.repeat(32), path: 'C:\\x' }),
    ).toThrow();
    expect(() => importReportSchema.parse({ ...report, sourceSha256: 'not-a-hash' })).toThrow();
  });
});
