import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FALLBACK_VERSION = '0.0.0';

function readPackageVersion(directory: string): string | undefined {
  try {
    const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')) as {
      version?: unknown;
    };
    return typeof manifest.version === 'string' && manifest.version !== ''
      ? manifest.version
      : undefined;
  } catch {
    return undefined;
  }
}

export function resolveServerVersion(moduleUrl: string = import.meta.url): string {
  let directory = dirname(fileURLToPath(moduleUrl));
  for (;;) {
    const version = readPackageVersion(directory);
    if (version !== undefined) {
      return version;
    }
    const parent = dirname(directory);
    if (parent === directory) {
      return FALLBACK_VERSION;
    }
    directory = parent;
  }
}
