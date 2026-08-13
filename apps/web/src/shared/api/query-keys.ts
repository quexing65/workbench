export const queryKeys = {
  tasks: (date: string) => ['tasks', { date }] as const,
  recurringTasks: ['recurringTasks'] as const,
  notes: (query: string) => ['notes', { query }] as const,
};
