import type { IncomingMessage, ServerResponse } from 'node:http';

import pino, { type DestinationStream, type Logger, type LoggerOptions } from 'pino';
import { pinoHttp } from 'pino-http';

import type { ServerConfig } from '../config.js';

const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers.set-cookie',
  'req.body.sessdata',
  'req.body.SESSDATA',
  'req.body.credential',
  'req.body.credentials',
];

function safePath(rawUrl: string | undefined): string {
  if (rawUrl === undefined) {
    return '/';
  }

  return rawUrl.split('?', 1)[0] ?? '/';
}

function serializeRequest(
  request: IncomingMessage & { id?: unknown; requestId?: string },
): Record<string, unknown> {
  return {
    requestId: request.requestId ?? (typeof request.id === 'string' ? request.id : undefined),
    method: request.method,
    path: safePath(request.url),
  };
}

function serializeResponse(response: ServerResponse): Record<string, unknown> {
  return { statusCode: response.statusCode };
}

function serializeError(error: Error): Record<string, unknown> {
  return { type: error.name };
}

const loggerOptions = (config: ServerConfig): LoggerOptions => ({
  level: config.logLevel,
  redact: { paths: REDACT_PATHS, censor: '[Redacted]' },
  serializers: {
    req: serializeRequest,
    res: serializeResponse,
    err: serializeError,
  },
});

export function createLogger(config: ServerConfig, destination?: DestinationStream): Logger {
  const options = loggerOptions(config);
  return destination === undefined ? pino(options) : pino(options, destination);
}

export function requestLogger(logger: Logger) {
  return pinoHttp({
    logger,
    wrapSerializers: false,
    serializers: {
      req: serializeRequest,
      res: serializeResponse,
      err: serializeError,
    },
    genReqId(request: IncomingMessage) {
      return (request as IncomingMessage & { requestId?: string }).requestId ?? 'unknown';
    },
  });
}
