import { overviewQuerySchema, reviewQuerySchema } from '@workbench/shared';
import { Router } from 'express';

import { parseInput } from '../../http/validation.js';
import type { InsightService } from './service.js';

export function createInsightRouter(service: InsightService): Router {
  const router = Router();

  router.get('/overview', (request, response) => {
    const { date } = parseInput(overviewQuerySchema, request.query);
    response.setHeader('Cache-Control', 'no-store');
    response.json(service.overview(date));
  });

  router.get('/review', (request, response) => {
    const { from, to } = parseInput(reviewQuerySchema, request.query);
    response.setHeader('Cache-Control', 'no-store');
    response.json(service.review(from, to));
  });

  return router;
}
