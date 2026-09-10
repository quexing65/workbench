import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { BiliBrowser } from '@workbench/shared';
import { useState } from 'react';

import { ApiError } from '../../shared/api/client';
import { fetchBiliCredential } from '../../shared/api/bili-sync';
import { queryKeys } from '../../shared/api/query-keys';
import { useConfirm } from '../../shared/ui/ConfirmDialog';
import { useToast } from '../../shared/ui/Toast';

/** Chrome 136+ 封禁了默认用户数据目录的远程调试端口，受控重启会被后端拒绝；
 *  这里先给一条指引，不弹重启确认，避免误导用户。 */
const CHROME_RESTART_GUIDANCE = 'Chrome 136 及以上版本不支持受控读取，请改用 Edge 或手工录入。';

const RESTART_PROMPT =
  '需要重启 Edge 才能读取登录态：所有 Edge 窗口会被关闭，随后自动恢复上次会话。是否继续？';

const BROWSERS: ReadonlyArray<{ readonly value: BiliBrowser; readonly label: string }> = [
  { value: 'edge', label: 'Edge（推荐）' },
  { value: 'chrome', label: 'Chrome' },
];

/** 从本机浏览器一键读取 B站登录态。被动发现 CDP 调试端口；找不到时 Edge 可在
 *  二次确认后受控重启再读取。读取到的 SESSDATA 走与手工录入相同的验活与加密收口。 */
export function BrowserCredentialFetch() {
  const client = useQueryClient();
  const toast = useToast();
  const [browser, setBrowser] = useState<BiliBrowser>('edge');
  const { confirm, dialog } = useConfirm();

  const fetchCredential = useMutation({
    mutationFn: (options: { forceRestart: boolean }) =>
      fetchBiliCredential({
        browser,
        forceRestart: options.forceRestart,
        ...(options.forceRestart ? { confirmation: 'restart-browser' as const } : {}),
      }),
    onSuccess: async () => {
      toast.push('已从浏览器读取登录态');
      await client.invalidateQueries({ queryKey: queryKeys.biliCredential });
    },
    // 重启是侵入式操作：Edge 需要用户显式确认后才带 forceRestart 继续读取。
    onError: (error) => {
      if (
        error instanceof ApiError &&
        error.code === 'BROWSER_RESTART_REQUIRED' &&
        browser === 'edge'
      ) {
        confirm({
          message: RESTART_PROMPT,
          confirmLabel: '重启并读取',
          onConfirm: () => fetchCredential.mutate({ forceRestart: true }),
        });
      }
    },
  });

  const error = fetchCredential.error;
  const restartRequired = error instanceof ApiError && error.code === 'BROWSER_RESTART_REQUIRED';
  // Edge 的「需重启」交给确认弹窗，不再渲染错误文案；Chrome 给指引；其余沿用服务端文案。
  const shownError = restartRequired
    ? browser === 'chrome'
      ? CHROME_RESTART_GUIDANCE
      : null
    : error instanceof Error
      ? error.message
      : null;

  const restarting = fetchCredential.isPending && fetchCredential.variables?.forceRestart === true;
  const buttonLabel = fetchCredential.isPending
    ? restarting
      ? '正在重启浏览器并读取…'
      : '正在读取浏览器登录态…'
    : '从浏览器读取';

  return (
    <div className="credential-browser-fetch">
      <div className="credential-browser-fetch__intro">
        <strong>从浏览器读取</strong>
        <p className="credential-note">
          一键读取本机浏览器里的 B站登录态，无需手动复制 Cookie。首次使用需要重启
          Edge，标签页会自动恢复。
        </p>
      </div>
      <div className="credential-browser-fetch__controls">
        <div className="browser-choice" role="radiogroup" aria-label="选择浏览器">
          {BROWSERS.map((option) => (
            <label className="browser-choice__option" key={option.value}>
              <input
                type="radio"
                name="credential-browser"
                value={option.value}
                checked={browser === option.value}
                disabled={fetchCredential.isPending}
                onChange={() => {
                  setBrowser(option.value);
                  fetchCredential.reset();
                }}
              />
              {option.label}
            </label>
          ))}
        </div>
        <button
          type="button"
          disabled={fetchCredential.isPending}
          onClick={() => fetchCredential.mutate({ forceRestart: false })}
        >
          {buttonLabel}
        </button>
      </div>
      {shownError !== null ? (
        <p role="alert" className="form-error">
          {shownError}
        </p>
      ) : null}
      {dialog}
    </div>
  );
}
