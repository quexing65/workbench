import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import { ExternalServiceError } from '../src/modules/domain-errors.js';
import { BiliHttpClient } from '../src/modules/learning/bili-client.js';

function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/bili/${name}`, import.meta.url), 'utf8');
}

function clientWith(response: Response) {
  return new BiliHttpClient({ fetcher: vi.fn().mockResolvedValue(response) });
}

describe('BiliHttpClient fixtures', () => {
  it('maps single and multi-part metadata without credentials', async () => {
    const single = await clientWith(new Response(fixture('single-part.json'))).getVideo(
      'BV1ab411c7de',
    );
    expect(single).toMatchObject({
      bvid: 'BV1ab411c7de',
      coverUrl: 'https://i0.hdslb.com/bfs/archive/cover.jpg',
      parts: [{ cid: '101', partNumber: 1, durationSeconds: 600 }],
    });
    const multiple = await clientWith(new Response(fixture('multi-part.json'))).getVideo(
      'BV1xy411c7fg',
    );
    expect(multiple.parts).toHaveLength(2);
    expect(multiple.parts.map(({ cid }) => cid)).toEqual(['201', '200']);
  });

  it('parses ugc_season episodes with arc durations and per-episode parts', async () => {
    const video = await clientWith(new Response(fixture('season.json'))).getVideo('BV1ab411c7de');
    expect(video.season).toMatchObject({
      seasonId: 636182,
      title: '合集课程',
      episodes: [
        {
          bvid: 'BV1ab411c7de',
          title: '00 - 学前必看 ｜合集课程',
          coverUrl: 'https://i0.hdslb.com/bfs/archive/cover-0.jpg',
          uploaderName: '讲师',
          durationSeconds: 67,
          parts: [{ cid: '101', partNumber: 1, durationSeconds: 67 }],
        },
        {
          bvid: 'BV1xy411c7fg',
          durationSeconds: 204,
          parts: [{ cid: '102', partNumber: 1, durationSeconds: 204 }],
        },
        {
          bvid: 'BV1em411c7ty',
          durationSeconds: 180,
          parts: [
            { cid: '103', partNumber: 1, durationSeconds: 90 },
            { cid: '104', partNumber: 2, durationSeconds: 90 },
          ],
        },
      ],
    });
  });

  it('treats a missing, malformed or empty season as null without blocking import', async () => {
    const missing = structuredClone(JSON.parse(fixture('single-part.json')));
    const result = await clientWith(new Response(JSON.stringify(missing))).getVideo('BV1ab411c7de');
    expect(result.season).toBeNull();

    const malformed = structuredClone(JSON.parse(fixture('season.json')));
    malformed.data.ugc_season = { id: 'not-a-number', sections: [] };
    const tolerated = await clientWith(new Response(JSON.stringify(malformed))).getVideo(
      'BV1ab411c7de',
    );
    expect(tolerated.season).toBeNull();
    expect(tolerated.bvid).toBe('BV1ab411c7de');

    const brokenEpisodes = structuredClone(JSON.parse(fixture('season.json')));
    brokenEpisodes.data.ugc_season.sections[0].episodes[1].pages = [];
    brokenEpisodes.data.ugc_season.sections[0].episodes[2].arc = { duration: -1 };
    const partial = await clientWith(new Response(JSON.stringify(brokenEpisodes))).getVideo(
      'BV1ab411c7de',
    );
    // 单集畸形只丢弃该集，其余分集仍可导入
    expect(partial.season?.episodes.map(({ bvid }) => bvid)).toEqual(['BV1ab411c7de']);
  });

  it('rejects mismatched or duplicate metadata and drops unsafe cover URLs', async () => {
    const base = JSON.parse(fixture('single-part.json'));
    const mismatch = structuredClone(base);
    mismatch.data.bvid = 'BV1xy411c7fg';
    await expect(
      clientWith(new Response(JSON.stringify(mismatch))).getVideo('BV1ab411c7de'),
    ).rejects.toMatchObject({ code: 'BILI_INVALID_RESPONSE' });

    const duplicate = structuredClone(base);
    duplicate.data.pages = [duplicate.data.pages[0], duplicate.data.pages[0]];
    await expect(
      clientWith(new Response(JSON.stringify(duplicate))).getVideo('BV1ab411c7de'),
    ).rejects.toMatchObject({ code: 'BILI_INVALID_RESPONSE' });

    const unsafeCover = structuredClone(base);
    unsafeCover.data.pic = 'javascript:alert(1)';
    await expect(
      clientWith(new Response(JSON.stringify(unsafeCover))).getVideo('BV1ab411c7de'),
    ).resolves.toMatchObject({ coverUrl: null });
  });

  it.each([
    ['empty pages', new Response(fixture('empty-pages.json')), 'BILI_EMPTY_PARTS'],
    ['unavailable video', new Response(fixture('unavailable.json')), 'BILI_VIDEO_UNAVAILABLE'],
    ['rate limiting', new Response('', { status: 429 }), 'BILI_RATE_LIMITED'],
    ['server failure', new Response('', { status: 503 }), 'BILI_UNAVAILABLE'],
    ['broken JSON', new Response('{broken'), 'BILI_INVALID_RESPONSE'],
    ['bad shape', new Response('{"code":0,"data":{}}'), 'BILI_INVALID_RESPONSE'],
    [
      'oversized declared response',
      new Response('{}', { headers: { 'Content-Length': '1000' } }),
      'BILI_RESPONSE_TOO_LARGE',
    ],
  ])('returns a safe code for %s', async (label, response, code) => {
    const client = new BiliHttpClient({
      fetcher: vi.fn().mockResolvedValue(response),
      maxResponseBytes: code === 'BILI_RESPONSE_TOO_LARGE' ? 100 : 10_000,
    });
    await expect(
      client.getVideo(label === 'empty pages' ? 'BV1em411c7ty' : 'BV1ab411c7de'),
    ).rejects.toMatchObject({ code });
  });

  it('checks every b23 redirect and resolves within the limit', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: '/second' } }))
      .mockResolvedValueOnce(
        new Response(null, {
          status: 301,
          headers: { Location: 'https://www.bilibili.com/video/BV1ab411c7de/?p=2' },
        }),
      );
    const result = await new BiliHttpClient({ fetcher }).resolveShortUrl('https://b23.tv/first');
    expect(result).toMatchObject({ kind: 'video', bvid: 'BV1ab411c7de', partNumber: 2 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('blocks redirect escapes, missing locations, non-redirects and loops', async () => {
    await expect(
      clientWith(
        new Response(null, { status: 302, headers: { Location: 'https://evil.example/' } }),
      ).resolveShortUrl('https://b23.tv/escape'),
    ).rejects.toMatchObject({ code: 'BILI_REDIRECT_BLOCKED' });
    await expect(
      clientWith(new Response(null, { status: 302 })).resolveShortUrl('https://b23.tv/missing'),
    ).rejects.toMatchObject({ code: 'BILI_SHORT_UNRESOLVED' });
    await expect(
      clientWith(new Response(null, { status: 200 })).resolveShortUrl('https://b23.tv/html'),
    ).rejects.toMatchObject({ code: 'BILI_SHORT_UNRESOLVED' });
    await expect(
      new BiliHttpClient({
        fetcher: vi
          .fn()
          .mockResolvedValue(
            new Response(null, { status: 302, headers: { Location: 'https://b23.tv/loop' } }),
          ),
        maxRedirects: 1,
      }).resolveShortUrl('https://b23.tv/loop'),
    ).rejects.toMatchObject({ code: 'BILI_REDIRECT_LIMIT' });
  });

  it('maps timeout and transport failures without leaking error details', async () => {
    const timeout = new Error('secret URL and token');
    timeout.name = 'TimeoutError';
    await expect(
      new BiliHttpClient({ fetcher: vi.fn().mockRejectedValue(timeout) }).getVideo('BV1ab411c7de'),
    ).rejects.toEqual(expect.objectContaining({ code: 'BILI_TIMEOUT', status: 504 }));
    await expect(
      new BiliHttpClient({ fetcher: vi.fn().mockRejectedValue(new Error('secret')) }).getVideo(
        'BV1ab411c7de',
      ),
    ).rejects.toEqual(expect.objectContaining({ code: 'BILI_UNAVAILABLE', status: 502 }));
  });

  it('passes through already normalized video URLs without network access', async () => {
    const fetcher = vi.fn();
    const result = await new BiliHttpClient({ fetcher }).resolveShortUrl(
      'https://www.bilibili.com/video/BV1ab411c7de/',
    );
    expect(result.kind).toBe('video');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('exposes typed safe external failures', () => {
    expect(new ExternalServiceError('SAFE', 'safe')).toMatchObject({ status: 502 });
  });
});
