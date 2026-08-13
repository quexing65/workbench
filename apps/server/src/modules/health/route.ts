import { Router } from 'express';

import { healthResponseSchema } from '@workbench/shared';

import type { ServerConfig } from '../../config.js';

export function createHealthRouter(config: ServerConfig): Router {
  const router = Router();

  router.get('/', (_request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.json(
      healthResponseSchema.parse({
        status: 'ok',
        version: '0.1.0',
        timeZone: config.timeZone,
      }),
    );
  });

  return router;
}
