const BVID = /^BV[0-9A-Za-z]{10}$/u;

export interface NormalizedBiliUrl {
  readonly kind: 'video' | 'short';
  readonly url: string;
  readonly bvid: string | null;
  readonly partNumber: number;
}

export function isAllowedBiliHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return lower === 'bilibili.com' || lower.endsWith('.bilibili.com') || lower === 'b23.tv';
}

export function normalizeBiliUrl(value: string): NormalizedBiliUrl {
  const trimmed = value.trim();
  if (BVID.test(trimmed)) {
    return {
      kind: 'video',
      url: `https://www.bilibili.com/video/${trimmed}/?p=1`,
      bvid: trimmed,
      partNumber: 1,
    };
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new RangeError('B站链接无效');
  }
  if (url.protocol !== 'https:' || !isAllowedBiliHostname(url.hostname)) {
    throw new RangeError('只允许 HTTPS B站链接');
  }

  const partValue = url.searchParams.get('p');
  const partNumber = partValue === null ? 1 : Number(partValue);
  if (!Number.isSafeInteger(partNumber) || partNumber < 1) {
    throw new RangeError('分P编号无效');
  }

  if (url.hostname.toLowerCase() === 'b23.tv') {
    const path = url.pathname.replace(/\/+$/u, '') || '/';
    return {
      kind: 'short',
      url: `https://b23.tv${path}`,
      bvid: null,
      partNumber,
    };
  }

  const segment = url.pathname.split('/').find((part) => BVID.test(part));
  if (segment === undefined) throw new RangeError('链接中缺少有效 BVID');
  return {
    kind: 'video',
    url: `https://www.bilibili.com/video/${segment}/?p=${partNumber}`,
    bvid: segment,
    partNumber,
  };
}
