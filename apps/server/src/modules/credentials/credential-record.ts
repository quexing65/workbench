import { z } from 'zod';

/** 完整登录态记录。sessdata 之外的字段仅在扫码登录写入，供 Cookie 自动续期使用。 */
export interface BiliCredentialRecord {
  readonly sessdata: string;
  readonly biliJct?: string | undefined;
  readonly refreshToken?: string | undefined;
  readonly dedeUserId?: string | undefined;
}

const recordSchema = z
  .object({
    sessdata: z.string().min(1).max(4096),
    biliJct: z.string().min(1).max(4096).optional(),
    refreshToken: z.string().min(1).max(4096).optional(),
    dedeUserId: z.string().min(1).max(4096).optional(),
  })
  .strict();

/** 这些字段会拼入发往B站的 Cookie 头，禁止控制字符与分隔符。 */
export function isSafeToken(value: string): boolean {
  return value.length >= 1 && value.length <= 4096 && !/[\u0000-\u001f\u007f;]/u.test(value);
}

export function encodeRecord(record: BiliCredentialRecord): string {
  return JSON.stringify(recordSchema.parse(record));
}

/** 旧版存储只写入裸 SESSDATA 字符串；解析失败时整串按 legacy SESSDATA 兜底。 */
export function decodeRecord(raw: string | null): BiliCredentialRecord | null {
  if (raw === null || raw === '') return null;
  try {
    const parsed = recordSchema.safeParse(JSON.parse(raw) as unknown);
    if (parsed.success) return parsed.data;
  } catch {
    // 非 JSON 即 legacy 格式，走下方兜底。
  }
  return { sessdata: raw };
}
