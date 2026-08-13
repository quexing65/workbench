import { describe, expect, it } from 'vitest';

import { createNoteSchema, noteListQuerySchema, updateNoteSchema } from './notes.js';
import {
  createRecurringTaskSchema,
  occurrenceParamsSchema,
  updateRecurringTaskSchema,
  updateOccurrenceSchema,
} from './recurring-tasks.js';
import { createTaskSchema, taskListQuerySchema, updateTaskSchema } from './tasks.js';

describe('business API contracts', () => {
  it('normalizes valid task and note inputs', () => {
    expect(createTaskSchema.parse({ title: '  报告  ', date: '2026-08-13' })).toEqual({
      title: '报告',
      description: '',
      date: '2026-08-13',
    });
    expect(createNoteSchema.parse({ content: '  灵感  ' })).toEqual({
      content: '灵感',
      pinned: false,
    });
    expect(noteListQuerySchema.parse({ limit: '500', pinned: 'true' })).toEqual({
      limit: 500,
      pinned: true,
    });
  });

  it('rejects invalid dates, empty updates, excessive fields and limits', () => {
    expect(() => taskListQuerySchema.parse({ date: '2026-02-30' })).toThrow();
    expect(() => createTaskSchema.parse({ title: '', date: '2026-08-13' })).toThrow();
    expect(() => updateTaskSchema.parse({ revision: 1 })).toThrow();
    expect(() => updateNoteSchema.parse({ revision: 1 })).toThrow();
    expect(() => noteListQuerySchema.parse({ limit: '501' })).toThrow();
    expect(() => noteListQuerySchema.parse({ unknown: 'x' })).toThrow();
  });

  it('validates recurring ranges and occurrence revision zero', () => {
    expect(
      createRecurringTaskSchema.parse({ title: '复盘', startDate: '2026-08-13' }),
    ).toMatchObject({ description: '', endDate: null });
    expect(() =>
      createRecurringTaskSchema.parse({
        title: '复盘',
        startDate: '2026-08-14',
        endDate: '2026-08-13',
      }),
    ).toThrow();
    expect(updateOccurrenceSchema.parse({ revision: 0, status: 'completed' })).toEqual({
      revision: 0,
      status: 'completed',
    });
    expect(() => occurrenceParamsSchema.parse({ id: 'bad', date: '2026-08-13' })).toThrow();
    expect(() => updateRecurringTaskSchema.parse({ revision: 1 })).toThrow();
    expect(updateRecurringTaskSchema.parse({ revision: 1, endDate: null })).toEqual({
      revision: 1,
      endDate: null,
    });
  });
});
