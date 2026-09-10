/**
 * 学习进度录入的时钟解析：接受「分:秒」/「时:分:秒」或裸秒数，返回非负整数秒。
 * 分、秒段必须 < 60（「1:90」非法）；裸秒数段允许任意非负值。无效输入返回 null，
 * 由调用方决定提示；不做四舍五入以外的宽容处理。
 */
const BARE_SECONDS = /^\d{1,7}$/u;
const CLOCK_PART = /^\d{1,2}$/u;
const MAX_CLOCK_INPUT_LENGTH = 11;

export function parseClockInput(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_CLOCK_INPUT_LENGTH) return null;
  if (BARE_SECONDS.test(trimmed)) return Number(trimmed);
  const parts = trimmed.split(':');
  if (parts.length < 2 || parts.length > 3) return null;
  if (!parts.every((part) => CLOCK_PART.test(part))) return null;
  const numbers = parts.map((part) => Number(part));
  const seconds = numbers[numbers.length - 1]!;
  const minutes = numbers.length >= 2 ? numbers[numbers.length - 2]! : 0;
  const hours = numbers.length === 3 ? numbers[0]! : 0;
  if (seconds > 59 || minutes > 59) return null;
  return hours * 3600 + minutes * 60 + seconds;
}

/** 与 parseClockInput 互补的格式化：不足一小时为「m:ss」，一小时以上为「h:mm:ss」。 */
export function formatClockInput(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const pad = (value: number) => String(value).padStart(2, '0');
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}
