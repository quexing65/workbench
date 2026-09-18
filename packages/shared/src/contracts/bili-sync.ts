import { z } from 'zod';

export const biliBrowserSchema = z.enum(['edge', 'chrome']);
export type BiliBrowser = z.infer<typeof biliBrowserSchema>;

export const biliCredentialStatusSchema = z
  .object({
    present: z.boolean(),
    valid: z.boolean(),
    userLabel: z.enum(['未连接', '已连接', '登录态已失效']),
  })
  .strict();
export type BiliCredentialStatus = z.infer<typeof biliCredentialStatusSchema>;

export const saveBiliCredentialSchema = z
  .object({
    sessdata: z
      .string()
      .trim()
      .min(1, 'SESSDATA 不能为空')
      .max(4096)
      .regex(/^[^\u0000-\u001f\u007f;]+$/u, 'SESSDATA 包含无效字符'),
  })
  .strict();
export type SaveBiliCredentialInput = z.infer<typeof saveBiliCredentialSchema>;

export const fetchBiliCredentialSchema = z
  .object({
    browser: biliBrowserSchema,
    forceRestart: z.boolean().default(false),
    confirmation: z.literal('restart-browser').optional(),
  })
  .strict();
export type FetchBiliCredentialInput = z.infer<typeof fetchBiliCredentialSchema>;

export const biliQrLoginStartSchema = z
  .object({
    qrImage: z.string().regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/u),
  })
  .strict();
export type BiliQrLoginStartResponse = z.infer<typeof biliQrLoginStartSchema>;

export const biliQrLoginStateSchema = z.enum([
  'absent',
  'waiting',
  'scanned',
  'expired',
  'succeeded',
]);
export type BiliQrLoginState = z.infer<typeof biliQrLoginStateSchema>;

export const biliQrLoginStatusSchema = z
  .object({
    state: biliQrLoginStateSchema,
    credential: biliCredentialStatusSchema.optional(),
  })
  .strict();
export type BiliQrLoginStatus = z.infer<typeof biliQrLoginStatusSchema>;

export const startLearningSyncSchema = z
  .object({
    resourceId: z.string().uuid(),
    pages: z.number().int().min(1).max(5).default(3),
  })
  .strict();
export type StartLearningSyncInput = z.infer<typeof startLearningSyncSchema>;

export const startLearningSyncAllSchema = z
  .object({
    pages: z.number().int().min(1).max(5).default(3),
  })
  .strict();
export type StartLearningSyncAllInput = z.infer<typeof startLearningSyncAllSchema>;

export const learningSyncStartResponseSchema = z.object({ runId: z.string().uuid() }).strict();
export type LearningSyncStartResponse = z.infer<typeof learningSyncStartResponseSchema>;

export const learningSyncRunSchema = z
  .object({
    id: z.string().uuid(),
    status: z.enum(['queued', 'running', 'succeeded', 'failed']),
    requestedPages: z.number().int().min(1).max(5),
    historyCount: z.number().int().nonnegative(),
    updatedCount: z.number().int().nonnegative(),
    safeErrorCode: z.string().max(100).nullable(),
    startedAt: z.string().datetime({ offset: false }).nullable(),
    finishedAt: z.string().datetime({ offset: false }).nullable(),
    createdAt: z.string().datetime({ offset: false }),
  })
  .strict();
export type LearningSyncRun = z.infer<typeof learningSyncRunSchema>;
