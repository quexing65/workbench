import { createNoteSchema, noteListQuerySchema, updateNoteSchema } from '@workbench/shared';
import { Router } from 'express';

import {
  parseIfMatch,
  parseInput,
  parseUuidParameter,
  setRevisionEtag,
} from '../../http/validation.js';
import type { NoteService } from './service.js';

export function createNoteRouter(service: NoteService): Router {
  const router = Router();

  router.get('/', (request, response) => {
    const query = parseInput(noteListQuerySchema, request.query);
    response.json(
      service.list({
        limit: query.limit,
        ...(query.q === undefined ? {} : { query: query.q }),
        ...(query.pinned === undefined ? {} : { pinned: query.pinned }),
        ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
      }),
    );
  });

  router.post('/', (request, response) => {
    const item = service.create(parseInput(createNoteSchema, request.body));
    setRevisionEtag(response, item.revision);
    response.status(201).json(item);
  });

  router.patch('/:id', (request, response) => {
    const item = service.update(
      parseUuidParameter(request),
      parseInput(updateNoteSchema, request.body),
    );
    setRevisionEtag(response, item.revision);
    response.json(item);
  });

  router.delete('/:id', (request, response) => {
    service.delete(parseUuidParameter(request), parseIfMatch(request));
    response.status(204).end();
  });

  return router;
}
