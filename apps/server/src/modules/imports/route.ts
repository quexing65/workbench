import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { applyImportSchema, importSourceTypeSchema } from '@workbench/shared';
import { Router, type RequestHandler } from 'express';
import multer, { MulterError } from 'multer';

import { AppError } from '../../http/errors.js';
import { parseInput, parseUuidParameter } from '../../http/validation.js';
import type { ImportService } from './import-service.js';

function uploadMiddleware(root: string): RequestHandler {
  mkdirSync(root, { recursive: true });
  const destinations = new WeakMap<object, string>();
  const upload = multer({
    storage: multer.diskStorage({
      destination: (request, _file, callback) => {
        try {
          const destination = mkdtempSync(join(root, 'upload-'));
          destinations.set(request, destination);
          callback(null, destination);
        } catch (error) {
          callback(error as Error, '');
        }
      },
      filename: (_request, _file, callback) => callback(null, 'source.bin'),
    }),
    limits: { fileSize: 50 * 1024 * 1024, files: 1, fields: 2, parts: 3 },
  }).single('file');
  return (request, response, next) => {
    upload(request, response, (error: unknown) => {
      if (error === undefined) next();
      else {
        const destination = destinations.get(request);
        if (destination !== undefined) rmSync(destination, { recursive: true, force: true });
        if (error instanceof MulterError) {
          next(new AppError(413, 'IMPORT_UPLOAD_REJECTED', '导入文件超过限制或字段无效'));
        } else next(new AppError(400, 'IMPORT_UPLOAD_FAILED', '导入文件无法接收'));
      }
    });
  };
}

export function createImportRouter(service: ImportService, uploadRoot: string): Router {
  const router = Router();
  router.post('/preflight', uploadMiddleware(uploadRoot), async (request, response, next) => {
    const file = request.file;
    if (file === undefined) {
      next(new AppError(400, 'IMPORT_FILE_REQUIRED', '必须上传一个导入文件'));
      return;
    }
    try {
      const sourceType = importSourceTypeSchema.parse(request.body['sourceType']);
      const rawTimezone = request.body['sourceTimezone'];
      const sourceTimezone =
        typeof rawTimezone === 'string' && rawTimezone.trim() !== ''
          ? rawTimezone.trim()
          : undefined;
      const result = await service.preflight({
        sourceType,
        ...(sourceTimezone === undefined ? {} : { sourceTimezone }),
        temporaryPath: file.path,
      });
      response.status(result.report.status === 'ready' ? 201 : 422).json(result);
    } catch (error) {
      rmSync(file.destination, { recursive: true, force: true });
      if (error instanceof Error && error.name === 'ZodError') {
        next(new AppError(400, 'VALIDATION_ERROR', '导入来源类型无效'));
      } else next(error);
    }
  });

  router.post('/:id/apply', async (request, response, next) => {
    try {
      const input = parseInput(applyImportSchema, request.body);
      response.json(await service.apply(parseUuidParameter(request), input.confirmationToken));
    } catch (error) {
      next(error);
    }
  });

  router.get('/:id/report', (request, response) => {
    response.json(service.report(parseUuidParameter(request)));
  });
  return router;
}
