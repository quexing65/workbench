import { z } from 'zod';

export const BACKUP_APP_ID = 'personal-workbench-vnext' as const;
export const BACKUP_FORMAT_VERSION = 1 as const;

export const backupManifestSchema = z
  .object({
    app: z.literal(BACKUP_APP_ID),
    backupFormat: z.literal(BACKUP_FORMAT_VERSION),
    schemaVersion: z.number().int().min(1).max(9_999),
    createdAt: z.string().datetime({ offset: true }),
    dbBytes: z
      .number()
      .int()
      .positive()
      .max(512 * 1024 * 1024),
    dbSha256: z.string().regex(/^[0-9a-f]{64}$/u),
    secretIncluded: z.literal(false),
  })
  .strict();

export type BackupManifest = z.infer<typeof backupManifestSchema>;
