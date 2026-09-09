import { MAX_UTC_EPOCH_MS } from './utc-time.js';

const BUSINESS_DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;

/** 业务日默认时区；`APP_TIME_ZONE` 未配置时与配置校验共用此常量。 */
export const DEFAULT_BUSINESS_TIME_ZONE = 'Asia/Shanghai';

/** 四位年份可表示的最大业务日；该日之后没有次日可用作开区间上界。 */
export const MAX_BUSINESS_DATE = '9999-12-31';

export interface BusinessDateParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

const BUSINESS_DATE_FORMATTERS = new Map<string, Intl.DateTimeFormat>();
const ZONE_OFFSET_FORMATTERS = new Map<string, Intl.DateTimeFormat>();

function cachedFormatter(
  cache: Map<string, Intl.DateTimeFormat>,
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const cached = cache.get(timeZone);
  if (cached !== undefined) return cached;

  const formatter = new Intl.DateTimeFormat('en-US', { ...options, timeZone });
  cache.set(timeZone, formatter);
  return formatter;
}

function partValue(parts: readonly Intl.DateTimeFormatPart[], type: string): number {
  const part = parts.find((candidate) => candidate.type === type);
  if (part === undefined) throw new RangeError(`Formatted timestamp is missing ${type}`);
  return Number(part.value);
}

function assertEpochMilliseconds(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_UTC_EPOCH_MS) {
    throw new RangeError('Epoch milliseconds are outside the supported UTC range');
  }
}

function utcInstant(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): number {
  const date = new Date(0);
  date.setUTCHours(hour, minute, second, 0);
  // setUTCFullYear avoids the 1900+year mapping that Date.UTC applies below year 100.
  date.setUTCFullYear(year, month - 1, day);
  return date.getTime();
}

function zoneOffsetMilliseconds(epochMilliseconds: number, timeZone: string): number {
  const truncated = Math.floor(epochMilliseconds / 1_000) * 1_000;
  const parts = cachedFormatter(ZONE_OFFSET_FORMATTERS, timeZone, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(truncated));

  const asUtc = utcInstant(
    partValue(parts, 'year'),
    partValue(parts, 'month'),
    partValue(parts, 'day'),
    partValue(parts, 'hour'),
    partValue(parts, 'minute'),
    partValue(parts, 'second'),
  );
  return asUtc - truncated;
}

/** 把 UTC 时刻归属到指定 IANA 时区的业务日（`YYYY-MM-DD`）。 */
export function businessDateOfEpochMilliseconds(
  epochMilliseconds: number,
  timeZone: string = DEFAULT_BUSINESS_TIME_ZONE,
): string {
  assertEpochMilliseconds(epochMilliseconds);
  const parts = cachedFormatter(BUSINESS_DATE_FORMATTERS, timeZone, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(epochMilliseconds));
  const year = String(partValue(parts, 'year')).padStart(4, '0');
  const month = String(partValue(parts, 'month')).padStart(2, '0');
  const day = String(partValue(parts, 'day')).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 指定时区中某个业务日 00:00 对应的 UTC epoch 毫秒。
 * 先按猜测偏移求解，再用该时刻的真实偏移校正一次，以覆盖夏令时切换。
 */
export function businessDayStartEpochMilliseconds(
  value: string,
  timeZone: string = DEFAULT_BUSINESS_TIME_ZONE,
): number {
  const { year, month, day } = parseBusinessDate(value);
  const naive = utcInstant(year, month, day);
  const guessed = zoneOffsetMilliseconds(naive, timeZone);
  const candidate = naive - guessed;
  const corrected = zoneOffsetMilliseconds(candidate, timeZone);
  return corrected === guessed ? candidate : naive - corrected;
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
