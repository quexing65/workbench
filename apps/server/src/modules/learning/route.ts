import {
  completeLearningProgressSchema,
  createLearningSeriesSchema,
  importLearningResourceSchema,
  observeLearningProgressSchema,
  replaceLearningSeriesItemsSchema,
  resetLearningProgressSchema,
  updateLearningSeriesSchema,
} from '@workbench/shared';
import { Router } from 'express';

import {
  parseIfMatch,
  parseInput,
  parseUuidParameter,
  setRevisionEtag,
} from '../../http/validation.js';
import type { LearningSeriesService } from './series-service.js';
import type { LearningService } from './service.js';

export function createLearningRouter(
  learning: LearningService,
  series: LearningSeriesService,
): Router {
  const router = Router();

  router.get('/resources', (_request, response) => response.json({ items: learning.list() }));
  router.post('/resources', async (request, response) => {
    const result = await learning.import(parseInput(importLearningResourceSchema, request.body));
    if (result.kind === 'resource') setRevisionEtag(response, result.resource.revision);
    response.status(result.kind === 'resource' ? 201 : 202).json(result);
  });
  router.get('/resources/:id', (request, response) => {
    const resource = learning.find(parseUuidParameter(request));
    setRevisionEtag(response, resource.revision);
    response.json(resource);
  });
  router.delete('/resources/:id', (request, response) => {
    learning.delete(parseUuidParameter(request), parseIfMatch(request));
    response.status(204).end();
  });
  router.post('/resources/:id/progress/observe', (request, response) => {
    const resource = learning.observe(
      parseUuidParameter(request),
      parseInput(observeLearningProgressSchema, request.body),
    );
    setRevisionEtag(response, resource.progress.revision);
    response.json(resource);
  });
  router.post('/resources/:id/progress/complete', (request, response) => {
    const input = parseInput(completeLearningProgressSchema, request.body);
    const resource = learning.manual(parseUuidParameter(request), input.revision, 'complete');
    setRevisionEtag(response, resource.progress.revision);
    response.json(resource);
  });
  router.post('/resources/:id/progress/reset', (request, response) => {
    const input = parseInput(resetLearningProgressSchema, request.body);
    const resource = learning.manual(parseUuidParameter(request), input.revision, 'reset');
    setRevisionEtag(response, resource.progress.revision);
    response.json(resource);
  });

  router.get('/series', (_request, response) => response.json({ items: series.list() }));
  router.post('/series', (request, response) => {
    const item = series.create(parseInput(createLearningSeriesSchema, request.body));
    setRevisionEtag(response, item.revision);
    response.status(201).json(item);
  });
  router.patch('/series/:id', (request, response) => {
    const item = series.update(
      parseUuidParameter(request),
      parseInput(updateLearningSeriesSchema, request.body),
    );
    setRevisionEtag(response, item.revision);
    response.json(item);
  });
  router.put('/series/:id/items', (request, response) => {
    const item = series.replaceItems(
      parseUuidParameter(request),
      parseInput(replaceLearningSeriesItemsSchema, request.body),
    );
    setRevisionEtag(response, item.revision);
    response.json(item);
  });
  router.delete('/series/:id', (request, response) => {
    series.delete(parseUuidParameter(request), parseIfMatch(request));
    response.status(204).end();
  });

  return router;
}
