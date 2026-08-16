import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import {
  getBiliCredentialStatus,
  getLearningSyncRun,
  startLearningSync,
} from '../../shared/api/bili-sync';
import { queryKeys } from '../../shared/api/query-keys';

export function LearningResourceSync({
  resourceId,
  resourceTitle,
}: {
  readonly resourceId: string;
  readonly resourceTitle: string;
}) {
  const client = useQueryClient();
  const [runId, setRunId] = useState<string | null>(null);
  const refreshedRun = useRef<string | null>(null);
  const credential = useQuery({
    queryKey: queryKeys.biliCredential,
    queryFn: ({ signal }) => getBiliCredentialStatus(signal),
    retry: false,
  });
  const run = useQuery({
    queryKey: queryKeys.learningSync(runId ?? 'pending'),
    queryFn: ({ signal }) => getLearningSyncRun(requiredRunId(runId), signal),
    enabled: runId !== null,
    retry: false,
    refetchInterval: ({ state }) =>
      state.data?.status === 'queued' || state.data?.status === 'running' ? 700 : false,
  });
  const startSync = useMutation({
    mutationFn: () => startLearningSync(resourceId),
    onSuccess: ({ runId: nextRunId }) => {
      refreshedRun.current = null;
      setRunId(nextRunId);
    },
  });

  useEffect(() => {
    if (
      runId !== null &&
      run.data !== undefined &&
      ['succeeded', 'failed'].includes(run.data.status) &&
      refreshedRun.current !== runId
    ) {
      refreshedRun.current = runId;
      void Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.learningResources }),
        client.invalidateQueries({ queryKey: queryKeys.learningSeries }),
        client.invalidateQueries({ queryKey: ['overview'] }),
      ]);
    }
  }, [client, run.data, runId]);

  const running =
    runId !== null &&
    (run.isPending || run.data?.status === 'queued' || run.data?.status === 'running');
  const error = [credential.error, startSync.error, run.error]
    .filter((item): item is Error => item instanceof Error)
    .at(-1);

  return (
    <>
      <button
        className="button-secondary learning-action-button"
        aria-label={`同步观看历史 ${resourceTitle}`}
        disabled={!credential.data?.valid || startSync.isPending || running}
        onClick={() => startSync.mutate()}
        title={credential.data?.valid ? undefined : '请先连接 B站登录态'}
      >
        {running ? '正在同步…' : '同步观看历史'}
      </button>
      {run.data ? <SyncResult run={run.data} /> : null}
      {error ? (
        <p role="alert" className="form-error resource-sync-status">
          {error.message}
        </p>
      ) : null}
    </>
  );
}

function SyncResult({
  run,
}: {
  readonly run: {
    status: string;
    historyCount: number;
    updatedCount: number;
    safeErrorCode: string | null;
  };
}) {
  if (run.status === 'queued' || run.status === 'running') {
    return (
      <p role="status" className="resource-sync-status">
        正在同步此资源，请保持工作台开启。
      </p>
    );
  }
  if (run.status === 'failed') {
    return (
      <p role="alert" className="resource-sync-status">
        同步失败（{run.safeErrorCode ?? 'SYNC_FAILED'}），本地进度未被清空。
      </p>
    );
  }
  return (
    <p role="status" className="resource-sync-status">
      已同步此资源：读取 {run.historyCount} 条记录，更新 {run.updatedCount} 条进度。
    </p>
  );
}

function requiredRunId(value: string | null): string {
  if (value === null) throw new Error('同步任务尚未启动');
  return value;
}
