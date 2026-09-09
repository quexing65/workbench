import { z } from 'zod';

export const BACKUP_APP_ID = 'personal-workbench-vnext' as const;

/**
 * 备份格式版本。
 * - v1：只有字节级完整性（dbBytes + dbSha256），无法证明业务内容一致。
 * - v2：新增 `logicalChecksumSha256`，恢复时可验证快照的业务内容与备份时一致。
 * v1 备份仍可读取，但恢复时跳过逻辑校验和比对。
 */
export const BACKUP_FORMAT_VERSION = 2 as const;
export const LEGACY_BACKUP_FORMAT_VERSION = 1 as const;

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/u);

export const backupManifestSchema = z
  .object({
    app: z.literal(BACKUP_APP_ID),
    backupFormat: z.union([
      z.literal(LEGACY_BACKUP_FORMAT_VERSION),
      z.literal(BACKUP_FORMAT_VERSION),
    ]),
    schemaVersion: z.number().int().min(1).max(9_999),
    createdAt: z.string().datetime({ offset: true }),
    dbBytes: z
      .number()
      .int()
      .positive()
      .max(512 * 1024 * 1024),
    dbSha256: sha256Schema,
    logicalChecksumSha256: sha256Schema.optional(),
    secretIncluded: z.literal(false),
  })
  .strict()
  .superRefine((manifest, context) => {
    if (
      manifest.backupFormat === BACKUP_FORMAT_VERSION &&
      manifest.logicalChecksumSha256 === undefined
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Backup format 2 requires logicalChecksumSha256',
        path: ['logicalChecksumSha256'],
      });
    }
  });

export type BackupManifest = z.infer<typeof backupManifestSchema>;
