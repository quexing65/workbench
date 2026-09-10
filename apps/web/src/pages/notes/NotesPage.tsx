import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import type { Note } from '@workbench/shared';
import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react';

import { errorMessage } from '../../shared/api/client';
import { createNote, deleteNote, getNotes, updateNote } from '../../shared/api/notes';
import { queryKeys } from '../../shared/api/query-keys';
import { useConfirm } from '../../shared/ui/ConfirmDialog';
import { useAnimatedList } from '../../shared/ui/useAnimatedList';
import { QueryError, QueryLoading } from '../../shared/ui/QueryState';

function useDebounced(value: string, delay = 300): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [delay, value]);
  return debounced;
}

function NoteRow({ note }: { note: Note }) {
  const client = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(note.content);
  // 按前缀失效全部搜索词的缓存，与创建路径口径一致；
  // 只失效当前搜索词会让其他搜索词在 staleTime 内展示陈旧排序
  const refresh = () => client.invalidateQueries({ queryKey: ['notes'] });
  const mutation = useMutation({
    mutationFn: async (action: 'save' | 'pin' | 'delete') => {
      if (action === 'delete') await deleteNote(note.id, note.revision);
      else
        await updateNote(
          note.id,
          note.revision,
          action === 'save' ? { content } : { pinned: !note.pinned },
        );
    },
    onSuccess: async (_data, action) => {
      if (action === 'save') setEditing(false);
      await refresh();
    },
    onError: refresh,
  });
  const { confirm, dialog } = useConfirm();
  function keyboardSave(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      // 键盘 auto-repeat 会在请求进行中连发 keydown，只放行首个请求
      if (!mutation.isPending) mutation.mutate('save');
    }
  }
  return (
    <li className={`note-card${note.pinned ? ' note-card--pinned' : ''}`}>
      {editing ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate('save');
          }}
        >
          <label>
            小记内容
            <textarea
              required
              maxLength={20_000}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              onKeyDown={keyboardSave}
            />
          </label>
          <div className="button-row">
            <button disabled={mutation.isPending}>保存</button>
            <button type="button" className="button-secondary" onClick={() => setEditing(false)}>
              取消编辑
            </button>
          </div>
        </form>
      ) : (
        <>
          <p>{note.content}</p>
          <small>{new Date(note.updatedAt).toLocaleString('zh-CN')}</small>
          <div className="button-row">
            <button className="button-secondary" onClick={() => setEditing(true)}>
              编辑
            </button>
            <button
              className="button-secondary"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate('pin')}
            >
              {note.pinned ? '取消置顶' : '置顶'}
            </button>
            <button
              className="button-danger"
              disabled={mutation.isPending}
              onClick={() =>
                confirm({
                  message: '确定删除这条小记吗？',
                  confirmLabel: '删除',
                  onConfirm: () => mutation.mutate('delete'),
                })
              }
            >
              删除
            </button>
          </div>
        </>
      )}
      {mutation.error && (
        <p role="alert" className="form-error">
          {errorMessage(mutation.error, '数据已在其他页面修改，已刷新。')}
        </p>
      )}
      {dialog}
    </li>
  );
}

export function NotesPage() {
  const client = useQueryClient();
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounced(query);
  const noteGrid = useAnimatedList<HTMLUListElement>();
  const [content, setContent] = useState('');
  const notes = useInfiniteQuery({
    queryKey: queryKeys.notes(debouncedQuery),
    queryFn: ({ pageParam, signal }) => getNotes(debouncedQuery, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    // 搜索词即缓存键：保留上一份数据可避免列表闪空，
    // 也避免 auto-animate 在新旧两份列表间产生同文本双节点。
    placeholderData: keepPreviousData,
  });
  // 后端按 100 条分页；拼接已加载页，剩余条目经「加载更多」按需拉取
  const items = notes.data?.pages.flatMap((page) => page.items);
  const create = useMutation({
    mutationFn: () => createNote({ content, pinned: false }),
    onSuccess: async () => {
      setContent('');
      await client.invalidateQueries({ queryKey: ['notes'] });
    },
  });
  function submit(event: FormEvent) {
    event.preventDefault();
    create.mutate();
  }
  function keyboardSave(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      // 键盘 auto-repeat 会在请求进行中连发 keydown，只放行首个请求
      if (!create.isPending) create.mutate();
    }
  }
  return (
    <section className="page business-page">
      <header className="page-header">
        <p className="eyebrow">随手记下</p>
        <h1>小记</h1>
        <p className="page-lead">草稿留在表单里，只有保存成功后才会清空。</p>
      </header>
      <div className="business-layout business-layout--wide-editor">
        <form className="editor-card" onSubmit={submit}>
          <h2>写一条小记</h2>
          <label>
            内容
            <textarea
              required
              maxLength={20_000}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              onKeyDown={keyboardSave}
            />
          </label>
          <button disabled={create.isPending}>保存小记</button>
          <small>Ctrl/Cmd + Enter 快速保存</small>
          {create.error && (
            <p role="alert" className="form-error">
              {create.error.message}
            </p>
          )}
        </form>
        <div className="list-panel">
          <div className="list-toolbar">
            <h2>小记列表</h2>
            <label>
              搜索
              <input
                type="search"
                value={query}
                maxLength={500}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          </div>
          {notes.isPending && <QueryLoading message="正在加载小记…" />}
          {notes.isError && <QueryError message="小记加载失败。" onRetry={() => notes.refetch()} />}
          {notes.data !== undefined && items?.length === 0 && (
            <p className="empty-state">还没有匹配的小记。</p>
          )}
          <ul className="note-grid" ref={noteGrid}>
            {items?.map((note) => (
              <NoteRow key={note.id} note={note} />
            ))}
          </ul>
          {notes.hasNextPage && (
            <button
              type="button"
              className="button-secondary list-more"
              disabled={notes.isFetchingNextPage}
              onClick={() => void notes.fetchNextPage()}
            >
              {notes.isFetchingNextPage ? '正在加载…' : '加载更多'}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
