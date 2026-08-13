import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

export function stableJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function hashText(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function hashValue(value: unknown): string {
  return hashText(stableJson(value));
}

export async function hashFile(path: string): Promise<string> {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(path, { highWaterMark: 64 * 1024 })) {
    digest.update(chunk);
  }
  return digest.digest('hex');
}
