import {
  createRecurringTaskSchema,
  occurrenceParamsSchema,
  updateOccurrenceSchema,
  updateRecurringTaskSchema,
} from '@workbench/shared';
import { Router } from 'express';

import {
  parseIfMatch,
  parseInput,
  parseUuidParameter,
  setRevisionEtag,
} from '../../http/validation.js';
import type { RecurringService } from './service.js';

export function createRecurringRouter(service: RecurringService): Router {
  const router = Router();

  router.get('/', (_request, response) => response.json({ items: service.list() }));

  router.post('/', (request, response) => {
    const item = service.create(parseInput(createRecurringTaskSchema, request.body));
    setRevisionEtag(response, item.revision);
    response.status(201).json(item);
  });

  router.patch('/:id', (request, response) => {
    const item = service.update(
      parseUuidParameter(request),
      parseInput(updateRecurringTaskSchema, request.body),
    );
    setRevisionEtag(response, item.revision);
    response.json(item);
  });

  router.delete('/:id', (request, response) => {
    service.delete(parseUuidParameter(request), parseIfMatch(request));
    response.status(204).end();
  });

  router.put('/:id/occurrences/:date', (request, response) => {
    const parameters = parseInput(occurrenceParamsSchema, request.params);
    const occurrence = service.updateOccurrence(
      parameters.id,
      parameters.date,
      parseInput(updateOccurrenceSchema, request.body),
    );
    setRevisionEtag(response, occurrence.revision);
    response.json({ ...occurrence, date: parameters.date, templateId: parameters.id });
  });

  return router;
}
