import { describe, expect, it } from 'vitest';

import {
  addBusinessDays,
  businessDateOfEpochMilliseconds,
  businessDateSpan,
  businessDayStartEpochMilliseconds,
  businessToday,
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

  it('refuses to step outside the representable business date range', () => {
    expect(addBusinessDays('0001-01-07', -6)).toBe('0001-01-01');
    expect(addBusinessDays('9999-12-31', 0)).toBe('9999-12-31');
    // 此前会静默产出 0000-12-26 / 10000-01-01 这类非法业务日
    expect(() => addBusinessDays('0001-01-06', -6)).toThrow(RangeError);
    expect(() => addBusinessDays('9999-12-31', 1)).toThrow(RangeError);
  });

  it('assigns instants to the business day of the configured zone', () => {
    const shanghai = 'Asia/Shanghai';
    expect(businessDateOfEpochMilliseconds(Date.parse('2026-08-13T15:59:59.999Z'), shanghai)).toBe(
      '2026-08-13',
    );
    expect(businessDateOfEpochMilliseconds(Date.parse('2026-08-13T16:00:00.000Z'), shanghai)).toBe(
      '2026-08-14',
    );

    const newYork = 'America/New_York';
    expect(businessDateOfEpochMilliseconds(Date.parse('2026-08-14T03:59:59.000Z'), newYork)).toBe(
      '2026-08-13',
    );
    expect(businessDateOfEpochMilliseconds(Date.parse('2026-08-14T04:00:00.000Z'), newYork)).toBe(
      '2026-08-14',
    );

    expect(() => businessDateOfEpochMilliseconds(0, 'Not/AZone')).toThrow(RangeError);
    expect(() => businessDateOfEpochMilliseconds(-1, shanghai)).toThrow(RangeError);
  });

  it('resolves the UTC instant of a zone-local midnight including offsets and DST', () => {
    expect(businessDayStartEpochMilliseconds('2026-08-13', 'Asia/Shanghai')).toBe(
      Date.parse('2026-08-12T16:00:00.000Z'),
    );
    // +05:30 半小时偏移，验证分钟级校正。
    expect(businessDayStartEpochMilliseconds('2026-08-13', 'Asia/Kolkata')).toBe(
      Date.parse('2026-08-12T18:30:00.000Z'),
    );
    // 2026-03-08 是美东夏令时切换日：午夜仍是 EST，次日午夜已是 EDT。
    expect(businessDayStartEpochMilliseconds('2026-03-08', 'America/New_York')).toBe(
      Date.parse('2026-03-08T05:00:00.000Z'),
    );
    expect(businessDayStartEpochMilliseconds('2026-03-09', 'America/New_York')).toBe(
      Date.parse('2026-03-09T04:00:00.000Z'),
    );
    expect(() => businessDayStartEpochMilliseconds('2026-02-30', 'Asia/Shanghai')).toThrow(
      RangeError,
    );
  });

  it('derives the current business day in the configured zone', () => {
    const now = () => Date.parse('2026-08-13T20:00:00.000Z');
    expect(businessToday('Asia/Shanghai', now)).toBe('2026-08-14');
    expect(businessToday('America/New_York', now)).toBe('2026-08-13');
  });
});
