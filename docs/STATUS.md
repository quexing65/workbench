# vNext 实施状态

## 当前阶段

- 阶段：2
- 状态：完成
- 最后更新：2026-08-13

## 阶段状态

| 阶段 | 内容               | 状态   | 验收提交                                                 |
| ---: | ------------------ | ------ | -------------------------------------------------------- |
|    0 | 决策基线           | 完成   | `dff2c62` `chore: establish vNext execution baseline`    |
|    1 | Monorepo 骨架      | 完成   | `c8b29f7` `feat: establish runnable monorepo foundation` |
|    2 | SQLite/migration   | 完成   | 本阶段提交，主题 `feat: add SQLite migration foundation` |
|    3 | 任务/固定任务/小记 | 未开始 |                                                          |
|    4 | 产品壳/总览/回顾   | 未开始 |                                                          |
|    5 | B站学习模型        | 未开始 |                                                          |
|    6 | 凭据/CDP/同步      | 未开始 |                                                          |
|    7 | 旧数据导入         | 未开始 |                                                          |
|    8 | 备份/恢复/切换     | 未开始 |                                                          |

## 本阶段变更

- 实现开发/正式数据目录解析及 `data`、`credentials`、`backups`、`logs`、`tmp/imports` 目录创建。
- 使用 Node 24 内置 `node:sqlite`，启用并验证 foreign keys、WAL、NORMAL synchronous、5s busy timeout 和 memory temp store。
- 实现不可变编号 migration、SHA-256 账本校验、事务应用、失败回滚、重复启动幂等和 `db:migrate` CLI。
- 落地 `0001-initial.sql`：18 个 STRICT 表、8 个业务索引及完整初始数据约束。
- 实现同步 repository transaction helper、严格业务日期、UTC epoch ms/ISO 转换。
- health 接入真实数据库状态与 schema version；服务启动迁移，SIGINT/SIGTERM 显式关闭数据库。
- 正式 build 将 migration SQL 复制到 server dist，开发、测试和正式运行使用同一 runner。

## 验证结果

| 命令/检查               | 结果 | 测试数/备注                                                                                    |
| ----------------------- | ---- | ---------------------------------------------------------------------------------------------- |
| `npm run format:check`  | 通过 | 全部文件符合 Prettier                                                                          |
| `npm run lint`          | 通过 | ESLint 0 error、0 warning                                                                      |
| `npm run typecheck`     | 通过 | Server/Web/Shared 严格类型检查通过                                                             |
| `npm run test`          | 通过 | 11 files、45 tests（Server 19、Web 10、Shared 16）                                             |
| `npm run test:coverage` | 通过 | Server 83.74/76.06/90.69/83.74%；DB 89.06% lines；Web 88.88% lines；Shared 92.30% lines        |
| `npm run build`         | 通过 | migration SQL 进入 dist；初始 JS 325.53 KB raw / 98.89 KB gzip                                 |
| `npm run check:all`     | 通过 | format、lint、typecheck、test、build、2 Chromium E2E 全部通过                                  |
| 空库/重复 migration     | 通过 | 首次 applied=`0001-initial`；第二次 applied=[]；schemaVersion=1                                |
| checksum/失败回滚       | 通过 | 修改已应用 SQL 被拒绝；失败的 `0002` 不留表或账本行                                            |
| PRAGMA/持久化           | 通过 | foreign_keys=1、journal_mode=wal、synchronous=1、busy_timeout=5000、temp_store=2；重启数据保留 |
| 完整性/句柄             | 通过 | integrity_check=ok、foreign_key_check=0；关闭后临时目录可完整删除                              |
| 正式 health             | 通过 | `database=ok`、`schemaVersion=1`，服务停止后临时数据库可清理                                   |

## 数据迁移

- 新增 migration：`0001-initial.sql`
- migration SHA-256：`103858fe38bbdfdc4ed2af86fa5894b71b0203aa2ab756ded9c859eabbfd08ac`
- schema version：1
- 真实数据导入：无

## 未完成项

- 下一阶段：阶段 3 每日任务、固定任务和小记；本阶段未提前实现业务 API 或业务页面。

## 已知风险

- qoder 不含 Git 元数据，只能依靠关键文件 hash 证明未修改。
- Personal 基线原本不是完全干净，已有未跟踪执行规范；验收以“前后状态相同”为准。
- npm 安装报告的 `glob@10.5.0` 间接依赖提示继续由上游工具链升级处理。
- 全局覆盖率阈值从阶段 3 起强制；阶段 2 database/migration 路径已有真实临时 SQLite 覆盖。

## 兼容性影响

- 首次服务启动会在 `WORKBENCH_DATA_DIR`（开发默认 `.local`）创建目录和 `data/workbench.sqlite`。
- 正式环境未显式配置时使用 `%LOCALAPPDATA%\PersonalWorkbenchVNext`。
- 已应用 migration 文件不可修改；后续 schema 变化只能新增编号 migration。
- 阶段 2 尚无真实业务数据或旧数据导入，不影响两个旧项目继续运行。

## 旧项目状态

- Personal-Workbench 被修改：否
- Personl-Workbench-qoder 被修改：否

## 退出条件

- 阶段 2 实现及验收均已通过；npm ci 重现、旧项目只读和敏感/运行时文件复核均通过。
