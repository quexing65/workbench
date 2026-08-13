import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { LearningResource, LearningSeries } from '@workbench/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  firstPartId,
  json,
  renderLearningPage,
  requestPath,
  resource,
  resourceId,
  series,
  seriesId,
} from './learning-fixtures';

describe('learning center', () => {
  beforeEach(() =>
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true),
    ),
  );
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders resource details, parts and resume state', async () => {
    const item = resource({
      progress: {
        ...resource().progress,
        furthestPartId: firstPartId,
        furthestSeconds: 25,
        resumePartId: firstPartId,
        resumeSeconds: 20,
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        json(requestPath(input).endsWith('/series') ? { items: [series()] } : { items: [item] }),
      ),
    );
    renderLearningPage();

    expect(await screen.findByRole('heading', { name: '安全测试课程' })).toBeInTheDocument();
    expect(screen.getByText(/上次看到 0:20/)).toBeInTheDocument();
    expect(screen.getByText('P1 · 基础')).toBeInTheDocument();
    expect(screen.getByText('P2 · 进阶')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /在 B站打开/ })).toHaveAttribute(
      'href',
      item.sourceUrl,
    );
  });

  it('imports a direct video into the selected series and clears the draft', async () => {
    const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
    let items: LearningResource[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push([input, init]);
        if (init?.method === 'POST') {
          items = [resource()];
          return json({ kind: 'resource', resource: items[0] }, 201);
        }
        return json(requestPath(input).endsWith('/series') ? { items: [series()] } : { items });
      }),
    );
    renderLearningPage();
    const url = screen.getByLabelText('视频链接或 BV 号');
    fireEvent.change(url, { target: { value: 'BV1AB411C7DE' } });
    await screen.findByRole('option', { name: '前端系列' });
    fireEvent.change(screen.getByLabelText('加入系列（可选）'), { target: { value: seriesId } });
    fireEvent.click(screen.getByRole('button', { name: '导入资源' }));

    expect(await screen.findByRole('heading', { name: '安全测试课程' })).toBeInTheDocument();
    const post = calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ url: 'BV1AB411C7DE', seriesId });
    expect(url).toHaveValue('');
  });

  it('records progress, completes, resets and deletes with explicit confirmations', async () => {
    let item: LearningResource | null = resource();
    const writes: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const target = requestPath(input);
        if (init?.method !== undefined && init.method !== 'GET') {
          writes.push(target);
          if (target.endsWith('/observe')) {
            const body = JSON.parse(String(init.body));
            item = resource({
              progress: {
                ...resource().progress,
                furthestPartId: firstPartId,
                furthestSeconds: body.seconds,
                resumePartId: firstPartId,
                resumeSeconds: body.seconds,
                lastObservedAt: body.observedAt,
                revision: 2,
              },
            });
            return json(item);
          }
          if (target.endsWith('/complete')) {
            item = resource({ progress: { ...resource().progress, completed: true, revision: 2 } });
            return json(item);
          }
          if (target.endsWith('/reset')) {
            item = resource({ progress: { ...resource().progress, revision: 2 } });
            return json(item);
          }
          if (init.method === 'DELETE') {
            item = null;
            return new Response(null, { status: 204 });
          }
        }
        return json(target.endsWith('/series') ? { items: [] } : { items: item ? [item] : [] });
      }),
    );
    renderLearningPage();
    fireEvent.change(await screen.findByLabelText('基础 看到秒数'), { target: { value: '45' } });
    fireEvent.click(screen.getAllByRole('button', { name: '记录进度' })[0]!);
    await waitFor(() => expect(writes.some((value) => value.endsWith('/observe'))).toBe(true));

    fireEvent.click(screen.getByRole('button', { name: '标记整项完成' }));
    await waitFor(() => expect(writes.some((value) => value.endsWith('/complete'))).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: '重置进度' }));
    await waitFor(() => expect(writes.some((value) => value.endsWith('/reset'))).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: '移除资源' }));
    expect(await screen.findByText(/还没有学习资源/)).toBeInTheDocument();
    expect(confirm).toHaveBeenCalledTimes(3);
  });

  it('creates, renames, reorders and deletes a series', async () => {
    const secondResource = resource({
      id: '55555555-5555-4555-8555-555555555555',
      externalId: 'BV1XY411C7DE',
      title: '第二门课',
      sourceUrl: 'https://www.bilibili.com/video/BV1XY411C7DE/',
    });
    let seriesItems: LearningSeries[] = [series({ resourceIds: [resourceId, secondResource.id] })];
    const writes: Array<{ path: string; method: string; body: unknown }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const target = requestPath(input);
        if (target.includes('/series') && init?.method !== undefined && init.method !== 'GET') {
          const body = init.body === undefined ? undefined : JSON.parse(String(init.body));
          writes.push({ path: target, method: init.method, body });
          if (init.method === 'POST')
            seriesItems = [
              ...seriesItems,
              series({
                id: '66666666-6666-4666-8666-666666666666',
                name: body.name,
                resourceIds: [],
              }),
            ];
          if (init.method === 'PATCH')
            seriesItems[0] = { ...seriesItems[0]!, name: body.name, revision: 2 };
          if (init.method === 'PUT')
            seriesItems[0] = series({ resourceIds: body.resourceIds, revision: 2 });
          if (init.method === 'DELETE') {
            seriesItems = seriesItems.filter((item) => !target.endsWith(item.id));
            return new Response(null, { status: 204 });
          }
          return json(seriesItems.at(-1) ?? series(), init.method === 'POST' ? 201 : 200);
        }
        return json(
          target.endsWith('/series')
            ? { items: seriesItems }
            : { items: [resource(), secondResource] },
        );
      }),
    );
    renderLearningPage();
    fireEvent.click(await screen.findByRole('button', { name: '编辑系列 前端系列' }));
    fireEvent.change(await screen.findByLabelText('新系列名称'), { target: { value: '新系列' } });
    fireEvent.click(screen.getByRole('button', { name: '创建系列' }));
    expect(await screen.findByDisplayValue('新系列')).toBeInTheDocument();

    const editor = screen.getByDisplayValue('前端系列').closest<HTMLElement>('.series-card');
    if (editor === null) throw new Error('系列编辑器不存在');
    fireEvent.change(within(editor).getByLabelText('系列名称'), {
      target: { value: '重命名系列' },
    });
    fireEvent.click(within(editor).getByRole('button', { name: '保存名称' }));
    await waitFor(() =>
      expect(writes.some(({ path, method }) => path.endsWith(seriesId) && method === 'PATCH')).toBe(
        true,
      ),
    );
    const renamedEditor = (await screen.findByDisplayValue('重命名系列')).closest<HTMLElement>(
      '.series-card',
    );
    if (renamedEditor === null) throw new Error('重命名后的系列编辑器不存在');
    fireEvent.click(within(renamedEditor).getByRole('button', { name: '上移 第二门课' }));
    fireEvent.click(within(renamedEditor).getByRole('button', { name: '保存顺序' }));
    await waitFor(() =>
      expect(
        writes.some(
          ({ method, body }) =>
            method === 'PUT' && JSON.stringify(body).includes(secondResource.id),
        ),
      ).toBe(true),
    );
    const reorderedEditor = screen
      .getByDisplayValue('重命名系列')
      .closest<HTMLElement>('.series-card');
    if (reorderedEditor === null) throw new Error('排序后的系列编辑器不存在');
    fireEvent.click(within(reorderedEditor).getByRole('button', { name: '删除系列' }));
    await waitFor(() =>
      expect(
        writes.some(({ path, method }) => path.endsWith(seriesId) && method === 'DELETE'),
      ).toBe(true),
    );
  });

  it('retains failed short links and lets the user retry a failed read', async () => {
    let resourceReads = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const target = requestPath(input);
        if (init?.method === 'POST')
          return json(
            {
              kind: 'unresolved',
              unresolved: {
                id: '77777777-7777-4777-8777-777777777777',
                normalizedUrl: 'https://b23.tv/abc123',
                requestedPartNumber: 1,
                revision: 1,
              },
            },
            202,
          );
        if (target.endsWith('/resources')) {
          resourceReads += 1;
          if (resourceReads === 1)
            return json({ error: { code: 'FAIL', message: '失败', details: [] } }, 500);
        }
        return json({ items: [] });
      }),
    );
    renderLearningPage();
    expect(await screen.findByText(/学习数据加载失败/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    await waitFor(() => expect(screen.getByText(/还没有学习资源/)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('视频链接或 BV 号'), {
      target: { value: 'https://b23.tv/abc123' },
    });
    fireEvent.click(screen.getByRole('button', { name: '导入资源' }));
    expect(await screen.findByText(/已安全保留/)).toBeInTheDocument();
    expect(screen.getByLabelText('视频链接或 BV 号')).toHaveValue('https://b23.tv/abc123');
  });

  it('keeps a large learning library available without rendering every card initially', async () => {
    const items = Array.from({ length: 25 }, (_, index) =>
      resource({
        id: `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        title: `性能课程 ${index + 1}`,
      }),
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        json(requestPath(input).endsWith('/series') ? { items: [] } : { items }),
      ),
    );
    renderLearningPage();

    expect(await screen.findByRole('heading', { name: '性能课程 20' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '性能课程 21' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '再显示 5 项（剩余 5 项）' }));
    expect(screen.getByRole('heading', { name: '性能课程 25' })).toBeInTheDocument();
  });
});
