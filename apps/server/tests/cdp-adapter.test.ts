import { describe, expect, it, vi } from 'vitest';

import type { BrowserProcessController } from '../src/modules/credentials/browser-process.js';
import type { CdpCookieReader } from '../src/modules/credentials/cdp-cookie.js';
import { LocalCdpAdapter } from '../src/modules/credentials/cdp-adapter.js';

describe('LocalCdpAdapter', () => {
  it('connects to an allowlisted existing Edge target without restarting it', async () => {
    const fetcher = vi.fn<typeof fetch>(async (url) => {
      if (String(url).includes(':9224/')) {
        return new Response(
          JSON.stringify({
            Browser: 'Edg/140.0',
            webSocketDebuggerUrl: 'ws://127.0.0.1:9224/devtools/browser/test',
          }),
        );
      }
      throw new Error('closed');
    });
    const processes: BrowserProcessController = { restart: vi.fn() };
    const cookies: CdpCookieReader = { readSessdata: vi.fn().mockResolvedValue('cdp-sentinel') };
    const adapter = new LocalCdpAdapter({ fetcher, processes, cookies });

    await expect(adapter.fetch('edge', false)).resolves.toEqual({
      kind: 'found',
      sessdata: 'cdp-sentinel',
    });
    expect(processes.restart).not.toHaveBeenCalled();
  });

  it('reports restart required without process actions when no target exists', async () => {
    const processes: BrowserProcessController = { restart: vi.fn() };
    const adapter = new LocalCdpAdapter({
      fetcher: vi.fn<typeof fetch>().mockRejectedValue(new Error('closed')),
      processes,
    });
    await expect(adapter.fetch('edge', false)).resolves.toEqual({ kind: 'restartRequired' });
    expect(processes.restart).not.toHaveBeenCalled();
  });

  it('rejects a remote or mismatched browser target', async () => {
    const cookies: CdpCookieReader = { readSessdata: vi.fn() };
    const adapter = new LocalCdpAdapter({
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(
        new Response(
          JSON.stringify({
            Browser: 'Chrome/140.0',
            webSocketDebuggerUrl: 'ws://example.com:9222/devtools/browser/test',
          }),
        ),
      ),
      cookies,
    });
    await expect(adapter.fetch('edge', false)).resolves.toEqual({ kind: 'restartRequired' });
    expect(cookies.readSessdata).not.toHaveBeenCalled();
  });

  it('restarts only after force confirmation and waits for a matching target', async () => {
    let calls = 0;
    const fetcher = vi.fn<typeof fetch>(async () => {
      calls += 1;
      if (calls <= 9) throw new Error('closed');
      return new Response(
        JSON.stringify({
          Browser: 'Edg/140.0',
          webSocketDebuggerUrl: 'ws://localhost:9222/devtools/browser/test',
        }),
      );
    });
    const processes: BrowserProcessController = { restart: vi.fn().mockResolvedValue(undefined) };
    const cookies: CdpCookieReader = { readSessdata: vi.fn().mockResolvedValue('restart-value') };
    const adapter = new LocalCdpAdapter({ fetcher, processes, cookies, restartWaitMs: 500 });
    await expect(adapter.fetch('edge', true)).resolves.toEqual({
      kind: 'found',
      sessdata: 'restart-value',
    });
    expect(processes.restart).toHaveBeenCalledWith('edge', 9224);
  });

  it('reports safe errors for restart timeout and a missing cookie', async () => {
    const processes: BrowserProcessController = { restart: vi.fn().mockResolvedValue(undefined) };
    const closed = new LocalCdpAdapter({
      fetcher: vi.fn<typeof fetch>().mockRejectedValue(new Error('closed')),
      processes,
      restartWaitMs: 0,
    });
    await expect(closed.fetch('edge', true)).rejects.toMatchObject({ code: 'CDP_UNAVAILABLE' });

    const noCookie = new LocalCdpAdapter({
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(
        new Response(
          JSON.stringify({
            Browser: 'Chrome/140.0',
            webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/browser/test',
          }),
        ),
      ),
      cookies: { readSessdata: vi.fn().mockResolvedValue(null) },
    });
    await expect(noCookie.fetch('chrome', false)).rejects.toMatchObject({
      code: 'BILI_CREDENTIAL_NOT_FOUND',
    });
  });

  it('skips unsafe discovery responses and continues to a valid local target', async () => {
    let portCall = 0;
    const fetcher = vi.fn<typeof fetch>(async () => {
      portCall += 1;
      if (portCall === 1) return new Response('', { status: 500 });
      if (portCall === 2) {
        return new Response('{}', { headers: { 'Content-Length': '70000' } });
      }
      if (portCall === 3) return new Response('A'.repeat(70_000));
      if (portCall === 4) return new Response('{broken');
      if (portCall === 5) {
        return new Response(
          JSON.stringify({
            Browser: 'Edg/140.0',
            webSocketDebuggerUrl: 'ws://127.0.0.1:9230/devtools/browser/wrong-port',
          }),
        );
      }
      return new Response(
        JSON.stringify({
          Browser: 'Edg/140.0',
          webSocketDebuggerUrl: 'ws://127.0.0.1:9227/devtools/browser/valid',
        }),
      );
    });
    const cookies: CdpCookieReader = { readSessdata: vi.fn().mockResolvedValue('safe-value') };
    const adapter = new LocalCdpAdapter({ fetcher, cookies });
    await expect(adapter.fetch('edge', false)).resolves.toEqual({
      kind: 'found',
      sessdata: 'safe-value',
    });
    expect(fetcher).toHaveBeenCalledTimes(6);
  });
});
