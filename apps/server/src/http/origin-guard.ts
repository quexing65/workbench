import type { RequestHandler } from 'express';

import type { ServerConfig } from '../config.js';
import { getServerOrigin } from '../config.js';
import { AppError } from './errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const JSON_MEDIA_TYPE = /^application\/(?:json|[a-z0-9!#$&^_.+-]+\+json)$/iu;

/**
 * 浏览器只会给出这四个值。采用白名单而不是只拒绝 `cross-site`：
 * 重复头会被 Node 拼成 `same-origin, cross-site` 之类，精确相等比较会被绕过。
 * 缺少该头（旧浏览器、命令行、探活）时不做判断，仍受 Host/Origin 与写标记约束。
 */
const ALLOWED_FETCH_SITES = new Set(['same-origin', 'none', 'same-site']);

function isJsonRequest(contentType: string | undefined): boolean {
  const mediaType = contentType?.split(';', 1)[0]?.trim();
  return mediaType !== undefined && JSON_MEDIA_TYPE.test(mediaType);
}

function allowedOrigin(config: ServerConfig): string {
  return config.nodeEnv === 'production' ? getServerOrigin(config) : config.webDevOrigin;
}

function singleHeader(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function crossSite(value: string | string[] | undefined): boolean {
  const header = singleHeader(value);
  return header !== undefined && !ALLOWED_FETCH_SITES.has(header.toLowerCase());
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

    // 对所有方法生效：跨站读同样会被本机恶意页面用来触发副作用（例如带凭据的健康校验）。
    if (crossSite(request.headers['sec-fetch-site'])) {
      next(new AppError(403, 'CROSS_SITE_REQUEST', '拒绝跨站请求'));
      return;
    }

    if (!SAFE_METHODS.has(request.method)) {
      if (request.headers['x-workbench-request'] !== '1') {
        next(new AppError(403, 'REQUEST_HEADER_REQUIRED', '写请求缺少工作台请求标记'));
        return;
      }

      if (!isJsonRequest(request.headers['content-type'])) {
        next(new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', '写请求必须使用 JSON'));
        return;
      }
    }

    next();
  };
}
