import { randomUUID } from 'node:crypto';
import { readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import {
  CredentialProtectionError,
  type CredentialProtector,
  WindowsDpapiProtector,
} from './dpapi-runner.js';
import type { BiliCredentialStore } from './store.js';

const MAX_CIPHERTEXT_BYTES = 64 * 1024;

export class DpapiCredentialStore implements BiliCredentialStore {
  public constructor(
    private readonly path: string,
    private readonly protector: CredentialProtector = new WindowsDpapiProtector(),
  ) {}

  public async has(): Promise<boolean> {
    try {
      const metadata = await stat(this.path);
      return metadata.isFile() && metadata.size > 0 && metadata.size <= MAX_CIPHERTEXT_BYTES;
    } catch (error) {
      if (isMissing(error)) return false;
      throw new CredentialProtectionError();
    }
  }

  public async read(): Promise<string | null> {
    if (!(await this.has())) return null;
    try {
      const ciphertext = await readFile(this.path, { encoding: 'utf8' });
      if (Buffer.byteLength(ciphertext) > MAX_CIPHERTEXT_BYTES) {
        throw new CredentialProtectionError();
      }
      const plaintext = await this.protector.unprotect(ciphertext.trim());
      return plaintext === '' ? null : plaintext;
    } catch (error) {
      if (error instanceof CredentialProtectionError) throw error;
      throw new CredentialProtectionError();
    }
  }

  public async write(sessdata: string): Promise<void> {
    const temporaryPath = join(dirname(this.path), `.credentials-${randomUUID()}.tmp`);
    try {
      const ciphertext = await this.protector.protect(sessdata);
      if (ciphertext === '' || Buffer.byteLength(ciphertext) > MAX_CIPHERTEXT_BYTES) {
        throw new CredentialProtectionError();
      }
      await writeFile(temporaryPath, ciphertext, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
      await rename(temporaryPath, this.path);
    } catch (error) {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
      if (error instanceof CredentialProtectionError) throw error;
      throw new CredentialProtectionError();
    }
  }

  public async clear(): Promise<void> {
    try {
      await rm(this.path, { force: true });
    } catch {
      throw new CredentialProtectionError();
    }
  }
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
  );
}
