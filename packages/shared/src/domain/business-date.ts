const BUSINESS_DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;

export interface BusinessDateParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return leap ? 29 : 28;
  }

  return new Set([4, 6, 9, 11]).has(month) ? 30 : 31;
}

export function parseBusinessDate(value: string): BusinessDateParts {
  const match = BUSINESS_DATE.exec(value);
  if (match === null) {
    throw new RangeError('Business date must use YYYY-MM-DD');
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new RangeError('Business date is not a real Gregorian date');
  }

  return { year, month, day };
}

export function isBusinessDate(value: string): boolean {
  try {
    parseBusinessDate(value);
    return true;
  } catch {
    return false;
  }
}

export function compareBusinessDates(left: string, right: string): number {
  parseBusinessDate(left);
  parseBusinessDate(right);
  return left.localeCompare(right);
}

function toEpochDay(value: string): number {
  const { year, month, day } = parseBusinessDate(value);
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return Math.floor(date.getTime() / 86_400_000);
}

export function addBusinessDays(value: string, days: number): string {
  if (!Number.isInteger(days)) throw new RangeError('Days must be an integer');
  const date = new Date((toEpochDay(value) + days) * 86_400_000);
  const year = String(date.getUTCFullYear()).padStart(4, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function businessDateSpan(from: string, to: string): number {
  return toEpochDay(to) - toEpochDay(from) + 1;
}
