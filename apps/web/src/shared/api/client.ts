import { z } from 'zod';

const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.array(
      z.object({ message: z.string(), current: z.unknown().optional() }).passthrough(),
    ),
  }),
});

export class ApiError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly current?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ApiOptions {
  readonly method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  readonly body?: unknown;
  readonly revision?: number;
  readonly signal?: AbortSignal;
}

interface RuntimeSchema<T> {
  parse(value: unknown): T;
}

export async function apiRequest<T>(
  path: string,
  schema: RuntimeSchema<T>,
  options: ApiOptions = {},
): Promise<T> {
  const method = options.method ?? 'GET';
  const response = await fetch(path, {
    method,
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      ...(method === 'GET'
        ? {}
        : { 'Content-Type': 'application/json', 'X-Workbench-Request': '1' }),
      ...(options.revision === undefined ? {} : { 'If-Match': `"${options.revision}"` }),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });

  if (!response.ok) {
    const parsed = errorEnvelopeSchema.safeParse(await response.json().catch(() => undefined));
    throw new ApiError(
      response.status,
      parsed.success ? parsed.data.error.code : 'REQUEST_FAILED',
      parsed.success ? parsed.data.error.message : '请求失败，请稍后重试',
      parsed.success ? parsed.data.error.details[0]?.current : undefined,
    );
  }

  if (response.status === 204) return schema.parse(undefined);
  return schema.parse(await response.json());
}

export function isRevisionConflict(error: unknown): error is ApiError {
  return error instanceof ApiError && error.code === 'REVISION_CONFLICT';
}
