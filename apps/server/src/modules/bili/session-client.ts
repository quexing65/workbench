import { z } from 'zod';

import { ExternalServiceError } from '../domain-errors.js';

export interface BiliHistoryObservation {
  readonly bvid: string;
  readonly partNumber: number;
  readonly progressSeconds: number;
  readonly observedAt: string;
}

export interface BiliSessionClient {
  verifyCredential(sessdata: string): Promise<boolean>;
  getHistory(sessdata: string, pages: number): Promise<readonly BiliHistoryObservation[]>;
}

const navSchema = z.object({
  code: z.number().int(),
  data: z.object({ isLogin: z.boolean() }).optional(),
});

const historyItemSchema = z
  .object({
    bvid: z.string().nullable().optional(),
    progress: z.number().int().safe().nullable().optional(),
    view_at: z.number().int().safe().nonnegative().max(4_102_444_800).nullable().optional(),
    page: z.unknown().optional(),
    history: z
      .object({
        bvid: z.string().nullable().optional(),
        page: z.number().int().positive().nullable().optional(),
      })
      .nullable()
      .optional(),
  })
  .passthrough();
const historySchema = z.object({ code: z.number().int(), data: z.unknown().optional() });

export interface BiliSessionHttpClientOptions {
  readonly fetcher?: typeof fetch;
  readonly timeoutMs?: number;
  readonly maxResponseBytes?: number;
}

export class BiliSessionHttpClient implements BiliSessionClient {
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxResponseBytes: number;

  public constructor(options: BiliSessionHttpClientOptions = {}) {
    this.fetcher = options.fetcher ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.maxResponseBytes = options.maxResponseBytes ?? 2 * 1024 * 1024;
  }

  public async verifyCredential(sessdata: string): Promise<boolean> {
    const raw = await this.requestJson('https://api.bilibili.com/x/web-interface/nav', sessdata);
    const parsed = navSchema.safeParse(raw);
    if (!parsed.success) throw invalidResponse();
    if (parsed.data.code === -101) return false;
    if (parsed.data.code !== 0 || parsed.data.data === undefined)
      throw biliApiError(parsed.data.code);
    return parsed.data.data.isLogin;
  }

  public async getHistory(
    sessdata: string,
    pages: number,
  ): Promise<readonly BiliHistoryObservation[]> {
    const observations: BiliHistoryObservation[] = [];
    for (let page = 1; page <= pages; page += 1) {
      const url = new URL('https://api.bilibili.com/x/v2/history');
      url.searchParams.set('pn', String(page));
      url.searchParams.set('ps', '100');
      const parsed = historySchema.safeParse(await this.requestJson(url.toString(), sessdata));
      if (!parsed.success) return this.getCursorHistory(sessdata, pages);
      if (parsed.data.code === -101) throw invalidCredential();
      if (parsed.data.code !== 0 && page === 1) {
        return this.getCursorHistory(sessdata, pages);
      }
      if (parsed.data.code !== 0) break;
      if (parsed.data.data === undefined) throw invalidResponse();
      const items = historyItems(parsed.data.data);
      observations.push(...items.flatMap(parseHistoryItem));
      if (items.length === 0) break;
    }
    return observations.sort((left, right) => left.observedAt.localeCompare(right.observedAt));
  }

  private async getCursorHistory(
    sessdata: string,
    pages: number,
  ): Promise<readonly BiliHistoryObservation[]> {
    const observations: BiliHistoryObservation[] = [];
    let max = 0;
    let viewAt = 0;
    for (let page = 0; page < pages; page += 1) {
      const url = new URL('https://api.bilibili.com/x/web-interface/history/cursor');
      url.searchParams.set('max', String(max));
      url.searchParams.set('view_at', String(viewAt));
      url.searchParams.set('ps', '100');
      const parsed = historySchema.safeParse(await this.requestJson(url.toString(), sessdata));
      if (!parsed.success) throw invalidResponse();
      if (parsed.data.code === -101) throw invalidCredential();
      if (parsed.data.code !== 0) throw biliApiError(parsed.data.code);
      const cursorPage = cursorHistoryPage(parsed.data.data);
      if (cursorPage === undefined) throw invalidResponse();
      observations.push(...cursorPage.items.flatMap(parseHistoryItem));
      if (cursorPage.items.length === 0 || cursorPage.max === 0 || cursorPage.viewAt === 0) break;
      max = cursorPage.max;
      viewAt = cursorPage.viewAt;
    }
    return observations.sort((left, right) => left.observedAt.localeCompare(right.observedAt));
  }

  private async requestJson(url: string, sessdata: string): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetcher(url, {
        headers: { Accept: 'application/json', Cookie: `SESSDATA=${sessdata}` },
        redirect: 'error',
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      if (error instanceof ExternalServiceError) throw error;
      const timeout = error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name);
      throw new ExternalServiceError(
        timeout ? 'BILI_TIMEOUT' : 'BILI_UNAVAILABLE',
        timeout ? 'B站请求超时' : 'B站暂时不可用',
        timeout ? 504 : 502,
      );
    }
    if (response.status === 429) {
      throw new ExternalServiceError('BILI_RATE_LIMITED', 'B站请求过于频繁，请稍后重试', 429);
    }
    if (response.status === 401 || response.status === 403) {
      throw new ExternalServiceError('BILI_CREDENTIAL_INVALID', 'B站登录态已失效', 401);
    }
    if (!response.ok) throw new ExternalServiceError('BILI_UNAVAILABLE', 'B站暂时不可用');
    const declared = Number(response.headers.get('content-length') ?? 0);
    if (declared > this.maxResponseBytes) throw responseTooLarge();
    const text = await response.text();
    if (Buffer.byteLength(text) > this.maxResponseBytes) throw responseTooLarge();
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw invalidResponse();
    }
  }
}

function historyItems(data: unknown): unknown[] {
  if (Array.isArray(data)) return data.slice(0, 1000);
  if (typeof data !== 'object' || data === null) return [];
  const list = Reflect.get(data, 'list');
  return Array.isArray(list) ? list.slice(0, 1000) : [];
}

function cursorHistoryPage(
  data: unknown,
): { readonly items: unknown[]; readonly max: number; readonly viewAt: number } | undefined {
  if (typeof data !== 'object' || data === null) return undefined;
  const items = historyItems(data);
  const cursor = Reflect.get(data, 'cursor');
  if (typeof cursor !== 'object' || cursor === null) {
    return Reflect.has(data, 'list') ? { items, max: 0, viewAt: 0 } : undefined;
  }
  const max = Reflect.get(cursor, 'max');
  const viewAt = Reflect.get(cursor, 'view_at');
  if (!Number.isSafeInteger(max) || !Number.isSafeInteger(viewAt)) return undefined;
  return { items, max: Number(max), viewAt: Number(viewAt) };
}

function parseHistoryItem(value: unknown): BiliHistoryObservation[] {
  const parsed = historyItemSchema.safeParse(value);
  return parsed.success ? mapHistoryItem(parsed.data) : [];
}

function mapHistoryItem(item: z.infer<typeof historyItemSchema>): BiliHistoryObservation[] {
  const bvid = item.history?.bvid ?? item.bvid;
  const legacyPage = z
    .union([z.number().int().positive(), z.object({ page: z.number().int().positive() })])
    .safeParse(item.page);
  const partNumber = legacyPage.success
    ? typeof legacyPage.data === 'number'
      ? legacyPage.data
      : legacyPage.data.page
    : (item.history?.page ?? 1);
  if (
    typeof bvid !== 'string' ||
    !/^BV[0-9A-Za-z]{10}$/u.test(bvid) ||
    item.progress == null ||
    item.view_at == null ||
    item.view_at === 0
  )
    return [];
  return [
    {
      bvid,
      partNumber,
      progressSeconds: item.progress,
      observedAt: new Date(item.view_at * 1000).toISOString(),
    },
  ];
}

function biliApiError(code: number): ExternalServiceError {
  if (code === -352 || code === -509) {
    return new ExternalServiceError('BILI_RATE_LIMITED', 'B站请求过于频繁，请稍后重试', 429);
  }
  return new ExternalServiceError('BILI_UNAVAILABLE', 'B站暂时不可用');
}

function invalidCredential(): ExternalServiceError {
  return new ExternalServiceError('BILI_CREDENTIAL_INVALID', 'B站登录态已失效', 401);
}

function invalidResponse(): ExternalServiceError {
  return new ExternalServiceError('BILI_INVALID_RESPONSE', 'B站返回了无效数据');
}

function responseTooLarge(): ExternalServiceError {
  return new ExternalServiceError('BILI_RESPONSE_TOO_LARGE', 'B站响应超过安全大小限制');
}
