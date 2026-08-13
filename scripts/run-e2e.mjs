import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const baseDirectory = resolve(tmpdir());
const dataDirectory = join(
  baseDirectory,
  `personal-workbench-vnext-e2e-${process.pid}-${Date.now()}`,
);

function cleanup() {
  const resolved = resolve(dataDirectory);
  if (
    !resolved.startsWith(`${baseDirectory}\\`) ||
    !resolved.includes('personal-workbench-vnext-e2e-')
  ) {
    throw new Error('Refusing to remove an unexpected E2E directory');
  }
  rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

cleanup();
const playwrightCli = fileURLToPath(
  new URL('../node_modules/@playwright/test/cli.js', import.meta.url),
);
const result = spawnSync(process.execPath, [playwrightCli, 'test'], {
  env: { ...process.env, WORKBENCH_DATA_DIR: dataDirectory },
  stdio: 'inherit',
});

try {
  cleanup();
} catch (error) {
  process.stderr.write(
    `E2E data cleanup failed: ${error instanceof Error ? error.message : 'unknown'}\n`,
  );
  process.exitCode = 1;
}

if (result.error !== undefined) throw result.error;
if (result.status !== 0) process.exitCode = result.status ?? 1;
