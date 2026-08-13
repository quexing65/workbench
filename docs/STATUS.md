# vNext 实施状态

## 当前阶段

- 阶段：4
- 状态：完成
- 最后更新：2026-08-13

## 阶段状态

| 阶段 | 内容               | 状态   | 验收提交                                                 |
| ---: | ------------------ | ------ | -------------------------------------------------------- |
|    0 | 决策基线           | 完成   | `dff2c62` `chore: establish vNext execution baseline`    |
|    1 | Monorepo 骨架      | 完成   | `c8b29f7` `feat: establish runnable monorepo foundation` |
|    2 | SQLite/migration   | 完成   | `68bf3ff` `feat: add SQLite migration foundation`        |
|    3 | 任务/固定任务/小记 | 完成   | `4b21ad2` `feat: add core workbench workflows`           |
|    4 | 产品壳/总览/回顾   | 完成   | 本阶段提交，主题 `feat: complete overview and review`    |
|    5 | B站学习模型        | 未开始 |                                                          |
|    6 | 凭据/CDP/同步      | 未开始 |                                                          |
|    7 | 旧数据导入         | 未开始 |                                                          |
|    8 | 备份/恢复/切换     | 未开始 |                                                          |

## 本阶段变更

- 新增 overview/review 共享 Zod contract、业务日期加减/跨度工具和只读 Insight repository/service/route。
- 总览真实聚合今日每日/固定任务、逾期任务、最近三条小记、下一条可续播学习进度和近 7 天统计；聚合读取不创建 occurrence。
- 总览页支持快速新增任务、把逾期任务移到今天、最重要待办、近期小记、继续学习和 7 日完成率；各块具有 loading/empty/error/retry 状态。
- 回顾页支持 7/30 天切换，展示计划、完成、取消、完成率和学习活动；无计划时使用 `null`/“—”，不显示误导性的 0%。
- 图表提供等价可见数据表，页面路由使用 React.lazy/Suspense；React、Query、Zod 分块并新增自动包体积预算门禁。
- 新增 1440x900 与 390x844 Windows Chromium 截图基线、360px 全业务页无横向溢出、纯键盘任务/小记流程、reduced-motion 和移动 axe 验收。

## 验证结果

| 命令/检查               | 结果 | 测试数/备注                                                                                         |
| ----------------------- | ---- | --------------------------------------------------------------------------------------------------- |
| `npm run format:check`  | 通过 | 全部文件符合 Prettier                                                                               |
| `npm run lint`          | 通过 | ESLint 0 error、0 warning                                                                           |
| `npm run typecheck`     | 通过 | Server/Web/Shared 严格类型检查通过                                                                  |
| `npm ci`                | 通过 | 干净重装 479 packages                                                                               |
| `npm run test`          | 通过 | 20 files、79 tests（Server 31、Web 26、Shared 22）                                                  |
| `npm run test:coverage` | 通过 | Server 95.22/82.55/98.33；Web 97.35/93.03/90.32；Shared 99.32/95.91/100（lines/branches/functions） |
| `npm run build`         | 通过 | 最大 JS chunk 224.63 KiB；首屏 JS gzip 116.58 KiB；自动预算门禁通过                                 |
| `npm run check:all`     | 通过 | format、lint、typecheck、79 tests、build、7 Chromium E2E 全部通过                                   |
| 聚合 API                | 通过 | overview/review 契约、3/7/30/366 天边界、空完成率、学习活动、no-store 与只读零写入                  |
| 视觉/响应式             | 通过 | 1440x900/390x844 截图；360px 五个业务页无横向溢出；人工目视基线通过                                 |
| 键盘/无障碍             | 通过 | 纯键盘创建并完成任务、Ctrl+Enter 保存小记、reduced-motion；axe serious/critical=0                   |
| 兼容/清理               | 通过 | 正式 SPA/API 保持兼容；E2E 隔离临时库并清理；无残留本项目 Node 进程                                 |

## 数据迁移

- 新增 migration：无（继续使用 `0001-initial.sql`）
- migration SHA-256：`103858fe38bbdfdc4ed2af86fa5894b71b0203aa2ab756ded9c859eabbfd08ac`
- schema version：1
- 真实数据导入：无

## 未完成项

- 下一阶段：阶段 5 B站学习资源、分P、系列和确定性进度合并模型。

## 已知风险

- qoder 不含 Git 元数据，只能依靠关键文件 hash 证明未修改。
- Personal 基线原本不是完全干净，已有未跟踪执行规范；验收以“前后状态相同”为准。
- npm 报告 `glob@10.5.0`、`whatwg-encoding@3.1.1` 间接依赖提示，等待上游测试工具链升级。
- npm `allow-scripts` 提示 esbuild postinstall 尚未显式审批；当前干净安装、构建和测试均通过。
- 截图基线当前针对项目规定的 Windows Chromium CI；浏览器或字体栈升级需显式审阅基线变化。

## 兼容性影响

- 首次服务启动会在 `WORKBENCH_DATA_DIR`（开发默认 `.local`）创建目录和 `data/workbench.sqlite`。
- 正式环境未显式配置时使用 `%LOCALAPPDATA%\PersonalWorkbenchVNext`。
- 已应用 migration 文件不可修改；后续 schema 变化只能新增编号 migration。
- 总览/回顾读取现有 vNext 数据但仍未导入旧数据；两个旧项目继续独立运行。
- `/overview` 和 `/review` 响应新增稳定共享契约；没有计划时 `completionRate` 为 `null`。

## 旧项目状态

- Personal-Workbench 被修改：否
- Personl-Workbench-qoder 被修改：否

## 退出条件

- 阶段 4 实现与自动验收已通过；npm ci 重现、视觉基线、旧项目只读和敏感/运行时文件复核均通过。
