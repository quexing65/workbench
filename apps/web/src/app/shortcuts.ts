/** 快捷键的单一数据源：全局 hook、设置页与 ? 浮层都从这里渲染，避免文案漂移。 */
export interface ShortcutItem {
  readonly keys: string;
  readonly label: string;
}

export interface ShortcutGroup {
  readonly title: string;
  readonly items: readonly ShortcutItem[];
}

/** g 前缀后按目标页首字母导航；逾期用 D（Due）、回顾用 V（reView）、数据用 B（backup）。 */
export const NAV_KEY_ROUTES: Readonly<Record<string, string>> = {
  o: '/overview',
  t: '/tasks',
  d: '/overdue',
  r: '/recurring',
  n: '/notes',
  l: '/learning',
  v: '/review',
  b: '/data',
  s: '/settings',
};

export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  {
    title: '导航（先按 G，松开后再按目标键）',
    items: [
      { keys: 'G O', label: '总览' },
      { keys: 'G T', label: '任务' },
      { keys: 'G D', label: '逾期' },
      { keys: 'G R', label: '固定任务' },
      { keys: 'G N', label: '小记' },
      { keys: 'G L', label: '学习' },
      { keys: 'G V', label: '回顾' },
      { keys: 'G B', label: '数据' },
      { keys: 'G S', label: '设置' },
    ],
  },
  {
    title: '操作',
    items: [
      { keys: 'N', label: '聚焦当前页的新建输入' },
      { keys: 'D', label: '切换浅色 / 深色主题' },
      { keys: '[', label: '任务页：切换到前一天' },
      { keys: ']', label: '任务页：切换到后一天' },
      { keys: '?', label: '打开 / 关闭本速查表' },
      { keys: 'Esc', label: '关闭弹窗与导航抽屉' },
    ],
  },
];

/** 输入框 / 文本域 / 弹窗内不触发全局快捷键；页面给新建控件挂此属性供 N 聚焦。 */
export const NEW_INPUT_SELECTOR = '[data-shortcut="new"]';

/** DateNavigator 监听：[ 或 ] 触发 ±1 天。 */
export const DATE_STEP_EVENT = 'workbench:date-step';
