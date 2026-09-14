import { createServer } from 'node:http';
import { join } from 'node:path';

import { createApp } from '../../server/src/app.js';
import { loadConfig } from '../../server/src/config.js';
import { openWorkbenchDatabase, type WorkbenchDatabase } from '../../server/src/db/connection.js';
import { acquireDataDirectoryLock } from '../../server/src/db/data-lock.js';
import { createLogger } from '../../server/src/http/logger.js';
import { WindowsDpapiProtector } from '../../server/src/modules/credentials/dpapi-runner.js';
import { DpapiCredentialStore } from '../../server/src/modules/credentials/dpapi-store.js';

export interface EmbeddedServerOptions {
  readonly migrationDirectory: string;
  readonly dpapiScriptPath: string;
  readonly webDistDirectory: string;
  readonly version?: string;
}

export interface EmbeddedServer {
  readonly host: string;
  readonly port: number;
  /** 关闭 HTTP server、数据库连接与数据目录锁；返回 Promise 以便调用方 await。 */
  stop(): Promise<void>;
}

/**
 * 在当前进程内启动与 CLI 正式运行完全一致的 Express 服务。桌面壳通过参数显式注入
 * migrations、DPAPI 脚本与 web dist 的资源路径，避免依赖打包后被破坏的
 * `import.meta.url` 相对默认值。
 */
export async function startEmbeddedServer(options: EmbeddedServerOptions): Promise<EmbeddedServer> {
  const config = loadConfig();
  const logger = createLogger(config);
  const lock = acquireDataDirectoryLock(config.dataDirectory, 'server');

  let database: WorkbenchDatabase;
  try {
    database = openWorkbenchDatabase({
      dataDirectory: config.dataDirectory,
      migrationDirectory: options.migrationDirectory,
    });
  } catch (error) {
    lock.release();
    throw error;
  }

  const credentialStore = new DpapiCredentialStore(
    join(config.dataDirectory, 'credentials', 'credentials.bin'),
    new WindowsDpapiProtector(options.dpapiScriptPath),
  );

  const app = createApp({
    config,
    database,
    logger,
    serveWeb: true,
    webDistDirectory: options.webDistDirectory,
    credentialStore,
    ...(options.version === undefined ? {} : { version: options.version }),
  });

  const server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, config.host, () => {
      resolve();
    });
  }).catch((error: unknown) => {
    database.close();
    lock.release();
    throw error;
  });

  logger.info(
    { host: config.host, port: config.port },
    'Personal Workbench desktop server listening',
  );

  let stopped = false;
  return {
    host: config.host,
    port: config.port,
    async stop(): Promise<void> {
      if (stopped) {
        return;
      }
      stopped = true;
      // 先关连接再 close，让 server.close() 尽快完成而非等待 keep-alive 超时。
      server.closeAllConnections();
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
      database.close();
      lock.release();
    },
  };
}
