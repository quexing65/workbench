import { resolve } from 'node:path';

import { z } from 'zod';

const serverConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.literal('127.0.0.1').default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(8790),
  WEB_DEV_ORIGIN: z.string().default('http://127.0.0.1:5190'),
  APP_TIME_ZONE: z.string().min(1).default('Asia/Shanghai'),
  WORKBENCH_DATA_DIR: z.string().min(1).optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  BILI_SYNC_ENABLED: z.enum(['true', 'false']).default('false'),
});

export interface ServerConfig {
  readonly nodeEnv: 'development' | 'test' | 'production';
  readonly host: '127.0.0.1';
  readonly port: number;
  readonly webDevOrigin: string;
  readonly timeZone: string;
  readonly dataDirectory: string;
  readonly logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
  readonly biliSyncEnabled: boolean;
}

function parseOrigin(value: string): string {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error('WEB_DEV_ORIGIN must be an absolute HTTP origin');
  }

  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    url.username !== '' ||
    url.password !== '' ||
    url.pathname !== '/' ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    throw new Error('WEB_DEV_ORIGIN must contain only an HTTP(S) origin');
  }

  return url.origin;
}

function assertTimeZone(value: string): void {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
  } catch {
    throw new Error('APP_TIME_ZONE must be a valid IANA time zone');
  }
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): ServerConfig {
  const parsed = serverConfigSchema.parse(environment);
  const webDevOrigin = parseOrigin(parsed.WEB_DEV_ORIGIN);
  assertTimeZone(parsed.APP_TIME_ZONE);
  const defaultDataDirectory =
    parsed.NODE_ENV === 'production' && environment['LOCALAPPDATA'] !== undefined
      ? resolve(environment['LOCALAPPDATA'], 'PersonalWorkbenchVNext')
      : resolve('.local');

  return {
    nodeEnv: parsed.NODE_ENV,
    host: parsed.HOST,
    port: parsed.PORT,
    webDevOrigin,
    timeZone: parsed.APP_TIME_ZONE,
    dataDirectory:
      parsed.WORKBENCH_DATA_DIR === undefined
        ? defaultDataDirectory
        : resolve(parsed.WORKBENCH_DATA_DIR),
    logLevel: parsed.LOG_LEVEL,
    biliSyncEnabled: parsed.BILI_SYNC_ENABLED === 'true',
  };
}

export function getServerOrigin(config: ServerConfig): string {
  return `http://${config.host}:${config.port}`;
}
