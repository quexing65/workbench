import { describe, expect, it } from 'vitest';

import { backupManifestSchema } from './backups.js';

describe('backup manifest contract', () => {
  const manifest = {
    app: 'personal-workbench-vnext',
    backupFormat: 1,
    schemaVersion: 3,
    createdAt: '2026-08-13T12:00:00.000Z',
    dbBytes: 42,
    dbSha256: 'a'.repeat(64),
    secretIncluded: false,
  };

  it('accepts only the exact v1 manifest', () => {
    expect(backupManifestSchema.parse(manifest)).toEqual(manifest);
    expect(() => backupManifestSchema.parse({ ...manifest, extra: true })).toThrow();
  });

  it('rejects identity, secret, size and hash violations', () => {
    expect(() => backupManifestSchema.parse({ ...manifest, app: 'other' })).toThrow();
    expect(() => backupManifestSchema.parse({ ...manifest, secretIncluded: true })).toThrow();
    expect(() => backupManifestSchema.parse({ ...manifest, dbBytes: 0 })).toThrow();
    expect(() => backupManifestSchema.parse({ ...manifest, dbSha256: 'bad' })).toThrow();
  });
});
