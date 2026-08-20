import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const MAX_OUTPUT_BYTES = 64 * 1024;
const DEFAULT_SCRIPT = fileURLToPath(new URL('../../../scripts/dpapi.ps1', import.meta.url));

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
    private readonly scriptPath = DEFAULT_SCRIPT,
    private readonly executable = 'powershell.exe',
  ) {}

  public protect(plaintext: string): Promise<string> {
    return this.run('protect', plaintext);
  }

  public unprotect(ciphertext: string): Promise<string> {
    return this.run('unprotect', ciphertext);
  }

  private run(operation: 'protect' | 'unprotect', input: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(
        this.executable,
        [
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
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
