import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { getBiliQrLoginStatus, startBiliQrLogin } from '../../shared/api/bili-sync';
import { queryKeys } from '../../shared/api/query-keys';
import { useToast } from '../../shared/ui/Toast';

/** 二维码约 3 分钟过期；连续自动换码达到该次数后转为手动刷新，避免面板常驻时空转请求。 */
const MAX_AUTO_REGENERATIONS = 5;

/** B站扫码登录：服务端生成二维码并轮询扫码状态，成功后登录态直接落盘。 */
export function QrLoginCard({ pollIntervalMs = 2000 }: { readonly pollIntervalMs?: number }) {
  const client = useQueryClient();
  const toast = useToast();
  const [active, setActive] = useState(false);
  const [paused, setPaused] = useState(false);
  const regenerations = useRef(0);

  const start = useMutation({
    mutationFn: startBiliQrLogin,
    onSuccess: () => {
      setPaused(false);
      setActive(true);
    },
  });

  const status = useQuery({
    queryKey: queryKeys.biliQrLogin,
    queryFn: ({ signal }) => getBiliQrLoginStatus(signal),
    enabled: active,
    retry: false,
    refetchInterval: ({ state }) =>
      paused || state.data?.state === 'succeeded' ? false : pollIntervalMs,
  });

  const state = status.data?.state;
  const handledState = useRef<string | null>(null);

  // 状态迁移通过微任务异步执行，避免 render/effect 内同步 setState 触发级联渲染。
  // useMutation 每次渲染都返回新对象，依赖它会促使同一状态值重复触发换码；
  // 这里保证每个终态只处理一次，回到常规状态后重新允许触发。
  useEffect(() => {
    if (state === undefined || state === 'waiting' || state === 'scanned') {
      handledState.current = null;
      return;
    }
    if (handledState.current === state) return;
    handledState.current = state;
    void Promise.resolve().then(() => {
      if (state === 'succeeded') {
        toast.push('已通过扫码连接 B站');
        setActive(false);
        regenerations.current = 0;
        void client.invalidateQueries({ queryKey: queryKeys.biliCredential });
        void client.removeQueries({ queryKey: queryKeys.biliQrLogin });
        return;
      }
      regenerations.current += 1;
      if (regenerations.current <= MAX_AUTO_REGENERATIONS) {
        start.mutate();
      } else {
        setPaused(true);
      }
    });
  }, [client, state, start, toast]);

  function beginLogin() {
    regenerations.current = 0;
    setPaused(false);
    start.mutate();
  }

  const qrImage = start.data?.qrImage;
  const showingQr = active && qrImage !== undefined;
  const statusText =
    state === 'scanned'
      ? '已扫码，请在手机上确认'
      : state === 'expired' || state === 'absent'
        ? paused
          ? '二维码已过期'
          : '二维码已过期，正在更换新码…'
        : '打开手机 B站 App 扫码登录';
  const error = [start.error, status.error].find((item): item is Error => item instanceof Error);

  return (
    <div className="credential-qr">
      <div className="credential-qr__intro">
        <strong>扫码登录</strong>
        <p className="credential-note">
          用手机 B站 App 扫码即可连接，无需复制 Cookie；登录态会自动续期。
        </p>
      </div>
      {!showingQr ? (
        <div className="credential-qr__controls">
          <button type="button" disabled={start.isPending} onClick={beginLogin}>
            {start.isPending ? '正在获取二维码…' : '扫码登录'}
          </button>
        </div>
      ) : (
        <div className="credential-qr__body">
          <img
            className="credential-qr__image"
            src={qrImage}
            alt="B站登录二维码"
            width={180}
            height={180}
          />
          <div className="credential-qr__side">
            <p role="status" className="credential-note">
              {statusText}
            </p>
            {paused ? (
              <button type="button" className="button-secondary" onClick={beginLogin}>
                刷新二维码
              </button>
            ) : null}
          </div>
        </div>
      )}
      {error !== undefined ? (
        <p role="alert" className="form-error">
          {error.message}
        </p>
      ) : null}
    </div>
  );
}
