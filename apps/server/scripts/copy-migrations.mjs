import { cpSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const source = resolve('src/db/migrations');
const destination = resolve('dist/db/migrations');

mkdirSync(destination, { recursive: true });
cpSync(source, destination, { recursive: true });
