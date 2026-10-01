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
import type { Icon } from '@phosphor-icons/react';

export interface NavigationItem {
  to: string;
  label: string;
  icon: Icon;
}

export interface NavigationGroup {
  id: string;
  label: string;
  items: readonly NavigationItem[];
}

/** 侧栏导航按使用频率分组：日常是高频动线，管理是低频入口；设置以按钮形式固定在侧栏底部。 */
export const navigationGroups: readonly NavigationGroup[] = [
  {
    id: 'daily',
    label: '日常',
    items: [
      { to: '/overview', label: '总览', icon: SquaresFour },
      { to: '/tasks', label: '任务', icon: ListChecks },
      { to: '/notes', label: '小记', icon: NotePencil },
      { to: '/learning', label: '学习', icon: MonitorPlay },
      { to: '/review', label: '回顾', icon: ChartLineUp },
    ],
  },
  {
    id: 'manage',
    label: '管理',
    items: [
      { to: '/overdue', label: '逾期', icon: ClockCountdown },
      { to: '/recurring', label: '固定任务', icon: ArrowsClockwise },
      { to: '/data', label: '数据', icon: Database },
    ],
  },
];
