# UI 改版计划（2026-08）

> 状态：**已批准，待实施**。
> 回退基线：git tag `pre-ui-redesign`（回退操作手册见 [ui-redesign-rollback.md](./ui-redesign-rollback.md)）。
> 工作分支：`ui-redesign`（从基线拉出；`main` 始终保持改版前状态，验收合格后才合并）。
> 改版前检查点提交：`c0c2c40`。

## 1. 目标与已拍板的选型

视觉风格从"暖纸编辑部"（奶油底 + Georgia 衬线标题）切换为**极简生产力风（Linear 式）**：
中性灰阶画布、纯白卡片、1px 细线分层、弱化阴影、去衬线标题、字重做层级；
**保留深绿侧栏与绿色强调色**作为品牌锚点（也是"白色线稿→白色填充"图标的前提）。

| 决策点 | 选择 | 落选原因 |
| --- | --- | --- |
| 风格方向 | B 极简生产力风，以令牌化精修打底 | 玻璃拟态：桌面端软件渲染扛不住 backdrop-filter；新粗野主义：与表单/表格/图表的内容密度冲突，对比度风险大 |
| 中文黑体 | `@fontsource-variable/noto-sans-sc`（单一可变家族，真实 100–900 字重） | MiSans：`misans-webfont` 把每个字重做成独立家族名且声明均为 weight 400，与 `font-synthesis: none` + 650~800 字重的现有用法不兼容。实施时（2026-08-24）确认受阻，按预案切换到备选项 |
| 拉丁/数字 | `@fontsource-variable/inter`（Inter Variable） | — |
| 等宽 | `@fontsource/jetbrains-mono`（400/500/600 静态字重） | Maple Mono 中英对齐好但需手动管文件，维护性差一档 |
| 标题字体 | 去衬线，统一 `--font-sans`，600/400 字重分层 | 思源宋体仅在保留旧风格时才需要 |
| 图标库 | `@phosphor-icons/react`，每图标用 regular（线稿）+ fill（填充）双 weight | lucide 无 fill 档；iconify 运行时拉取，离线桌面不适用 |
| 动画方案 | 纯 CSS transition，不引动画库 | framer-motion 占 JS 预算，且 JS 驱动动画会绕过 reduced-motion e2e 门禁 |

## 2. 硬约束（实现时逐条遵守）

1. **软件渲染**：桌面端默认关闭 GPU 加速（`apps/desktop/src/main.ts:15`）。动效只允许 `transform`/`opacity`；禁止新增大面积 `backdrop-filter`。
2. **reduced-motion 门禁**：`tests/e2e/visual-accessibility.spec.ts:67-75` 断言 reduced-motion 下 `.nav-link` 计算样式 `transitionDuration` ≈ 0，全局开关在 `apps/web/src/styles/responsive.css:167-175`。所有动效必须由 CSS transition 驱动。
3. **JS 包预算**（`scripts/check-web-bundle.mjs`，随 `npm run build` 强制）：最大单 chunk ≤ 350 KiB；首屏 JS gzip ≤ 200 KiB。Phosphor 用具名导入（Vite 可摇树）；`weight` 属性切换会把该图标两档 weight 都打进包——本方案恰好只需要 regular+fill 两档，可接受；引入后必须跑 `npm run build` 验证。若超标，退回手写 16 个内联 SVG（8 项 × 线稿/填充）的备选方案。
4. **类名契约**（e2e 与性能脚本依赖，禁止改名）：`.nav-link`、`.side-nav`、`.app-shell--sidebar-collapsed`、`.health`、`.health--ok`、`.mobile-header`、`.editor-card`、`.work-list .work-item`、`.note-grid .note-card`、`.learning-card`、`.review-stats`。
5. **对比度**：`--line` 在 `--paper` 上仅 1.34:1，禁止用作任何文字色（大字也要求 3:1）；新文字色自查：普通字 ≥ 4.5:1、大字 ≥ 3:1。360×800 宽度 `/data` 的 axe 用例对 serious/critical 零容忍。
6. **字体体积**：字体是静态资源不占 JS 预算，但 CJK 切片使 dist 增大几十 MB、electron-builder 产物同步变大——已接受。

## 3. 目标设计令牌（Phase 1 落地；数值为起点，Phase 3 允许微调）

替换 `apps/web/src/styles/base.css:1-26` 的 `:root` 块。

### 颜色（浅色工作区）

| 令牌 | 目标值 | 用途 |
| --- | --- | --- |
| `--canvas` | `#f6f6f3` | 页面背景（暖调近白灰） |
| `--paper` | `#ffffff` | 卡片面 |
| `--ink` | `#191b18` | 正文 |
| `--muted` | `#5c605a` | 次要文字 |
| `--line` | `#e6e5e0` | 1px 分隔线/边框 |
| `--accent` | `#315f50` | 品牌绿（保留现值） |
| `--accent-strong` | `#23493e` | 主按钮（保留现值） |
| `--accent-soft` | `#e4efe9` | 绿色浅底 |
| `--warm` | `#c96a42` | 赤陶：focus/逾期/取消点缀 |
| `--error` | `#b0413d` | 错误 |
| `--success` | `#326b48` | 成功（**新增**，修复 `learning.css:72` 引用未定义令牌的历史问题） |

### 侧栏（深底保留）

| 令牌 | 目标值 |
| --- | --- |
| `--sidebar-bg` | `#1f2e29` |
| `--sidebar-ink` | `#f2f4f1` |
| `--sidebar-muted` | `#9fb3a9` |
| `--sidebar-hover` | `rgb(255 255 255 / 6%)` |
| `--sidebar-glider` | `rgb(255 255 255 / 10%)` |
| `--sidebar-line` | `rgb(255 255 255 / 8%)` |

### 圆角 / 阴影 / 动效 / 字体

```css
--radius-sm: 6px;    /* 输入框、小件 */
--radius-md: 10px;   /* 按钮、导航项 */
--radius-lg: 14px;   /* 卡片、面板 */
--radius-full: 999px;/* 胶囊、进度 */
--shadow-sm: 0 1px 2px rgb(20 23 18 / 5%);
--shadow-md: 0 8px 24px rgb(20 23 18 / 7%);
--motion-fast: 150ms;
--motion-base: 220ms;
--ease-out: cubic-bezier(0.2, 0, 0, 1);
--font-sans: 'Inter Variable', 'MiSans', ui-sans-serif, system-ui, 'Segoe UI', 'Microsoft YaHei', sans-serif;
--font-mono: 'JetBrains Mono', ui-monospace, 'Cascadia Code', Consolas, monospace;
```

现有 12 种硬编码圆角（0.2~1.25rem）全部收敛到 4 档；正文 line-height 提至 1.7；
统计数字统一 `font-variant-numeric: tabular-nums`。

## 4. 分阶段任务

### Phase 0 ✅ git 基线（已完成）

main 上两个提交：检查点 `c0c2c40` + 本计划文档；打 tag `pre-ui-redesign`；拉出 `ui-redesign` 分支。

### Phase 1 依赖引入与令牌体系

提交信息建议：`build(web): 引入字体图标依赖并落地设计令牌`

- [ ] `apps/web` 安装：`misans-webfont`、`@fontsource-variable/inter`、`@fontsource/jetbrains-mono`、`@phosphor-icons/react`
- [ ] 新建 `apps/web/src/styles/fonts.css`：按各包 README 引入 @font-face（MiSans 全字重 CSS、Inter Variable 入口、JetBrains Mono 400/500/600），并在 `styles.css` import 链首位挂载
- [ ] `base.css` 重写 `:root` 为第 3 节令牌；根 `font-family` 换 `var(--font-sans)`
- [ ] `apps/web/index.html:6` 的 `theme-color` 同步为 `--canvas` 值
- [ ] 验收：`npm run build`（含包预算检查）+ `npm run test -w @workbench/web`

### Phase 2 侧边栏图标与切换动效

提交信息建议：`feat(web): 侧边栏启用线稿填充双态图标与滑动指示条`

- [ ] `apps/web/src/app/navigation.ts`：`icon` 字段从 Unicode 字符改为 `{ regular, fill }` 图标组件引用。映射（实施时可换更贴切的）：
  总览 `house` · 任务 `check-square` · 逾期 `clock-countdown` · 固定任务 `arrows-clockwise` · 小记 `notebook` · 学习 `book-open` · 回顾 `chart-donut` · 数据 `database`
- [ ] `apps/web/src/app/AppShell.tsx`：
  - 图标位渲染双层叠放（线稿层 + 填充层，绝对定位重合）
  - 新增 `.side-nav__glider` 绝对定位指示条，`style` 由激活项 index 计算 `translateY`
  - 折叠按钮的内联 SVG（68-81 行）换成 Phosphor 图标统一语言
- [ ] `apps/web/src/styles/shell.css`：
  - `.nav-link__icon` 双层样式 + 交叉淡化（`opacity` 互换 + `scale(0.92)→scale(1)`），只用 transform/opacity
  - glider：`transition: transform var(--motion-base) var(--ease-out)`
  - 激活态重构（替换 115-134 行现有色块方案）：glider 背景 + 填充图标 + label `translateX(2px)` 提亮为 `--sidebar-ink`
  - 折叠动画平滑化：label 由 `display: none`（210-214 行）改为 `grid-template-columns: 1fr → 0fr` + `opacity` 渐隐，与现有 180ms 宽度过渡同步
- [ ] `apps/web/src/styles/responsive.css:112-120`：移动端底栏激活 = fill 图标 + `--accent` 色 + 顶部小圆点指示
- [ ] 验收：本地 dev 目测 8 项切换、折叠、390px 底栏；模拟 reduced-motion 确认动效归零；`npm run test -w @workbench/web`

### Phase 3 全局风格落地

提交信息建议：`style(web): 全局切换极简生产力风格并收编散落样式`

- [ ] 去衬线：`base.css:92`、`shell.css:60,74`（品牌标识）、`pages.css:64,156`、`insights.css:86,170,328` 的 Georgia 栈全部改 `var(--font-sans)` + 600 字重
- [ ] 硬编码色收编进令牌：`shell.css:14,58-59,160-171` → `--sidebar-*`；`business.css:65`、`learning.css:166` 输入底 → `--paper`；`business.css:205,219` 状态底色 → 令牌；`pages.css:90`、`insights.css:43-46,470,523` 覆盖层/图表待定色 → 令牌
- [ ] `apps/web/src/pages/review/ReviewPage.tsx:17`：`PIE_COLORS` 调整为与中性灰阶协调的色板（绿主 + 赤陶 + 中性阶）
- [ ] 等宽落地：备份卡片 code（`data.css:39`）、日期与统计数字用 `var(--font-mono)` + `tabular-nums`
- [ ] 自定义 webkit 滚动条（细而淡，软件渲染零成本）
- [ ] 验收：全部页面目测；新文字色逐个自查对比度（硬约束 5）

### Phase 4 基线重生成与全量验证

提交信息建议：`test: 重生成视觉基线并复核可访问性与性能门禁`

- [ ] `netstat` 确认 5190/8790 端口空闲（dev 服务在跑会被复用、截到真实数据）→ `npx playwright test tests/e2e/visual-accessibility.spec.ts --update-snapshots`（自起新服务 + 全新临时 DB = 空库基线）。dev 服务停不掉时：建临时 spec 用 `page.route` 固定空库响应，生成后把 PNG 复制进 `visual-accessibility.spec.ts-snapshots/`，再删临时 spec
- [ ] `npm run test:e2e` 全量（仅端口空闲时跑）
- [ ] `npm run performance:browser`
- [ ] axe 重点复核：桌面 `/overview`、390×844 `/review`、360×800 `/data`
- [ ] 全部通过后：合并 `ui-redesign` → `main`（建议 `--no-ff` 保留阶段历史），推送 origin

### Phase 5（后续单独立项，不混入本次）：暗色模式

`data-theme` + `prefers-color-scheme` + localStorage（侧栏折叠偏好已有先例 `AppShell.tsx:29-39`）。
对比度验证面翻倍，必须独立成期。

## 5. 每阶段提交前固定动作

1. `git status` 确认只有本阶段文件，单一职责提交
2. `npm run test -w @workbench/web`（单测）
3. 涉及依赖/构建的改动跑 `npm run build`（包预算门禁）
4. Phase 2 起每阶段末跑 `npm run test:e2e`（端口空闲时）与 `npm run performance:browser`，提前暴露过时基线/选择器
5. 提交信息遵循 `AGENTS.md`：`type(scope): 中文描述`

## 6. 相关文档

- 回退操作手册：[ui-redesign-rollback.md](./ui-redesign-rollback.md)
- 前端结构约定：`docs/baseline/PROJECT_STRUCTURE.md`
- 提交规范：`AGENTS.md`
