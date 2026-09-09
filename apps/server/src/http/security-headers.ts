import type { RequestHandler } from 'express';

/**
 * Defense-in-depth headers for API and static responses alike. The server
 * only listens on loopback, but these headers are free and protect against
 * content sniffing and framing if the origin is ever embedded elsewhere.
 *
 * CSP 是限制同源 XSS 的纵深防线：脚本只允许来自同源的构建产物，页面即使被
 * 注入脚本标签也无法执行。样式仍允许内联，因为 React 通过 CSSOM 设置的行内
 * 样式依赖它，且本应用不渲染任何用户提供的 HTML。
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join('; ');

export const securityHeaders: RequestHandler = (_request, response, next) => {
  response.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('X-Frame-Options', 'DENY');
  next();
};
