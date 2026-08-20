import { execFile, spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { join } from 'node:path';

import type { BiliBrowser } from '@workbench/shared';

import { ExternalServiceError } from '../domain-errors.js';

export interface BrowserProcessController {
  restart(browser: BiliBrowser, port: number): Promise<void>;
}

export interface BrowserProcessRuntime {
  readonly environment: NodeJS.ProcessEnv;
  access(path: string): Promise<void>;
  stopEdge(): Promise<void>;
  launchEdge(executable: string, arguments_: readonly string[]): void;
}

export interface BrowserNativeCommands {
  execFile: typeof execFile;
  spawn: typeof spawn;
}

export function createWindowsBrowserRuntime(
  commands: BrowserNativeCommands = { execFile, spawn },
  environment: NodeJS.ProcessEnv = process.env,
  accessFile: (path: string) => Promise<void> = access,
): BrowserProcessRuntime {
  return {
    environment,
    access: accessFile,
    stopEdge: () =>
      new Promise((resolve) => {
        commands.execFile(
          'taskkill.exe',
          ['/IM', 'msedge.exe', '/T', '/F'],
          { windowsHide: true },
          () => resolve(),
        );
      }),
    launchEdge: (executable, arguments_) => {
      const child = commands.spawn(executable, [...arguments_], {
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
      });
      child.once('error', () => undefined);
      child.unref();
    },
  };
}

export class WindowsBrowserProcessController implements BrowserProcessController {
  public constructor(
    private readonly runtime: BrowserProcessRuntime = createWindowsBrowserRuntime(),
  ) {}

  public async restart(browser: BiliBrowser, port: number): Promise<void> {
    if (browser === 'chrome') {
      throw new ExternalServiceError(
        'BROWSER_RESTART_UNSUPPORTED',
        'Chrome 136 及以上版本不支持此受控启动方式，请改用 Edge 或手工录入',
        409,
      );
    }
    const executable = await findEdgeExecutable(this.runtime);
    await this.runtime.stopEdge();
    this.runtime.launchEdge(executable, [
      `--remote-debugging-port=${port}`,
      '--restore-last-session',
      '--no-first-run',
    ]);
  }
}

async function findEdgeExecutable(runtime: BrowserProcessRuntime): Promise<string> {
  const candidates = [
    runtime.environment['PROGRAMFILES(X86)'],
    runtime.environment['PROGRAMFILES'],
    runtime.environment['LOCALAPPDATA'],
  ]
    .filter((value): value is string => value !== undefined && value !== '')
    .map((root) => join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
  for (const candidate of candidates) {
    try {
      await runtime.access(candidate);
      return candidate;
    } catch {
      // Continue through the fixed allowlist.
    }
  }
  throw new ExternalServiceError('BROWSER_NOT_FOUND', '未找到受支持的 Edge 浏览器', 404);
}
