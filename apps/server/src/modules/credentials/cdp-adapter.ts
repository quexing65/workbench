import type { BiliBrowser } from '@workbench/shared';
import { z } from 'zod';

import { ExternalServiceError } from '../domain-errors.js';
import {
  WindowsBrowserProcessController,
  type BrowserProcessController,
} from './browser-process.js';
import { WebSocketCdpCookieReader, type CdpCookieReader } from './cdp-cookie.js';

const FIRST_PORT = 9222;
const LAST_PORT = 9230;
const RESTART_PORT = 9224;
const MAX_VERSION_BYTES = 64 * 1024;
const versionSchema = z.object({
  Browser: z.string(),
  webSocketDebuggerUrl: z.string().url(),
});

export type BrowserCredentialResult =
  | { readonly kind: 'found'; readonly sessdata: string }
  | { readonly kind: 'restartRequired' };

export interface BrowserCredentialAdapter {
  fetch(browser: BiliBrowser, forceRestart: boolean): Promise<BrowserCredentialResult>;
}

export interface LocalCdpAdapterOptions {
  readonly fetcher?: typeof fetch;
  readonly cookies?: CdpCookieReader;
  readonly processes?: BrowserProcessController;
  readonly discoveryTimeoutMs?: number;
  readonly restartWaitMs?: number;
}

export class LocalCdpAdapter implements BrowserCredentialAdapter {
  private readonly fetcher: typeof fetch;
  private readonly cookies: CdpCookieReader;
  private readonly processes: BrowserProcessController;
  private readonly discoveryTimeoutMs: number;
  private readonly restartWaitMs: number;

  public constructor(options: LocalCdpAdapterOptions = {}) {
    this.fetcher = options.fetcher ?? fetch;
    this.cookies = options.cookies ?? new WebSocketCdpCookieReader();
    this.processes = options.processes ?? new WindowsBrowserProcessController();
    this.discoveryTimeoutMs = options.discoveryTimeoutMs ?? 500;
    this.restartWaitMs = options.restartWaitMs ?? 5_000;
  }

  public async fetch(browser: BiliBrowser, forceRestart: boolean): Promise<BrowserCredentialResult> {
    let target = await this.discover(browser);
    if (target === null) {
      if (!forceRestart) return { kind: 'restartRequired' };
      await this.processes.restart(browser, RESTART_PORT);
      target = await this.waitForTarget(browser);
    }
    const sessdata = await this.cookies.readSessdata(target);
    if (sessdata === null || sessdata === '') {
      throw new ExternalServiceError('BILI_CREDENTIAL_NOT_FOUND', '浏览器中没有可用的 B站登录态', 404);
    }
    return { kind: 'found', sessdata };
  }

  private async waitForTarget(browser: BiliBrowser): Promise<string> {
    const deadline = Date.now() + this.restartWaitMs;
    while (Date.now() < deadline) {
      const target = await this.discover(browser);
      if (target !== null) return target;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    throw new ExternalServiceError('CDP_UNAVAILABLE', '浏览器调试连接未就绪', 504);
  }

  private async discover(browser: BiliBrowser): Promise<string | null> {
    for (let port = FIRST_PORT; port <= LAST_PORT; port += 1) {
      try {
        const response = await this.fetcher(`http://127.0.0.1:${port}/json/version`, {
          headers: { Accept: 'application/json' },
          redirect: 'error',
          signal: AbortSignal.timeout(this.discoveryTimeoutMs),
        });
        if (!response.ok) continue;
        const declared = Number(response.headers.get('content-length') ?? 0);
        if (declared > MAX_VERSION_BYTES) continue;
        const text = await response.text();
        if (Buffer.byteLength(text) > MAX_VERSION_BYTES) continue;
        const parsed = versionSchema.safeParse(JSON.parse(text) as unknown);
        if (!parsed.success || !matchesBrowser(parsed.data.Browser, browser)) continue;
        const target = new URL(parsed.data.webSocketDebuggerUrl);
        if (
          target.protocol !== 'ws:' ||
          !['127.0.0.1', 'localhost'].includes(target.hostname) ||
          Number(target.port) !== port ||
          target.username !== '' ||
          target.password !== ''
        ) {
          continue;
        }
        return target.toString();
      } catch {
        // A closed local port is expected during bounded discovery.
      }
    }
    return null;
  }
}

function matchesBrowser(identity: string, browser: BiliBrowser): boolean {
  return browser === 'edge'
    ? identity.includes('Edg/') || identity.includes('Microsoft Edge')
    : identity.startsWith('Chrome/') && !identity.includes('Edg/');
}
