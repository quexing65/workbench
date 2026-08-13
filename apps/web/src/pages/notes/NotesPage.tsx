import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Note } from '@workbench/shared';
import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react';

import { isRevisionConflict } from '../../shared/api/client';
import { createNote, deleteNote, getNotes, updateNote } from '../../shared/api/notes';
import { queryKeys } from '../../shared/api/query-keys';

function useDebounced(value: string, delay = 300): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [delay, value]);
  return debounced;
}

function NoteRow({ note, query }: { note: Note; query: string }) {
  const client = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(note.content);
  const refresh = () => client.invalidateQueries({ queryKey: queryKeys.notes(query) });
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
  function keyboardSave(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      mutation.mutate('save');
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
              onClick={() => window.confirm('确定删除这条小记吗？') && mutation.mutate('delete')}
            >
              删除
            </button>
          </div>
        </>
      )}
      {mutation.error && (
        <p role="alert" className="form-error">
          {isRevisionConflict(mutation.error)
            ? '数据已在其他页面修改，已刷新。'
            : mutation.error.message}
        </p>
      )}
    </li>
  );
}

export function NotesPage() {
  const client = useQueryClient();
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounced(query);
  const [content, setContent] = useState('');
  const notes = useQuery({
    queryKey: queryKeys.notes(debouncedQuery),
    queryFn: ({ signal }) => getNotes(debouncedQuery, signal),
  });
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
      create.mutate();
    }
  }
  return (
    <section className="page business-page">
      <header className="page-header">
        <p className="eyebrow">随手记下</p>
        <h1>小记</h1>
        <p className="page-lead">草稿留在表单里，只有保存成功后才会清空。</p>
      </header>
      <div className="business-layout">
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
          {notes.isPending && <p>正在加载小记…</p>}
          {notes.isError && (
            <div role="alert">
              <p>小记加载失败。</p>
              <button onClick={() => notes.refetch()}>重试</button>
            </div>
          )}
          {notes.data?.items.length === 0 && <p className="empty-state">还没有匹配的小记。</p>}
          <ul className="note-grid">
            {notes.data?.items.map((note) => (
              <NoteRow key={note.id} note={note} query={debouncedQuery} />
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
