import type {
  BiliCredentialStatus,
  FetchBiliCredentialInput,
  SaveBiliCredentialInput,
} from '@workbench/shared';

import type { BiliSessionClient } from '../bili/session-client.js';
import { DomainConflictError, ExternalServiceError } from '../domain-errors.js';
import type { BrowserCredentialAdapter } from './cdp-adapter.js';
import type { BiliCredentialStore } from './store.js';

const ABSENT: BiliCredentialStatus = { present: false, valid: false, userLabel: '未连接' };
const VALID: BiliCredentialStatus = { present: true, valid: true, userLabel: '已连接' };
const INVALID: BiliCredentialStatus = {
  present: true,
  valid: false,
  userLabel: '登录态已失效',
};

export class CredentialService {
  public constructor(
    private readonly store: BiliCredentialStore,
    private readonly bili: BiliSessionClient,
    private readonly browser: BrowserCredentialAdapter,
  ) {}

  public async status(): Promise<BiliCredentialStatus> {
    const sessdata = await this.store.read();
    if (sessdata === null) return ABSENT;
    if (!isSafeCredential(sessdata)) return INVALID;
    try {
      return (await this.bili.verifyCredential(sessdata)) ? VALID : INVALID;
    } catch (error) {
      if (error instanceof ExternalServiceError && error.code === 'BILI_CREDENTIAL_INVALID') {
        return INVALID;
      }
      throw error;
    }
  }

  public async save(input: SaveBiliCredentialInput): Promise<BiliCredentialStatus> {
    await this.verifyAndWrite(input.sessdata);
    return VALID;
  }

  public async clear(): Promise<void> {
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
    await this.verifyAndWrite(result.sessdata);
    return VALID;
  }

  private async verifyAndWrite(sessdata: string): Promise<void> {
    if (!isSafeCredential(sessdata)) {
      throw new ExternalServiceError('BILI_CREDENTIAL_INVALID', 'B站登录态格式无效', 401);
    }
    if (!(await this.bili.verifyCredential(sessdata))) {
      throw new ExternalServiceError('BILI_CREDENTIAL_INVALID', 'B站登录态已失效', 401);
    }
    await this.store.write(sessdata);
  }
}

export function isSafeCredential(value: string): boolean {
  return value.length >= 1 && value.length <= 4096 && !/[\u0000-\u001f\u007f;]/u.test(value);
}
