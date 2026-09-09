import { describe, expect, it } from 'vitest';

import {
  backupManifestSchema,
  BACKUP_FORMAT_VERSION,
  LEGACY_BACKUP_FORMAT_VERSION,
} from './backups.js';

describe('backup manifest contract', () => {
  const legacyManifest = {
    app: 'personal-workbench-vnext',
    backupFormat: LEGACY_BACKUP_FORMAT_VERSION,
    schemaVersion: 3,
    createdAt: '2026-08-13T12:00:00.000Z',
    dbBytes: 42,
    dbSha256: 'a'.repeat(64),
    secretIncluded: false,
  };
  const manifest = {
    ...legacyManifest,
    backupFormat: BACKUP_FORMAT_VERSION,
    logicalChecksumSha256: 'b'.repeat(64),
  };

  it('accepts the current manifest and still reads legacy v1 backups', () => {
    expect(backupManifestSchema.parse(manifest)).toEqual(manifest);
    expect(backupManifestSchema.parse(legacyManifest)).toEqual(legacyManifest);
    expect(() => backupManifestSchema.parse({ ...manifest, extra: true })).toThrow();
    expect(() => backupManifestSchema.parse({ ...manifest, backupFormat: 3 })).toThrow();
  });

  it('requires the logical checksum for format 2 only', () => {
    expect(() => backupManifestSchema.parse(legacyManifest)).not.toThrow();
    expect(() =>
      backupManifestSchema.parse({
        app: manifest.app,
        backupFormat: BACKUP_FORMAT_VERSION,
        schemaVersion: manifest.schemaVersion,
        createdAt: manifest.createdAt,
        dbBytes: manifest.dbBytes,
        dbSha256: manifest.dbSha256,
        secretIncluded: false,
      }),
    ).toThrow(/logicalChecksumSha256/u);
    expect(() =>
      backupManifestSchema.parse({ ...manifest, logicalChecksumSha256: 'bad' }),
    ).toThrow();
  });

  it('rejects identity, secret, size and hash violations', () => {
    expect(() => backupManifestSchema.parse({ ...manifest, app: 'other' })).toThrow();
    expect(() => backupManifestSchema.parse({ ...manifest, secretIncluded: true })).toThrow();
    expect(() => backupManifestSchema.parse({ ...manifest, dbBytes: 0 })).toThrow();
    expect(() => backupManifestSchema.parse({ ...manifest, dbSha256: 'bad' })).toThrow();
  });
});
