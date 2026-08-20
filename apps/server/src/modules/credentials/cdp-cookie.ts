import { z } from 'zod';

import { ExternalServiceError } from '../domain-errors.js';

const cdpResponseSchema = z.object({
  id: z.number().int(),
  result: z
    .object({
      cookies: z.array(
        z.object({ name: z.string(), value: z.string().max(4096), domain: z.string() }),
      ),
    })
    .optional(),
  error: z.unknown().optional(),
});

export interface CdpCookieReader {
  readSessdata(webSocketUrl: string): Promise<string | null>;
}

export interface CdpSocket {
  close(): void;
  send(data: string): void;
  addEventListener(type: 'open' | 'error', listener: () => void): void;
  addEventListener(type: 'message', listener: (event: { readonly data: unknown }) => void): void;
}

export type CdpSocketFactory = (url: string) => CdpSocket;

export class WebSocketCdpCookieReader implements CdpCookieReader {
  public constructor(
    private readonly timeoutMs = 3_000,
    private readonly createSocket: CdpSocketFactory = (url) =>
      new WebSocket(url) as unknown as CdpSocket,
  ) {}

  public readSessdata(webSocketUrl: string): Promise<string | null> {
    return new Promise((resolve, reject) => {
      const socket = this.createSocket(webSocketUrl);
      const timer = setTimeout(() => fail(), this.timeoutMs);
      let settled = false;
      const fail = () => finish(undefined, true);
      const finish = (value?: string | null, failed = false) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.close();
        if (failed) reject(new ExternalServiceError('CDP_UNAVAILABLE', '无法读取浏览器登录态'));
        else resolve(value ?? null);
      };
      socket.addEventListener('open', () => {
        socket.send(JSON.stringify({ id: 1, method: 'Network.getAllCookies' }));
      });
      socket.addEventListener('error', fail);
      socket.addEventListener('message', (event) => {
        if (typeof event.data !== 'string' || event.data.length > 2 * 1024 * 1024) return fail();
        let raw: unknown;
        try {
          raw = JSON.parse(event.data);
        } catch {
          return fail();
        }
        const parsed = cdpResponseSchema.safeParse(raw);
        if (!parsed.success || parsed.data.id !== 1 || parsed.data.result === undefined) {
          return fail();
        }
        const cookie = parsed.data.result.cookies.find(
          ({ name, domain }) =>
            name === 'SESSDATA' &&
            (domain === 'bilibili.com' || domain === '.bilibili.com' || domain.endsWith('.bilibili.com')),
        );
        finish(cookie?.value ?? null);
      });
    });
  }
}
