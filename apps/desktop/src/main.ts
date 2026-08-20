import { app, BrowserWindow, dialog, shell } from 'electron';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { startEmbeddedServer, type EmbeddedServer } from './server-process.js';

const DIST_DIRECTORY = fileURLToPath(new URL('.', import.meta.url));
const DEVELOPMENT_URL = 'http://127.0.0.1:5190';
const MINIMUM_EMBEDDED_NODE_MAJOR = 24;

const isDevelopment = process.argv.includes('--dev');

/**
 * dpapi.ps1 由外部进程 powershell.exe 读取，asar 虚拟文件系统对外部进程不可见，
 * 因此打包产物把它释放到 app.asar.unpacked 并在这里解析真实磁盘路径。
 * migrations 与 web dist 仍留在 asar 内，由 Electron 补丁版 fs 正常读取。
 */
function dpapiScriptPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'app.asar.unpacked', 'dist', 'dpapi.ps1')
    : join(DIST_DIRECTORY, 'dpapi.ps1');
}

let server: EmbeddedServer | undefined;
let mainWindow: BrowserWindow | undefined;

function embeddedNodeMajor(): number {
  const major = Number(process.versions.node.split('.')[0]);
  return Number.isFinite(major) ? major : 0;
}

function showErrorAndExit(title: string, detail: string): void {
  dialog.showErrorBox(title, detail);
  app.exit(1);
}

function isAddressInUse(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'EADDRINUSE'
  );
}

function describeStartupError(error: unknown): string {
  if (isAddressInUse(error)) {
    return '端口 8790 已被占用。请关闭占用端口的程序（例如已在运行的 Personal Workbench 或 npm run dev）后重试。';
  }
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('already in use')) {
    return '数据目录正被另一个进程使用。请先停止另一个 Personal Workbench 服务（npm run dev、正式服务或恢复 CLI）后重试。';
  }
  return message;
}

function parseUrl(value: string): URL | undefined {
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}

async function createMainWindow(targetUrl: string): Promise<void> {
  const allowedOrigin = parseUrl(targetUrl)?.origin;

  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 360,
    minHeight: 480,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow = window;
  window.once('ready-to-show', () => {
    window.show();
  });
  window.on('closed', () => {
    if (mainWindow === window) {
      mainWindow = undefined;
    }
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    const parsed = parseUrl(url);
    if (parsed !== undefined && (parsed.protocol === 'http:' || parsed.protocol === 'https:')) {
      void shell.openExternal(parsed.href);
    }
    return { action: 'deny' };
  });

  window.webContents.on('will-navigate', (event, url) => {
    const parsed = parseUrl(url);
    if (parsed === undefined || allowedOrigin === undefined || parsed.origin !== allowedOrigin) {
      event.preventDefault();
    }
  });

  await window.loadURL(targetUrl);
}

async function bootstrap(): Promise<void> {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }

  app.on('second-instance', () => {
    if (mainWindow === undefined) {
      return;
    }
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
  });

  await app.whenReady();

  if (embeddedNodeMajor() < MINIMUM_EMBEDDED_NODE_MAJOR) {
    showErrorAndExit(
      'Personal Workbench 无法启动',
      `当前 Electron 内置 Node.js 为 v${process.versions.node}，要求 v24 或更高，请更新应用。`,
    );
    return;
  }

  let targetUrl = DEVELOPMENT_URL;
  if (!isDevelopment) {
    try {
      // 与 CLI 正式运行保持一致：production 决定数据目录（LOCALAPPDATA）、
      // origin guard 允许的同源地址以及静态资源托管行为。
      process.env['NODE_ENV'] = 'production';
      server = await startEmbeddedServer({
        migrationDirectory: join(DIST_DIRECTORY, 'migrations'),
        dpapiScriptPath: dpapiScriptPath(),
        webDistDirectory: join(DIST_DIRECTORY, 'web'),
      });
      targetUrl = `http://${server.host}:${server.port}/`;
    } catch (error) {
      showErrorAndExit('Personal Workbench 启动失败', describeStartupError(error));
      return;
    }
  }

  try {
    await createMainWindow(targetUrl);
  } catch (error) {
    showErrorAndExit('Personal Workbench 窗口加载失败', describeStartupError(error));
  }
}

app.on('window-all-closed', () => {
  app.quit();
});

app.on('will-quit', () => {
  server?.stop();
});

void bootstrap();
