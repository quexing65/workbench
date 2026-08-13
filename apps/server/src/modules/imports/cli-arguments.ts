type Command = 'personal' | 'qoder' | 'apply';

export interface ImportCliInput {
  readonly command: Command;
  readonly file?: string;
  readonly runId?: string;
  readonly sourceTimezone?: string;
  readonly dryRun: boolean;
}

export function parseImportCli(arguments_: readonly string[]): ImportCliInput {
  const command = arguments_[0];
  if (command !== 'personal' && command !== 'qoder' && command !== 'apply') {
    throw new Error('导入命令无效');
  }
  const values = new Map<string, string>();
  let dryRun = false;
  for (let index = 1; index < arguments_.length; index += 1) {
    const name = arguments_[index]!;
    if (name === '--dry-run') {
      if (dryRun) throw new Error('--dry-run 不能重复');
      dryRun = true;
      continue;
    }
    if (!['--file', '--run', '--source-timezone'].includes(name) || values.has(name)) {
      throw new Error('存在未知或重复导入参数');
    }
    const value = arguments_[index + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`${name} 缺少值`);
    values.set(name, value);
    index += 1;
  }
  const file = values.get('--file');
  const runId = values.get('--run');
  const sourceTimezone = values.get('--source-timezone');
  if (command === 'apply') {
    if (runId === undefined || file !== undefined || sourceTimezone !== undefined || dryRun) {
      throw new Error('apply 仅接受 --run <id>');
    }
  } else if (
    file === undefined ||
    runId !== undefined ||
    (command === 'personal' && sourceTimezone !== undefined)
  ) {
    throw new Error('预检参数无效');
  }
  if (command === 'qoder' && sourceTimezone === undefined) {
    throw new Error('qoder 预检必须提供 --source-timezone');
  }
  return {
    command,
    ...(file === undefined ? {} : { file }),
    ...(runId === undefined ? {} : { runId }),
    ...(sourceTimezone === undefined ? {} : { sourceTimezone }),
    dryRun,
  };
}
