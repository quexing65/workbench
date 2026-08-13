export const MAX_UTC_EPOCH_MS = 253_402_300_799_999;

function assertEpochMilliseconds(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_UTC_EPOCH_MS) {
    throw new RangeError('Epoch milliseconds are outside the supported UTC range');
  }
}

export function epochMillisecondsToIso(value: number): string {
  assertEpochMilliseconds(value);
  return new Date(value).toISOString();
}

export function isoToEpochMilliseconds(value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > MAX_UTC_EPOCH_MS) {
    throw new RangeError('Timestamp must be a supported UTC ISO 8601 value');
  }

  if (new Date(parsed).toISOString() !== value) {
    throw new RangeError('Timestamp must use canonical UTC ISO 8601 format');
  }

  return parsed;
}
