import { describe, expect, it } from 'vitest';

import { overviewResponseSchema } from './overview.js';
import { reviewQuerySchema, reviewResponseSchema } from './review.js';

describe('insight contracts', () => {
  it('accepts truthful empty overview and review payloads', () => {
    const day = {
      date: '2026-08-13',
      planned: 0,
      completed: 0,
      cancelled: 0,
      completionRate: null,
      learningActivities: 0,
    };
    expect(
      overviewResponseSchema.safeParse({
        date: day.date,
        today: { items: [], planned: 0, active: 0, completed: 0, cancelled: 0 },
        overdueTasks: [],
        recentNotes: [],
        nextLearning: null,
        last7Days: Array.from({ length: 7 }, () => day),
      }).success,
    ).toBe(true);
    expect(
      reviewResponseSchema.safeParse({
        from: day.date,
        to: day.date,
        days: [day],
        totals: {
          planned: 0,
          completed: 0,
          cancelled: 0,
          completionRate: null,
          learningActivities: 0,
        },
        learningDuration: { totalSeconds: 0, bySeries: [] },
      }).success,
    ).toBe(true);
  });

  it('rejects reversed and oversized review ranges', () => {
    expect(reviewQuerySchema.safeParse({ from: 'not-a-date', to: '2026-08-13' }).success).toBe(
      false,
    );
    expect(reviewQuerySchema.safeParse({ from: '2026-08-14', to: '2026-08-13' }).success).toBe(
      false,
    );
    expect(reviewQuerySchema.safeParse({ from: '2025-08-01', to: '2026-08-14' }).success).toBe(
      false,
    );
    expect(reviewQuerySchema.safeParse({ from: '2025-08-14', to: '2026-08-14' }).success).toBe(
      true,
    );
  });
});
