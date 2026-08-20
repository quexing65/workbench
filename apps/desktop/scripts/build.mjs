import { access, constants, cp, rm } from 'node:fs/promises';

import { build } from 'esbuild';

const entrySource = 'src/main.ts';
const outputBundle = 'dist/main.js';
const migrationsSource = '../server/src/db/migrations';
const dpapiScriptSource = '../server/scripts/dpapi.ps1';
const webDistSource = '../web/dist';

async function ensureExists(path, hint) {
  try {
    await access(path, constants.F_OK);
  } catch {
    throw new Error(`缺少 ${path}（${hint}）`);
  }
}

await ensureExists(migrationsSource, 'server 迁移目录缺失，请检查 apps/server 源码');
await ensureExists(dpapiScriptSource, 'DPAPI 脚本缺失，请检查 apps/server/scripts');
await ensureExists(webDistSource, '请先执行 npm run build -w @workbench/web');

await rm('dist', { recursive: true, force: true });

await build({
  entryPoints: [entrySource],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node24',
  outfile: outputBundle,
  external: ['electron'],
  // CJS 依赖（express/pino/debug 等）在 ESM bundle 里通过运行时 require 调用
  // node 内置模块，必须注入 createRequire 才能工作。
  banner: {
    js: "import { createRequire } from 'node:module';\nconst require = createRequire(import.meta.url);",
  },
  logLevel: 'info',
});

await cp(migrationsSource, 'dist/migrations', { recursive: true });
await cp(dpapiScriptSource, 'dist/dpapi.ps1');
await cp(webDistSource, 'dist/web', { recursive: true });
