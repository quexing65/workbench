import { readFileSync, statSync } from 'node:fs';

import { isoToEpochMilliseconds, normalizeBiliUrl } from '@workbench/shared';

import type {
  ParsedImportSource,
  SourceEntity,
  SourceTombstone,
  TaskImportPayload,
} from '../contracts.js';
import { hashValue } from '../source-hash.js';
import { personalDataSchema, personalWrapperSchema, type PersonalData } from './personal-schema.js';

const MAX_PERSONAL_BYTES = 5 * 1024 * 1024;

function epoch(value: string | undefined): number | null {
  return value === undefined ? null : isoToEpochMilliseconds(value);
}

function entity(
  sourceKind: string,
  sourceId: string,
  targetKind: string,
  payload: SourceEntity['payload'],
): SourceEntity {
  return { sourceKind, sourceId, targetKind, sourceHash: hashValue(payload), payload };
}

function taskPayload(item: PersonalData['tasks'][number]): TaskImportPayload {
  return {
    kind: 'task',
    title: item.title,
    description: '',
    date: item.date,
    status: item.status,
    createdAtMs: isoToEpochMilliseconds(item.createdAt),
    updatedAtMs: isoToEpochMilliseconds(item.updatedAt),
    completedAtMs: epoch(item.completedAt),
    cancelledAtMs: epoch(item.cancelledAt),
  };
}

function newestBy<T>(
  items: readonly T[],
  key: (item: T) => string,
  updated: (item: T) => string,
): T[] {
  const selected = new Map<string, T>();
  for (const item of items) {
    const id = key(item);
    const current = selected.get(id);
    if (
      current === undefined ||
      updated(item) > updated(current) ||
      (updated(item) === updated(current) && hashValue(item) > hashValue(current))
    )
      selected.set(id, item);
  }
  return [...selected.values()].sort((left, right) => key(left).localeCompare(key(right)));
}

function hasAmbiguousDuplicate<T>(
  items: readonly T[],
  key: (item: T) => string,
  updated: (item: T) => string,
): boolean {
  const seen = new Map<string, string>();
  for (const item of items) {
    const identity = `${key(item)}\u0000${updated(item)}`;
    const digest = hashValue(item);
    const existing = seen.get(identity);
    if (existing !== undefined && existing !== digest) return true;
    seen.set(identity, digest);
  }
  return false;
}

function containsAmbiguousDuplicate(data: PersonalData): boolean {
  if (
    hasAmbiguousDuplicate(
      data.tasks,
      ({ id }) => id,
      ({ updatedAt }) => updatedAt,
    ) ||
    hasAmbiguousDuplicate(
      data.notes,
      ({ id }) => id,
      ({ updatedAt }) => updatedAt,
    ) ||
    hasAmbiguousDuplicate(
      data.studyItems,
      ({ id }) => id,
      ({ updatedAt }) => updatedAt,
    )
  )
    return true;
  if (
    data.version === 3 &&
    (hasAmbiguousDuplicate(
      data.fixedTasks,
      ({ id }) => id,
      ({ updatedAt }) => updatedAt,
    ) ||
      hasAmbiguousDuplicate(
        data.fixedTaskDays,
        (item) => `${item.fixedTaskId}:${item.date}`,
        ({ updatedAt }) => updatedAt,
      ))
  )
    return true;
  return (
    data.version !== 1 &&
    hasAmbiguousDuplicate(
      data.tombstones,
      (item) => `${item.entity}:${item.id}:${item.canonicalKey ?? ''}`,
      ({ deletedAt }) => deletedAt,
    )
  );
}

function mapPersonal(data: PersonalData): Omit<ParsedImportSource, 'sourceSchema'> {
  const entities: SourceEntity[] = [];
  for (const item of newestBy(
    data.tasks,
    ({ id }) => id,
    ({ updatedAt }) => updatedAt,
  )) {
    entities.push(entity('task', item.id, 'task', taskPayload(item)));
  }
  if (data.version === 3) {
    for (const item of newestBy(
      data.fixedTasks,
      ({ id }) => id,
      ({ updatedAt }) => updatedAt,
    )) {
      const payload = {
        kind: 'recurring' as const,
        title: item.title,
        startDate: item.startDate,
        endDate: item.endDate ?? null,
        createdAtMs: isoToEpochMilliseconds(item.createdAt),
        updatedAtMs: isoToEpochMilliseconds(item.updatedAt),
      };
      entities.push(entity('fixed_task', item.id, 'recurring', payload));
    }
    for (const item of newestBy(
      data.fixedTaskDays,
      (day) => `${day.fixedTaskId}:${day.date}`,
      ({ updatedAt }) => updatedAt,
    )) {
      const payload = {
        kind: 'occurrence' as const,
        templateSourceId: item.fixedTaskId,
        date: item.date,
        status: item.status,
        updatedAtMs: isoToEpochMilliseconds(item.updatedAt),
        completedAtMs: epoch(item.completedAt),
        cancelledAtMs: epoch(item.cancelledAt),
      };
      entities.push(
        entity('fixed_task_day', `${item.fixedTaskId}:${item.date}`, 'occurrence', payload),
      );
    }
  }
  for (const item of newestBy(
    data.notes,
    ({ id }) => id,
    ({ updatedAt }) => updatedAt,
  )) {
    const payload = {
      kind: 'note' as const,
      content: item.content,
      pinned: item.pinned,
      createdAtMs: isoToEpochMilliseconds(item.createdAt),
      updatedAtMs: isoToEpochMilliseconds(item.updatedAt),
    };
    entities.push(entity('note', item.id, 'note', payload));
  }

  const warnings: ParsedImportSource['warnings'][number][] = [];
  for (const item of newestBy(
    data.studyItems,
    ({ id }) => id,
    ({ updatedAt }) => updatedAt,
  )) {
    try {
      const normalized = normalizeBiliUrl(item.sourceUrl);
      if (normalized.kind === 'short') {
        const payload = {
          kind: 'unresolved' as const,
          normalizedUrl: normalized.url,
          title: item.title,
          partNumber: normalized.partNumber,
          positionSeconds: item.lastPositionSec,
          status: item.status,
          lastOpenedAtMs: epoch(item.lastOpenedAt),
          createdAtMs: isoToEpochMilliseconds(item.createdAt),
          updatedAtMs: isoToEpochMilliseconds(item.updatedAt),
        };
        entities.push(entity('study', item.id, 'unresolved', payload));
      } else {
        const payload = {
          kind: 'learning' as const,
          bvid: normalized.bvid!,
          sourceUrl: normalized.url,
          title: item.title,
          partNumber: normalized.partNumber,
          positionSeconds: item.lastPositionSec,
          status: item.status,
          observedAtMs: epoch(item.lastOpenedAt),
          completedAtMs: epoch(item.completedAt),
          createdAtMs: isoToEpochMilliseconds(item.createdAt),
          updatedAtMs: isoToEpochMilliseconds(item.updatedAt),
        };
        entities.push(entity('study', item.id, 'learning', payload));
      }
    } catch {
      warnings.push({
        code: 'PERSONAL_STUDY_URL_REJECTED',
        entity: 'study',
        sourceId: item.id,
        message: '学习链接无法安全识别，已拒绝该条记录',
      });
    }
  }

  const tombstones: SourceTombstone[] =
    data.version === 1
      ? []
      : newestBy(
          data.tombstones,
          (item) => `${item.entity}:${item.id}:${item.canonicalKey ?? ''}`,
          ({ deletedAt }) => deletedAt,
        ).map((item) => ({
          entityKind: item.entity,
          sourceId: item.id,
          canonicalKey: item.canonicalKey ?? null,
          deletedAtMs: isoToEpochMilliseconds(item.deletedAt),
        }));
  return {
    sourceType: 'personal-json',
    entities,
    tombstones,
    warnings,
    fatal: [],
    credentialsDetected: false,
  };
}

function fatal(code: string, message: string): ParsedImportSource {
  return {
    sourceType: 'personal-json',
    sourceSchema: 'personal-unknown',
    entities: [],
    tombstones: [],
    warnings: [],
    fatal: [{ code, message }],
    credentialsDetected: false,
  };
}

export function parsePersonalFile(path: string): ParsedImportSource {
  if (statSync(path).size > MAX_PERSONAL_BYTES) {
    return fatal('PERSONAL_FILE_TOO_LARGE', 'Personal JSON 超过 5MB 上限');
  }
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fatal('PERSONAL_INVALID_JSON', 'Personal 文件不是有效 JSON');
  }
  const wrapper = personalWrapperSchema.safeParse(value);
  let data: PersonalData;
  if (wrapper.success) {
    data = wrapper.data.data;
    if (wrapper.data.version !== data.version) {
      return fatal('PERSONAL_VERSION_MISMATCH', 'Personal wrapper 与 data 版本不一致');
    }
  } else {
    const direct = personalDataSchema.safeParse(value);
    if (!direct.success) {
      return fatal('PERSONAL_SCHEMA_INVALID', 'Personal 文件结构、版本或字段无效');
    }
    data = direct.data;
  }
  if (containsAmbiguousDuplicate(data)) {
    return fatal(
      'PERSONAL_AMBIGUOUS_DUPLICATE',
      'Personal 文件包含同一标识、同一更新时间但内容不同的记录',
    );
  }
  return { sourceSchema: `personal-v${data.version}`, ...mapPersonal(data) };
}
