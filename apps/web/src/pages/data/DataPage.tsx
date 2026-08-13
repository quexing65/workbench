import { useMutation } from '@tanstack/react-query';
import type { ImportPreflightResponse, ImportReport, ImportSourceType } from '@workbench/shared';
import { useState, type FormEvent } from 'react';

import { applyImport, preflightImport } from '../../shared/api/imports';
import { downloadBackup } from '../../shared/api/backups';

export function DataPage() {
  const [sourceType, setSourceType] = useState<ImportSourceType>('personal-json');
  const [sourceTimezone, setSourceTimezone] = useState('Asia/Shanghai');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreflightResponse | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const backup = useMutation({ mutationFn: downloadBackup });
  const preflight = useMutation({
    mutationFn: preflightImport,
    onSuccess: (result) => {
      setPreview(result);
      setConfirmed(false);
    },
  });
  const apply = useMutation({
    mutationFn: ({ runId, token }: { runId: string; token: string }) => applyImport(runId, token),
    onSuccess: (report) => setPreview({ report }),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (file === null) return;
    setPreview(null);
    preflight.mutate({
      sourceType,
      ...(sourceType === 'qoder-sqlite' ? { sourceTimezone } : {}),
      file,
    });
  }

  function applyPreview() {
    const report = preview?.report;
    const token = preview?.confirmationToken;
    if (report !== undefined && token !== undefined) {
      apply.mutate({ runId: report.runId, token });
    }
  }

  const error = preflight.error ?? apply.error;
  return (
    <section className="page business-page data-page" aria-labelledby="page-title">
      <header className="page-header">
        <p className="eyebrow">本机优先 · 两阶段导入</p>
        <h1 id="page-title">数据</h1>
        <p className="page-lead">先只读预检并核对报告，再创建快照、事务应用；登录凭据永不迁移。</p>
      </header>

      <div className="data-layout">
        <section className="editor-card backup-card" aria-labelledby="backup-title">
          <p className="eyebrow">一致快照</p>
          <h2 id="backup-title">创建普通备份</h2>
          <p>
            下载受控 <code>.pwbk</code>，仅含 manifest 和一致 SQLite 快照；登录凭据不进入备份。
          </p>
          <button disabled={backup.isPending} onClick={() => backup.mutate()}>
            {backup.isPending ? '正在校验并打包…' : '创建并下载备份'}
          </button>
          {backup.isSuccess && (
            <p className="form-success" role="status">
              备份已通过浏览器下载，请妥善保存。
            </p>
          )}
          {backup.error instanceof Error && (
            <p className="form-error" role="alert">
              {backup.error.message}
            </p>
          )}
          <p className="credential-note">
            整库时间点恢复不是迁移或合并。请停止服务后运行
            <code> npm run data:restore -- --file &lt;backup.pwbk&gt;</code>；页面不接受服务器路径。
          </p>
        </section>

        <form className="editor-card import-form" onSubmit={submit}>
          <h2>导入旧数据</h2>
          <label>
            来源
            <select
              value={sourceType}
              onChange={(event) => {
                setSourceType(event.target.value as ImportSourceType);
                setPreview(null);
              }}
            >
              <option value="personal-json">Personal JSON（v1 / v2 / v3）</option>
              <option value="qoder-sqlite">qoder SQLite 快照</option>
            </select>
          </label>
          {sourceType === 'qoder-sqlite' && (
            <label>
              来源时区
              <input
                required
                value={sourceTimezone}
                onChange={(event) => setSourceTimezone(event.target.value)}
              />
            </label>
          )}
          <label>
            备份文件
            <input
              required
              type="file"
              accept={sourceType === 'personal-json' ? '.json,application/json' : '.db,.sqlite'}
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </label>
          {sourceType === 'qoder-sqlite' && (
            <p className="import-caution">
              请选择 qoder 的一致备份快照；不要在旧服务运行且存在 WAL 时直接复制 workbench.db。
            </p>
          )}
          <button disabled={file === null || preflight.isPending || apply.isPending}>
            {preflight.isPending ? '正在只读检查…' : '预检并生成对账报告'}
          </button>
          <p className="credential-note">
            文件上传到随机临时目录；成功或失败后会清理。SESSDATA
            仅检测存在性，不读取、不显示、不迁移。
          </p>
          {error instanceof Error && (
            <p className="form-error" role="alert">
              {error.message}
            </p>
          )}
        </form>

        <div className="data-results">
          {preview === null ? (
            <section className="list-panel" aria-labelledby="import-empty-title">
              <h2 id="import-empty-title">等待预检</h2>
              <p>预检不会写入业务数据。报告会逐类列出新增、更新、不变、冲突和拒绝数量。</p>
            </section>
          ) : (
            <ImportReportPanel report={preview.report} />
          )}
          {preview?.report.status === 'ready' && preview.confirmationToken !== undefined && (
            <section className="list-panel import-confirm" aria-labelledby="apply-title">
              <h2 id="apply-title">确认应用</h2>
              <label>
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                我已核对计数、warning 和 conflict；冲突将保留 vNext 本地数据。
              </label>
              <button disabled={!confirmed || apply.isPending} onClick={applyPreview}>
                {apply.isPending ? '正在创建快照并导入…' : '创建快照并事务导入'}
              </button>
            </section>
          )}
        </div>
      </div>
    </section>
  );
}

function ImportReportPanel({ report }: { readonly report: ImportReport }) {
  return (
    <section className="list-panel import-report" aria-labelledby="import-report-title">
      <div className="report-heading">
        <div>
          <p className="eyebrow">{report.mode === 'preflight' ? '预检报告' : '应用报告'}</p>
          <h2 id="import-report-title">{statusLabel(report.status)}</h2>
        </div>
        <span className={`status-pill status-pill--${report.status}`}>{report.status}</span>
      </div>
      <dl className="report-meta">
        <div>
          <dt>来源结构</dt>
          <dd>{report.sourceSchema}</dd>
        </div>
        {report.sourceTimezone && (
          <div>
            <dt>来源时区</dt>
            <dd>{report.sourceTimezone}</dd>
          </div>
        )}
        <div>
          <dt>SHA-256</dt>
          <dd className="report-hash">{report.sourceSha256}</dd>
        </div>
      </dl>
      <div className="count-grid" aria-label="导入计数">
        {Object.entries(report.counts).map(([kind, count]) => (
          <article className="count-card" key={kind}>
            <h3>{kind}</h3>
            <dl>
              <div>
                <dt>读取</dt>
                <dd>{count.read}</dd>
              </div>
              <div>
                <dt>新增</dt>
                <dd>{count.add}</dd>
              </div>
              <div>
                <dt>更新</dt>
                <dd>{count.update}</dd>
              </div>
              <div>
                <dt>不变</dt>
                <dd>{count.unchanged}</dd>
              </div>
              <div>
                <dt>冲突</dt>
                <dd>{count.conflict}</dd>
              </div>
              <div>
                <dt>拒绝</dt>
                <dd>{count.reject}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
      <ReportMessages title="致命错误" items={report.fatal} role="alert" />
      <ReportMessages title="冲突（保留本地）" items={report.conflicts} />
      <ReportMessages title="提醒" items={report.warnings} />
      <p className={report.credentials.detected ? 'credential-detected' : 'credential-note'}>
        凭据：{report.credentials.detected ? '检测到，但未迁移' : '未检测到'}；迁移状态始终为
        false。
      </p>
    </section>
  );
}

function ReportMessages({
  title,
  items,
  role,
}: {
  readonly title: string;
  readonly items: readonly {
    code: string;
    message?: string | undefined;
    sourceId?: string | undefined;
  }[];
  readonly role?: 'alert';
}) {
  if (items.length === 0) return null;
  return (
    <div className="report-messages" {...(role === undefined ? {} : { role })}>
      <h3>{title}</h3>
      <ul>
        {items.map((item, index) => (
          <li key={`${item.code}:${item.sourceId ?? index}`}>
            <strong>{item.code}</strong> {item.message ?? item.sourceId ?? ''}
          </li>
        ))}
      </ul>
    </div>
  );
}

function statusLabel(status: ImportReport['status']): string {
  if (status === 'ready') return '可以安全应用';
  if (status === 'succeeded') return '导入已完成';
  if (status === 'failed') return '预检未通过';
  return '正在处理';
}
