import { describe, expect, it } from 'vitest';

import {
  addBusinessDays,
  businessDateSpan,
  compareBusinessDates,
  isBusinessDate,
  parseBusinessDate,
} from './business-date.js';

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

  it('adds calendar days and computes inclusive spans without local-time drift', () => {
    expect(addBusinessDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addBusinessDays('2024-12-31', 1)).toBe('2025-01-01');
    expect(addBusinessDays('2025-01-01', -1)).toBe('2024-12-31');
    expect(addBusinessDays('0001-01-01', 1)).toBe('0001-01-02');
    expect(businessDateSpan('2026-08-07', '2026-08-13')).toBe(7);
    expect(() => addBusinessDays('2026-08-13', 0.5)).toThrow(RangeError);
  });
});
