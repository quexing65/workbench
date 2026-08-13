const LOCAL_TIME = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/u;

function partsAt(epochMs: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(epochMs));
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value['year']}-${value['month']}-${value['day']} ${value['hour']}:${value['minute']}:${value['second']}`;
}

export function validateTimeZone(timeZone: string): void {
  try {
    new Intl.DateTimeFormat('en', { timeZone }).format(0);
  } catch {
    throw new RangeError('来源时区无效');
  }
}

export function qoderLocalTimeToEpoch(value: string, timeZone: string): number {
  validateTimeZone(timeZone);
  const match = LOCAL_TIME.exec(value);
  if (match === null) throw new RangeError('qoder 本地时间格式无效');
  const fields = match.slice(1).map(Number);
  const [year, month, day, hour, minute, second] = fields as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const naive = Date.UTC(year, month - 1, day, hour, minute, second);
  let candidate = naive;
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const displayed = partsAt(candidate, timeZone);
    const shown = LOCAL_TIME.exec(displayed)!;
    const values = shown.slice(1).map(Number) as [number, number, number, number, number, number];
    const displayedAsUtc = Date.UTC(
      values[0],
      values[1] - 1,
      values[2],
      values[3],
      values[4],
      values[5],
    );
    candidate += naive - displayedAsUtc;
  }
  if (partsAt(candidate, timeZone) !== value) throw new RangeError('qoder 本地时间不存在或有歧义');
  for (const deltaMinutes of [-120, -90, -60, -30, 30, 60, 90, 120]) {
    if (partsAt(candidate + deltaMinutes * 60_000, timeZone) === value) {
      throw new RangeError('qoder 本地时间不存在或有歧义');
    }
  }
  return candidate;
}
