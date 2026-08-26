import {
  ArrowsClockwise,
  ChartLineUp,
  ClockCountdown,
  Database,
  ListChecks,
  MonitorPlay,
  NotePencil,
  SquaresFour,
} from '@phosphor-icons/react';

export const navigationItems = [
  { to: '/overview', label: '总览', shortLabel: '总览', icon: SquaresFour },
  { to: '/tasks', label: '任务', shortLabel: '任务', icon: ListChecks },
  { to: '/overdue', label: '逾期', shortLabel: '逾期', icon: ClockCountdown },
  { to: '/recurring', label: '固定任务', shortLabel: '固定', icon: ArrowsClockwise },
  { to: '/notes', label: '小记', shortLabel: '小记', icon: NotePencil },
  { to: '/learning', label: '学习', shortLabel: '学习', icon: MonitorPlay },
  { to: '/review', label: '回顾', shortLabel: '回顾', icon: ChartLineUp },
  { to: '/data', label: '数据', shortLabel: '数据', icon: Database },
] as const;
