import { loadConfig } from '../config.js';
import { openWorkbenchDatabase } from './connection.js';

const config = loadConfig();
const database = openWorkbenchDatabase({ dataDirectory: config.dataDirectory });

try {
  process.stdout.write(
    `${JSON.stringify({ schemaVersion: database.schemaVersion, applied: database.migrations.applied })}\n`,
  );
} finally {
  database.close();
}
