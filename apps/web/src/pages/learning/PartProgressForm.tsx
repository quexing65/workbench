import { formatClockInput, parseClockInput } from '@workbench/shared';
import { useMemo, useState } from 'react';

/**
 * 单集进度录入：接受「分:秒」「时:分:秒」或裸秒数，附「+5 分钟」「看到结尾」快捷步进。
 * 值超过本集时长时禁用提交并给出行内错误；服务端仍以秒为唯一单位。
 * 父组件以 key={partId} 挂载：切换集数时重挂载并回到该集已记录位置，
 * 同一集内保留用户正在编辑的文本。
 */
export function PartProgressForm({
  partTitle,
  initialSeconds,
  durationSeconds,
  pending,
  onRecord,
}: {
  readonly partTitle: string;
  readonly initialSeconds: number;
  readonly durationSeconds: number;
  readonly pending: boolean;
  readonly onRecord: (seconds: number) => void;
}) {
  const [value, setValue] = useState(() => formatClockInput(initialSeconds));

  const parsed = useMemo(() => parseClockInput(value), [value]);
  const tooLong = parsed !== null && parsed > durationSeconds;
  const error =
    value.trim() !== '' && parsed === null
      ? '格式应为 分:秒（如 12:30）或直接输入秒数。'
      : tooLong
        ? '不能超过本集时长。'
        : null;

  const bump = (delta: number) => {
    const base = parsed ?? initialSeconds;
    setValue(formatClockInput(Math.min(Math.max(base + delta, 0), durationSeconds)));
  };

  return (
    <form
      className="part-progress-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (parsed !== null && !tooLong) onRecord(parsed);
      }}
    >
      <label>
        本集看到
        <input
          aria-label={`${partTitle} 看到位置`}
          data-shortcut="new"
          value={value}
          inputMode="numeric"
          placeholder="0:00"
          maxLength={11}
          onChange={(event) => setValue(event.target.value)}
        />
      </label>
      <div className="part-progress-form__quick">
        <button type="button" className="button-secondary" onClick={() => bump(300)}>
          +5 分钟
        </button>
        <button
          type="button"
          className="button-secondary"
          onClick={() => setValue(formatClockInput(durationSeconds))}
        >
          看到结尾
        </button>
      </div>
      <button disabled={pending || parsed === null || tooLong}>记录进度</button>
      {error !== null ? (
        <p role="alert" className="form-error">
          {error}
        </p>
      ) : null}
    </form>
  );
}
