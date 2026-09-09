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
        // 正式运行不暴露本机绝对路径；开发/测试保留，供 E2E 隔离守卫核对。
        ...(config.nodeEnv === 'production' ? {} : { dataDirectory: config.dataDirectory }),
      }),
    );
  });

  return router;
}
