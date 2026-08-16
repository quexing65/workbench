import { createTaskSchema, taskListQuerySchema, updateTaskSchema } from '@workbench/shared';
import { Router } from 'express';

import {
  parseIfMatch,
  parseInput,
  parseUuidParameter,
  setRevisionEtag,
} from '../../http/validation.js';
import type { TaskService } from './service.js';

export function createTaskRouter(service: TaskService): Router {
  const router = Router();

  router.get('/', (request, response) => {
    const { date } = parseInput(taskListQuerySchema, request.query);
    response.json({ items: service.list(date) });
  });

  router.get('/overdue', (request, response) => {
    const { date } = parseInput(taskListQuerySchema, request.query);
    response.json({ items: service.listOverdue(date) });
  });

  router.post('/', (request, response) => {
    const task = service.create(parseInput(createTaskSchema, request.body));
    setRevisionEtag(response, task.revision);
    response.status(201).json(task);
  });

  router.patch('/:id', (request, response) => {
    const task = service.update(
      parseUuidParameter(request),
      parseInput(updateTaskSchema, request.body),
    );
    setRevisionEtag(response, task.revision);
    response.json(task);
  });

  router.delete('/:id', (request, response) => {
    service.delete(parseUuidParameter(request), parseIfMatch(request));
    response.status(204).end();
  });

  return router;
}
