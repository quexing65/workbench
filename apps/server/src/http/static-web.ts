import { existsSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

import express, { type Express, type RequestHandler, type Response } from 'express';

import { AppError } from './errors.js';

function isApiPath(path: string): boolean {
  return path === '/api' || path.startsWith('/api/');
}

/**
 * Vite emits every fingerprinted file into assets/, so anything served from
 * that directory is safe to cache forever. Everything else (index.html and
 * any other root-level file) must be revalidated so new deploys take effect
 * immediately.
 */
function setStaticCacheHeaders(response: Response, filePath: string): void {
  if (filePath.includes(`${sep}assets${sep}`)) {
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return;
  }
  response.setHeader('Cache-Control', 'no-cache');
}

export function mountStaticWeb(app: Express, webDistDirectory: string): void {
  const directory = resolve(webDistDirectory);
  const indexPath = join(directory, 'index.html');

  app.use(
    express.static(directory, {
      dotfiles: 'ignore',
      fallthrough: true,
      index: false,
      redirect: false,
      setHeaders: setStaticCacheHeaders,
    }),
  );

  const spaFallback: RequestHandler = (request, response, next) => {
    if ((request.method !== 'GET' && request.method !== 'HEAD') || isApiPath(request.path)) {
      next();
      return;
    }

    if (!existsSync(indexPath)) {
      next(new AppError(503, 'WEB_BUILD_UNAVAILABLE', 'Web 应用尚未构建'));
      return;
    }

    response.setHeader('Cache-Control', 'no-cache');
    response.sendFile(indexPath);
  };

  app.use(spaFallback);
}
