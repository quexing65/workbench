import { startLearningSyncSchema } from '@workbench/shared';
import { Router } from 'express';

import { parseInput, parseUuidParameter } from '../../http/validation.js';
import type { LearningSyncService } from './service.js';

export function createLearningSyncRouter(service: LearningSyncService): Router {
  const router = Router();
  router.post('/', async (request, response) => {
    const input = parseInput(startLearningSyncSchema, request.body);
    response.status(202).json({ runId: await service.start(input.pages) });
  });
  router.get('/:id', (request, response) => {
    response.json(service.find(parseUuidParameter(request)));
  });
  return router;
}
