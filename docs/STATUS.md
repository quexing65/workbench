# vNext 实施状态

## 当前阶段

- 阶段：8
- 状态：进行中（工程实现与自动验收完成，真实切换门槛未全部满足）
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
|    7 | 旧数据导入         | 完成   | `d637eeb` `feat: add auditable legacy imports`           |
|    8 | 备份/恢复/切换     | 进行中 | `de6005e`；性能补强 `83db8c5`                            |

## 桌面分发（2026-08-21，阶段 8 附加交付）

- 新增 `apps/desktop` Electron 桌面壳（ADR 0007）：主进程内嵌正式 Express 服务，
  esbuild 单文件打包，单实例窗口，启动失败原生对话框反馈；migrations/DPAPI/web dist
  资源路径显式注入，`dpapi.ps1` asarUnpack 释放以支持外部 powershell 读取。
- 发版机制：`npm run desktop:dist` 按 `release/v<version>/` 归档 NSIS 安装版与便携版，
  自动生成 `SHA256SUMS.txt`；`docs/RELEASES.md` 台账入库，安装包二进制不入库，
  分发走 GitHub Releases。
- v0.1.0 已发布（tag `v0.1.0`，commit `2177c3d`）；开发数据已完整迁移到正式数据目录
  `%LOCALAPPDATA%\PersonalWorkbenchVNext`（备份→停服恢复→凭据复制→桌面验证）。
- 仓库已配置 remote `github.com/quexing65/workbench` 并推送 main 与 tag。

## 本阶段变更

- 新增最终 `.pwbk`：`VACUUM INTO` 一致快照，受控 ZIP 只允许 manifest/SQLite；校验 app、format、schema、bytes、SHA-256、integrity、foreign keys，并扫描禁用 credential/settings key 与已删除秘密残页。
- 新增 `POST /api/v1/data/backups`、浏览器下载 UI 与 E2E；并发创建受互斥保护，传输完成/失败后清理临时包，不向页面暴露服务端路径。
- 新增停服 `data:restore` CLI、数据目录排他锁、staging migration、pre-restore 快照、WAL checkpoint、同卷数据库集合替换、重开健康检查和失败自动回退；拒绝额外/重复/大小写变体/遍历/加密/symlink/zip bomb/超限包。
- 新增 migration `0003-performance-indexes.sql`，覆盖按日/逾期任务、笔记分页/最近笔记、学习库、继续学习和学习活动范围；活动查询改为 Asia/Shanghai 日界对应的 epoch range。
- 新增可重复性能审计：10,000 tasks、10,000 notes、1,000 videos，7 个常用查询均保存 `EXPLAIN QUERY PLAN`，未发现明显业务大表全表扫描；报告位于 `docs/reports/performance-audit.json`。
- 新增正式构建浏览器性能审计：同一隔离 fixture 增加 10 个系列，覆盖总览、任务、小记、学习、
  回顾、4 个常用交互和系列编辑展开态；首次实测发现总览/学习分别约 29,851/23,997 DOM，修复为 20 项逐步展示和
  系列按需编辑后降至 272/687，所有页面、交互和 DOM 预算通过。报告位于
  `docs/reports/browser-performance-audit.json`。
- 新增 qoder 脱敏快照 CLI：只复制 allowlist 业务列，settings 只读取允许的 `bili_browser`，不 SELECT SESSDATA 值；真实旧 qoder 在临时目录完成两次隔离导入并清理。
- 新增 `docs/OPERATIONS.md`、`docs/MIGRATION_GUIDE.md` 和不含标题/正文/凭据的 qoder/restore 演练报告。

新增文件集中在 `apps/server/src/modules/backups/**`、`apps/server/src/performance/**`、qoder sanitizer、
backup/performance/restore tests、shared backup contract、Web backup API/UI、migration `0003`、运维/迁移文档
与 `docs/reports/**`；修改 app/startup data lock、洞察查询、workspace scripts、Data page、E2E、
大列表首屏渲染、系列按需编辑和基线文档；
删除文件：无。

## 验证结果

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

本机 Windows 结果不能替代远程 CI；当前仓库未配置 Git remote，因此 `.github/workflows/ci.yml` 尚无
可核对的 GitHub Actions 成功运行记录。

## 数据迁移

- 新增 migration：`0003-performance-indexes.sql`
- migration SHA-256：`1d29efde9ad5d9a65f9312a8fce751edcb6b832961d1a77b0e8a79a754fbb74e`
- `0001` SHA-256：`103858fe38bbdfdc4ed2af86fa5894b71b0203aa2ab756ded9c859eabbfd08ac`（未修改）
- `0002` SHA-256：`53b63690deffce1fed6a4276bd5690e4d28efc13db59aaf6f72a02575f192965`（未修改）
- schema version：3
- 真实数据导入：仅在系统临时目录完成脱敏 qoder 演练，未写入正式 vNext 数据目录；临时文件已删除。
- 真实 Personal 导入：未执行；旧 Personal 仓库没有业务导出文件，需用户从旧页面导出后演练。

## 未完成项

- 确认远程 GitHub Actions（windows-latest）在推送后实际成功运行并保留记录。
- 用户提供真实 Personal v1/v2/v3 业务导出后，按 `docs/MIGRATION_GUIDE.md` 完成 preflight、apply、重复 no-op、抽样和报告保存。
- 并行使用旧项目与 vNext 3–7 天，记录并处理真实工作流差异。
- 用户确认每日任务、固定任务、小记、总览、回顾、单/多P学习、系列、同步和备份恢复没有核心缺失。
- 最终切换后继续保留两个旧项目至少 30 天；该日历门槛当前尚未满足。

## 已知风险

- qoder 不含 Git 元数据，只能依靠 20 项关键文件 manifest 和数据库 hash 证明未修改。
- Personal 基线原本不是完全干净，已有未跟踪执行规范；验收以前后 HEAD/status 相同为准。
- `.pwbk` 排除登录凭据但包含个人业务数据，格式本身不加密，必须存放在受信任位置。
- 恢复依赖应用级 lock file 和同卷 rename；异常断电仍应优先用已验证的 pre-restore `.pwbk` 回退。
- 性能数据来自本机合成 fixture；虽然已覆盖 10 个系列和正式浏览器路径，真实长文本、更多分P或
  较慢磁盘仍需 3–7 天窗口观察。
- npm 的间接依赖弃用/allow-scripts 提示及 Chromium 字体截图基线风险延续；自动门禁当前通过。

## 兼容性影响

- 首次启动在 schema 2 数据库上自动应用只新增索引的不可变 migration `0003`；旧 migration 未修改，checksum 不一致仍拒绝启动。
- 新增 `/api/v1/data/backups`，不新增 HTTP restore；整库恢复仍只允许停服 CLI。
- server 启动和 restore 共用数据目录排他锁；同一数据目录重复启动会 fail closed。
- 普通备份不会替换或包含 DPAPI credential；恢复后凭据状态保持当前机器/用户的独立文件状态。
- qoder sanitize 仅是显式运维 CLI，不是运行时依赖；输出默认被 `.gitignore` 的 SQLite 规则排除。
- 两个旧项目不是 workspace、链接或运行时依赖，本阶段没有写入、移动或删除旧来源。
- 总览逾期任务和学习资源仍全部从 API 读取，但首屏只渲染 20 项并允许逐步展开；系列只在用户
  点“编辑系列”后渲染资源选择器，避免目标数据量下超大 DOM。

## 旧项目状态

- Personal-Workbench 被修改：否（HEAD `3f2ebf38a1609625dee62163b9af0f0f6128d81e`；status 仍仅原有未跟踪文档）
- Personl-Workbench-qoder 被修改：否（20/20 manifest；DB 94,208 bytes，SHA-256 `ae8e79700fe53bec0557720c1c00d68e5b60795694495202364d49dad4517b7e`）

## 退出条件

- 阶段 8 工程实现和可自动执行的验收已完成：备份/恢复、安全矩阵、真实性能 fixture、查询计划、
  正式浏览器性能、qoder 脱敏导入、跨进程恢复、文档、干净安装和覆盖率均通过。
- 阶段 8 尚未完成：远程 Windows CI、真实 Personal 导出、3–7 天并行使用、用户核心工作流确认
  和旧项目 30 天保留期不能由本机自动测试代替。上述条件全部满足前不得宣布 vNext 完成。
