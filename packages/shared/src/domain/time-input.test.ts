import { describe, expect, it } from 'vitest';

import { formatClockInput, parseClockInput } from './time-input.js';

describe('parseClockInput', () => {
  it('accepts bare seconds', () => {
    expect(parseClockInput('45')).toBe(45);
    expect(parseClockInput(' 130 ')).toBe(130);
    expect(parseClockInput('0')).toBe(0);
  });

  it('accepts clock formats and converts to seconds', () => {
    expect(parseClockInput('1:30')).toBe(90);
    expect(parseClockInput('02:30')).toBe(150);
    expect(parseClockInput('1:02:03')).toBe(3723);
    expect(parseClockInput('0:00')).toBe(0);
  });

  it('rejects malformed, out-of-range and empty inputs', () => {
    expect(parseClockInput('')).toBeNull();
    expect(parseClockInput('   ')).toBeNull();
    expect(parseClockInput('abc')).toBeNull();
    expect(parseClockInput('1:90')).toBeNull();
    expect(parseClockInput('60:30')).toBeNull();
    expect(parseClockInput('1:2:3:4')).toBeNull();
    expect(parseClockInput('-45')).toBeNull();
    expect(parseClockInput('1:3.5')).toBeNull();
    expect(parseClockInput('::')).toBeNull();
    expect(parseClockInput('99999999')).toBeNull();
  });
});

describe('formatClockInput', () => {
  it('formats sub-hour durations as m:ss', () => {
    expect(formatClockInput(0)).toBe('0:00');
    expect(formatClockInput(45)).toBe('0:45');
    expect(formatClockInput(90)).toBe('1:30');
    expect(formatClockInput(3599)).toBe('59:59');
  });

  it('formats hour-plus durations as h:mm:ss', () => {
    expect(formatClockInput(3600)).toBe('1:00:00');
    expect(formatClockInput(3723)).toBe('1:02:03');
    expect(formatClockInput(9999)).toBe('2:46:39');
  });

  it('is round-trippable for clock-shaped values', () => {
    for (const seconds of [0, 5, 60, 90, 3600, 3723, 9999]) {
      expect(parseClockInput(formatClockInput(seconds))).toBe(seconds);
    }
  });
});
