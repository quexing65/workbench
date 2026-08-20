import {
  addBusinessDays,
  businessDateSpan,
  type DayStats,
  type OverviewResponse,
  type ReviewResponse,
  type TaskListItem,
} from '@workbench/shared';

import type { TaskRepository } from '../tasks/repository.js';
import type { InsightRepository } from './repository.js';

function dateRange(from: string, to: string): string[] {
  return Array.from({ length: businessDateSpan(from, to) }, (_, index) =>
    addBusinessDays(from, index),
  );
}

function stats(date: string, items: TaskListItem[], learningActivities: number): DayStats {
  const planned = items.length;
  const completed = items.filter((item) => item.status === 'completed').length;
  // 已取消与已过期都视为“作废”，避免过期任务被残留计算成待完成。
  const cancelled = items.filter(
    (item) => item.status === 'cancelled' || item.status === 'expired',
  ).length;
  return {
    date,
    planned,
    completed,
    cancelled,
    completionRate: planned === 0 ? null : completed / planned,
    learningActivities,
  };
}

export class InsightService {
  public constructor(
    private readonly repository: InsightRepository,
    private readonly tasks: TaskRepository,
  ) {}

  public overview(date: string): OverviewResponse {
    const items = this.tasks.list(date);
    const from = addBusinessDays(date, -6);
    const activity = this.repository.learningActivityCounts(from, date);
    const last7Days = dateRange(from, date).map((day) =>
      stats(day, this.tasks.list(day), activity.get(day) ?? 0),
    );
    return {
      date,
      today: {
        items,
        planned: items.length,
        active: items.filter((item) => item.status === 'active').length,
        completed: items.filter((item) => item.status === 'completed').length,
        cancelled: items.filter((item) => item.status === 'cancelled' || item.status === 'expired')
          .length,
      },
      overdueTasks: this.tasks.listOverdue(date),
      recentNotes: this.repository.listRecentNotes(3),
      nextLearning: this.repository.nextLearning(),
      last7Days,
    };
  }

  public review(from: string, to: string): ReviewResponse {
    const activity = this.repository.learningActivityCounts(from, to);
    // 观看进度是当前状态快照，与 from/to 区间无关，两期查询返回相同值。
    const learningPositionBySeries = this.repository.learningPositionBySeries();
    const days = dateRange(from, to).map((date) =>
      stats(date, this.tasks.list(date), activity.get(date) ?? 0),
    );
    const totals = days.reduce(
      (result, day) => ({
        planned: result.planned + day.planned,
        completed: result.completed + day.completed,
        cancelled: result.cancelled + day.cancelled,
        learningActivities: result.learningActivities + day.learningActivities,
      }),
      { planned: 0, completed: 0, cancelled: 0, learningActivities: 0 },
    );
    return {
      from,
      to,
      days,
      totals: {
        ...totals,
        completionRate: totals.planned === 0 ? null : totals.completed / totals.planned,
      },
      learningDuration: {
        totalSeconds: learningPositionBySeries.reduce(
          (total, item) => total + item.durationSeconds,
          0,
        ),
        bySeries: learningPositionBySeries,
      },
    };
  }
}
