import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

export interface WorkbenchDataDirectories {
  readonly root: string;
  readonly database: string;
  readonly credentials: string;
  readonly backups: string;
  readonly logs: string;
  readonly imports: string;
}

export function ensureDataDirectories(root: string): WorkbenchDataDirectories {
  const directories = {
    root,
    database: join(root, 'data'),
    credentials: join(root, 'credentials'),
    backups: join(root, 'backups'),
    logs: join(root, 'logs'),
    imports: join(root, 'tmp', 'imports'),
  };

  for (const directory of Object.values(directories)) {
    mkdirSync(directory, { recursive: true });
  }

  return directories;
}
