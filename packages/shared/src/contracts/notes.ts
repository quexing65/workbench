import { z } from 'zod';

const contentSchema = z
  .string()
  .trim()
  .min(1, '内容不能为空')
  .max(20_000, '内容不能超过 20000 个字符');

export const noteSchema = z.object({
  id: z.string().uuid(),
  content: z.string(),
  pinned: z.boolean(),
  createdAt: z.string().datetime({ offset: false }),
  updatedAt: z.string().datetime({ offset: false }),
  revision: z.number().int().positive(),
});
export type Note = z.infer<typeof noteSchema>;

export const noteListResponseSchema = z.object({
  items: z.array(noteSchema),
  nextCursor: z.string().nullable(),
});
export type NoteListResponse = z.infer<typeof noteListResponseSchema>;

export const noteListQuerySchema = z
  .object({
    q: z.string().trim().max(500, '搜索内容不能超过 500 个字符').optional(),
    pinned: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
    cursor: z.string().max(500, '分页游标无效').optional(),
    limit: z.coerce.number().int().min(1).max(500).default(100),
  })
  .strict();

export const createNoteSchema = z
  .object({ content: contentSchema, pinned: z.boolean().default(false) })
  .strict();

export const updateNoteSchema = z
  .object({
    revision: z.number().int().positive(),
    content: contentSchema.optional(),
    pinned: z.boolean().optional(),
  })
  .strict()
  .refine(({ content, pinned }) => content !== undefined || pinned !== undefined, {
    message: '至少提供一个要更新的字段',
  });

export type CreateNoteInput = z.infer<typeof createNoteSchema>;
export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;
