import { createHash } from 'node:crypto';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import electronBuilder from 'electron-builder';

const { version } = JSON.parse(await readFile('package.json', 'utf8'));
const outputDirectory = `release/v${version}`;

await electronBuilder.build({
  win: ['nsis', 'portable'],
  config: {
    directories: {
      output: outputDirectory,
    },
  },
});

// 为本版本全部分发产物生成 SHA-256 清单，与 docs/operations/RELEASES.md 台账配合：
// 安装包本体不入库，校验和进库，用于验证 GitHub Release 下载或本地归档是否完好。
const checksumEntries = [];
for (const entry of await readdir(outputDirectory, { withFileTypes: true })) {
  if (!entry.isFile()) continue;
  const fileName = entry.name;
  if (fileName === 'SHA256SUMS.txt' || fileName.startsWith('builder-')) continue;
  const filePath = join(outputDirectory, fileName);
  const metadata = await stat(filePath);
  const digest = createHash('sha256')
    .update(await readFile(filePath))
    .digest('hex');
  checksumEntries.push(`${digest}  ${fileName}  (${metadata.size} bytes)`);
}

checksumEntries.sort();
await writeFile(
  join(outputDirectory, 'SHA256SUMS.txt'),
  `# Personal Workbench v${version}\n# 校验命令：Get-FileHash <文件名> -Algorithm SHA256\n\n${checksumEntries.join('\n')}\n`,
  'utf8',
);

process.stdout.write(
  `\n已归档到 ${outputDirectory}，共 ${checksumEntries.length} 个产物的校验和写入 SHA256SUMS.txt\n`,
);
