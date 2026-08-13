import { loadConfig } from '../../config.js';
import { restoreBackup } from './restore.js';

function parseFile(arguments_: readonly string[]): string {
  const file = arguments_[1];
  if (
    arguments_.length !== 2 ||
    arguments_[0] !== '--file' ||
    file === undefined ||
    file.startsWith('--')
  ) {
    throw new Error('restore 仅接受 --file <backup.pwbk>');
  }
  return file;
}

async function main(): Promise<void> {
  const file = parseFile(process.argv.slice(2));
  const result = await restoreBackup(loadConfig().dataDirectory, file);
  process.stdout.write(
    `${JSON.stringify({
      status: 'restored',
      sourceFileName: result.sourceFileName,
      preRestoreFileName: result.preRestoreFileName,
      schemaVersion: result.manifest.schemaVersion,
      logicalChecksumSha256: result.restoredLogicalChecksumSha256,
    })}\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${JSON.stringify({ status: 'failed', errorCode: error instanceof Error ? error.name : 'Error' })}\n`,
  );
  process.exitCode = 1;
});
