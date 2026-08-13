import {
  noteListResponseSchema,
  noteSchema,
  type CreateNoteInput,
  type Note,
} from '@workbench/shared';
import { z } from 'zod';

import { apiRequest } from './client';

export function getNotes(query: string, signal?: AbortSignal) {
  const search = query === '' ? '' : `?q=${encodeURIComponent(query)}`;
  return apiRequest(`/api/v1/notes${search}`, noteListResponseSchema, {
    ...(signal === undefined ? {} : { signal }),
  });
}

export function createNote(input: CreateNoteInput): Promise<Note> {
  return apiRequest('/api/v1/notes', noteSchema, { method: 'POST', body: input });
}

export function updateNote(
  id: string,
  revision: number,
  patch: { content?: string; pinned?: boolean },
): Promise<Note> {
  return apiRequest(`/api/v1/notes/${id}`, noteSchema, {
    method: 'PATCH',
    body: { revision, ...patch },
  });
}

export function deleteNote(id: string, revision: number): Promise<void> {
  return apiRequest(`/api/v1/notes/${id}`, z.void(), { method: 'DELETE', revision });
}
