import { type Router, Router as createRouter } from 'express';

import { AppError } from '../../http/errors.js';
import type { BackupService } from './service.js';

type BackupCreator = Pick<BackupService, 'create'>;

export function createBackupRouter(service: BackupCreator): Router {
  const router = createRouter();
  let creating = false;
  router.post('/', async (_request, response, next) => {
    if (creating) {
      next(new AppError(409, 'BACKUP_ALREADY_RUNNING', '已有备份正在创建'));
      return;
    }
    creating = true;
    try {
      const result = await service.create();
      response.download(
        result.path,
        result.fileName,
        {
          headers: {
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
          },
        },
        (error) => {
          creating = false;
          result.cleanup();
          if (error !== undefined) next(error);
        },
      );
    } catch (error) {
      creating = false;
      next(error);
    }
  });
  return router;
}
