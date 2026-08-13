import { describe, expect, it, vi } from 'vitest';

import {
  createWindowsBrowserRuntime,
  WindowsBrowserProcessController,
  type BrowserNativeCommands,
  type BrowserProcessRuntime,
} from '../src/modules/credentials/browser-process.js';

function runtime(foundSuffix = 'msedge.exe'): BrowserProcessRuntime {
  return {
    environment: {
      'PROGRAMFILES(X86)': 'C:/Program Files (x86)',
      PROGRAMFILES: 'C:/Program Files',
      LOCALAPPDATA: 'C:/Users/test/AppData/Local',
    },
    access: vi.fn(async (path: string) => {
      if (!path.endsWith(foundSuffix)) throw new Error('missing');
    }),
    stopEdge: vi.fn().mockResolvedValue(undefined),
    launchEdge: vi.fn(),
  };
}

describe('WindowsBrowserProcessController', () => {
  it('builds fixed native stop and launch commands', async () => {
    const child = { once: vi.fn(), unref: vi.fn() };
    const commands = {
      execFile: vi.fn((_file, _args, _options, callback) => {
        callback(null, '', '');
        return child;
      }),
      spawn: vi.fn(() => child),
    } as unknown as BrowserNativeCommands;
    const platform = createWindowsBrowserRuntime(
      commands,
      {},
      vi.fn().mockResolvedValue(undefined),
    );
    await platform.stopEdge();
    platform.launchEdge('C:/fixed/msedge.exe', ['--remote-debugging-port=9222']);
    expect(commands.execFile).toHaveBeenCalledWith(
      'taskkill.exe',
      ['/IM', 'msedge.exe', '/T', '/F'],
      { windowsHide: true },
      expect.any(Function),
    );
    expect(commands.spawn).toHaveBeenCalledWith(
      'C:/fixed/msedge.exe',
      ['--remote-debugging-port=9222'],
      { detached: true, stdio: 'ignore', windowsHide: false },
    );
    expect(child.once).toHaveBeenCalledWith('error', expect.any(Function));
    expect(child.unref).toHaveBeenCalledTimes(1);
  });

  it('never attempts to restart Chrome', async () => {
    const platform = runtime();
    const controller = new WindowsBrowserProcessController(platform);
    await expect(controller.restart('chrome', 9224)).rejects.toMatchObject({
      code: 'BROWSER_RESTART_UNSUPPORTED',
    });
    expect(platform.stopEdge).not.toHaveBeenCalled();
  });

  it('launches only an allowlisted Edge executable and fixed arguments', async () => {
    const platform = runtime();
    const controller = new WindowsBrowserProcessController(platform);
    await controller.restart('edge', 9222);
    expect(platform.stopEdge).toHaveBeenCalledTimes(1);
    expect(platform.launchEdge).toHaveBeenCalledWith(
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      ['--remote-debugging-port=9222', '--restore-last-session', '--no-first-run'],
    );
  });

  it('reports a safe error when no allowlisted Edge executable exists', async () => {
    const platform = runtime('never-found');
    await expect(
      new WindowsBrowserProcessController(platform).restart('edge', 9222),
    ).rejects.toMatchObject({ code: 'BROWSER_NOT_FOUND' });
    expect(platform.stopEdge).not.toHaveBeenCalled();
  });
});
