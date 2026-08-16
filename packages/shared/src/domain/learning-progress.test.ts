import { describe, expect, it } from 'vitest';

import {
  LearningObservationConflictError,
  mergeLearningObservation,
  type LearningPartProgressState,
  type LearningProgressState,
} from './learning-progress.js';

const parts = [
  { id: 'part-a', partNumber: 1, durationSeconds: 100 },
  { id: 'part-b', partNumber: 2, durationSeconds: 200 },
];
const empty: LearningProgressState = {
  furthestPartId: null,
  furthestSeconds: 0,
  resumePartId: null,
  resumeSeconds: 0,
  completed: false,
  completedAt: null,
  lastObservedAt: null,
  manualOverrideAt: null,
};

function observe(
  state: LearningProgressState,
  partId: string,
  seconds: number,
  observedAt: string,
) {
  return mergeLearningObservation(parts, state, null, { partId, seconds, observedAt });
}

describe('mergeLearningObservation', () => {
  it('moves furthest and resume forward on the first reliable observation', () => {
    const result = observe(empty, 'part-a', 40, '2026-08-13T12:00:00.000Z');
    expect(result).toMatchObject({ changed: true, ignored: false });
    expect(result.progress).toMatchObject({
      furthestPartId: 'part-a',
      furthestSeconds: 40,
      resumePartId: 'part-a',
      resumeSeconds: 40,
    });
    expect(result.partProgress).toMatchObject({ furthestSeconds: 40, completed: false });
  });

  it('keeps furthest monotonic while a newer resume position can move backward', () => {
    const first = observe(empty, 'part-b', 150, '2026-08-13T12:00:00.000Z');
    const replay = observe(first.progress, 'part-a', 20, '2026-08-13T13:00:00.000Z');
    expect(replay.progress).toMatchObject({
      furthestPartId: 'part-b',
      furthestSeconds: 150,
      resumePartId: 'part-a',
      resumeSeconds: 20,
    });
  });

  it('compares cross-part absolute positions and is stable across part reordering', () => {
    const first = observe(empty, 'part-a', 90, '2026-08-13T12:00:00.000Z');
    const second = mergeLearningObservation([...parts].reverse(), first.progress, null, {
      partId: 'part-b',
      seconds: 1,
      observedAt: '2026-08-13T12:01:00.000Z',
    });
    expect(second.progress).toMatchObject({ furthestPartId: 'part-b', furthestSeconds: 1 });
  });

  it('ignores older observations behind a manual override barrier', () => {
    const state = {
      ...empty,
      manualOverrideAt: '2026-08-13T12:00:00.000Z',
    };
    expect(observe(state, 'part-a', 50, '2026-08-13T12:00:00.000Z')).toMatchObject({
      changed: false,
      ignored: true,
      progress: state,
    });
    expect(observe(state, 'part-a', 50, '2026-08-13T11:59:59.999Z').ignored).toBe(true);
    expect(observe(state, 'part-a', 50, '2026-08-13T12:00:00.001Z').ignored).toBe(false);
  });

  it('treats an identical timestamp/position as idempotent and conflicts otherwise', () => {
    const first = observe(empty, 'part-a', 50, '2026-08-13T12:00:00.000Z');
    expect(observe(first.progress, 'part-a', 50, '2026-08-13T12:00:00.000Z')).toMatchObject({
      changed: false,
      ignored: false,
    });
    expect(() => observe(first.progress, 'part-a', 51, '2026-08-13T12:00:00.000Z')).toThrow(
      LearningObservationConflictError,
    );
    expect(() => observe(first.progress, 'part-b', 50, '2026-08-13T12:00:00.000Z')).toThrow(
      LearningObservationConflictError,
    );
  });

  it('completes a part only at its duration and preserves existing completion', () => {
    const completed = observe(empty, 'part-a', 100, '2026-08-13T12:00:00.000Z');
    expect(completed.partProgress).toMatchObject({
      furthestSeconds: 100,
      completed: true,
      completedAt: '2026-08-13T12:00:00.000Z',
    });
    const replay = mergeLearningObservation(parts, completed.progress, completed.partProgress, {
      partId: 'part-a',
      seconds: 20,
      observedAt: '2026-08-13T13:00:00.000Z',
    });
    expect(replay.partProgress).toMatchObject({ furthestSeconds: 100, completed: true });
  });

  it('does not regress resource or part progress for an older observation', () => {
    const progress: LearningProgressState = {
      ...empty,
      furthestPartId: 'part-a',
      furthestSeconds: 50,
      resumePartId: 'part-a',
      resumeSeconds: 50,
      lastObservedAt: '2026-08-13T13:00:00.000Z',
    };
    const partProgress: LearningPartProgressState = {
      furthestSeconds: 50,
      watchedSeconds: 0,
      lastSeconds: 50,
      completed: false,
      completedAt: null,
      lastObservedAt: '2026-08-13T13:00:00.000Z',
    };
    const result = mergeLearningObservation(parts, progress, partProgress, {
      partId: 'part-a',
      seconds: 20,
      observedAt: '2026-08-13T12:00:00.000Z',
    });

    expect(result).toEqual({
      progress,
      partProgress,
      watchedDelta: 0,
      changed: false,
      ignored: false,
    });
  });

  it('does not infer completion for a zero-duration part', () => {
    const result = mergeLearningObservation(
      [{ id: 'zero', partNumber: 1, durationSeconds: 0 }],
      empty,
      null,
      {
        partId: 'zero',
        seconds: 0,
        observedAt: '2026-08-13T12:00:00.000Z',
      },
    );
    expect(result.partProgress.completed).toBe(false);
  });

  it.each([
    ['unknown part', parts, 'missing', 1],
    ['negative seconds', parts, 'part-a', -1],
    ['past duration', parts, 'part-a', 101],
    ['empty parts', [], 'part-a', 1],
    ['duplicate ids', [parts[0]!, parts[0]!], 'part-a', 1],
    [
      'duplicate order',
      [parts[0]!, { id: 'part-c', partNumber: 1, durationSeconds: 10 }],
      'part-a',
      1,
    ],
  ])('rejects %s', (_label, inputParts, partId, seconds) => {
    expect(() =>
      mergeLearningObservation(inputParts, empty, null, {
        partId,
        seconds,
        observedAt: '2026-08-13T12:00:00.000Z',
      }),
    ).toThrow(RangeError);
  });

  it('rejects non-canonical timestamps and invalid part metadata', () => {
    expect(() => observe(empty, 'part-a', 1, 'yesterday')).toThrow(RangeError);
    expect(() =>
      mergeLearningObservation([{ id: 'x', partNumber: 0, durationSeconds: 1 }], empty, null, {
        partId: 'x',
        seconds: 1,
        observedAt: '2026-08-13T12:00:00.000Z',
      }),
    ).toThrow(RangeError);
  });
});

describe('mergeLearningObservation watched duration', () => {
  function step(
    previous: { progress: LearningProgressState; partProgress: LearningPartProgressState | null },
    partId: string,
    seconds: number,
    observedAt: string,
  ) {
    return mergeLearningObservation(parts, previous.progress, previous.partProgress, {
      partId,
      seconds,
      observedAt,
    });
  }

  it('establishes a baseline without counting the first observation', () => {
    const result = step(
      { progress: empty, partProgress: null },
      'part-a',
      40,
      '2026-08-13T12:00:00.000Z',
    );
    expect(result.watchedDelta).toBe(0);
    expect(result.partProgress).toMatchObject({ watchedSeconds: 0, lastSeconds: 40 });
  });

  it('accumulates continuous playback between observations', () => {
    const first = step(
      { progress: empty, partProgress: null },
      'part-a',
      40,
      '2026-08-13T12:00:00.000Z',
    );
    const second = step(first, 'part-a', 100, '2026-08-13T12:01:05.000Z');
    expect(second.watchedDelta).toBe(60);
    expect(second.partProgress).toMatchObject({ watchedSeconds: 60, lastSeconds: 100 });
  });

  it('caps suspicious jumps so seeking is not counted', () => {
    const first = step(
      { progress: empty, partProgress: null },
      'part-a',
      0,
      '2026-08-13T12:00:00.000Z',
    );
    const jump = step(first, 'part-a', 100, '2026-08-13T12:00:10.000Z');
    // 间隔 10 秒：封顶 10 * 3 + 15 = 45 秒，而非 100 秒。
    expect(jump.watchedDelta).toBe(45);
    expect(jump.partProgress.watchedSeconds).toBe(45);
  });

  it('counts 1.5x playback by the original-speed timeline', () => {
    const first = step(
      { progress: empty, partProgress: null },
      'part-a',
      0,
      '2026-08-13T12:00:00.000Z',
    );
    // 1.5 倍速看 40 实分钟，时间轴推进 2400 秒，全额计入。
    const watched = step(first, 'part-a', 100, '2026-08-13T12:40:00.000Z');
    expect(watched.partProgress).toMatchObject({ furthestSeconds: 100, watchedSeconds: 100 });
  });

  it('does not count rewinds', () => {
    const first = step(
      { progress: empty, partProgress: null },
      'part-a',
      90,
      '2026-08-13T12:00:00.000Z',
    );
    const rewind = step(first, 'part-a', 20, '2026-08-13T12:01:00.000Z');
    expect(rewind.watchedDelta).toBe(0);
    expect(rewind.partProgress.lastSeconds).toBe(20);
  });

  it('accumulates again after rewinding past the previous position', () => {
    const first = step(
      { progress: empty, partProgress: null },
      'part-a',
      90,
      '2026-08-13T12:00:00.000Z',
    );
    const rewind = step(first, 'part-a', 60, '2026-08-13T12:01:00.000Z');
    const forward = step(rewind, 'part-a', 80, '2026-08-13T12:03:00.000Z');
    expect(forward.watchedDelta).toBe(20);
    expect(forward.partProgress.watchedSeconds).toBe(20);
  });

  it('ignores stale out-of-order observations for watched duration', () => {
    const first = step(
      { progress: empty, partProgress: null },
      'part-a',
      40,
      '2026-08-13T12:00:00.000Z',
    );
    const stale = step(first, 'part-a', 90, '2026-08-13T11:59:00.000Z');
    expect(stale.watchedDelta).toBe(0);
    expect(stale.partProgress).toMatchObject({ watchedSeconds: 0, lastSeconds: 40 });
  });
});
