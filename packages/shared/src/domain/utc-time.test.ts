import { describe, expect, it } from 'vitest';

import { epochMillisecondsToIso, isoToEpochMilliseconds, MAX_UTC_EPOCH_MS } from './utc-time.js';

describe('UTC time conversion', () => {
  it('round trips epoch milliseconds and canonical ISO strings', () => {
    const value = 1_786_595_200_123;
    expect(isoToEpochMilliseconds(epochMillisecondsToIso(value))).toBe(value);
  });

  it.each([-1, 1.5, Number.NaN, MAX_UTC_EPOCH_MS + 1])('rejects epoch %s', (value) => {
    expect(() => epochMillisecondsToIso(value)).toThrow(RangeError);
  });

  it.each(['2026-02-30T00:00:00.000Z', '2026-08-13T00:00:00Z', '2026-08-13 00:00:00'])(
    'rejects non-canonical timestamp %s',
    (value) => expect(() => isoToEpochMilliseconds(value)).toThrow(RangeError),
  );
});
