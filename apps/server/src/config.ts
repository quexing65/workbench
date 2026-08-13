import { z } from 'zod';

const serverConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.literal('127.0.0.1').default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(8790),
  WEB_DEV_ORIGIN: z.string().default('http://127.0.0.1:5190'),
  APP_TIME_ZONE: z.string().min(1).default('Asia/Shanghai'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export interface ServerConfig {
  readonly nodeEnv: 'development' | 'test' | 'production';
  readonly host: '127.0.0.1';
  readonly port: number;
  readonly webDevOrigin: string;
  readonly timeZone: string;
  readonly logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
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

  return {
    nodeEnv: parsed.NODE_ENV,
    host: parsed.HOST,
    port: parsed.PORT,
    webDevOrigin,
    timeZone: parsed.APP_TIME_ZONE,
    logLevel: parsed.LOG_LEVEL,
  };
}

export function getServerOrigin(config: ServerConfig): string {
  return `http://${config.host}:${config.port}`;
}
