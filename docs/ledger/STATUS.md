# vNext 实施状态

## 当前阶段

- 阶段：8（完成）；此后为常规迭代，当前版本 **v1.6.0**（2026-09-11 已发布：
  <https://github.com/quexing65/workbench/releases/tag/v1.6.0>）。
- 状态：已完成。工程实现、自动验收、远程 CI、桌面分发、并行使用与用户确认均通过；
  30 天旧项目保留期已由用户于 2026-08-21 主动声明取消，旧项目可自行处置。
- 最后更新：2026-09-11

## v1.4.0 之后的加固改动（2026-09-10，v1.5.0 已发布）

针对一次全仓复核发现的缺陷与文档漂移，完成以下改动；每条都有对应自动化测试：

| 改动          | 关键文件                                                                                                                | 说明                                                                                                                                            |
| ------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 业务时区贯通  | `packages/shared/src/domain/business-date.ts`、`learning/progress-repository.ts`、`insights/repository.ts`、`config.ts` | `APP_TIME_ZONE` 此前只出现在 `/health`，业务日硬编码 UTC+8；现按 IANA 时区计算日界，日界以 epoch 范围下推到 SQL，观看时长与学习活动归属随之生效 |
| 备份格式 v2   | `packages/shared/src/contracts/backups.ts`、`backups/snapshot.ts`、`backups/service.ts`、`backups/restore.ts`           | manifest 记录业务内容逻辑校验和；恢复在应用 migration 前比对，证明内容与备份时一致；v1 旧备份仍可恢复                                           |
| 迁移 CLI 加锁 | `apps/server/src/db/cli-migrate.ts`、`db/data-lock.ts`                                                                  | `npm run db:migrate` 与服务端/恢复共用数据目录排他锁                                                                                            |
| CSP           | `apps/server/src/http/security-headers.ts`                                                                              | 增加 `Content-Security-Policy`（`script-src 'self'`，禁用 `object-src`/`frame-ancestors`，样式允许内联）                                        |
| DPAPI 加固    | `apps/server/src/modules/credentials/dpapi-runner.ts`                                                                   | PowerShell 解释器固定为系统绝对路径；执行策略由 `Bypass` 收窄为 `RemoteSigned`；脚本缺失直接 fail closed                                        |
| 迁移顺序守卫  | `apps/server/src/db/migrate.ts`                                                                                         | 已应用集合必须是文件列表前缀，防止新增低位编号迁移在已升级库上乱序执行                                                                          |
| 恢复回退保真  | `apps/server/src/modules/backups/restore.ts`                                                                            | 回退链自身失败时抛聚合错误（`cause` 同时携带原始失败与回退失败），不再掩盖根因                                                                  |
| 锁自愈与属主  | `apps/server/src/db/data-lock.ts`                                                                                       | 损坏锁 30 秒宽限期后自动接管；`release()` 只在锁仍属于自己时删除                                                                                |
| 跨站请求防护  | `apps/server/src/http/origin-guard.ts`                                                                                  | `Sec-Fetch-Site` 改白名单并覆盖所有方法，跨站 GET 不再能触发副作用                                                                              |
| 健康接口收口  | `packages/shared/src/contracts/health.ts`、`health/route.ts`                                                            | 仅非 production 模式返回数据目录（E2E 隔离守卫仍可用），正式运行不暴露绝对路径                                                                  |
| 状态组件统一  | `apps/web/src/shared/ui/QueryState.tsx` 及 7 个页面                                                                     | 加载/失败状态收敛为一套 markup 与样式；顺带修复 axe 报出的 `/review` `definition-list` 违规                                                     |
| 前端去重      | `apps/web/src/shared/api/business-time.ts`、`shared/ui/ConfirmDialog.tsx` 及 6 个页面                                   | `today()` 跟随服务端时区、409 文案单点维护、`window.confirm` 换成可访问的应用内确认对话框                                                       |
| 视觉与无障碍  | `tests/e2e/00-empty-visual.spec.ts`、`visual-accessibility.spec.ts`                                                     | 新增 8 页空态像素基线（先于数据用例运行，确定性），axe 扫描从 2 页扩到 8 页                                                                     |
| 覆盖率硬门槛  | `vitest.config.ts`、`vitest.coverage-thresholds.ts`                                                                     | 为 migrate/credentials/learning-progress 恢复 per-path ≥95%/90% 阈值并验证生效                                                                  |
| 桌面壳测试    | `apps/desktop/tests/server-process.test.ts`                                                                             | 内嵌服务的启动、静态资源、锁释放与迁移/端口失败清理纳入自动化                                                                                   |

## 阶段状态

| 阶段 | 内容               | 状态 | 验收提交                                                                         |
| ---: | ------------------ | ---- | -------------------------------------------------------------------------------- |
|    0 | 决策基线           | 完成 | `dff2c62` `chore: establish vNext execution baseline`                            |
|    1 | Monorepo 骨架      | 完成 | `c8b29f7` `feat: establish runnable monorepo foundation`                         |
|    2 | SQLite/migration   | 完成 | `68b3ff` `feat: add SQLite migration foundation`                                 |
|    3 | 任务/固定任务/小记 | 完成 | `4b21ad2` `feat: add core workbench workflows`                                   |
|    4 | 产品壳/总览/回顾   | 完成 | `bed3329` `feat: complete overview and review`                                   |
|    5 | B站学习模型        | 完成 | `71f6ae6` `feat: add Bilibili learning workflows`                                |
|    6 | 凭据/CDP/同步      | 完成 | `564e344` `feat: secure Bilibili credential sync`                                |
|    7 | 旧数据导入         | 完成 | `d637eeb` `feat: add auditable legacy imports`                                   |
|    8 | 备份/恢复/切换     | 完成 | `de6005e` `83db8c5` 工程实现 + 本次验收文档提交集（含桌面发版、README、远程 CI） |

## 桌面分发与正式切换（2026-08-21）

- 新增 `apps/desktop` Electron 桌面壳（ADR 0007）：主进程内嵌正式 Express 服务，
  esbuild 单文件打包，单实例窗口，启动失败原生对话框反馈；migrations/DPAPI/web dist
  资源路径显式注入，`dpapi.ps1` asarUnpack 释放以支持外部 powershell 读取。
- 发版机制：`npm run desktop:dist` 按 `release/v<version>/` 归档 NSIS 安装版与便携版，
  自动生成 `SHA256SUMS.txt`；`docs/operations/RELEASES.md` 台账入库，安装包二进制不入库，
  分发走 GitHub Releases。
- v0.1.0 首版发布（tag `v0.1.0`，commit `2177c3d`）：验证了安装向导/便携版启动、
  开发数据迁移到正式目录、凭据复制与桌面验证链路。
- v1.0.0 正式切换（本次）：阶段 8 全部门槛满足，版本从 0.x 升级到 1.0.0。
- 仓库 remote `github.com/quexing65/workbench` 已配置并推送 main 与 tag。
- 用户 quexing65 于 2026-08-21 声明：并行使用满 7 天无缺陷，旧 Personal 已弃用不需要
  导入；旧项目保留期自 2026-08-21 起算，同日用户主动声明取消（见「退出条件」），
  旧项目可自行处置。

## 本阶段变更（阶段 8 至验收）

- 新增最终 `.pwbk`：`VACUUM INTO` 一致快照，受控 ZIP 只允许 manifest/SQLite；校验 app、format、schema、bytes、SHA-256、integrity、foreign keys，并扫描禁用 credential/settings key 与已删除秘密残页。
- 新增 `POST /api/v1/data/backups`、浏览器下载 UI 与 E2E；并发创建受互斥保护，传输完成/失败后清理临时包，不向页面暴露服务端路径。
- 新增停服 `data:restore` CLI、数据目录排他锁、staging migration、pre-restore 快照、WAL checkpoint、同卷数据库集合替换、重开健康检查和失败自动回退；拒绝额外/重复/大小写变体/遍历/加密/symlink/zip bomb/超限包。
- 新增 migration `0003-performance-indexes.sql`，覆盖按日/逾期任务、笔记分页/最近笔记、学习库、继续学习和学习活动范围；活动查询改为 Asia/Shanghai 日界对应的 epoch range。
- 新增可重复性能审计：10,000 tasks、10,000 notes、1,000 videos，7 个常用查询均保存 `EXPLAIN QUERY PLAN`，未发现明显业务大表全表扫描；报告位于 `docs/reports/performance-audit.json`。
- 新增正式构建浏览器性能审计：同一隔离 fixture 增加 10 个系列，覆盖总览、任务、小记、学习、
  回顾、4 个常用交互和系列编辑展开态；首屏大数据量渲染优化（20 项逐步展示、系列按需编辑）
  通过所有页面/交互/DOM 预算；报告位于 `docs/reports/browser-performance-audit.json`。
- 新增 qoder 脱敏快照 CLI：只复制 allowlist 业务列，settings 只读取允许的 `bili_browser`，不 SELECT SESSDATA 值；真实旧 qoder 在临时目录完成两次隔离导入并清理。
- 新增桌面分发：Electron 壳 ADR 0007、`apps/desktop` 项目、esbuild 构建链路、
  electron-builder NSIS/便携版配置与 `scripts/dist.mjs` 版本归档（SHA256SUMS.txt）；
  v0.1.0 安装包发布到 GitHub Releases。
- 新增用户向 README 与 B站 SESSDATA 获取教程；重写 docs/OPERATIONS/RELEASES/SECURITY/
  PROJECT_STRUCTURE/MIGRATION_GUIDE/FINAL_ACCEPTANCE 等台账文档。

新增文件集中在 `apps/server/src/modules/backups/**`、`apps/server/src/performance/**`、qoder sanitizer、
backup/performance/restore tests、shared backup contract、Web backup API/UI、migration `0003`、
`apps/desktop/**`、运维/迁移/验收文档与 `docs/reports/**`；修改 app/startup data lock、
洞察查询、workspace scripts、Data page、E2E、大列表首屏渲染、系列按需编辑、README 与基线文档；
删除文件：无。

## 验证结果（阶段 8 验收，2026-08-21，历史记录）

> 下表是 v1.0.0 上线时的验收快照，数字已不再代表当前代码。当前数字见下节。

| 命令/检查               | 结果 | 测试数/备注                                                                                       |
| ----------------------- | ---- | ------------------------------------------------------------------------------------------------- |
| `npm ci`                | 通过 | 从唯一根 lockfile 干净安装 485 packages                                                           |
| `npm run format:check`  | 通过 | 全部文件符合 Prettier                                                                             |
| `npm run lint`          | 通过 | ESLint 0 error、0 warning                                                                         |
| `npm run typecheck`     | 通过 | Server/Web/Shared strict 类型检查通过                                                             |
| `npm run test:coverage` | 通过 | 51 files、299 tests（Server 202、Web 40、Shared 57），0 failed、0 skipped                         |
| 全局覆盖率              | 通过 | Server 97.07/87.78/97.31；Web 96.24/89.90/88.98；Shared 100/98.52/100（lines/branches/functions） |
| 导入严格路径阈值        | 通过 | 配置阈值 lines/functions/statements ≥95%、branches ≥90%；qoder 98.72/94.84/100                    |
| 备份/恢复矩阵           | 通过 | exact entries、hash/integrity/FK、秘密残页、恶意 ZIP、5 故障点回退、锁竞争、跨进程 CLI            |
| `npm run build`         | 通过 | bundle 预算通过；生产 SPA/API 静态边界保持通过                                                    |
| `npm run test:e2e`      | 通过 | 10 Chromium tests；浏览器 `.pwbk` 下载/条目、导入、刷新、360px、键盘、reduced-motion 与 axe 通过  |
| `npm run check:all`     | 通过 | format/lint/typecheck、299 tests、build、10 E2E 和浏览器性能门禁一次完整运行通过                  |
| 查询性能审计            | 通过 | fixture build 约 0.37s；7 查询约 0.2–175ms；查询计划均使用索引或至多 1 行 CTE                     |
| 浏览器性能审计          | 通过 | 10k/10k/1k+10系列；最慢页面 672.50ms、交互 363.39ms，最大 DOM 2,201                               |
| 真实 qoder 脱敏演练     | 通过 | 1 series、2 videos、1 setting；第二次全部 unchanged；credentials false；integrity ok/FK 0         |
| 真实恢复演练            | 通过 | 跨进程 backup→mutate→stop→restore→reopen，逻辑 checksum 回归，pre-restore 保留，输出无绝对路径    |
| 只读旧项目              | 通过 | Personal HEAD/status 不变；qoder DB SHA-256 不变；无本项目残留 Node 进程                          |
| 远程 GitHub Actions CI  | 通过 | windows-latest workflow run #13，commit `5b4fcfd`，2026-08-21，conclusion: success                |
| 桌面安装版/便携版冒烟   | 通过 | v0.1.0 NSIS 向导与便携版均正常启动；正式数据目录 `%LOCALAPPDATA%` 读写正常；单实例、端口报错、    |
|                         |      | 卸载保留数据等特性均人工验证通过                                                                  |
| 用户真实并行使用        | 通过 | 桌面版日常使用满 7 天（用户 quexing65，2026-08-21 声明），核心工作流无缺陷                        |

## 当前验证结果（2026-09-10，v1.4.0 + 加固改动）

| 命令/检查               | 结果 | 测试数/备注                                                                                                                        |
| ----------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `npm run format:check`  | 通过 | 全部文件符合 Prettier                                                                                                              |
| `npm run lint`          | 通过 | ESLint 0 error、0 warning                                                                                                          |
| `npm run typecheck`     | 通过 | Desktop/Server/Web/Shared strict 类型检查通过                                                                                      |
| `npm run test:coverage` | 通过 | 49 files、278 tests（Desktop 4、Server 153、Web 55、Shared 66），0 failed、0 skipped                                               |
| 覆盖率门槛              | 通过 | 按包判定（lines/branches/functions）：Desktop 100/91.66/100；Server 96.67/86.47/97.39；Web 96.67/89.59/88.65；Shared 100/97.61/100 |
| 关键路径 per-path 阈值  | 通过 | migrate.ts、credentials/**、learning-progress.ts 均满足 lines/functions/statements ≥95%、branches ≥90%                             |
| `npm run build`         | 通过 | bundle 预算通过（最大 chunk 224.63 KiB、首屏 gzip 159.45 KiB）；生产 SPA/API 静态边界保持通过                                      |
| `npm run test:e2e`      | 通过 | 11 Chromium tests；新增 8 页空态像素基线，axe 扫描覆盖全部 8 页                                                                    |
| `npm run check:all`     | 通过 | format/lint/typecheck、278 tests、build、11 E2E 与浏览器性能门禁（5 页 0 失败）一次完整运行通过                                    |
| 备份/恢复矩阵           | 通过 | exact entries、hash/integrity/FK、逻辑校验和（v2）、v1 兼容恢复、恶意 ZIP、5 故障点回退、回退失败聚合报错                          |
| 迁移与锁                | 通过 | 跨进程验证：持锁时 `db:migrate` 拒绝执行、退出后释放；乱序迁移拒绝启动；损坏锁宽限期自愈                                           |
| 时区贯通                | 通过 | 同一 UTC 时刻在 `Asia/Shanghai` 与 `America/New_York` 归属不同业务日（写入与聚合两路）                                             |
| 跨站请求                | 通过 | 跨站 GET/POST 一律 403，`same-origin`/`none`/无头请求放行                                                                          |
| 桌面壳内嵌服务          | 通过 | 健康接口 + 注入的静态资源 + 数据目录锁释放；迁移失败与端口占用均清理锁与数据库                                                     |

> 说明：`npm run check:all` 含 E2E 与浏览器性能审计，耗时较长；上表为本次加固改动的实测结果。

## 数据迁移

- 现行 migration 序列：`0001-initial.sql`、`0002-source-contributions.sql`、
  `0003-performance-indexes.sql`、`0004-watched-seconds.sql`、`0005-task-expired-status.sql`
- `0001` SHA-256：`103858fe38bbdfdc4ed2af86fa5894b71b0203aa2ab756ded9c859eabbfd08ac`（未修改）
- `0002` SHA-256：`53b63690deffce1fed6a4276bd5690e4d28efc13db59aaf6f72a02575f192965`（未修改）
- `0003` SHA-256：`1d29efde9ad5d9a65f9312a8fce751edcb6b832961d1a77b0e8a79a754fbb74e`
- schema version：5（0004 增加 `watched_seconds`/`last_seconds` 与 `learning_watch_daily`；
  0005 把 `tasks.status` 的 `expired` 正式纳入 CHECK 并重建相关索引）
- 真实数据导入：qoder 脱敏副本已在临时目录完成两次导入；Personal 真实导出用户声明已弃用
  不导入，fixture 覆盖已通过；均未写入正式 vNext 数据目录，临时文件已清理。
- 开发 → 正式数据目录迁移：`.local` 备份 → 停服 production restore → 凭据复制 → 桌面验证
  链路在 v0.1.0 发布前完成一次完整演练，结果通过。

## 未完成项

- 阶段 8 全部完成；v1.0.0 于 2026-08-21 上线，此后迭代至 v1.6.0（2026-09-11 发布）。
- v1.5.0 已按 `docs/operations/OPERATIONS.md`「桌面应用发布」完成：main CI 全绿（run
  `34381406550`）→ tag `v1.5.0` 打在 `bff2ba9` → Release 流水线 `34381954138` 构建
  NSIS/便携版 → 草稿审阅后正式发布 → 已在 `docs/operations/RELEASES.md` 登记校验和。
- v1.5.1 为迁移校验和行尾符修复的补丁版，同样按「桌面应用发布」流程完成：main CI 全绿
  （run `34434240730`）→ tag `v1.5.1` 打在 `53d5c1e` → Release 流水线 `34434563558` 构建
  NSIS/便携版 → 草稿审阅并补写变更说明后正式发布 → 已登记校验和。发布前解包核对过 CI
  产物：`package.json` 为 1.5.1、五个迁移文件均为 LF、`main.js` 含规范化行尾的校验和逻辑。
- v1.5.2 为业务日期边界、学习模块与 Web 交互九处缺陷修复的补丁版，同样按「桌面应用
  发布」流程完成：main CI 全绿（run `34456556670`）→ tag `v1.5.2` 打在 `ac5c7e2` →
  Release 流水线 `34457121620` 构建 NSIS/便携版并生成草稿 → 草稿补写变更摘要与校验和
  表后正式发布 → 已在 `docs/operations/RELEASES.md` 登记校验和。
- v1.6.0 为学习页接入浏览器一键读取 B站登录态的功能版，同样按「桌面应用发布」流程
  完成：main CI 全绿（run `34511094648`）→ tag `v1.6.0` 打在 `bda78f4` → Release 流水线
  `34511803366` 构建 NSIS/便携版并生成草稿 → 草稿补写变更摘要与校验和表后正式发布 →
  已在 `docs/operations/RELEASES.md` 登记校验和。
- 旧项目（Personal-Workbench / Personl-Workbench-qoder）由用户 quexing65 主动声明
  取消 30 天保留期，可由用户自行处置。

## 已知风险

- qoder 不含 Git 元数据，只能依靠 20 项关键文件 manifest 和数据库 hash 证明未修改。
- Personal 基线原本不是完全干净，已有未跟踪执行规范；验收以前后 HEAD/status 相同为准。
- `.pwbk` 排除登录凭据但包含个人业务数据，格式本身不加密，必须存放在受信任位置。
- 恢复依赖应用级 lock file 和同卷 rename；异常断电仍应优先用已验证的 pre-restore `.pwbk` 回退。
- 备份格式 v2 的 manifest 含 `logicalChecksumSha256`；v1 旧备份可恢复但没有内容一致性校验，
  且旧版本程序无法读取 v2 备份（`backupFormat` 不匹配会拒绝）。
- DPAPI 依赖系统执行策略：以 `RemoteSigned` 调用固定脚本，若机器通过组策略强制
  `Restricted`，凭据功能不可用（与之前 `Bypass` 的受限面相同）。
- `apps/desktop` 的内嵌服务装配已有自动化测试；Electron 主进程（窗口、外链拦截、
  单实例锁）仍依赖人工冒烟。
- 健康检查在非 production 模式仍返回数据目录（开发与 E2E 隔离守卫依赖它）；正式运行不返回。
- 损坏的 `.workbench.lock` 在 30 秒宽限期后会被接管：若确实有进程在启动瞬间写入失败，可能被
  误判为陈旧，但该窗口极短且锁文件不含业务数据。
- 性能数据来自本机合成 fixture；虽然已覆盖 10 个系列和正式浏览器路径，真实长文本、更多分P或
  较慢磁盘仍应持续观察。
- npm 的间接依赖弃用/allow-scripts 提示及 Chromium 字体截图基线风险延续；自动门禁当前通过。
- 回退路径：任何时候发现回归，用已验证的 pre-restore `.pwbk` 备份执行 `npm run data:restore` 即可整库回退。

## 兼容性影响

- 首次启动在 schema 2 数据库上自动应用只新增索引的不可变 migration `0003`；旧 migration 未修改，checksum 不一致仍拒绝启动。
- 新增 `/api/v1/data/backups`，不新增 HTTP restore；整库恢复仍只允许停服 CLI。
- server 启动、restore 与 `npm run db:migrate` 共用数据目录排他锁；同一数据目录重复启动会 fail closed。
- 备份格式由 v1 升到 v2：新备份带逻辑校验和；恢复 v2 时在迁移前比对，v1 备份跳过该比对。
  旧版本程序读取 v2 备份会因 `backupFormat` 不受支持而拒绝。
- `APP_TIME_ZONE` 现在真正决定业务日归属（观看时长聚合与学习活动统计）；默认值仍为
  `Asia/Shanghai`，默认配置下行为与之前一致。
- 所有响应新增 `Content-Security-Policy`；`script-src 'self'` 不加载任何外部脚本，生产构建
  产物全部同源，无需调整部署。
- `Sec-Fetch-Site` 收紧为白名单且覆盖所有方法：跨站页面发起的 GET 现在也会被 403 拒绝；
  浏览器扩展、命令行与探活请求不带该头，行为不变。
- `/api/v1/health` 的 `dataDirectory` 变为可选字段，仅非 production 模式返回。
- 迁移新增「已应用集合必须是文件列表前缀」校验：若曾跳过某个编号后补写，启动会被拒绝，
  需要先对齐迁移序列。
- 普通备份不会替换或包含 DPAPI credential；恢复后凭据状态保持当前机器/用户的独立文件状态。
- qoder sanitize 仅是显式运维 CLI，不是运行时依赖；输出默认被 `.gitignore` 的 SQLite 规则排除。
- 两个旧项目不是 workspace、链接或运行时依赖；保留期已由用户于 2026-08-21 取消，
  旧来源可由用户自行处置。
- 总览逾期任务和学习资源仍全部从 API 读取，但首屏只渲染 20 项并允许逐步展开；系列只在用户
  点"编辑系列"后渲染资源选择器，避免目标数据量下超大 DOM。

## 旧项目状态

- Personal-Workbench 被修改：否（HEAD `3f2ebf38a1609625dee62163b9af0f0f6128d81e`；status 仍仅原有未跟踪文档）
- Personl-Workbench-qoder 被修改：否（20/20 manifest；DB 94,208 bytes，SHA-256 `ae8e79700fe53bec0557720c1c00d68e5b60795694495202364d49dad4517b7e`）
- 保留期：原定至 2026-09-20，用户已于 2026-08-21 主动声明取消，旧项目可立即自行处置

## 退出条件

- 阶段 8 工程实现和可自动执行的验收全部通过：备份/恢复、安全矩阵、真实性能 fixture、查询计划、
  正式浏览器性能、qoder 脱敏导入、跨进程恢复、文档、干净安装、覆盖率、远程 CI、桌面分发、
  安装版/便携版冒烟测试均通过。
- 阶段 8 使用/用户门槛全部通过：并行使用满 7 天（用户 2026-08-21 确认无缺陷）、用户确认核心
  工作流无缺失、Personal 导入项按用户声明标记不适用。
- 独立日历门槛：用户 quexing65 于 2026-08-21 主动声明取消 30 天旧项目只读保留期，
  立即生效；vNext v1.0.0 当日正式上线。
- 满足上述条件，vNext 宣布正式完成，版本号由 0.x 升为 1.0.0。
