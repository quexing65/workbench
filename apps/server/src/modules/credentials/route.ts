import { fetchBiliCredentialSchema, saveBiliCredentialSchema } from '@workbench/shared';
import { Router } from 'express';

import { parseInput } from '../../http/validation.js';
import type { CredentialService } from './service.js';

export function createCredentialRouter(service: CredentialService): Router {
  const router = Router();
  router.get('/status', async (_request, response) => response.json(await service.status()));
  router.put('/', async (request, response) => {
    response.json(await service.save(parseInput(saveBiliCredentialSchema, request.body)));
  });
  router.delete('/', async (_request, response) => {
    await service.clear();
    response.status(204).end();
  });
  router.post('/fetch', async (request, response) => {
    response.json(await service.fetch(parseInput(fetchBiliCredentialSchema, request.body)));
  });
  return router;
}
