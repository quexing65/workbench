export const queryKeys = {
  overview: (date: string) => ['overview', { date }] as const,
  review: (from: string, to: string) => ['review', { from, to }] as const,
  tasks: (date: string) => ['tasks', { date }] as const,
  recurringTasks: ['recurringTasks'] as const,
  notes: (query: string) => ['notes', { query }] as const,
  learningResources: ['learningResources'] as const,
  learningSeries: ['learningSeries'] as const,
  biliCredential: ['biliCredential'] as const,
  learningSync: (runId: string) => ['learningSync', { runId }] as const,
};
