import type { Logger } from 'pino';

import { createApp } from '../src/app.js';
import type { ServerConfig } from '../src/config.js';
import { createLogger } from '../src/http/logger.js';

export const testConfig: ServerConfig = {
  nodeEnv: 'test',
  host: '127.0.0.1',
  port: 8790,
  webDevOrigin: 'http://127.0.0.1:5190',
  timeZone: 'Asia/Shanghai',
  logLevel: 'silent',
};

export function makeApp(
  options: { logger?: Logger; serveWeb?: boolean; webDistDirectory?: string } = {},
) {
  return createApp({
    config: testConfig,
    logger: options.logger ?? createLogger(testConfig),
    ...(options.serveWeb === undefined ? {} : { serveWeb: options.serveWeb }),
    ...(options.webDistDirectory === undefined
      ? {}
      : { webDistDirectory: options.webDistDirectory }),
  });
}

export const allowedHost = '127.0.0.1:8790';
