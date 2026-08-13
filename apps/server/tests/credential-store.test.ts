import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { CredentialProtector } from '../src/modules/credentials/dpapi-runner.js';
import {
  CredentialProtectionError,
  WindowsDpapiProtector,
} from '../src/modules/credentials/dpapi-runner.js';
import { DpapiCredentialStore } from '../src/modules/credentials/dpapi-store.js';
import { MemoryCredentialStore } from '../src/modules/credentials/store.js';

const roots: string[] = [];

afterEach(async () => {
  const { rm } = await import('node:fs/promises');
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('credential stores', () => {
  it('round trips and clears an in-memory credential', async () => {
    const store = new MemoryCredentialStore();
    expect(await store.has()).toBe(false);
    expect(await store.read()).toBeNull();
    await store.write('memory-test-value');
    expect(await store.has()).toBe(true);
    expect(await store.read()).toBe('memory-test-value');
    await store.clear();
    expect(await store.read()).toBeNull();
  });

  it('writes only protected bytes and removes them on clear', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workbench-credential-'));
    roots.push(root);
    const path = join(root, 'credentials.bin');
    const protector: CredentialProtector = {
      protect: async (value) => Buffer.from(`protected:${value}`, 'utf8').toString('base64'),
      unprotect: async (value) =>
        Buffer.from(value, 'base64')
          .toString('utf8')
          .replace(/^protected:/u, ''),
    };
    const store = new DpapiCredentialStore(path, protector);
    const sentinel = 'credential-store-sentinel';

    await store.write(sentinel);
    expect(await store.read()).toBe(sentinel);
    expect(await readFile(path, 'utf8')).not.toContain(sentinel);
    await store.write('replacement-value');
    expect(await store.read()).toBe('replacement-value');
    await store.clear();
    expect(await store.has()).toBe(false);
  });

  it.runIf(process.platform === 'win32')(
    'round trips a synthetic value with Windows CurrentUser DPAPI',
    async () => {
      const root = await mkdtemp(join(tmpdir(), 'workbench-dpapi-'));
      roots.push(root);
      const path = join(root, 'credentials.bin');
      const store = new DpapiCredentialStore(path);
      const sentinel = `dpapi-test-${crypto.randomUUID()}`;

      await store.write(sentinel);
      expect(await store.read()).toBe(sentinel);
      expect(await readFile(path, 'utf8')).not.toContain(sentinel);
      await store.clear();
    },
  );

  it.runIf(process.platform === 'win32')(
    'normalizes PowerShell startup, exit and oversized-output failures',
    async () => {
      await expect(
        new WindowsDpapiProtector('missing.ps1', 'missing-powershell.exe').protect('test-value'),
      ).rejects.toBeInstanceOf(CredentialProtectionError);
      await expect(
        new WindowsDpapiProtector('missing.ps1').protect('test-value'),
      ).rejects.toBeInstanceOf(CredentialProtectionError);
      await expect(
        new WindowsDpapiProtector(
          join(import.meta.dirname, 'fixtures', 'dpapi-oversized.ps1'),
        ).protect('test-value'),
      ).rejects.toBeInstanceOf(CredentialProtectionError);
    },
  );

  it('normalizes corrupt protect and unprotect operations', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workbench-corrupt-credential-'));
    roots.push(root);
    const path = join(root, 'credentials.bin');
    const empty: CredentialProtector = {
      protect: async () => '',
      unprotect: async () => '',
    };
    await expect(new DpapiCredentialStore(path, empty).write('value')).rejects.toBeInstanceOf(
      CredentialProtectionError,
    );

    const broken: CredentialProtector = {
      protect: async () => 'encrypted',
      unprotect: async () => {
        throw new Error('unsafe low-level detail');
      },
    };
    const store = new DpapiCredentialStore(path, broken);
    await store.write('value');
    await expect(store.read()).rejects.toBeInstanceOf(CredentialProtectionError);

    const rejected: CredentialProtector = {
      protect: async () => {
        throw new Error('unsafe low-level detail');
      },
      unprotect: async () => '',
    };
    await expect(new DpapiCredentialStore(path, rejected).write('value')).rejects.toBeInstanceOf(
      CredentialProtectionError,
    );
    const oversized: CredentialProtector = {
      protect: async () => 'A'.repeat(70_000),
      unprotect: async () => '',
    };
    await expect(new DpapiCredentialStore(path, oversized).write('value')).rejects.toBeInstanceOf(
      CredentialProtectionError,
    );
  });

  it('treats empty, directory and oversized credential paths as absent', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workbench-credential-shape-'));
    roots.push(root);
    const emptyPath = join(root, 'empty.bin');
    const directoryPath = join(root, 'directory.bin');
    const oversizedPath = join(root, 'oversized.bin');
    await writeFile(emptyPath, '');
    await mkdir(directoryPath);
    await writeFile(oversizedPath, 'A'.repeat(70_000));
    const protector: CredentialProtector = {
      protect: async (value) => value,
      unprotect: async (value) => value,
    };
    await expect(new DpapiCredentialStore(emptyPath, protector).read()).resolves.toBeNull();
    await expect(new DpapiCredentialStore(directoryPath, protector).has()).resolves.toBe(false);
    await expect(new DpapiCredentialStore(oversizedPath, protector).read()).resolves.toBeNull();
    await expect(new DpapiCredentialStore('\0', protector).has()).rejects.toBeInstanceOf(
      CredentialProtectionError,
    );
    await expect(new DpapiCredentialStore('\0', protector).clear()).rejects.toBeInstanceOf(
      CredentialProtectionError,
    );
  });
});
