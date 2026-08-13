// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DataPage } from '../pages/data/DataPage';
import { json } from './learning-fixtures';

const runId = '11111111-1111-4111-8111-111111111111';
const sha = 'a'.repeat(64);

function report(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    runId,
    sourceType: 'personal-json',
    sourceSha256: sha,
    sourceSchema: 'personal-v3',
    mode: 'preflight',
    status: 'ready',
    counts: {
      task: { read: 2, add: 1, update: 0, unchanged: 0, conflict: 1, reject: 0 },
    },
    conflicts: [
      {
        code: 'SOURCE_TARGET_CONFLICT',
        entity: 'task',
        sourceId: 'old-task',
        fields: ['source', 'target'],
        resolution: 'keep-target',
      },
    ],
    warnings: [{ code: 'POSSIBLE_DUPLICATE_TASK', message: '可能重复' }],
    fatal: [],
    credentials: { detected: true, migrated: false },
    ...overrides,
  };
}

function renderPage() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}
    >
      <DataPage />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('data import page', () => {
  it('preflights multipart, shows every reconciliation class, and requires confirmation', async () => {
    const requests: { input: RequestInfo | URL; init?: RequestInit }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push({ input, ...(init === undefined ? {} : { init }) });
        if (String(input).endsWith('/preflight')) {
          return json(
            {
              report: report(),
              confirmationToken: 't'.repeat(43),
              expiresAt: '2026-08-13T12:15:00.000Z',
            },
            201,
          );
        }
        return json(report({ mode: 'apply', status: 'succeeded', conflicts: [] }));
      }),
    );
    renderPage();
    const file = new File(['{}'], 'personal.json', { type: 'application/json' });
    fireEvent.change(screen.getByLabelText('备份文件'), { target: { files: [file] } });
    fireEvent.submit(screen.getByRole('button', { name: '预检并生成对账报告' }).closest('form')!);

    expect(await screen.findByRole('heading', { name: '可以安全应用' })).toBeInTheDocument();
    expect(screen.getByText('SOURCE_TARGET_CONFLICT')).toBeInTheDocument();
    expect(screen.getByText('POSSIBLE_DUPLICATE_TASK')).toBeInTheDocument();
    expect(screen.getByText(/检测到，但未迁移/)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('t'.repeat(43));
    const applyButton = screen.getByRole('button', { name: '创建快照并事务导入' });
    expect(applyButton).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(applyButton);
    expect(await screen.findByRole('heading', { name: '导入已完成' })).toBeInTheDocument();

    const preflight = requests[0]?.init;
    expect(preflight?.headers).toEqual({
      Accept: 'application/json',
      'X-Workbench-Request': '1',
    });
    expect(preflight?.body).toBeInstanceOf(FormData);
    expect((preflight?.body as FormData).get('file')).toBe(file);
    expect(JSON.parse(String(requests[1]?.init?.body))).toEqual({
      confirmationToken: 't'.repeat(43),
    });
  });

  it('requires and sends the confirmed timezone for qoder snapshots', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = init?.body as FormData;
        expect(body.get('sourceType')).toBe('qoder-sqlite');
        expect(body.get('sourceTimezone')).toBe('Asia/Shanghai');
        return json(
          {
            report: report({
              sourceType: 'qoder-sqlite',
              sourceSchema: 'qoder-current',
              sourceTimezone: 'Asia/Shanghai',
              status: 'failed',
              fatal: [{ code: 'QODER_INSPECTION_FAILED', message: '检查失败' }],
              credentials: { detected: false, migrated: false },
            }),
          },
          422,
        );
      }),
    );
    renderPage();
    fireEvent.change(screen.getByLabelText('来源'), { target: { value: 'qoder-sqlite' } });
    expect(screen.getByLabelText('来源时区')).toHaveValue('Asia/Shanghai');
    expect(screen.getByText(/不要在旧服务运行且存在 WAL/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('备份文件'), {
      target: { files: [new File(['db'], 'qoder.sqlite')] },
    });
    fireEvent.submit(screen.getByRole('button', { name: '预检并生成对账报告' }).closest('form')!);
    expect(await screen.findByRole('heading', { name: '预检未通过' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '创建快照并事务导入' })).not.toBeInTheDocument();
  });

  it('shows safe transport errors without exposing local paths', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json(
          {
            error: { code: 'IMPORT_UPLOAD_REJECTED', message: '导入文件超过限制', details: [] },
          },
          413,
        ),
      ),
    );
    renderPage();
    fireEvent.change(screen.getByLabelText('备份文件'), {
      target: { files: [new File(['{}'], 'personal.json')] },
    });
    fireEvent.submit(screen.getByRole('button', { name: '预检并生成对账报告' }).closest('form')!);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('导入文件超过限制'));
    expect(document.body.textContent).not.toContain('C:\\');
  });
});
