# vNext 实施状态

## 当前阶段

- 阶段：3
- 状态：完成
- 最后更新：2026-08-13

## 阶段状态

| 阶段 | 内容               | 状态   | 验收提交                                                 |
| ---: | ------------------ | ------ | -------------------------------------------------------- |
|    0 | 决策基线           | 完成   | `dff2c62` `chore: establish vNext execution baseline`    |
|    1 | Monorepo 骨架      | 完成   | `c8b29f7` `feat: establish runnable monorepo foundation` |
|    2 | SQLite/migration   | 完成   | `68bf3ff` `feat: add SQLite migration foundation`        |
|    3 | 任务/固定任务/小记 | 完成   | 本阶段提交，主题 `feat: add core workbench workflows`    |
|    4 | 产品壳/总览/回顾   | 未开始 |                                                          |
|    5 | B站学习模型        | 未开始 |                                                          |
|    6 | 凭据/CDP/同步      | 未开始 |                                                          |
|    7 | 旧数据导入         | 未开始 |                                                          |
|    8 | 备份/恢复/切换     | 未开始 |                                                          |

## 本阶段变更

- 新增每日任务、固定任务和小记的共享 Zod contract、repository、service、route 和 typed Web client。
- 每日任务支持新增、编辑、完成、取消、恢复、改期和软删除；PATCH 使用 revision，DELETE 使用标准 `If-Match`/`ETag`。
- 固定任务只保存日期范围规则；查询当日列表使用 `LEFT JOIN` 合并 override，不读取写入、不批量生成未来记录。
- occurrence 首次写入以 revision=0 和唯一键原子竞争，后续使用 revision 乐观锁；每天状态互不影响。
- 小记支持新增、编辑、搜索、置顶、稳定游标分页和软删除；搜索全部参数化，limit 默认 100、最大 500。
- 三个正式页面实现 loading/empty/error/retry/busy；失败保留草稿，409 提示并刷新，删除前确认，小记支持 Ctrl/Cmd+Enter。
- 新增 360px 响应式业务布局、typed query key、全局覆盖率门禁和每轮隔离/清理的 Playwright 数据目录。

## 验证结果

| 命令/检查               | 结果 | 测试数/备注                                                                                         |
| ----------------------- | ---- | --------------------------------------------------------------------------------------------------- |
| `npm run format:check`  | 通过 | 全部文件符合 Prettier                                                                               |
| `npm run lint`          | 通过 | ESLint 0 error、0 warning                                                                           |
| `npm run typecheck`     | 通过 | Server/Web/Shared 严格类型检查通过                                                                  |
| `npm ci`                | 通过 | 干净重装 479 packages                                                                               |
| `npm run test`          | 通过 | 17 files、70 tests（Server 29、Web 22、Shared 19）                                                  |
| `npm run test:coverage` | 通过 | Server 94.56/80.90/98.07；Web 96.93/92.53/89.00；Shared 99.06/94.44/100（lines/branches/functions） |
| `npm run build`         | 通过 | Web JS 413.07 KB raw / 121.34 KB gzip；Server/Shared 构建通过                                       |
| `npm run check:all`     | 通过 | format、lint、typecheck、70 tests、build、4 Chromium E2E 全部通过                                   |
| API/并发                | 通过 | CRUD、结构化 4xx、ETag、同 revision 仅一次成功；daily 与 occurrence 均覆盖 409                      |
| 固定任务语义            | 通过 | 范围内每日默认出现、重复查询零写入、日期状态独立、范围外 404                                        |
| 浏览器持久化            | 通过 | 三类数据写入后页面刷新仍存在；360px 无页面级横向溢出；axe serious/critical=0                        |
| 正式运行/完整性         | 通过 | 同源 CRUD 与 SPA fallback；integrity_check=ok、foreign_key_check=0；临时目录可清理                  |

## 数据迁移

- 新增 migration：无（继续使用 `0001-initial.sql`）
- migration SHA-256：`103858fe38bbdfdc4ed2af86fa5894b71b0203aa2ab756ded9c859eabbfd08ac`
- schema version：1
- 真实数据导入：无

## 未完成项

- 下一阶段：阶段 4 正式总览、7/30 天回顾、页面级 lazy loading 和截图/键盘响应式验收。

## 已知风险

- qoder 不含 Git 元数据，只能依靠关键文件 hash 证明未修改。
- Personal 基线原本不是完全干净，已有未跟踪执行规范；验收以“前后状态相同”为准。
- npm 安装报告的 `glob@10.5.0` 间接依赖提示继续由上游工具链升级处理。
- npm 报告 `glob@10.5.0`、`whatwg-encoding@3.1.1` 间接依赖提示，等待上游测试工具链升级。
- npm `allow-scripts` 提示 esbuild postinstall 尚未显式审批；当前干净安装、构建和测试均通过。

## 兼容性影响

- 首次服务启动会在 `WORKBENCH_DATA_DIR`（开发默认 `.local`）创建目录和 `data/workbench.sqlite`。
- 正式环境未显式配置时使用 `%LOCALAPPDATA%\PersonalWorkbenchVNext`。
- 已应用 migration 文件不可修改；后续 schema 变化只能新增编号 migration。
- vNext 已可创建本地业务数据，但仍未导入旧数据；两个旧项目继续独立运行。

## 旧项目状态

- Personal-Workbench 被修改：否
- Personl-Workbench-qoder 被修改：否

## 退出条件

- 阶段 3 实现与自动验收已通过；npm ci 重现、旧项目只读和敏感/运行时文件复核均通过。
