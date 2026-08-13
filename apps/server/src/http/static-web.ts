import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import express, { type Express, type RequestHandler } from 'express';

import { AppError } from './errors.js';

function isApiPath(path: string): boolean {
  return path === '/api' || path.startsWith('/api/');
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

    response.sendFile(indexPath);
  };

  app.use(spaFallback);
}
