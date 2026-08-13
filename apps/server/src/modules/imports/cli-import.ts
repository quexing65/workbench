import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

import { loadConfig } from '../../config.js';
import { openWorkbenchDatabase } from '../../db/connection.js';
import { ImportService } from './import-service.js';
import { parseImportCli } from './cli-arguments.js';

async function run(): Promise<void> {
  const input = parseImportCli(process.argv.slice(2));
  const config = loadConfig();
  const database = openWorkbenchDatabase({ dataDirectory: config.dataDirectory });
  try {
    const service = new ImportService(
      database.connection,
      database.directories.imports,
      database.directories.backups,
    );
    if (input.command === 'apply') {
      process.stdout.write(`${JSON.stringify(await service.applySaved(input.runId!))}\n`);
      return;
    }
    const upload = join(database.directories.imports, 'uploads', `cli-${randomUUID()}`);
    mkdirSync(upload, { recursive: true });
    const temporaryPath = join(upload, 'source.bin');
    try {
      copyFileSync(resolve(input.file!), temporaryPath);
      const preview = await service.preflight({
        sourceType: input.command === 'personal' ? 'personal-json' : 'qoder-sqlite',
        ...(input.sourceTimezone === undefined ? {} : { sourceTimezone: input.sourceTimezone }),
        temporaryPath,
        persistConfirmation: input.dryRun,
      });
      if (input.dryRun || preview.report.status !== 'ready') {
        process.stdout.write(`${JSON.stringify(preview.report)}\n`);
      } else {
        process.stdout.write(
          `${JSON.stringify(await service.apply(preview.report.runId, preview.confirmationToken!))}\n`,
        );
      }
    } finally {
      rmSync(upload, { recursive: true, force: true });
    }
  } finally {
    database.close();
  }
}

run().catch((error: unknown) => {
  const code =
    error !== null && typeof error === 'object' && 'code' in error
      ? String(error.code)
      : 'IMPORT_CLI_FAILED';
  process.stderr.write(`${JSON.stringify({ error: { code, message: '导入命令执行失败' } })}\n`);
  process.exitCode = 1;
});
