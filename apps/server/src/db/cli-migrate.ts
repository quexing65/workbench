import { loadConfig } from '../config.js';
import { openWorkbenchDatabase } from './connection.js';
import { acquireDataDirectoryLock } from './data-lock.js';

const config = loadConfig();
// 与服务端/恢复共用同一把数据目录排他锁：迁移可能重建表，禁止与运行中的服务并发。
const lock = acquireDataDirectoryLock(config.dataDirectory, 'migrate');
const database = openWorkbenchDatabase({ dataDirectory: config.dataDirectory });

try {
  process.stdout.write(
    `${JSON.stringify({ schemaVersion: database.schemaVersion, applied: database.migrations.applied })}\n`,
  );
} finally {
  database.close();
  lock.release();
}
