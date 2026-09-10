import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type FormEvent } from 'react';

import {
  getLearningResources,
  getLearningSeries,
  importLearningResource,
} from '../../shared/api/learning';
import { queryKeys } from '../../shared/api/query-keys';
import { QueryError, QueryLoading } from '../../shared/ui/QueryState';
import { useToast } from '../../shared/ui/Toast';
import { useAnimatedList } from '../../shared/ui/useAnimatedList';
import {
  buildSeriesMembership,
  DEFAULT_LEARNING_VIEW,
  filterLearningResources,
  type LearningViewOptions,
} from './learning-filters';
import { LearningResourceCard } from './LearningResourceCard';
import { LearningSeriesPanel } from './LearningSeriesPanel';
import { BiliSyncPanel } from './BiliSyncPanel';

const RESOURCE_BATCH_SIZE = 20;

export function LearningPage() {
  const [showBiliTools, setShowBiliTools] = useState(false);
  const learningList = useAnimatedList<HTMLDivElement>();
  const [showImport, setShowImport] = useState(false);
  const [showSeries, setShowSeries] = useState(false);
  const [url, setUrl] = useState('');
  const [seriesId, setSeriesId] = useState('');
  const [unresolvedMessage, setUnresolvedMessage] = useState('');
  const [visibleResourceCount, setVisibleResourceCount] = useState(RESOURCE_BATCH_SIZE);
  const [view, setView] = useState<LearningViewOptions>(DEFAULT_LEARNING_VIEW);
  const client = useQueryClient();
  const toast = useToast();
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
      toast.push('已导入学习资源');
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.learningResources }),
        client.invalidateQueries({ queryKey: queryKeys.learningSeries }),
      ]);
    },
  });

  function updateView(patch: Partial<LearningViewOptions>) {
    setView((current) => ({ ...current, ...patch }));
    setVisibleResourceCount(RESOURCE_BATCH_SIZE);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setUnresolvedMessage('');
    importResource.mutate();
  }

  const hasLoadError = resources.isError || series.isError;
  // resourceItems 必须稳定引用，否则 filtered 的 useMemo 每次渲染都重算。
  const resourceItems = useMemo(() => resources.data?.items ?? [], [resources.data]);
  const membership = useMemo(
    () => buildSeriesMembership(series.data?.items ?? []),
    [series.data?.items],
  );
  const filtered = useMemo(
    () => filterLearningResources(resourceItems, membership, view),
    [resourceItems, membership, view],
  );
  const visibleResources = filtered.slice(0, visibleResourceCount);
  const remainingResources = filtered.length - visibleResources.length;

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
              data-shortcut="new"
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
        <QueryError
          message="学习数据加载失败，其他工作台数据不受影响。"
          onRetry={() => {
            void resources.refetch();
            void series.refetch();
          }}
        />
      )}
      {(resources.isPending || series.isPending) && <QueryLoading message="正在加载学习数据…" />}

      {resources.data && series.data && (
        <div className="learning-sections">
          <section className="learning-library" aria-labelledby="library-title">
            <div>
              <p className="eyebrow">学习库</p>
              <h2 id="library-title">资源与进度</h2>
            </div>
            <div className="learning-toolbar" aria-label="资源筛选与排序">
              <label>
                系列
                <select
                  value={view.series}
                  onChange={(event) => updateView({ series: event.target.value })}
                >
                  <option value="all">全部系列</option>
                  <option value="none">未分类</option>
                  {series.data?.items.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                状态
                <select
                  value={view.status}
                  onChange={(event) =>
                    updateView({ status: event.target.value as LearningViewOptions['status'] })
                  }
                >
                  <option value="all">全部</option>
                  <option value="learning">学习中</option>
                  <option value="completed">已完成</option>
                </select>
              </label>
              <label>
                排序
                <select
                  value={view.sort}
                  onChange={(event) =>
                    updateView({ sort: event.target.value as LearningViewOptions['sort'] })
                  }
                >
                  <option value="recent">最近更新</option>
                  <option value="progress">完成度</option>
                  <option value="title">标题</option>
                </select>
              </label>
              <p className="learning-toolbar__meta" role="status">
                共 {resourceItems.length} 项 · 筛选后 {filtered.length} 项
              </p>
            </div>
            {resources.data.items.length === 0 && (
              <p className="empty-state">还没有学习资源，从上方导入一个 B站视频。</p>
            )}
            {resources.data.items.length > 0 && filtered.length === 0 && (
              <p className="empty-state">当前筛选下没有学习资源。</p>
            )}
            {filtered.length > 0 ? (
              <div className="learning-list" ref={learningList}>
                {visibleResources.map((resource) => (
                  <LearningResourceCard key={resource.id} resource={resource} />
                ))}
              </div>
            ) : null}
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
