import { createServer } from 'node:http';

import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { openWorkbenchDatabase } from './db/connection.js';
import { acquireDataDirectoryLock } from './db/data-lock.js';
import { createLogger } from './http/logger.js';

const config = loadConfig();
const logger = createLogger(config);
const dataLock = acquireDataDirectoryLock(config.dataDirectory, 'server');
let database: ReturnType<typeof openWorkbenchDatabase>;
try {
  database = openWorkbenchDatabase({ dataDirectory: config.dataDirectory });
} catch (error) {
  dataLock.release();
  throw error;
}
const app = createApp({ config, database, logger });
const server = createServer(app);

server.on('error', (error) => {
  database.close();
  dataLock.release();
  logger.fatal({ errorType: error.name }, 'Server failed');
  process.exitCode = 1;
});

server.listen(config.port, config.host, () => {
  logger.info({ host: config.host, port: config.port }, 'Personal Workbench server listening');
});

function stop(signal: NodeJS.Signals): void {
  logger.info({ signal }, 'Stopping server');
  server.close((error) => {
    database.close();
    dataLock.release();
    if (error !== undefined) {
      logger.error({ errorType: error.name }, 'Server shutdown failed');
      process.exitCode = 1;
    }
  });
}

process.once('SIGINT', stop);
process.once('SIGTERM', stop);
