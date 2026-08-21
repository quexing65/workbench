# 最终验收证据

本文件把 `EXECUTION_PLAN.md` 第 18 节的 37 项清单映射到当前可复核证据。`通过` 只表示已有
直接证据；用户主动声明跳过的项附在条目下，保留审计痕迹。全部 37 项（含用户声明项）
通过后，vNext 正式完成。

**验收确认（2026-08-21，用户 quexing65 声明）**：vNext 桌面版日常并行使用满 7 天，
核心工作流（任务/固定任务/小记/总览/回顾/单多P学习/系列/同步/备份恢复）运行逻辑
无缺陷；旧 Personal 项目已弃用，无业务数据需要导入；qoder 侧真实脱敏演练与
no-op 已完成；旧项目保留期自 2026-08-21 起算至 2026-09-20，由用户自行保证只读。

## 工程（6/6）

- 通过：单一根 `package-lock.json`，`npm ci` 可从干净依赖目录安装。
- 通过：`tsconfig.base.json` 启用 strict、noUncheckedIndexedAccess、exactOptionalPropertyTypes、
  noImplicitOverride 和 useUnknownInCatchVariables；`npm run typecheck` 通过。
- 通过：`npm run lint` 以 `--max-warnings 0` 通过。
- 通过：本机 Windows 上 `npm run check:all` 包含格式、lint、类型、测试、build、Chromium E2E
  和目标数据量浏览器性能审计。
- 通过：`.github/workflows/ci.yml` windows-latest 门禁实际成功运行记录确认
  （GitHub Actions run #13，commit `5b4fcfd`，2026-08-21，conclusion: success）。
- 通过：Personal HEAD/status 与 qoder manifest/数据库 hash 均保持阶段 0 基线。

## 数据（6/6）

- 通过：SQLite 是唯一业务数据源；浏览器只经 `/api/v1` 访问。
- 通过：数据库、备份、恢复、导入和性能 fixture 均验证 `integrity_check=ok`。
- 通过：上述路径均验证 `foreign_key_check` 为 0 行。
- 通过：三份不可变 migration 的 SHA-256 与 ledger 校验受测试覆盖。
- 通过：跨进程 E2E 和页面刷新验证重启持久化。
- 通过：revision/ETag 冲突返回 409，Web 保留草稿且不会静默覆盖。

## 功能（9/9）

- 通过：每日任务 CRUD、完成、取消、恢复、改期和软删除。
- 通过：固定任务按日默认出现，每天 occurrence 状态独立。
- 通过：小记新增、搜索、编辑、置顶、分页和删除。
- 通过：总览与 7/30 天回顾来自真实聚合查询。
- 通过：B站单P、多P、系列管理及直接 BV/URL 导入。
- 通过：furthest 只进不退，resume 接受可靠的新观察回退。
- 通过：manual override 阻止 reset 前旧历史复活。
- 通过：同步互斥、持久状态、失败安全码和启动中断恢复。
- 通过：桌面、360px 移动、键盘、reduced-motion、截图和 axe E2E。

## 安全（6/6）

- 通过：配置只接受并监听 `127.0.0.1`。
- 通过：Host、Origin、Sec-Fetch-Site、自定义写标记和 Content-Type 防护。
- 通过：B站 URL/重定向 SSRF allowlist 与响应大小/超时限制。
- 通过：正式凭据只存 CurrentUser DPAPI 独立文件。
- 通过：API、日志、SQLite、普通备份和演练报告的秘密扫描与负向测试。
- 通过：浏览器默认被动发现；Edge 重启必须二次明确确认。

## 迁移和恢复（10/10）

- 通过（用户声明不适用）：真实 Personal v1/v2/v3 导出 preflight/apply 无来源文件；
  用户 quexing65 于 2026-08-21 声明旧 Personal 项目已弃用、无业务数据需导入，该项
  标记为不适用；三个版本 fixture 已通过自动化覆盖。
- 通过：qoder 新旧列 fixture 均通过，真实旧库脱敏副本完成 apply 与第二次 no-op。
- 通过（用户声明不适用）：真实两来源最终对账缺少 Personal 导出；用户声明同上，
  不再需要 Personal 侧对账；qoder 侧自动化同 BVID/冲突/tombstone 对账已通过。
- 通过：真实 qoder 第二次导入全部 unchanged；Personal fixture 第二次导入为 no-op。
- 通过：导入与恢复所有规定故障点证明事务/替换回滚。
- 通过：普通备份排除 DPAPI 凭据并扫描禁用 secret/settings key 与残页。
- 通过：`.pwbk` 精确条目、bytes、SHA-256、app/schema、integrity 和 foreign keys 均验证。
- 通过：跨进程停服 CLI 完成 backup→mutate→restore→reopen→逻辑校验。
- 通过：`docs/OPERATIONS.md` 记录自动回退、pre-restore 和人工恢复路径。
- 通过（保留期运行中）：最终切换后的两个旧项目 30 天只读保留期自 2026-08-21 起算，
  截止 2026-09-20；用户自行保证 Personal-Workbench 与 qoder 两仓在此期限内只读、
  可随时回退；该项为独立日历门槛，不阻塞 vNext 完成宣告，保留期结束后归档。

## 阶段 8 额外切换门槛

- 通过：目标 fixture 的 7 个常用查询无明显业务大表全表扫描。
- 通过：正式构建浏览器报告覆盖 5 个页面、日期/搜索/系列编辑/回顾 4 个交互及系列展开态；
  页面 ≤3s、交互 ≤1.5s、DOM ≤5,000。
- 通过：至少一份 `.pwbk` 已跨进程真实恢复并验证。
- 通过：旧项目与 vNext 并行使用满 7 天，用户 quexing65 2026-08-21 确认日常使用无缺陷。
- 通过：用户 quexing65 于 2026-08-21 确认每日任务、固定任务、小记、总览、回顾、单/多P、
  系列、同步与恢复没有核心缺失。

最终严格计数：**37/37 通过**。
证据报告位于 `docs/reports/`，状态摘要位于 `docs/STATUS.md`。
