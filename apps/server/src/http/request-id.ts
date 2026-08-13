import { randomUUID } from 'node:crypto';

import type { RequestHandler } from 'express';

declare module 'express-serve-static-core' {
  interface Request {
    requestId: string;
  }
}

export const requestId: RequestHandler = (request, response, next) => {
  const value = randomUUID();
  request.requestId = value;
  response.setHeader('X-Request-Id', value);
  next();
};
