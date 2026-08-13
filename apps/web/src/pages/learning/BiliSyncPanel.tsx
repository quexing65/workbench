import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BiliBrowser } from '@workbench/shared';
import { useEffect, useRef, useState, type FormEvent } from 'react';

import {
  clearBiliCredential,
  fetchBiliCredential,
  getBiliCredentialStatus,
  getLearningSyncRun,
  saveBiliCredential,
  startLearningSync,
} from '../../shared/api/bili-sync';
import { ApiError } from '../../shared/api/client';
import { queryKeys } from '../../shared/api/query-keys';

export function BiliSyncPanel() {
  const client = useQueryClient();
  const [sessdata, setSessdata] = useState('');
  const [pages, setPages] = useState(3);
  const [runId, setRunId] = useState<string | null>(null);
  const [restartBrowser, setRestartBrowser] = useState<BiliBrowser | null>(null);
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
  const save = useMutation({
    mutationFn: saveBiliCredential,
    onSuccess: async () => client.invalidateQueries({ queryKey: queryKeys.biliCredential }),
    onSettled: () => setSessdata(''),
  });
  const clear = useMutation({
    mutationFn: clearBiliCredential,
    onSuccess: async () => client.invalidateQueries({ queryKey: queryKeys.biliCredential }),
  });
  const fetchCredential = useMutation({
    mutationFn: ({ browser, forceRestart }: { browser: BiliBrowser; forceRestart: boolean }) =>
      fetchBiliCredential(
        browser,
        forceRestart
          ? { forceRestart: true, confirmation: 'restart-browser' }
          : { forceRestart: false },
      ),
    onSuccess: async () => {
      setRestartBrowser(null);
      await client.invalidateQueries({ queryKey: queryKeys.biliCredential });
    },
    onError: (error, { browser, forceRestart }) => {
      if (!forceRestart && error instanceof ApiError && error.code === 'BROWSER_RESTART_REQUIRED') {
        setRestartBrowser(browser === 'edge' ? browser : null);
      }
    },
  });
  const startSync = useMutation({
    mutationFn: startLearningSync,
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
      void client.invalidateQueries({ queryKey: queryKeys.learningResources });
    }
  }, [client, run.data, runId]);

  const running =
    runId !== null &&
    (run.isPending || run.data?.status === 'queued' || run.data?.status === 'running');

  function submitCredential(event: FormEvent) {
    event.preventDefault();
    save.mutate(sessdata);
  }

  function forceRestart() {
    if (
      restartBrowser !== null &&
      confirm('这会关闭并重新打开 Edge。未保存的浏览器内容可能丢失，确定继续吗？')
    ) {
      fetchCredential.mutate({ browser: restartBrowser, forceRestart: true });
    }
  }

  return (
    <section className="bili-sync-panel" aria-labelledby="bili-connection-title">
      <div className="bili-sync-panel__header">
        <div>
          <p className="eyebrow">仅存于本机</p>
          <h2 id="bili-connection-title">B站连接与观看同步</h2>
        </div>
        <p className={`connection-state ${credential.data?.valid ? 'is-connected' : ''}`}>
          {credential.isPending ? '正在检查…' : (credential.data?.userLabel ?? '状态不可用')}
        </p>
      </div>

      <div className="credential-actions">
        <form onSubmit={submitCredential}>
          <label>
            手工录入 SESSDATA
            <input
              required
              type="password"
              autoComplete="off"
              maxLength={4096}
              value={sessdata}
              onChange={(event) => setSessdata(event.target.value)}
            />
          </label>
          <button disabled={save.isPending}>验证并安全保存</button>
        </form>
        <div className="browser-actions" aria-label="从浏览器读取登录态">
          <button
            onClick={() => fetchCredential.mutate({ browser: 'edge', forceRestart: false })}
            disabled={fetchCredential.isPending}
          >
            连接已开启调试的 Edge
          </button>
          <button
            onClick={() => fetchCredential.mutate({ browser: 'chrome', forceRestart: false })}
            disabled={fetchCredential.isPending}
          >
            连接已开启调试的 Chrome
          </button>
          {restartBrowser !== null && (
            <button className="danger-button" onClick={forceRestart}>
              确认重启 {restartBrowser === 'edge' ? 'Edge' : 'Chrome'} 并连接
            </button>
          )}
        </div>
      </div>
      <p className="credential-note">
        默认只连接已开启本机调试端口的浏览器，不会关闭浏览器。Chrome 136+ 请优先改用 Edge
        或手工录入。
      </p>
      {credential.data?.present && (
        <button className="text-button" onClick={() => clear.mutate()} disabled={clear.isPending}>
          清除本机登录态
        </button>
      )}

      <div className="sync-actions">
        <label>
          同步历史页数
          <select value={pages} onChange={(event) => setPages(Number(event.target.value))}>
            {[1, 2, 3, 4, 5].map((value) => (
              <option key={value} value={value}>
                {value} 页
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={() => startSync.mutate(pages)}
          disabled={!credential.data?.valid || startSync.isPending || running}
        >
          {running ? '正在同步…' : '同步观看历史'}
        </button>
        {run.data && <SyncResult run={run.data} />}
      </div>

      {[
        credential.error,
        save.error,
        clear.error,
        fetchCredential.error,
        startSync.error,
        run.error,
      ]
        .filter((error): error is Error => error instanceof Error)
        .slice(-1)
        .map((error) => (
          <p role="alert" className="form-error" key={error.message}>
            {error.message}
          </p>
        ))}
    </section>
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
    return <p role="status">同步任务运行中，请保持工作台开启。</p>;
  }
  if (run.status === 'failed') {
    return <p role="alert">同步失败（{run.safeErrorCode ?? 'SYNC_FAILED'}），本地数据未被清空。</p>;
  }
  return (
    <p role="status">
      已读取 {run.historyCount} 条记录，更新 {run.updatedCount} 条进度。
    </p>
  );
}

function requiredRunId(value: string | null): string {
  if (value === null) throw new Error('同步任务尚未启动');
  return value;
}
