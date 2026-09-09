import { z } from 'zod';

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  version: z.string().min(1),
  database: z.literal('ok'),
  schemaVersion: z.number().int().nonnegative(),
  timeZone: z.string().min(1),
  /**
   * 仅开发与测试模式返回：E2E 用它确认 API 连的是隔离的临时数据目录。
   * 正式运行不返回本机绝对路径。
   */
  dataDirectory: z.string().min(1).optional(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
