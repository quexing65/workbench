import { Router } from 'express';

import { healthResponseSchema } from '@workbench/shared';

import type { ServerConfig } from '../../config.js';

export interface HealthDatabaseState {
  readonly schemaVersion: number;
}

export function createHealthRouter(
  config: ServerConfig,
  database: HealthDatabaseState,
  version: string,
): Router {
  const router = Router();

  router.get('/', (_request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.json(
      healthResponseSchema.parse({
        status: 'ok',
        version,
        database: 'ok',
        schemaVersion: database.schemaVersion,
        timeZone: config.timeZone,
        dataDirectory: config.dataDirectory,
      }),
    );
  });

  return router;
}
