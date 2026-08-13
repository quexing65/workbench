import { describe, expect, it, vi } from 'vitest';

import { WebSocketCdpCookieReader, type CdpSocket } from '../src/modules/credentials/cdp-cookie.js';

class FakeSocket implements CdpSocket {
  public readonly close = vi.fn();
  public readonly send = vi.fn();
  private readonly listeners = new Map<string, Array<(event?: { data: unknown }) => void>>();

  public addEventListener(
    type: 'open' | 'error' | 'message',
    listener: (() => void) | ((event: { readonly data: unknown }) => void),
  ): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener as (event?: { data: unknown }) => void);
    this.listeners.set(type, listeners);
  }

  public emit(type: 'open' | 'error'): void;
  public emit(type: 'message', data: unknown): void;
  public emit(type: 'open' | 'error' | 'message', data?: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(type === 'message' ? { data } : undefined);
    }
  }
}

describe('WebSocketCdpCookieReader', () => {
  it('requests cookies and picks only a Bilibili SESSDATA value', async () => {
    const socket = new FakeSocket();
    const reader = new WebSocketCdpCookieReader(100, () => socket);
    const result = reader.readSessdata('ws://127.0.0.1:9222/devtools/browser/test');
    socket.emit('open');
    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({ id: 1, method: 'Network.getAllCookies' }),
    );
    socket.emit(
      'message',
      JSON.stringify({
        id: 1,
        result: {
          cookies: [
            { name: 'SESSDATA', value: 'wrong-domain', domain: 'example.com' },
            { name: 'other', value: 'ignored', domain: '.bilibili.com' },
            { name: 'SESSDATA', value: 'cdp-cookie-value', domain: '.www.bilibili.com' },
          ],
        },
      }),
    );
    await expect(result).resolves.toBe('cdp-cookie-value');
    expect(socket.close).toHaveBeenCalledTimes(1);
  });

  it('returns null when the response contains no matching cookie', async () => {
    const socket = new FakeSocket();
    const result = new WebSocketCdpCookieReader(100, () => socket).readSessdata(
      'ws://127.0.0.1:9222/devtools/browser/test',
    );
    socket.emit('message', JSON.stringify({ id: 1, result: { cookies: [] } }));
    await expect(result).resolves.toBeNull();
  });

  it.each([42, '{broken', JSON.stringify({ id: 2, result: { cookies: [] } })])(
    'rejects malformed CDP messages safely',
    async (message) => {
      const socket = new FakeSocket();
      const result = new WebSocketCdpCookieReader(100, () => socket).readSessdata(
        'ws://127.0.0.1:9222/devtools/browser/test',
      );
      socket.emit('message', message);
      await expect(result).rejects.toMatchObject({ code: 'CDP_UNAVAILABLE' });
    },
  );

  it('rejects socket errors and timeouts with the same safe error', async () => {
    const errorSocket = new FakeSocket();
    const errored = new WebSocketCdpCookieReader(100, () => errorSocket).readSessdata(
      'ws://127.0.0.1:9222/devtools/browser/test',
    );
    errorSocket.emit('error');
    await expect(errored).rejects.toMatchObject({ code: 'CDP_UNAVAILABLE' });

    const timeoutSocket = new FakeSocket();
    const timedOut = new WebSocketCdpCookieReader(1, () => timeoutSocket).readSessdata(
      'ws://127.0.0.1:9222/devtools/browser/test',
    );
    await expect(timedOut).rejects.toMatchObject({ code: 'CDP_UNAVAILABLE' });
  });
});
