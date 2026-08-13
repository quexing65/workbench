import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { openWorkbenchDatabase } from '../db/connection.js';
import { populatePerformanceFixture, runPerformanceAudit } from './audit.js';

const outputIndex = process.argv.indexOf('--output');
const output = outputIndex === -1 ? undefined : process.argv.at(outputIndex + 1);
if (outputIndex !== -1 && output === undefined) throw new Error('--output requires a file path');

const dataDirectory = mkdtempSync(`${tmpdir()}\workbench-performance-`);
try {
  const database = openWorkbenchDatabase({ dataDirectory });
  try {
    const fixtureBuildMs = populatePerformanceFixture(database.connection);
    const report = runPerformanceAudit(database.connection, fixtureBuildMs);
    const json = `${JSON.stringify(report, null, 2)}\n`;
    if (output === undefined) process.stdout.write(json);
    else {
      const outputPath = resolve(process.env['INIT_CWD'] ?? process.cwd(), output);
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, json, { encoding: 'utf8', flag: 'w' });
      const prettier = fileURLToPath(
        new URL('../../../../node_modules/prettier/bin/prettier.cjs', import.meta.url),
      );
      const formatted = spawnSync(process.execPath, [prettier, outputPath, '--write'], {
        encoding: 'utf8',
      });
      if (formatted.error !== undefined) throw formatted.error;
      if (formatted.status !== 0) throw new Error('Performance report formatting failed');
    }
    if (!report.passed) process.exitCode = 1;
  } finally {
    database.close();
  }
} finally {
  rmSync(dataDirectory, { recursive: true, force: true });
}
