import { resolve } from 'node:path';

import { createSanitizedQoderSnapshot } from './sanitized-snapshot.js';

function value(name: string): string {
  const index = process.argv.indexOf(name);
  const result = index === -1 ? undefined : process.argv.at(index + 1);
  if (result === undefined || result.startsWith('--')) throw new Error(`${name} requires a value`);
  return result;
}

try {
  if (process.argv.length !== 8) throw new Error('Unexpected qoder sanitize arguments');
  const result = createSanitizedQoderSnapshot(
    resolve(value('--source')),
    resolve(value('--output')),
    value('--source-timezone'),
  );
  process.stdout.write(
    `${JSON.stringify({ status: 'created', ...result, credentialsDetected: false })}\n`,
  );
} catch (error) {
  process.stderr.write(
    `${JSON.stringify({ status: 'failed', errorCode: error instanceof Error ? error.name : 'Error' })}\n`,
  );
  process.exitCode = 1;
}
