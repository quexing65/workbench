import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';

import {
  getLearningResources,
  getLearningSeries,
  importLearningResource,
} from '../../shared/api/learning';
import { queryKeys } from '../../shared/api/query-keys';
import { LearningResourceCard } from './LearningResourceCard';
import { LearningSeriesPanel } from './LearningSeriesPanel';
import { BiliSyncPanel } from './BiliSyncPanel';

const RESOURCE_BATCH_SIZE = 20;

export function LearningPage() {
  const [showBiliTools, setShowBiliTools] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showSeries, setShowSeries] = useState(false);
  const [url, setUrl] = useState('');
  const [seriesId, setSeriesId] = useState('');
  const [unresolvedMessage, setUnresolvedMessage] = useState('');
  const [visibleResourceCount, setVisibleResourceCount] = useState(RESOURCE_BATCH_SIZE);
  const client = useQueryClient();
  const resources = useQuery({
    queryKey: queryKeys.learningResources,
    queryFn: ({ signal }) => getLearningResources(signal),
  });
  const series = useQuery({
    queryKey: queryKeys.learningSeries,
    queryFn: ({ signal }) => getLearningSeries(signal),
  });
  const importResource = useMutation({
    mutationFn: () => importLearningResource({ url, seriesId: seriesId || null }),
    onSuccess: async (result) => {
      if (result.kind === 'unresolved') {
        setUnresolvedMessage('短链暂时无法解析，已安全保留，稍后可再次导入。');
        return;
      }
      setUrl('');
      setUnresolvedMessage('');
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.learningResources }),
        client.invalidateQueries({ queryKey: queryKeys.learningSeries }),
      ]);
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    setUnresolvedMessage('');
    importResource.mutate();
  }

  const hasLoadError = resources.isError || series.isError;
  const resourceItems = resources.data?.items ?? [];
  const visibleResources = resourceItems.slice(0, visibleResourceCount);
  const remainingResources = resourceItems.length - visibleResources.length;

  return (
    <section className="page learning-page">
      <header className="page-header learning-page__header">
        <div>
          <p className="eyebrow">持续前进</p>
          <h1>学习</h1>
          <p className="page-lead">整理 B站课程、分P与真实观看进度，随时从上次的位置继续。</p>
        </div>
        <div className="learning-tools-menu">
          <button
            type="button"
            className="button-secondary learning-tools-toggle"
            aria-expanded={showBiliTools}
            aria-controls="bili-tools"
            onClick={() => setShowBiliTools((current) => !current)}
          >
            {showBiliTools ? '收起 B站连接' : 'B站连接'}
          </button>
          <button
            type="button"
            className="button-secondary learning-tools-toggle"
            aria-expanded={showImport}
            aria-controls="learning-import"
            onClick={() => setShowImport((current) => !current)}
          >
            {showImport ? '收起资源导入' : '导入 B站学习资源'}
          </button>
          <button
            type="button"
            className="button-secondary learning-tools-toggle"
            aria-expanded={showSeries}
            aria-controls="learning-series-tools"
            onClick={() => setShowSeries((current) => !current)}
          >
            {showSeries ? '收起学习系列' : '学习系列'}
          </button>
        </div>
      </header>

      {showBiliTools ? (
        <div id="bili-tools">
          <BiliSyncPanel />
        </div>
      ) : null}

      {showImport ? (
        <form id="learning-import" className="learning-import" onSubmit={submit}>
          <div>
            <h2>导入 B站学习资源</h2>
            <p>支持 bilibili.com 视频链接、BV 号与 b23.tv 短链。</p>
          </div>
          <label>
            视频链接或 BV 号
            <input
              required
              maxLength={2048}
              placeholder="https://www.bilibili.com/video/BV…"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
            />
          </label>
          <label>
            加入系列（可选）
            <select value={seriesId} onChange={(event) => setSeriesId(event.target.value)}>
              <option value="">暂不加入</option>
              {series.data?.items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <button disabled={importResource.isPending}>
            {importResource.isPending ? '正在读取元数据…' : '导入资源'}
          </button>
          {importResource.error && (
            <p role="alert" className="form-error">
              {importResource.error.message}
            </p>
          )}
          {unresolvedMessage && (
            <p role="status" className="resume-note">
              {unresolvedMessage}
            </p>
          )}
        </form>
      ) : null}

      {showSeries && resources.data && series.data ? (
        <div id="learning-series-tools" className="learning-series-tools">
          <LearningSeriesPanel series={series.data.items} resources={resources.data.items} />
        </div>
      ) : null}

      {hasLoadError && (
        <div className="load-error" role="alert">
          <p>学习数据加载失败，其他工作台数据不受影响。</p>
          <button
            onClick={() => {
              void resources.refetch();
              void series.refetch();
            }}
          >
            重试
          </button>
        </div>
      )}
      {(resources.isPending || series.isPending) && <p role="status">正在加载学习数据…</p>}

      {resources.data && series.data && (
        <div className="learning-sections">
          <section className="learning-library" aria-labelledby="library-title">
            <div>
              <p className="eyebrow">学习库</p>
              <h2 id="library-title">资源与进度</h2>
            </div>
            {resources.data.items.length === 0 && (
              <p className="empty-state">还没有学习资源，从上方导入一个 B站视频。</p>
            )}
            <div className="learning-list">
              {visibleResources.map((resource) => (
                <LearningResourceCard key={resource.id} resource={resource} />
              ))}
            </div>
            {remainingResources > 0 ? (
              <button
                className="button-secondary list-more"
                onClick={() => setVisibleResourceCount((count) => count + RESOURCE_BATCH_SIZE)}
              >
                再显示 {Math.min(RESOURCE_BATCH_SIZE, remainingResources)} 项（剩余{' '}
                {remainingResources} 项）
              </button>
            ) : null}
          </section>
        </div>
      )}
    </section>
  );
}
