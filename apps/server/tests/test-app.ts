import type { Logger } from 'pino';
import type { DatabaseSync } from 'node:sqlite';

import { createApp } from '../src/app.js';
import type { ServerConfig } from '../src/config.js';
import { createLogger } from '../src/http/logger.js';
import type { BiliClient } from '../src/modules/learning/bili-client.js';
import type { BiliSessionClient } from '../src/modules/bili/session-client.js';
import type { BrowserCredentialAdapter } from '../src/modules/credentials/cdp-adapter.js';
import type { BiliCredentialStore } from '../src/modules/credentials/store.js';
import type { BackupService } from '../src/modules/backups/service.js';

export const testConfig: ServerConfig = {
  nodeEnv: 'test',
  host: '127.0.0.1',
  port: 8790,
  webDevOrigin: 'http://127.0.0.1:5190',
  timeZone: 'Asia/Shanghai',
  dataDirectory: 'unused-in-unit-tests',
  logLevel: 'silent',
  biliSyncEnabled: false,
};

export function makeApp(
  options: {
    logger?: Logger;
    serveWeb?: boolean;
    webDistDirectory?: string;
    database?: DatabaseSync;
    biliClient?: BiliClient;
    biliSessionClient?: BiliSessionClient;
    credentialStore?: BiliCredentialStore;
    browserCredentialAdapter?: BrowserCredentialAdapter;
    mountBackups?: boolean;
    backupService?: Pick<BackupService, 'create'>;
    dataDirectory?: string;
    version?: string;
  } = {},
) {
  return createApp({
    config: {
      ...testConfig,
      ...(options.dataDirectory === undefined ? {} : { dataDirectory: options.dataDirectory }),
    },
    database: {
      schemaVersion: 5,
      ...(options.database === undefined ? {} : { connection: options.database }),
    },
    logger: options.logger ?? createLogger(testConfig),
    ...(options.biliClient === undefined ? {} : { biliClient: options.biliClient }),
    ...(options.biliSessionClient === undefined
      ? {}
      : { biliSessionClient: options.biliSessionClient }),
    ...(options.credentialStore === undefined ? {} : { credentialStore: options.credentialStore }),
    ...(options.browserCredentialAdapter === undefined
      ? {}
      : { browserCredentialAdapter: options.browserCredentialAdapter }),
    mountBackups: options.mountBackups ?? false,
    ...(options.backupService === undefined ? {} : { backupService: options.backupService }),
    ...(options.serveWeb === undefined ? {} : { serveWeb: options.serveWeb }),
    ...(options.webDistDirectory === undefined
      ? {}
      : { webDistDirectory: options.webDistDirectory }),
    ...(options.version === undefined ? {} : { version: options.version }),
  });
}

export const allowedHost = '127.0.0.1:8790';
