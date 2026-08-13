import type { QoderPart } from '../contracts.js';

const MAX_PAGES_JSON_CHARS = 2 * 1024 * 1024;
const MAX_PARTS = 500;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function parseQoderPages(value: string): QoderPart[] {
  if (value.length > MAX_PAGES_JSON_CHARS) throw new RangeError('pages_json 超过安全上限');
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new RangeError('pages_json 不是有效 JSON');
  }
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > MAX_PARTS) {
    throw new RangeError('pages_json 分P数量无效');
  }
  const pages = parsed.map((item) => {
    if (!record(item)) throw new RangeError('pages_json 分P结构无效');
    const partNumber = item['page'];
    const durationSeconds = item['duration'];
    const externalPartId = String(item['cid'] ?? '').trim();
    const title = String(item['part'] ?? '').trim();
    if (
      !Number.isSafeInteger(partNumber) ||
      Number(partNumber) < 1 ||
      !Number.isSafeInteger(durationSeconds) ||
      Number(durationSeconds) < 0 ||
      externalPartId.length === 0 ||
      externalPartId.length > 200 ||
      title.length === 0 ||
      title.length > 500
    ) {
      throw new RangeError('pages_json 分P字段无效');
    }
    return {
      externalPartId,
      partNumber: Number(partNumber),
      title,
      durationSeconds: Number(durationSeconds),
    };
  });
  if (
    new Set(pages.map(({ partNumber }) => partNumber)).size !== pages.length ||
    new Set(pages.map(({ externalPartId }) => externalPartId)).size !== pages.length
  ) {
    throw new RangeError('pages_json 包含重复 page 或 cid');
  }
  return pages.sort((left, right) => left.partNumber - right.partNumber);
}
