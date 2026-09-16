import type {
  BiliCredentialStatus,
  BiliQrLoginStartResponse,
  BiliQrLoginStatus,
  FetchBiliCredentialInput,
  SaveBiliCredentialInput,
} from '@workbench/shared';
import { toDataURL } from 'qrcode';

import type { BiliPassportClient, BiliQrPollResult } from '../bili/passport-client.js';
import type { BiliSessionClient } from '../bili/session-client.js';
import { DomainConflictError, ExternalServiceError } from '../domain-errors.js';
import type { BrowserCredentialAdapter } from './cdp-adapter.js';
import type { BiliCredentialRecord } from './credential-record.js';
import { decodeRecord, encodeRecord, isSafeToken } from './credential-record.js';
import type { BiliCredentialStore } from './store.js';

const ABSENT: BiliCredentialStatus = { present: false, valid: false, userLabel: '未连接' };
const VALID: BiliCredentialStatus = { present: true, valid: true, userLabel: '已连接' };
const INVALID: BiliCredentialStatus = {
  present: true,
  valid: false,
  userLabel: '登录态已失效',
};

/** 与浏览器「每日首次访问检查一次」的续期节奏对齐，同时避免频繁刷新触发风控。 */
const REFRESH_CHECK_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/** bilibili 官方二维码密钥有效期（文档口径 180 秒）。 */
const QR_KEY_TTL_MS = 180_000;
/** 距真实有效期不足该余量时不采信B站返回的「已失效」，防止风控误报换掉在扫的码。 */
const QR_EXPIRY_TRUST_MARGIN_MS = 15_000;
/** 轮询遭遇网络故障后的补试间隔。 */
const QR_POLL_RETRY_DELAY_MS = 500;

interface QrLoginSession {
  readonly key: string;
  readonly qrImage: string;
  readonly createdAt: number;
}

async function renderQrImage(text: string): Promise<string> {
  return toDataURL(text, { margin: 1, width: 240 });
}

export interface CredentialServiceOptions {
  readonly renderQr?: (text: string) => Promise<string>;
  readonly now?: () => number;
}

export class CredentialService {
  private qrSession: QrLoginSession | null = null;
  private lastRefreshCheckAt = 0;
  private readonly now: () => number;
  private readonly renderQr: (text: string) => Promise<string>;

  public constructor(
    private readonly store: BiliCredentialStore,
    private readonly bili: BiliSessionClient,
    private readonly browser: BrowserCredentialAdapter,
    private readonly passport: BiliPassportClient,
    options: CredentialServiceOptions = {},
  ) {
    this.renderQr = options.renderQr ?? renderQrImage;
    this.now = options.now ?? Date.now;
  }

  public async status(): Promise<BiliCredentialStatus> {
    await this.ensureFreshCredential();
    const record = await this.readRecord();
    if (record === null) return ABSENT;
    if (!isSafeCredential(record.sessdata)) return INVALID;
    try {
      return (await this.bili.verifyCredential(record.sessdata)) ? VALID : INVALID;
    } catch (error) {
      if (error instanceof ExternalServiceError && error.code === 'BILI_CREDENTIAL_INVALID') {
        return INVALID;
      }
      throw error;
    }
  }

  public async save(input: SaveBiliCredentialInput): Promise<BiliCredentialStatus> {
    await this.verifyAndWriteRecord({ sessdata: input.sessdata });
    return VALID;
  }

  public async clear(): Promise<void> {
    this.qrSession = null;
    await this.store.clear();
  }

  public async fetch(input: FetchBiliCredentialInput): Promise<BiliCredentialStatus> {
    if (input.forceRestart && input.confirmation !== 'restart-browser') {
      throw new DomainConflictError(
        'BROWSER_RESTART_CONFIRMATION_REQUIRED',
        '重新启动浏览器需要再次明确确认',
      );
    }
    const result = await this.browser.fetch(input.browser, input.forceRestart);
    if (result.kind === 'restartRequired') {
      throw new DomainConflictError(
        'BROWSER_RESTART_REQUIRED',
        '需要重新启动所选浏览器后才能读取登录态',
      );
    }
    if (!isSafeCredential(result.sessdata)) {
      throw new ExternalServiceError('BILI_CREDENTIAL_INVALID', '浏览器登录态格式无效', 401);
    }
    await this.verifyAndWriteRecord({ sessdata: result.sessdata });
    return VALID;
  }

  public async startQrLogin(): Promise<BiliQrLoginStartResponse> {
    const session = await this.passport.createQrSession();
    const qrImage = await this.renderQr(session.url);
    this.qrSession = { key: session.key, qrImage, createdAt: this.now() };
    return { qrImage };
  }

  public async pollQrLogin(): Promise<BiliQrLoginStatus> {
    const session = this.qrSession;
    if (session === null) return { state: 'absent' };
    const result = await this.pollSessionWithRetry(session.key);
    if (result.state === 'waiting' || result.state === 'scanned') {
      return { state: result.state };
    }
    if (result.state === 'expired') {
      // 密钥未到真实有效期就返回「已失效」，多为风控误报或确认结果已被网络
      // 抖动吞掉：保留原 key 继续轮询，避免把用户正在扫的码换掉。
      if (this.now() - session.createdAt < QR_KEY_TTL_MS - QR_EXPIRY_TRUST_MARGIN_MS) {
        return { state: 'waiting' };
      }
      return { state: 'expired' };
    }
    this.qrSession = null;
    if (!isSafeCredential(result.login.sessdata)) {
      throw new ExternalServiceError('BILI_CREDENTIAL_INVALID', '扫码登录态格式无效', 401);
    }
    await this.verifyAndWriteRecord({
      sessdata: result.login.sessdata,
      biliJct: result.login.biliJct,
      refreshToken: result.login.refreshToken,
      dedeUserId: result.login.dedeUserId ?? undefined,
    });
    return { state: 'succeeded', credential: VALID };
  }

  /** 网络故障时立刻补试一次：扫码确认的结果只体现在轮询响应里，
   * 一次瞬断就可能把登录凭证永远卡在被吞掉的那次请求上。 */
  private async pollSessionWithRetry(key: string): Promise<BiliQrPollResult> {
    try {
      return await this.passport.pollQrSession(key);
    } catch (error) {
      if (
        !(error instanceof ExternalServiceError) ||
        (error.code !== 'BILI_UNAVAILABLE' && error.code !== 'BILI_TIMEOUT')
      ) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, QR_POLL_RETRY_DELAY_MS));
      return this.passport.pollQrSession(key);
    }
  }

  /**
   * Cookie 自动续期：仅扫码登录写入的记录带刷新材料。尽力而为——任何失败都不影响
   * 当前登录态的使用，冷却在尝试时即推进，避免持续失败时反复请求B站。
   */
  public async ensureFreshCredential(): Promise<void> {
    if (this.now() - this.lastRefreshCheckAt < REFRESH_CHECK_COOLDOWN_MS) return;
    this.lastRefreshCheckAt = this.now();
    try {
      const record = await this.readRecord();
      if (record?.biliJct === undefined || record.refreshToken === undefined) return;
      const cookie = cookieHeader(record);
      const info = await this.passport.getCookieInfo(cookie);
      if (info === null || !info.refresh) return;
      const refreshed = await this.passport.refreshCookie(cookie, record.refreshToken);
      if (!isSafeCredential(refreshed.sessdata)) return;
      if (!(await this.bili.verifyCredential(refreshed.sessdata))) return;
      await this.store.write(
        encodeRecord({
          sessdata: refreshed.sessdata,
          biliJct: refreshed.biliJct,
          refreshToken: refreshed.refreshToken,
          dedeUserId: refreshed.dedeUserId ?? undefined,
        }),
      );
      // 换发成功并落盘后才作废旧凭证；confirm 失败仅意味着旧 cookie 暂时仍有效。
      await this.passport.confirmRefresh(cookie, refreshed.biliJct, record.refreshToken).catch(
        () => undefined,
      );
    } catch {
      // 静默放弃本轮续期，等下个冷却窗口。
    }
  }

  private async readRecord(): Promise<BiliCredentialRecord | null> {
    return decodeRecord(await this.store.read());
  }

  private async verifyAndWriteRecord(record: BiliCredentialRecord): Promise<void> {
    if (
      !isSafeCredential(record.sessdata) ||
      (record.biliJct !== undefined && !isSafeToken(record.biliJct)) ||
      (record.refreshToken !== undefined && !isSafeToken(record.refreshToken)) ||
      (record.dedeUserId !== undefined && !isSafeToken(record.dedeUserId))
    ) {
      throw new ExternalServiceError('BILI_CREDENTIAL_INVALID', 'B站登录态格式无效', 401);
    }
    if (!(await this.bili.verifyCredential(record.sessdata))) {
      throw new ExternalServiceError('BILI_CREDENTIAL_INVALID', 'B站登录态已失效', 401);
    }
    await this.store.write(encodeRecord(record));
  }
}

function cookieHeader(record: BiliCredentialRecord): string {
  const parts = [`SESSDATA=${record.sessdata}`, `bili_jct=${record.biliJct}`];
  if (record.dedeUserId !== undefined) parts.push(`DedeUserID=${record.dedeUserId}`);
  return parts.join('; ');
}

export function isSafeCredential(value: string): boolean {
  return value.length >= 1 && value.length <= 4096 && !/[\u0000-\u001f\u007f;]/u.test(value);
}
