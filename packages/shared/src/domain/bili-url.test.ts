import { describe, expect, it } from 'vitest';

import { isAllowedBiliHostname, normalizeBiliUrl } from './bili-url.js';

describe('Bilibili URL normalization', () => {
  it('normalizes a bare BVID without requiring a URL wrapper', () => {
    expect(normalizeBiliUrl('  BV1ab411c7de  ')).toEqual({
      kind: 'video',
      url: 'https://www.bilibili.com/video/BV1ab411c7de/?p=1',
      bvid: 'BV1ab411c7de',
      partNumber: 1,
    });
  });

  it('normalizes a video URL and preserves a valid part number', () => {
    expect(
      normalizeBiliUrl('https://m.bilibili.com/video/BV1ab411c7de/?p=2&spm_id_from=tracking'),
    ).toEqual({
      kind: 'video',
      url: 'https://www.bilibili.com/video/BV1ab411c7de/?p=2',
      bvid: 'BV1ab411c7de',
      partNumber: 2,
    });
  });

  it('normalizes b23 links without following redirects', () => {
    expect(normalizeBiliUrl('https://b23.tv/AbCd12/?utm_source=x')).toEqual({
      kind: 'short',
      url: 'https://b23.tv/AbCd12',
      bvid: null,
      partNumber: 1,
    });
  });

  it.each([
    'http://www.bilibili.com/video/BV1ab411c7de',
    'https://evil.example/video/BV1ab411c7de',
    'https://bilibili.com.evil.example/video/BV1ab411c7de',
    'https://www.bilibili.com/video/not-a-bvid',
    'https://www.bilibili.com/video/BV1ab411c7de?p=0',
    'not a URL',
  ])('rejects unsafe or malformed URL %s', (url) => {
    expect(() => normalizeBiliUrl(url)).toThrow(RangeError);
  });

  it('uses an exact/subdomain allowlist', () => {
    expect(isAllowedBiliHostname('bilibili.com')).toBe(true);
    expect(isAllowedBiliHostname('WWW.BILIBILI.COM')).toBe(true);
    expect(isAllowedBiliHostname('b23.tv')).toBe(true);
    expect(isAllowedBiliHostname('notbilibili.com')).toBe(false);
  });
});
