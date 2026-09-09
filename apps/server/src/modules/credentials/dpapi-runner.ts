import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_OUTPUT_BYTES = 64 * 1024;
export const DEFAULT_DPAPI_SCRIPT_PATH = fileURLToPath(
  new URL('../../../scripts/dpapi.ps1', import.meta.url),
);

/**
 * 固定解析系统目录中的 Windows PowerShell 绝对路径，避免依赖 PATH：同目录下的
 * 同名可执行文件不再有机会被优先命中。
 */
export function defaultPowerShellPath(): string {
  const systemRoot = process.env['SystemRoot'] ?? 'C:\\Windows';
  return join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
}

export class CredentialProtectionError extends Error {
  public constructor() {
    super('凭据安全存储操作失败');
    this.name = 'CredentialProtectionError';
  }
}

export interface CredentialProtector {
  protect(plaintext: string): Promise<string>;
  unprotect(ciphertext: string): Promise<string>;
}

export class WindowsDpapiProtector implements CredentialProtector {
  public constructor(
    private readonly scriptPath = DEFAULT_DPAPI_SCRIPT_PATH,
    private readonly executable = defaultPowerShellPath(),
  ) {}

  public protect(plaintext: string): Promise<string> {
    return this.run('protect', plaintext);
  }

  public unprotect(ciphertext: string): Promise<string> {
    return this.run('unprotect', ciphertext);
  }

  private run(operation: 'protect' | 'unprotect', input: string): Promise<string> {
    return new Promise((resolve, reject) => {
      // 脚本缺失时直接 fail closed，不启动外部进程。
      if (!existsSync(this.scriptPath)) {
        reject(new CredentialProtectionError());
        return;
      }

      const child = spawn(
        this.executable,
        [
          '-NoProfile',
          '-NonInteractive',
          // 只放行本机未签名脚本，比 Bypass 更窄；完全省略该参数会在默认
          // Restricted 的 Windows 客户端上拒绝执行固定脚本。
          '-ExecutionPolicy',
          'RemoteSigned',
          '-File',
          this.scriptPath,
          operation,
        ],
        { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true },
      );
      const output: Buffer[] = [];
      let outputBytes = 0;
      let failed = false;

      const fail = () => {
        if (failed) return;
        failed = true;
        child.kill();
        reject(new CredentialProtectionError());
      };

      child.once('error', fail);
      child.stdout.on('data', (chunk: Buffer) => {
        outputBytes += chunk.length;
        if (outputBytes > MAX_OUTPUT_BYTES) fail();
        else output.push(chunk);
      });
      child.stderr.resume();
      child.once('close', (code) => {
        if (failed) return;
        if (code !== 0) {
          fail();
          return;
        }
        resolve(Buffer.concat(output).toString('utf8'));
      });
      child.stdin.once('error', fail);
      child.stdin.end(input, 'utf8');
    });
  }
}
