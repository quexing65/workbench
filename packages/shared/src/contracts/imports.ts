import { z } from 'zod';

export const importSourceTypeSchema = z.enum(['personal-json', 'qoder-sqlite']);
export const importResolutionSchema = z.enum(['keep-target', 'source-wins', 'manual']);

export const importCountSchema = z.object({
  read: z.number().int().nonnegative(),
  add: z.number().int().nonnegative(),
  update: z.number().int().nonnegative(),
  unchanged: z.number().int().nonnegative(),
  conflict: z.number().int().nonnegative(),
  reject: z.number().int().nonnegative(),
});

export const importConflictSchema = z.object({
  code: z.string().min(1).max(100),
  entity: z.string().min(1).max(100),
  sourceId: z.string().min(1).max(500),
  targetId: z.string().uuid().optional(),
  fields: z.array(z.string().min(1).max(100)).max(50),
  resolution: importResolutionSchema,
});

export const importWarningSchema = z.object({
  code: z.string().min(1).max(100),
  entity: z.string().min(1).max(100).optional(),
  sourceId: z.string().min(1).max(500).optional(),
  message: z.string().min(1).max(500),
});

export const importFatalSchema = z.object({
  code: z.string().min(1).max(100),
  message: z.string().min(1).max(500),
});

export const importReportSchema = z.object({
  runId: z.string().uuid(),
  sourceType: importSourceTypeSchema,
  sourceSha256: z.string().regex(/^[0-9a-f]{64}$/u),
  sourceSchema: z.string().min(1).max(100),
  sourceTimezone: z.string().min(1).max(100).optional(),
  mode: z.enum(['preflight', 'apply']),
  status: z.enum(['running', 'ready', 'succeeded', 'failed']),
  logicalChecksumSha256: z
    .string()
    .regex(/^[0-9a-f]{64}$/u)
    .optional(),
  counts: z.record(z.string().min(1).max(100), importCountSchema),
  conflicts: z.array(importConflictSchema),
  warnings: z.array(importWarningSchema),
  fatal: z.array(importFatalSchema),
  credentials: z.object({ detected: z.boolean(), migrated: z.literal(false) }),
});

export const importPreflightResponseSchema = z.object({
  report: importReportSchema,
  confirmationToken: z.string().min(32).max(200).optional(),
  expiresAt: z.string().datetime({ offset: true }).optional(),
});

export const applyImportSchema = z
  .object({ confirmationToken: z.string().min(32).max(200) })
  .strict();

export type ImportSourceType = z.infer<typeof importSourceTypeSchema>;
export type ImportCount = z.infer<typeof importCountSchema>;
export type ImportConflict = z.infer<typeof importConflictSchema>;
export type ImportWarning = z.infer<typeof importWarningSchema>;
export type ImportFatal = z.infer<typeof importFatalSchema>;
export type ImportReport = z.infer<typeof importReportSchema>;
export type ImportPreflightResponse = z.infer<typeof importPreflightResponseSchema>;
export type ApplyImportInput = z.infer<typeof applyImportSchema>;
