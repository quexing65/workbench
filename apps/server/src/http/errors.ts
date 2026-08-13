import type { ErrorRequestHandler, RequestHandler } from 'express';

import {
  DomainValidationError,
  ResourceNotFoundError,
  RevisionConflictError,
} from '../modules/domain-errors.js';

export interface SafeErrorDetail {
  readonly field?: string;
  readonly message: string;
  readonly current?: unknown;
}

export class AppError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details: readonly SafeErrorDetail[] = [],
  ) {
    super(message);
    this.name = 'AppError';
  }
}

function hasProperty(value: unknown, property: string): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && property in value;
}

function normalizeError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof ResourceNotFoundError) {
    return new AppError(404, error.code, error.message);
  }

  if (error instanceof RevisionConflictError) {
    return new AppError(409, 'REVISION_CONFLICT', error.message, [
      { message: '请刷新后重试', current: error.current },
    ]);
  }

  if (error instanceof DomainValidationError) {
    return new AppError(400, 'VALIDATION_ERROR', '请求参数无效', [
      { field: error.field, message: error.message },
    ]);
  }

  if (hasProperty(error, 'type') && error['type'] === 'entity.parse.failed') {
    return new AppError(400, 'INVALID_JSON', '请求 JSON 格式无效');
  }

  if (hasProperty(error, 'type') && error['type'] === 'entity.too.large') {
    return new AppError(413, 'PAYLOAD_TOO_LARGE', '请求内容过大');
  }

  return new AppError(500, 'INTERNAL_ERROR', '服务器内部错误');
}

export function notFound(code = 'NOT_FOUND', message = '请求的资源不存在'): RequestHandler {
  return (_request, _response, next) => {
    next(new AppError(404, code, message));
  };
}

export const errorHandler: ErrorRequestHandler = (error, request, response, next) => {
  void next;
  const safeError = normalizeError(error);

  if (safeError.status >= 500) {
    request.log?.error(
      {
        event: 'request_failed',
        errorType: error instanceof Error ? error.name : typeof error,
        requestId: request.requestId,
      },
      'Request failed',
    );
  }

  response.status(safeError.status).json({
    error: {
      code: safeError.code,
      message: safeError.message,
      requestId: request.requestId,
      details: safeError.details,
    },
  });
};
