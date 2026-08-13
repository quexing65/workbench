import { fileURLToPath } from 'node:url';

import express, { type Express } from 'express';
import type { Logger } from 'pino';

import type { ServerConfig } from './config.js';
import { errorHandler, notFound } from './http/errors.js';
import { createLogger, requestLogger } from './http/logger.js';
import { loopbackGuard } from './http/origin-guard.js';
import { requestId } from './http/request-id.js';
import { mountStaticWeb } from './http/static-web.js';
import { createHealthRouter } from './modules/health/route.js';

export interface CreateAppOptions {
  readonly config: ServerConfig;
  readonly logger?: Logger;
  readonly serveWeb?: boolean;
  readonly webDistDirectory?: string;
}

const DEFAULT_WEB_DIST = fileURLToPath(new URL('../../web/dist', import.meta.url));

export function createApp(options: CreateAppOptions): Express {
  const { config } = options;
  const app = express();
  const logger = options.logger ?? createLogger(config);

  app.disable('x-powered-by');
  app.set('trust proxy', false);
  app.use(requestId);
  app.use(requestLogger(logger));
  app.use(loopbackGuard(config));
  app.use(express.json({ limit: '1mb', type: ['application/json', 'application/*+json'] }));

  const api = express.Router();
  api.use('/health', createHealthRouter(config));
  api.use(notFound('API_NOT_FOUND', 'API 路由不存在'));
  app.use('/api/v1', api);
  app.use('/api', notFound('API_NOT_FOUND', 'API 路由不存在'));

  if (options.serveWeb ?? config.nodeEnv === 'production') {
    mountStaticWeb(app, options.webDistDirectory ?? DEFAULT_WEB_DIST);
  }

  app.use(notFound());
  app.use(errorHandler);

  return app;
}
