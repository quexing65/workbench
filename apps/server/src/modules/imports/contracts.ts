import type { ImportFatal, ImportSourceType, ImportWarning, TaskStatus } from '@workbench/shared';

export interface SourceEntity<T extends ImportPayload = ImportPayload> {
  readonly sourceKind: string;
  readonly sourceId: string;
  readonly targetKind: string;
  readonly sourceHash: string;
  readonly payload: T;
}

export interface TaskImportPayload {
  readonly kind: 'task';
  readonly title: string;
  readonly description: string;
  readonly date: string;
  readonly status: TaskStatus;
  readonly createdAtMs: number;
  readonly updatedAtMs: number;
  readonly completedAtMs: number | null;
  readonly cancelledAtMs: number | null;
}

export interface RecurringImportPayload {
  readonly kind: 'recurring';
  readonly title: string;
  readonly startDate: string;
  readonly endDate: string | null;
  readonly createdAtMs: number;
  readonly updatedAtMs: number;
}

export interface OccurrenceImportPayload {
  readonly kind: 'occurrence';
  readonly templateSourceId: string;
  readonly date: string;
  readonly status: TaskStatus;
  readonly updatedAtMs: number;
  readonly completedAtMs: number | null;
  readonly cancelledAtMs: number | null;
}

export interface NoteImportPayload {
  readonly kind: 'note';
  readonly content: string;
  readonly pinned: boolean;
  readonly createdAtMs: number;
  readonly updatedAtMs: number;
}

export interface LearningImportPayload {
  readonly kind: 'learning';
  readonly bvid: string;
  readonly sourceUrl: string;
  readonly title: string;
  readonly partNumber: number;
  readonly positionSeconds: number;
  readonly status: 'not_started' | 'learning' | 'completed';
  readonly observedAtMs: number | null;
  readonly completedAtMs: number | null;
  readonly createdAtMs: number;
  readonly updatedAtMs: number;
}

export interface UnresolvedImportPayload {
  readonly kind: 'unresolved';
  readonly normalizedUrl: string;
  readonly title: string;
  readonly partNumber: number;
  readonly positionSeconds: number;
  readonly status: 'not_started' | 'learning' | 'completed';
  readonly lastOpenedAtMs: number | null;
  readonly createdAtMs: number;
  readonly updatedAtMs: number;
}

export interface SeriesImportPayload {
  readonly kind: 'series';
  readonly name: string;
  readonly createdAtMs: number;
}

export interface QoderPart {
  readonly externalPartId: string;
  readonly partNumber: number;
  readonly title: string;
  readonly durationSeconds: number;
}

export interface QoderVideoImportPayload {
  readonly kind: 'qoder-video';
  readonly bvid: string;
  readonly title: string;
  readonly coverUrl: string | null;
  readonly uploaderName: string | null;
  readonly durationSeconds: number;
  readonly seriesSourceId: string | null;
  readonly parts: readonly QoderPart[];
  readonly furthestPage: number;
  readonly furthestSeconds: number;
  readonly resumePage: number;
  readonly resumeSeconds: number;
  readonly completed: boolean;
  readonly lastObservedAtMs: number | null;
  readonly manualOverrideAtMs: number | null;
  readonly importedAtMs: number;
}

export interface SettingImportPayload {
  readonly kind: 'setting';
  readonly key: 'bili_browser';
  readonly value: 'edge' | 'chrome';
}

export type ImportPayload =
  | TaskImportPayload
  | RecurringImportPayload
  | OccurrenceImportPayload
  | NoteImportPayload
  | LearningImportPayload
  | UnresolvedImportPayload
  | SeriesImportPayload
  | QoderVideoImportPayload
  | SettingImportPayload;

export interface SourceTombstone {
  readonly entityKind: string;
  readonly sourceId: string;
  readonly canonicalKey: string | null;
  readonly deletedAtMs: number;
}

export interface PlannedTombstone extends SourceTombstone {
  readonly action: 'add' | 'update' | 'unchanged' | 'conflict';
  readonly baselineDeletedAtMs: number | null;
  readonly targetKind: string | null;
  readonly targetId: string | null;
  readonly baselineTargetHash: string | null;
}

export interface ParsedImportSource {
  readonly sourceType: ImportSourceType;
  readonly sourceSchema: string;
  readonly sourceTimezone?: string;
  readonly entities: readonly SourceEntity[];
  readonly tombstones: readonly SourceTombstone[];
  readonly warnings: readonly ImportWarning[];
  readonly fatal: readonly ImportFatal[];
  readonly credentialsDetected: boolean;
}

export interface PlannedEntity extends SourceEntity {
  readonly action: 'add' | 'update' | 'unchanged' | 'conflict';
  readonly targetId: string;
  readonly baselineTargetHash: string | null;
}

export interface PersistedImportPlan {
  readonly runId: string;
  readonly sourceType: ImportSourceType;
  readonly sourceSchema: string;
  readonly sourceTimezone?: string;
  readonly entities: readonly PlannedEntity[];
  readonly tombstones: readonly PlannedTombstone[];
  readonly warnings: readonly ImportWarning[];
  readonly fatal: readonly ImportFatal[];
  readonly credentialsDetected: boolean;
  readonly sourceSha256: string;
  readonly targetBaselineSha256: string;
  readonly planSha256: string;
  readonly createdAtMs: number;
}
