import type { RequestHandler } from 'express';

import type { ServerConfig } from '../config.js';
import { getServerOrigin } from '../config.js';
import { AppError } from './errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const JSON_MEDIA_TYPE = /^application\/(?:json|[a-z0-9!#$&^_.+-]+\+json)$/iu;
const MULTIPART_MEDIA_TYPE = /^multipart\/form-data\s*;.*\bboundary=[^;\s]+/iu;

function isJsonRequest(contentType: string | undefined): boolean {
  const mediaType = contentType?.split(';', 1)[0]?.trim();
  return mediaType !== undefined && JSON_MEDIA_TYPE.test(mediaType);
}

function isControlledMultipart(
  method: string,
  originalUrl: string,
  contentType: string | undefined,
): boolean {
  return (
    method === 'POST' &&
    originalUrl.split('?', 1)[0] === '/api/v1/data/imports/preflight' &&
    MULTIPART_MEDIA_TYPE.test(contentType ?? '')
  );
}

function allowedOrigin(config: ServerConfig): string {
  return config.nodeEnv === 'production' ? getServerOrigin(config) : config.webDevOrigin;
}

function singleHeader(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function loopbackGuard(config: ServerConfig): RequestHandler {
  const expectedHost = `${config.host}:${config.port}`;
  const expectedOrigin = allowedOrigin(config);

  return (request, _response, next) => {
    if (request.headers.host !== expectedHost) {
      next(new AppError(403, 'HOST_NOT_ALLOWED', '请求 Host 不受允许'));
      return;
    }

    const origin = singleHeader(request.headers.origin);
    if (Array.isArray(request.headers.origin)) {
      next(new AppError(403, 'ORIGIN_NOT_ALLOWED', '请求 Origin 不受允许'));
      return;
    }
    if (origin !== undefined && origin !== expectedOrigin) {
      next(new AppError(403, 'ORIGIN_NOT_ALLOWED', '请求 Origin 不受允许'));
      return;
    }

    if (!SAFE_METHODS.has(request.method)) {
      if (singleHeader(request.headers['sec-fetch-site'])?.toLowerCase() === 'cross-site') {
        next(new AppError(403, 'CROSS_SITE_REQUEST', '拒绝跨站写请求'));
        return;
      }

      if (request.headers['x-workbench-request'] !== '1') {
        next(new AppError(403, 'REQUEST_HEADER_REQUIRED', '写请求缺少工作台请求标记'));
        return;
      }

      if (
        !isJsonRequest(request.headers['content-type']) &&
        !isControlledMultipart(request.method, request.originalUrl, request.headers['content-type'])
      ) {
        next(new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', '写请求必须使用 JSON'));
        return;
      }
    }

    next();
  };
}
