import type { Request } from 'express';
import type { z } from 'zod';

import { AppError, type SafeErrorDetail } from './errors.js';

export function parseInput<S extends z.ZodTypeAny>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (result.success) {
    return result.data;
  }

  const details: SafeErrorDetail[] = result.error.issues.map((issue) => {
    const field = issue.path.join('.');
    return { message: issue.message, ...(field === '' ? {} : { field }) };
  });
  throw new AppError(400, 'VALIDATION_ERROR', '请求参数无效', details);
}

export function parseUuidParameter(request: Request): string {
  const id = request.params['id'];
  if (
    typeof id !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(id)
  ) {
    throw new AppError(400, 'VALIDATION_ERROR', '资源 ID 无效', [
      { field: 'id', message: '必须是 UUID' },
    ]);
  }
  return id;
}

export function parseIfMatch(request: Request): number {
  const value = request.header('if-match');
  const match = value?.match(/^"([1-9][0-9]*)"$/u);
  if (match?.[1] === undefined) {
    throw new AppError(400, 'IF_MATCH_REQUIRED', 'If-Match 必须是当前 revision 的实体标签');
  }
  return Number(match[1]);
}

export function setRevisionEtag(
  response: { setHeader(name: string, value: string): void },
  revision: number,
): void {
  response.setHeader('ETag', `"${revision}"`);
}
