import { isAllowedBiliHostname, normalizeBiliUrl, type NormalizedBiliUrl } from '@workbench/shared';
import { z } from 'zod';

import { ExternalServiceError } from '../domain-errors.js';

export interface BiliPartMetadata {
  readonly cid: string;
  readonly partNumber: number;
  readonly title: string;
  readonly durationSeconds: number;
}

export interface BiliVideoMetadata {
  readonly bvid: string;
  readonly sourceUrl: string;
  readonly title: string;
  readonly coverUrl: string | null;
  readonly uploaderName: string | null;
  readonly durationSeconds: number;
  readonly parts: readonly BiliPartMetadata[];
}

export interface BiliClient {
  resolveShortUrl(url: string): Promise<NormalizedBiliUrl>;
  getVideo(bvid: string): Promise<BiliVideoMetadata>;
}

const pageSchema = z.object({
  cid: z.union([z.string(), z.number()]).transform(String),
  page: z.number().int().positive(),
  part: z.string().trim().min(1).max(500),
  duration: z.number().int().nonnegative(),
});

const apiSchema = z.object({
  code: z.number().int(),
  data: z
    .object({
      bvid: z.string(),
      cid: z.union([z.string(), z.number()]).transform(String).optional(),
      title: z.string().trim().min(1).max(500),
      pic: z.string().optional(),
      duration: z.number().int().nonnegative(),
      owner: z.object({ name: z.string().max(500) }).optional(),
      pages: z.array(pageSchema).optional(),
    })
    .optional(),
});

export interface BiliHttpClientOptions {
  readonly fetcher?: typeof fetch;
  readonly timeoutMs?: number;
  readonly maxRedirects?: number;
  readonly maxResponseBytes?: number;
}

export class BiliHttpClient implements BiliClient {
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxRedirects: number;
  private readonly maxResponseBytes: number;

  public constructor(options: BiliHttpClientOptions = {}) {
    this.fetcher = options.fetcher ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.maxRedirects = options.maxRedirects ?? 5;
    this.maxResponseBytes = options.maxResponseBytes ?? 2 * 1024 * 1024;
  }

  public async resolveShortUrl(value: string): Promise<NormalizedBiliUrl> {
    let current = normalizeBiliUrl(value);
    if (current.kind !== 'short') return current;

    for (let redirects = 0; redirects < this.maxRedirects; redirects += 1) {
      const response = await this.request(current.url);
      if (response.status < 300 || response.status >= 400) {
        throw new ExternalServiceError('BILI_SHORT_UNRESOLVED', 'B站短链暂时无法解析');
      }
      const location = response.headers.get('location');
      if (location === null) {
        throw new ExternalServiceError('BILI_SHORT_UNRESOLVED', 'B站短链缺少跳转目标');
      }
      const nextUrl = new URL(location, current.url);
      if (nextUrl.protocol !== 'https:' || !isAllowedBiliHostname(nextUrl.hostname)) {
        throw new ExternalServiceError('BILI_REDIRECT_BLOCKED', 'B站短链跳转到了非允许域名');
      }
      current = normalizeBiliUrl(nextUrl.toString());
      if (current.kind === 'video') return current;
    }
    throw new ExternalServiceError('BILI_REDIRECT_LIMIT', 'B站短链跳转次数过多');
  }

  public async getVideo(bvid: string): Promise<BiliVideoMetadata> {
    const url = new URL('https://api.bilibili.com/x/web-interface/view');
    url.searchParams.set('bvid', bvid);
    const response = await this.request(url.toString());
    if (response.status === 429) {
      throw new ExternalServiceError('BILI_RATE_LIMITED', 'B站请求过于频繁，请稍后重试', 429);
    }
    if (!response.ok) {
      throw new ExternalServiceError('BILI_UNAVAILABLE', 'B站元数据暂时不可用');
    }
    const declaredSize = Number(response.headers.get('content-length') ?? 0);
    if (declaredSize > this.maxResponseBytes) {
      throw new ExternalServiceError('BILI_RESPONSE_TOO_LARGE', 'B站响应超过安全大小限制');
    }
    const text = await response.text();
    if (Buffer.byteLength(text) > this.maxResponseBytes) {
      throw new ExternalServiceError('BILI_RESPONSE_TOO_LARGE', 'B站响应超过安全大小限制');
    }
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new ExternalServiceError('BILI_INVALID_RESPONSE', 'B站返回了无效数据');
    }
    const parsed = apiSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ExternalServiceError('BILI_INVALID_RESPONSE', 'B站返回了无效数据');
    }
    if (parsed.data.code !== 0 || parsed.data.data === undefined) {
      throw new ExternalServiceError('BILI_VIDEO_UNAVAILABLE', 'B站视频不存在或已下架', 404);
    }
    const data = parsed.data.data;
    if (data.bvid !== bvid) {
      throw new ExternalServiceError('BILI_INVALID_RESPONSE', 'B站返回了无效数据');
    }
    const pages = data.pages ?? [];
    const parts =
      pages.length > 0
        ? pages.map((page) => ({
            cid: page.cid,
            partNumber: page.page,
            title: page.part,
            durationSeconds: page.duration,
          }))
        : data.cid === undefined
          ? []
          : [{ cid: data.cid, partNumber: 1, title: data.title, durationSeconds: data.duration }];
    if (parts.length === 0) {
      throw new ExternalServiceError('BILI_EMPTY_PARTS', 'B站视频没有可用分P');
    }
    if (
      new Set(parts.map(({ cid }) => cid)).size !== parts.length ||
      new Set(parts.map(({ partNumber }) => partNumber)).size !== parts.length
    ) {
      throw new ExternalServiceError('BILI_INVALID_RESPONSE', 'B站返回了重复分P');
    }
    return {
      bvid: data.bvid,
      sourceUrl: `https://www.bilibili.com/video/${data.bvid}/`,
      title: data.title,
      coverUrl: data.pic === undefined || data.pic === '' ? null : secureUrl(data.pic),
      uploaderName: data.owner?.name ?? null,
      durationSeconds: data.duration,
      parts,
    };
  }

  private async request(url: string): Promise<Response> {
    try {
      return await this.fetcher(url, {
        headers: { Accept: 'application/json,text/html;q=0.8' },
        redirect: 'manual',
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      if (error instanceof ExternalServiceError) throw error;
      const code =
        error instanceof Error && error.name === 'TimeoutError'
          ? 'BILI_TIMEOUT'
          : 'BILI_UNAVAILABLE';
      throw new ExternalServiceError(
        code,
        code === 'BILI_TIMEOUT' ? 'B站请求超时' : 'B站暂时不可用',
        code === 'BILI_TIMEOUT' ? 504 : 502,
      );
    }
  }
}

function secureUrl(value: string): string | null {
  try {
    const url = value.startsWith('//') ? `https:${value}` : value;
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
      return null;
    }
    parsed.protocol = 'https:';
    return parsed.toString();
  } catch {
    return null;
  }
}
