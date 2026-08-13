import { describe, expect, it, vi } from 'vitest';

import { BiliSessionHttpClient } from '../src/modules/bili/session-client.js';

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('BiliSessionHttpClient', () => {
  it('verifies a credential without exposing it in the URL', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ code: 0, data: { isLogin: true } }));
    const client = new BiliSessionHttpClient({ fetcher });
    expect(await client.verifyCredential('verification-sentinel')).toBe(true);
    expect(fetcher.mock.calls[0]?.[0]).not.toContain('verification-sentinel');
    expect(fetcher.mock.calls[0]?.[1]?.headers).toEqual(
      expect.objectContaining({ Cookie: 'SESSDATA=verification-sentinel' }),
    );
  });

  it('maps multi-part legacy history and a completed part', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          code: 0,
          data: [
            {
              bvid: 'BV1AB411C7mD',
              progress: 80,
              view_at: 1_786_588_800,
              page: { page: 2 },
            },
            {
              history: { bvid: 'BV1AB411C7mD', page: 3 },
              progress: -1,
              view_at: 1_786_588_900,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { list: [] } }));
    const client = new BiliSessionHttpClient({ fetcher });
    await expect(client.getHistory('history-sentinel', 3)).resolves.toEqual([
      {
        bvid: 'BV1AB411C7mD',
        partNumber: 2,
        progressSeconds: 80,
        observedAt: '2026-08-13T02:40:00.000Z',
      },
      {
        bvid: 'BV1AB411C7mD',
        partNumber: 3,
        progressSeconds: -1,
        observedAt: '2026-08-13T02:41:40.000Z',
      },
    ]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('falls back to the fixed cursor endpoint after a first-page legacy failure', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ code: -404 }))
      .mockResolvedValueOnce(
        jsonResponse({
          code: 0,
          data: {
            list: [
              {
                bvid: 'BV1AB411C7mD',
                progress: 12,
                view_at: 1_786_588_800,
                page: 1,
              },
            ],
          },
        }),
      );
    const client = new BiliSessionHttpClient({ fetcher });
    await expect(client.getHistory('cursor-sentinel', 3)).resolves.toHaveLength(1);
    expect(String(fetcher.mock.calls[1]?.[0])).toBe(
      'https://api.bilibili.com/x/web-interface/history/cursor?max=0&view_at=0&ps=100',
    );
  });

  it('keeps first-page observations when a later legacy page fails', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          code: 0,
          data: [
            {
              bvid: 'BV1AB411C7mD',
              progress: 20,
              view_at: 1_786_588_800,
              page: 1,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ code: -509 }));
    await expect(
      new BiliSessionHttpClient({ fetcher }).getHistory('partial-sentinel', 3),
    ).resolves.toHaveLength(1);
  });

  it.each([
    [429, 'BILI_RATE_LIMITED'],
    [401, 'BILI_CREDENTIAL_INVALID'],
    [500, 'BILI_UNAVAILABLE'],
  ] as const)('maps HTTP %i to a safe error', async (status, code) => {
    const client = new BiliSessionHttpClient({
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status })),
    });
    await expect(client.getHistory('error-sentinel', 1)).rejects.toMatchObject({ code });
  });

  it.each([
    [new Error('network detail'), 'BILI_UNAVAILABLE'],
    [Object.assign(new Error('timeout detail'), { name: 'TimeoutError' }), 'BILI_TIMEOUT'],
  ] as const)('maps transport failures to a safe code', async (error, code) => {
    const client = new BiliSessionHttpClient({
      fetcher: vi.fn<typeof fetch>().mockRejectedValue(error),
    });
    await expect(client.verifyCredential('transport-sentinel')).rejects.toMatchObject({ code });
  });
});
