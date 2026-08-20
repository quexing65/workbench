import type { RequestHandler } from 'express';

/**
 * Defense-in-depth headers for API and static responses alike. The server
 * only listens on loopback, but these headers are free and protect against
 * content sniffing and framing if the origin is ever embedded elsewhere.
 */
export const securityHeaders: RequestHandler = (_request, response, next) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('X-Frame-Options', 'DENY');
  next();
};
