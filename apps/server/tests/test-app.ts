import type { Logger } from 'pino';
import type { DatabaseSync } from 'node:sqlite';

import { createApp } from '../src/app.js';
import type { ServerConfig } from '../src/config.js';
import { createLogger } from '../src/http/logger.js';
import type { BiliClient } from '../src/modules/learning/bili-client.js';

export const testConfig: ServerConfig = {
  nodeEnv: 'test',
  host: '127.0.0.1',
  port: 8790,
  webDevOrigin: 'http://127.0.0.1:5190',
  timeZone: 'Asia/Shanghai',
  dataDirectory: 'unused-in-unit-tests',
  logLevel: 'silent',
};

export function makeApp(
  options: {
    logger?: Logger;
    serveWeb?: boolean;
    webDistDirectory?: string;
    database?: DatabaseSync;
    biliClient?: BiliClient;
  } = {},
) {
  return createApp({
    config: testConfig,
    database: {
      schemaVersion: 1,
      ...(options.database === undefined ? {} : { connection: options.database }),
    },
    logger: options.logger ?? createLogger(testConfig),
    ...(options.biliClient === undefined ? {} : { biliClient: options.biliClient }),
    ...(options.serveWeb === undefined ? {} : { serveWeb: options.serveWeb }),
    ...(options.webDistDirectory === undefined
      ? {}
      : { webDistDirectory: options.webDistDirectory }),
  });
}

export const allowedHost = '127.0.0.1:8790';
