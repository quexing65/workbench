import { describe, expect, it } from 'vitest';

import { compareBusinessDates, isBusinessDate, parseBusinessDate } from './business-date.js';

describe('business dates', () => {
  it('accepts real Gregorian dates including leap days', () => {
    expect(parseBusinessDate('2024-02-29')).toEqual({ year: 2024, month: 2, day: 29 });
    expect(isBusinessDate('2000-02-29')).toBe(true);
  });

  it.each(['2026-02-30', '2100-02-29', '2026-13-01', '2026-1-01', '0000-01-01'])(
    'rejects %s',
    (value) => expect(isBusinessDate(value)).toBe(false),
  );

  it('compares validated dates lexically', () => {
    expect(compareBusinessDates('2026-08-13', '2026-08-14')).toBeLessThan(0);
    expect(() => compareBusinessDates('2026-02-30', '2026-03-01')).toThrow(RangeError);
  });
});
