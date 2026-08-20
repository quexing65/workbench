import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';

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
    let cleanup = () => {};
    try {
      const result = await service.create();
      cleanup = result.cleanup;
      // Stream the archive manually: res.download relies on send, whose
      // default dotfile policy rejects any path containing a dot segment
      // (such as the default data directory ".local") with a bare 404.
      response.status(200);
      response.setHeader('Content-Type', 'application/octet-stream');
      response.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('X-Content-Type-Options', 'nosniff');
      await pipeline(createReadStream(result.path), response);
    } catch (error) {
      if (!response.headersSent) next(error);
    } finally {
      creating = false;
      cleanup();
    }
  });
  return router;
}
