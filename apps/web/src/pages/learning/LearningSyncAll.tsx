import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import {
  getBiliCredentialStatus,
  getLearningSyncRun,
  startLearningSyncAll,
} from '../../shared/api/bili-sync';
import { queryKeys } from '../../shared/api/query-keys';

const TERMINAL_STATUSES = ['succeeded', 'failed'] as const;

function isTerminalStatus(
  status: string | undefined,
): status is (typeof TERMINAL_STATUSES)[number] {
  return status !== undefined && (TERMINAL_STATUSES as readonly string[]).includes(status);
}

export function LearningSyncAll() {
  const client = useQueryClient();
  const [runId, setRunId] = useState<string | null>(null);
  const refreshedRun = useRef<string | null>(null);

  // 全局缓存订阅：即使本组件卸载、轮询停止，只要 sync run 查询缓存
  // 更新为终态，就失效学习资源/系列/总览查询。
  useEffect(() => {
    return client.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated') return;
      const data = event.query.state.data;
      if (
        data !== undefined &&
        typeof data === 'object' &&
        'status' in data &&
        isTerminalStatus((data as { status: string }).status)
      ) {
        void Promise.all([
          client.invalidateQueries({ queryKey: queryKeys.learningResources }),
          client.invalidateQueries({ queryKey: queryKeys.learningSeries }),
          client.invalidateQueries({ queryKey: ['overview'] }),
        ]);
      }
    });
  }, [client]);

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
    mutationFn: () => startLearningSyncAll(),
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
        type="button"
        className="button-secondary learning-tools-toggle"
        disabled={!credential.data?.valid || startSync.isPending || running}
        onClick={() => startSync.mutate()}
        title={credential.data?.valid ? undefined : '请先连接 B站登录态'}
      >
        {running ? '正在同步全部…' : '同步全部观看历史'}
      </button>
      {run.data ? <SyncAllResult run={run.data} /> : null}
      {error ? (
        <p role="alert" className="form-error">
          {error.message}
        </p>
      ) : null}
    </>
  );
}

function SyncAllResult({
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
      <p role="status" className="learning-sync-all__status">
        正在同步全部资源，请保持工作台开启。
      </p>
    );
  }
  if (run.status === 'failed') {
    return (
      <p role="alert" className="form-error">
        同步失败（{run.safeErrorCode ?? 'SYNC_FAILED'}），本地进度未被清空。
      </p>
    );
  }
  return (
    <p role="status" className="learning-sync-all__status">
      已同步全部资源：读取 {run.historyCount} 条记录，更新 {run.updatedCount} 条进度。
    </p>
  );
}

function requiredRunId(value: string | null): string {
  if (value === null) throw new Error('同步任务尚未启动');
  return value;
}
