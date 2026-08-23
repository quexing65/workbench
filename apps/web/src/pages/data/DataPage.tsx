import { useMutation } from '@tanstack/react-query';

import { downloadBackup } from '../../shared/api/backups';

export function DataPage() {
  const backup = useMutation({ mutationFn: downloadBackup });

  return (
    <section className="page business-page data-page" aria-labelledby="page-title">
      <header className="page-header">
        <p className="eyebrow">本机优先 · 受控备份</p>
        <h1 id="page-title">数据</h1>
        <p className="page-lead">
          下载受控 <code>.pwbk</code> 整库快照用于归档与迁移；登录凭据永不进入备份。
        </p>
      </header>

      <section className="editor-card data-action-card backup-card" aria-labelledby="backup-title">
        <div className="data-action-card__heading">
          <div>
            <p className="eyebrow">导出 · 一致快照</p>
            <h2 id="backup-title">创建普通备份</h2>
          </div>
        </div>
        <p className="data-action-card__description">
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
        <p className="credential-note data-action-card__note">
          整库时间点恢复不是迁移或合并。请停止服务后运行
          <code> npm run data:restore -- --file &lt;backup.pwbk&gt;</code>
          ；页面不接受服务器路径。
        </p>
      </section>
    </section>
  );
}
