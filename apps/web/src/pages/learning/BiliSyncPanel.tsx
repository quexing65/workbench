import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';

import {
  clearBiliCredential,
  getBiliCredentialStatus,
  saveBiliCredential,
} from '../../shared/api/bili-sync';
import { queryKeys } from '../../shared/api/query-keys';

export function BiliSyncPanel() {
  const client = useQueryClient();
  const [sessdata, setSessdata] = useState('');
  const credential = useQuery({
    queryKey: queryKeys.biliCredential,
    queryFn: ({ signal }) => getBiliCredentialStatus(signal),
    retry: false,
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

  function submitCredential(event: FormEvent) {
    event.preventDefault();
    save.mutate(sessdata);
  }

  return (
    <section className="bili-sync-panel" aria-labelledby="bili-connection-title">
      <div className="bili-sync-panel__header">
        <div>
          <p className="eyebrow">仅存于本机</p>
          <h2 id="bili-connection-title">B站连接</h2>
        </div>
        <p className={`connection-state ${credential.data?.valid ? 'is-connected' : ''}`}>
          {credential.isPending ? '正在检查…' : (credential.data?.userLabel ?? '状态不可用')}
        </p>
      </div>

      <div className="credential-section">
        <div className="credential-intro">
          <strong>登录凭证</strong>
          <p className="credential-note">
            SESSDATA 验证后会加密保存在本机，连接有效时无需重复录入。
          </p>
        </div>
        <form className="credential-form" onSubmit={submitCredential}>
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
          <div className="credential-buttons">
            <button disabled={save.isPending}>验证并安全保存</button>
            {credential.data?.present && (
              <button
                type="button"
                className="credential-clear"
                onClick={() => clear.mutate()}
                disabled={clear.isPending}
              >
                清除本机登录态
              </button>
            )}
          </div>
        </form>
      </div>

      {[credential.error, save.error, clear.error]
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
