import { describe, expect, it } from 'vitest';

import {
  LearningObservationConflictError,
  mergeLearningObservation,
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
