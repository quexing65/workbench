import { isoToEpochMilliseconds } from './utc-time.js';

export interface LearningProgressPart {
  readonly id: string;
  readonly partNumber: number;
  readonly durationSeconds: number;
}

export interface LearningProgressState {
  readonly furthestPartId: string | null;
  readonly furthestSeconds: number;
  readonly resumePartId: string | null;
  readonly resumeSeconds: number;
  readonly completed: boolean;
  readonly completedAt: string | null;
  readonly lastObservedAt: string | null;
  readonly manualOverrideAt: string | null;
}

export interface LearningPartProgressState {
  readonly furthestSeconds: number;
  readonly watchedSeconds: number;
  readonly lastSeconds: number;
  readonly completed: boolean;
  readonly completedAt: string | null;
  readonly lastObservedAt: string | null;
}

/** 相邻两次观察之间允许的最大播放速率，超出视为拖动跳过。 */
export const WATCH_RATE_CAP = 3;

/** 跳过判定的时间容差（秒），用于吸收观察时间戳的误差。 */
export const WATCH_GRACE_SECONDS = 15;

export interface LearningObservation {
  readonly partId: string;
  readonly seconds: number;
  readonly observedAt: string;
}

export interface LearningMergeResult {
  readonly progress: LearningProgressState;
  readonly partProgress: LearningPartProgressState;
  /** 本次观察计入的实际观看秒数（按原速时长，拖动跳过不计）。 */
  readonly watchedDelta: number;
  readonly changed: boolean;
  readonly ignored: boolean;
}

export class LearningObservationConflictError extends Error {
  public constructor() {
    super('相同观察时间包含不同进度');
    this.name = 'LearningObservationConflictError';
  }
}

function validateParts(parts: readonly LearningProgressPart[]): LearningProgressPart[] {
  const ordered = [...parts].sort((left, right) => left.partNumber - right.partNumber);
  if (
    ordered.length === 0 ||
    new Set(ordered.map(({ id }) => id)).size !== ordered.length ||
    new Set(ordered.map(({ partNumber }) => partNumber)).size !== ordered.length ||
    ordered.some(
      ({ partNumber, durationSeconds }) =>
        !Number.isInteger(partNumber) ||
        partNumber < 1 ||
        !Number.isInteger(durationSeconds) ||
        durationSeconds < 0,
    )
  ) {
    throw new RangeError('Learning parts must have unique identities and positive ordering');
  }
  return ordered;
}

function position(parts: readonly LearningProgressPart[], partId: string, seconds: number): number {
  if (!Number.isInteger(seconds) || seconds < 0) {
    throw new RangeError('Learning seconds must be a non-negative integer');
  }
  let offset = 0;
  for (const part of parts) {
    if (part.id === partId) {
      if (seconds > part.durationSeconds) {
        throw new RangeError('Learning seconds exceed the part duration');
      }
      return offset + seconds;
    }
    offset += part.durationSeconds;
  }
  throw new RangeError('Learning part does not belong to this resource');
}

function timestamp(value: string | null): number | null {
  return value === null ? null : isoToEpochMilliseconds(value);
}

function watchedDeltaFor(
  partProgress: LearningPartProgressState,
  observedAt: number,
  seconds: number,
): number {
  const partLatest = timestamp(partProgress.lastObservedAt);
  if (partLatest === null || observedAt <= partLatest) return 0;
  const delta = seconds - partProgress.lastSeconds;
  if (delta <= 0) return 0;
  const cap = Math.ceil(((observedAt - partLatest) / 1000) * WATCH_RATE_CAP + WATCH_GRACE_SECONDS);
  return Math.min(delta, cap);
}

export function mergeLearningObservation(
  parts: readonly LearningProgressPart[],
  progress: LearningProgressState,
  currentPartProgress: LearningPartProgressState | null,
  observation: LearningObservation,
): LearningMergeResult {
  const ordered = validateParts(parts);
  const observedAt = isoToEpochMilliseconds(observation.observedAt);
  const manualOverrideAt = timestamp(progress.manualOverrideAt);
  const candidatePosition = position(ordered, observation.partId, observation.seconds);
  const observedPart = ordered.find(({ id }) => id === observation.partId)!;

  if (manualOverrideAt !== null && observedAt <= manualOverrideAt) {
    return {
      progress,
      partProgress: currentPartProgress ?? {
        furthestSeconds: 0,
        watchedSeconds: 0,
        lastSeconds: 0,
        completed: false,
        completedAt: null,
        lastObservedAt: null,
      },
      watchedDelta: 0,
      changed: false,
      ignored: true,
    };
  }

  const lastObservedAt = timestamp(progress.lastObservedAt);
  if (lastObservedAt === observedAt) {
    if (
      progress.resumePartId !== observation.partId ||
      progress.resumeSeconds !== observation.seconds
    ) {
      throw new LearningObservationConflictError();
    }
    return {
      progress,
      partProgress: currentPartProgress ?? {
        furthestSeconds: observation.seconds,
        watchedSeconds: 0,
        lastSeconds: observation.seconds,
        completed: false,
        completedAt: null,
        lastObservedAt: observation.observedAt,
      },
      watchedDelta: 0,
      changed: false,
      ignored: false,
    };
  }

  const currentPosition =
    progress.furthestPartId === null
      ? 0
      : position(ordered, progress.furthestPartId, progress.furthestSeconds);
  const advancesFurthest = progress.furthestPartId === null || candidatePosition > currentPosition;
  const advancesLatest = lastObservedAt === null || observedAt > lastObservedAt;
  const partProgress = currentPartProgress ?? {
    furthestSeconds: 0,
    watchedSeconds: 0,
    lastSeconds: 0,
    completed: false,
    completedAt: null,
    lastObservedAt: null,
  };
  const partLatest = timestamp(partProgress.lastObservedAt);
  const advancesPartObservedAt = partLatest === null || observedAt > partLatest;
  const watchedDelta = advancesPartObservedAt
    ? watchedDeltaFor(partProgress, observedAt, observation.seconds)
    : 0;
  const partCompleted =
    partProgress.completed ||
    (observedPart.durationSeconds > 0 && observation.seconds === observedPart.durationSeconds);
  const nextPartProgress: LearningPartProgressState = {
    furthestSeconds: Math.max(partProgress.furthestSeconds, observation.seconds),
    watchedSeconds: partProgress.watchedSeconds + watchedDelta,
    lastSeconds: advancesPartObservedAt ? observation.seconds : partProgress.lastSeconds,
    completed: partCompleted,
    completedAt: partProgress.completedAt ?? (partCompleted ? observation.observedAt : null),
    lastObservedAt:
      partLatest === null || observedAt > partLatest
        ? observation.observedAt
        : partProgress.lastObservedAt,
  };
  const nextProgress: LearningProgressState = {
    ...progress,
    furthestPartId: advancesFurthest ? observation.partId : progress.furthestPartId,
    furthestSeconds: advancesFurthest ? observation.seconds : progress.furthestSeconds,
    resumePartId: advancesLatest ? observation.partId : progress.resumePartId,
    resumeSeconds: advancesLatest ? observation.seconds : progress.resumeSeconds,
    lastObservedAt: advancesLatest ? observation.observedAt : progress.lastObservedAt,
  };

  return {
    progress: nextProgress,
    partProgress: nextPartProgress,
    watchedDelta,
    changed:
      advancesFurthest ||
      advancesLatest ||
      nextPartProgress.furthestSeconds !== partProgress.furthestSeconds ||
      nextPartProgress.watchedSeconds !== partProgress.watchedSeconds ||
      nextPartProgress.lastSeconds !== partProgress.lastSeconds ||
      nextPartProgress.completed !== partProgress.completed ||
      nextPartProgress.lastObservedAt !== partProgress.lastObservedAt,
    ignored: false,
  };
}
