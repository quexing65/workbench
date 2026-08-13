# vNext 实施状态

## 当前阶段

- 阶段：7
- 状态：完成
- 最后更新：2026-08-13

## 阶段状态

| 阶段 | 内容               | 状态   | 验收提交                                                 |
| ---: | ------------------ | ------ | -------------------------------------------------------- |
|    0 | 决策基线           | 完成   | `dff2c62` `chore: establish vNext execution baseline`    |
|    1 | Monorepo 骨架      | 完成   | `c8b29f7` `feat: establish runnable monorepo foundation` |
|    2 | SQLite/migration   | 完成   | `68bf3ff` `feat: add SQLite migration foundation`        |
|    3 | 任务/固定任务/小记 | 完成   | `4b21ad2` `feat: add core workbench workflows`           |
|    4 | 产品壳/总览/回顾   | 完成   | `bed3329` `feat: complete overview and review`           |
|    5 | B站学习模型        | 完成   | `71f6ae6` `feat: add Bilibili learning workflows`        |
|    6 | 凭据/CDP/同步      | 完成   | `564e344` `feat: secure Bilibili credential sync`        |
|    7 | 旧数据导入         | 完成   | 本阶段提交，主题 `feat: add auditable legacy imports`    |
|    8 | 备份/恢复/切换     | 未开始 |                                                          |

## 本阶段变更

- 新增 shared 导入 contract、Personal v1/v2/v3 严格解析器和 qoder SQLite 只读检查器；qoder 只查询 allowlist table/column，并检查 magic、大小、页数、行数、integrity、foreign keys、时区、分P与字段边界。
- 新增 preflight/apply 两阶段服务与 API：流式 multipart 50MB 上限、随机隔离目录、源 SHA-256、15 分钟 confirmation token、计划摘要、目标基线与 tombstone 目标哈希绑定。
- apply 前自动生成并验证 pre-import SQLite 快照；随后以 `BEGIN IMMEDIATE` 单事务写入，故障注入覆盖所有阶段，任一失败不留下部分业务写入。
- 新增 `source_contributions`，扩展 deletion marker 组合身份，并实现来源映射、幂等、三方合并、显式 tombstone、多来源同 BVID、固定任务永久 tombstone 与默认保留本地的冲突策略。
- qoder 缺行只报告 `missing_from_source`；SESSDATA 只返回 `detected=true, migrated=false`，不读取、物化、输出或保存其值。
- Personal/qoder CLI 复用同一 service；dry-run 与保存的 run/token apply 均不接受任意目标路径。成功、失败、过期和重启会清理计划与临时源。
- 数据页新增来源/时区/文件选择、预检计数、warning/conflict/fatal/credential 展示和显式确认后 apply；新增桌面与 360px 移动 E2E/axe 覆盖。
- 新增导入边界、解析、服务、API、生命周期、对账抽样和 shared/Web 测试；导入子系统独立覆盖率阈值固定为 lines/functions/statements ≥95%、branches ≥90%。

新增文件集中在 `apps/server/src/modules/imports/**`、`apps/server/tests/import-*.test.ts`、`packages/shared/src/contracts/imports*`、`apps/web/src/pages/data` 相关 API/CSS/测试、`tests/e2e/import-workflow.spec.ts` 和 migration `0002`；修改 app/router/guard、workspace scripts、Data page 接线、E2E 和受控文档；删除文件：无。

## 验证结果

| 命令/检查               | 结果 | 测试数/备注                                                                                       |
| ----------------------- | ---- | ------------------------------------------------------------------------------------------------- |
| `npm run format:check`  | 通过 | 全部文件符合 Prettier                                                                             |
| `npm run lint`          | 通过 | ESLint 0 error、0 warning                                                                         |
| `npm run typecheck`     | 通过 | Server/Web/Shared strict 类型检查通过                                                             |
| `npm ci`                | 通过 | 从唯一根 lockfile 干净安装 479 packages                                                           |
| `npm run test:coverage` | 通过 | 45 files、268 tests（Server 176、Web 37、Shared 55），0 failed、0 skipped                         |
| 全局覆盖率              | 通过 | Server 97.06/87.74/97.35；Web 96.33/91.10/88.68；Shared 100/98.52/100（lines/branches/functions） |
| 导入子系统独立覆盖率    | 通过 | 97.56/90.04/98.29（lines/branches/functions）；路径级 95/90 阈值已启用                            |
| `npm run build`         | 通过 | Data chunk 6.40 KiB；最大 JS chunk 224.63 KiB；首屏 JS gzip 117.84 KiB；预算通过                  |
| `npm run test:e2e`      | 通过 | 9 Chromium tests；导入预检/确认、刷新持久化、360px、键盘和 axe 通过                               |
| `npm run check:all`     | 通过 | format、lint、typecheck、268 tests、build、9 Chromium E2E 全部通过                                |
| 解析/安全 fixture       | 通过 | Personal v1/v2/v3、wrapper/裸 data、坏/超限/重复；qoder 新旧列、坏 DB/pages/schema/timezone/状态  |
| 对账/回滚               | 通过 | 重复导入全 unchanged；冲突保留本地；两来源 BVID；tombstone；所有故障点原子回滚                    |
| 抽样核对                | 通过 | 10 tasks、10 notes、固定任务边界、全部多P、完成/取消/重置样本                                     |
| CLI 跨进程合成演练      | 通过 | preflight/apply 成功，源 hash 不变，task added=1，输出不含 token                                  |
| 只读旧项目              | 通过 | Personal HEAD/status 不变；双项目 20/20 manifest；qoder DB hash/bytes 不变                        |
| 秘密与清理              | 通过 | 仅测试 fixture 含 sentinel；无真实 Cookie/B站请求；E2E 结束后无项目 Node 残留                     |

## 数据迁移

- 新增 migration：`0002-source-contributions.sql`
- migration SHA-256：`53b63690deffce1fed6a4276bd5690e4d28efc13db59aaf6f72a02575f192965`
- `0001` SHA-256：`103858fe38bbdfdc4ed2af86fa5894b71b0203aa2ab756ded9c859eabbfd08ac`（未修改）
- schema version：2
- 真实数据导入：无；阶段 7 只使用合成/脱敏 fixture，真实 Personal 与脱敏 qoder snapshot 演练属于阶段 8。

## 未完成项

- 下一阶段：阶段 8 一致 `.pwbk`、manifest/hash/integrity、停服恢复与自动回退、性能 fixture/查询计划、运维和迁移指南、真实/脱敏数据演练及最终切换。
- 用户确认核心工作流、3–7 天并行使用和旧项目保留至少 30 天需要阶段 8 的真实运行窗口，不能由自动测试代替。

## 已知风险

- qoder 不含 Git 元数据，只能依靠 20 项关键文件 manifest 和数据库 hash 证明未修改。
- Personal 基线原本不是完全干净，已有未跟踪执行规范；验收以 HEAD/status 和清单哈希前后相同为准。
- 导入规则覆盖已知 Personal v1/v2/v3 与 qoder schema；未知版本/列缺失会 fail closed，不会猜测迁移。
- b23 短链离线导入只进入 unresolved；阶段 7 不因导入而访问网络。
- npm 报告的间接依赖/allow-scripts 提示及 Chromium 字体截图基线风险延续；自动门禁当前通过。
- 真实旧数据可能揭示 fixture 未包含的格式异常；必须先 preflight、审阅报告和快照，再由用户确认 apply。

## 兼容性影响

- 首次启动在 schema 1 数据库上自动应用不可变 migration `0002`；旧 migration 不修改，checksum 不一致仍拒绝启动。
- 新增 `/api/v1/data/imports/preflight`、`/:id/apply`、`/:id/report` 与根 CLI scripts；既有业务 API 不变。
- import source、plan/token 和 pre-import snapshot 位于运行时数据目录；普通业务 SQLite 仍是唯一业务事实源，凭据继续独立且不迁移。
- qoder 本地时间必须显式确认来源时区；API/DB 时间仍规范化为 UTC epoch milliseconds。
- 两个旧项目不是 workspace、链接或运行时依赖，阶段 7 没有写入或移动旧来源。

## 旧项目状态

- Personal-Workbench 被修改：否（HEAD `3f2ebf38a1609625dee62163b9af0f0f6128d81e`；status 仍仅原有未跟踪文档）
- Personl-Workbench-qoder 被修改：否（20/20 manifest；DB 94,208 bytes，SHA-256 `ae8e79700fe53bec0557720c1c00d68e5b60795694495202364d49dad4517b7e`）

## 退出条件

- 阶段 7 实现与自动验收已通过：fatal 不可 apply、单事务无部分写、计数/最终库对账、幂等、冲突、源 hash、凭据布尔策略、integrity/foreign-key、抽样、覆盖率和 E2E 均达标。
- 完整干净安装、覆盖率和 `npm run check:all` 均已通过；阶段 7 满足全部退出条件。
