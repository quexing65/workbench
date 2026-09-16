import { constants, createPublicKey, publicEncrypt } from 'node:crypto';
import { z } from 'zod';

import { ExternalServiceError } from '../domain-errors.js';

/** bilibili-API-collect 文档收录的B站网页端公开加密公钥（用于生成 CorrespondPath）。 */
const CORRESPOND_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDLgd2OAkcGVtoE3ThUREbio0Eg
Uc/prcajMKXvkCKFCWhJYJcLkcM2DKKcSeFpD/j6Boy538YXnR6VhcuUJOhH2x71
nzPjfdTcqMz7djHum0qSZA0AyCBDABUqCrfNgCiJ00Ra7GmRj+YCK1NJEuewlb40
JNrRuoEUXpabUzGB8QIDAQAB
-----END PUBLIC KEY-----`;

const QR_GENERATE_URL = 'https://passport.bilibili.com/x/passport-login/web/qrcode/generate';
const QR_POLL_URL = 'https://passport.bilibili.com/x/passport-login/web/qrcode/poll';
const COOKIE_INFO_URL = 'https://passport.bilibili.com/x/passport-login/web/cookie/info';
const COOKIE_REFRESH_URL = 'https://passport.bilibili.com/x/passport-login/web/cookie/refresh';
const CONFIRM_REFRESH_URL = 'https://passport.bilibili.com/x/passport-login/web/confirm/refresh';
const CORRESPOND_URL = 'https://www.bilibili.com/correspond/1/';

/** 扫码成功后从B站拿到的完整登录态素材。 */
export interface BiliQrLoginMaterial {
  readonly sessdata: string;
  readonly biliJct: string;
  readonly dedeUserId: string | null;
  readonly refreshToken: string;
}

export type BiliQrPollResult =
  | { readonly state: 'waiting' }
  | { readonly state: 'scanned' }
  | { readonly state: 'expired' }
  | { readonly state: 'succeeded'; readonly login: BiliQrLoginMaterial };

export interface BiliQrSession {
  readonly url: string;
  readonly key: string;
}

export interface BiliCookieInfo {
  readonly refresh: boolean;
  readonly timestamp: number;
}

export interface BiliRefreshedCredential {
  readonly sessdata: string;
  readonly biliJct: string;
  readonly dedeUserId: string | null;
  readonly refreshToken: string;
}

export interface BiliPassportClient {
  createQrSession(): Promise<BiliQrSession>;
  pollQrSession(key: string): Promise<BiliQrPollResult>;
  getCookieInfo(cookie: string): Promise<BiliCookieInfo | null>;
  getRefreshCsrf(cookie: string, timestamp: number): Promise<string>;
  refreshCookie(cookie: string, refreshToken: string): Promise<BiliRefreshedCredential>;
  confirmRefresh(oldCookie: string, newBiliJct: string, oldRefreshToken: string): Promise<void>;
}

const qrGenerateSchema = z.object({
  code: z.number().int(),
  data: z.object({ url: z.string().url(), qrcode_key: z.string().min(1).max(128) }).optional(),
});

const qrPollSchema = z.object({
  code: z.number().int(),
  data: z
    .object({
      url: z.string(),
      refresh_token: z.string(),
      code: z.number().int(),
      message: z.string().optional(),
    })
    .optional(),
});

const cookieInfoSchema = z.object({
  code: z.number().int(),
  data: z.object({ refresh: z.boolean(), timestamp: z.number().int().nonnegative() }).optional(),
});

const refreshSchema = z.object({
  code: z.number().int(),
  data: z.object({ refresh_token: z.string().min(1) }).optional(),
});

const confirmSchema = z.object({ code: z.number().int() });

const CORRESPOND_CSRF_PATTERN = /<div id="1-name">([^<]{8,128})<\/div>/u;
const CORRESPOND_PATH_PATTERN = /^[0-9a-f]+$/u;
const MAX_CORRESPOND_BYTES = 256 * 1024;

export interface BiliPassportHttpClientOptions {
  readonly fetcher?: typeof fetch;
  readonly timeoutMs?: number;
  readonly maxResponseBytes?: number;
}

export class BiliPassportHttpClient implements BiliPassportClient {
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxResponseBytes: number;

  public constructor(options: BiliPassportHttpClientOptions = {}) {
    this.fetcher = options.fetcher ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.maxResponseBytes = options.maxResponseBytes ?? 2 * 1024 * 1024;
  }

  public async createQrSession(): Promise<BiliQrSession> {
    const parsed = safeParse(qrGenerateSchema, await this.requestJson(QR_GENERATE_URL));
    if (parsed.code !== 0 || parsed.data === undefined) throw unavailable();
    return { url: parsed.data.url, key: parsed.data.qrcode_key };
  }

  public async pollQrSession(key: string): Promise<BiliQrPollResult> {
    const url = new URL(QR_POLL_URL);
    url.searchParams.set('qrcode_key', key);
    // 不能走 requestJson：成功素材除了 data.url 还可能通过 Set-Cookie 下发，需要保留响应头。
    const response = await this.request(url.toString());
    if (response.status === 429) throw rateLimited();
    if (!response.ok) throw unavailable();
    let raw: unknown;
    try {
      raw = JSON.parse(await this.readBounded(response)) as unknown;
    } catch {
      throw invalidResponse();
    }
    const parsed = safeParse(qrPollSchema, raw);
    if (parsed.code !== 0 || parsed.data === undefined) throw unavailable();
    if (parsed.data.code === 86_101) return { state: 'waiting' };
    if (parsed.data.code === 86_090) return { state: 'scanned' };
    if (parsed.data.code === 86_038) return { state: 'expired' };
    if (parsed.data.code !== 0) throw unavailable();
    const login =
      parseLoginMaterial(parsed.data.url, parsed.data.refresh_token) ??
      loginFromSetCookies(response, parsed.data.refresh_token);
    if (login === null) throw invalidResponse();
    return { state: 'succeeded', login };
  }

  /** 返回 null 表示登录态已失效（-101），由调用方走既有的失效流程。 */
  public async getCookieInfo(cookie: string): Promise<BiliCookieInfo | null> {
    const url = new URL(COOKIE_INFO_URL);
    const biliJct = cookieValue(cookie, 'bili_jct');
    if (biliJct !== null) url.searchParams.set('csrf', biliJct);
    const parsed = safeParse(cookieInfoSchema, await this.requestJson(url.toString(), cookie));
    if (parsed.code === -101) return null;
    if (parsed.code !== 0 || parsed.data === undefined) throw invalidResponse();
    return parsed.data;
  }

  public async getRefreshCsrf(cookie: string, timestamp: number): Promise<string> {
    const path = correspondPath(timestamp);
    const response = await this.request(`${CORRESPOND_URL}${path}`, cookie, 'text/html');
    if (!response.ok) throw unavailable();
    let text: string;
    try {
      text = await this.readBounded(response, MAX_CORRESPOND_BYTES);
    } catch {
      throw invalidResponse();
    }
    const match = CORRESPOND_CSRF_PATTERN.exec(text);
    const csrf = match?.[1];
    if (csrf === undefined) throw invalidResponse();
    return csrf.trim();
  }

  public async refreshCookie(
    cookie: string,
    refreshToken: string,
  ): Promise<BiliRefreshedCredential> {
    const biliJct = cookieValue(cookie, 'bili_jct');
    if (biliJct === null) throw invalidResponse();
    const timestamp = await this.currentTimestamp(cookie);
    const refreshCsrf = await this.getRefreshCsrf(cookie, timestamp);
    const url = new URL(COOKIE_REFRESH_URL);
    url.searchParams.set('csrf', biliJct);
    url.searchParams.set('refresh_csrf', refreshCsrf);
    url.searchParams.set('source', 'main_web');
    url.searchParams.set('refresh_token', refreshToken);
    const response = await this.request(url.toString(), cookie);
    if (response.status === 429) throw rateLimited();
    if (!response.ok) throw unavailable();
    let raw: unknown;
    try {
      raw = JSON.parse(await this.readBounded(response)) as unknown;
    } catch {
      throw invalidResponse();
    }
    const parsed = safeParse(refreshSchema, raw);
    if (parsed.code === -101) throw credentialInvalid();
    if (parsed.code === 86_095) {
      throw new ExternalServiceError('BILI_REFRESH_FAILED', 'B站登录态续期被拒绝');
    }
    if (parsed.code !== 0 || parsed.data === undefined) throw invalidResponse();
    const sessdata = cookieFromSetCookies(response, 'SESSDATA');
    const newBiliJct = cookieFromSetCookies(response, 'bili_jct');
    if (sessdata === null || newBiliJct === null) throw invalidResponse();
    return {
      sessdata,
      biliJct: newBiliJct,
      dedeUserId: cookieFromSetCookies(response, 'DedeUserID'),
      refreshToken: parsed.data.refresh_token,
    };
  }

  public async confirmRefresh(
    oldCookie: string,
    newBiliJct: string,
    oldRefreshToken: string,
  ): Promise<void> {
    const url = new URL(CONFIRM_REFRESH_URL);
    url.searchParams.set('csrf', newBiliJct);
    url.searchParams.set('refresh_token', oldRefreshToken);
    const response = await this.request(url.toString(), oldCookie);
    if (response.status === 429) throw rateLimited();
    if (!response.ok) throw unavailable();
    let raw: unknown;
    try {
      raw = JSON.parse(await this.readBounded(response)) as unknown;
    } catch {
      throw invalidResponse();
    }
    const parsed = safeParse(confirmSchema, raw);
    if (parsed.code !== 0) throw invalidResponse();
  }

  private async currentTimestamp(cookie: string): Promise<number> {
    const info = await this.getCookieInfo(cookie);
    if (info === null) throw credentialInvalid();
    return info.timestamp;
  }

  private async requestJson(url: string, cookie?: string): Promise<unknown> {
    const response = await this.request(url, cookie);
    if (response.status === 429) throw rateLimited();
    if (response.status === 401 || response.status === 403) throw credentialInvalid();
    if (!response.ok) throw unavailable();
    const text = (await this.readBounded(response)) as string;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw invalidResponse();
    }
  }

  private async request(
    url: string,
    cookie?: string,
    accept = 'application/json',
  ): Promise<Response> {
    try {
      return await this.fetcher(url, {
        headers: {
          Accept: accept,
          'User-Agent': 'Mozilla/5.0',
          ...(cookie === undefined ? {} : { Cookie: cookie }),
        },
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
  }

  private async readBounded(
    response: Response,
    limitBytes = this.maxResponseBytes,
  ): Promise<string> {
    const declared = Number(response.headers.get('content-length') ?? 0);
    if (declared > limitBytes) throw responseTooLarge();
    const text = await response.text();
    if (Buffer.byteLength(text) > limitBytes) throw responseTooLarge();
    return text;
  }
}

/** 兜底通道：成功素材不再出现在 data.url 时，从响应 Set-Cookie 提取登录态。 */
function loginFromSetCookies(response: Response, refreshToken: string): BiliQrLoginMaterial | null {
  if (refreshToken === '') return null;
  const sessdata = cookieFromSetCookies(response, 'SESSDATA');
  const biliJct = cookieFromSetCookies(response, 'bili_jct');
  if (sessdata === null || sessdata === '' || biliJct === null || biliJct === '') return null;
  const dedeUserId = cookieFromSetCookies(response, 'DedeUserID');
  return {
    sessdata,
    biliJct,
    dedeUserId: dedeUserId === null || dedeUserId === '' ? null : dedeUserId,
    refreshToken,
  };
}

function parseLoginMaterial(url: string, refreshToken: string): BiliQrLoginMaterial | null {
  if (refreshToken === '') return null;
  try {
    const target = new URL(url);
    const sessdata = target.searchParams.get('SESSDATA');
    const biliJct = target.searchParams.get('bili_jct');
    if (sessdata === null || sessdata === '' || biliJct === null || biliJct === '') return null;
    const dedeUserId = target.searchParams.get('DedeUserID');
    return {
      sessdata,
      biliJct,
      dedeUserId: dedeUserId === null || dedeUserId === '' ? null : dedeUserId,
      refreshToken,
    };
  } catch {
    return null;
  }
}

function cookieValue(cookie: string, name: string): string | null {
  for (const part of cookie.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() === name) return part.slice(separator + 1).trim();
  }
  return null;
}

function cookieFromSetCookies(response: Response, name: string): string | null {
  for (const header of response.headers.getSetCookie()) {
    const separator = header.indexOf('=');
    if (separator === -1) continue;
    if (header.slice(0, separator).trim() !== name) continue;
    const value = header
      .slice(separator + 1)
      .split(';')[0]
      ?.trim();
    return value === undefined || value === '' ? null : value;
  }
  return null;
}

/** CorrespondPath：RSA-OAEP(SHA-256) 加密 `refresh_${timestamp}`，输出小写 hex。 */
export function correspondPath(timestamp: number): string {
  const key = createPublicKey(CORRESPOND_PUBLIC_KEY);
  const encrypted = publicEncrypt(
    { key, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    Buffer.from(`refresh_${timestamp}`, 'utf8'),
  );
  const hex = encrypted.toString('hex');
  if (!CORRESPOND_PATH_PATTERN.test(hex)) throw invalidResponse();
  return hex;
}

function safeParse<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw invalidResponse();
  return parsed.data;
}

function unavailable(): ExternalServiceError {
  return new ExternalServiceError('BILI_UNAVAILABLE', 'B站暂时不可用');
}

function invalidResponse(): ExternalServiceError {
  return new ExternalServiceError('BILI_INVALID_RESPONSE', 'B站返回了无效数据');
}

function rateLimited(): ExternalServiceError {
  return new ExternalServiceError('BILI_RATE_LIMITED', 'B站请求过于频繁，请稍后重试', 429);
}

function credentialInvalid(): ExternalServiceError {
  return new ExternalServiceError('BILI_CREDENTIAL_INVALID', 'B站登录态已失效', 401);
}

function responseTooLarge(): ExternalServiceError {
  return new ExternalServiceError('BILI_RESPONSE_TOO_LARGE', 'B站响应超过安全大小限制');
}
