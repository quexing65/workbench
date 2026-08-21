# 最终验收证据

本文件把 `EXECUTION_PLAN.md` 第 18 节的 37 项清单映射到当前可复核证据。`通过` 只表示已有
直接证据；`待完成` 不以配置、fixture 或意图替代真实外部运行。全部通过前不得宣布 vNext 完成。

## 工程（5/6）

- 通过：单一根 `package-lock.json`，`npm ci` 可从干净依赖目录安装。
- 通过：`tsconfig.base.json` 启用 strict、noUncheckedIndexedAccess、exactOptionalPropertyTypes、
  noImplicitOverride 和 useUnknownInCatchVariables；`npm run typecheck` 通过。
- 通过：`npm run lint` 以 `--max-warnings 0` 通过。
- 通过：本机 Windows 上 `npm run check:all` 包含格式、lint、类型、测试、build、Chromium E2E
  和目标数据量浏览器性能审计。
- 待完成：`.github/workflows/ci.yml` 已定义 `windows-latest` 门禁，仓库已配置 remote 并
  推送（含桌面壳），远程 GitHub Actions 成功运行记录待确认。
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

## 迁移和恢复（7/10）

- 待完成：真实 Personal v1/v2/v3 导出的 preflight/apply 尚无来源文件；三个版本 fixture 已通过。
- 通过：qoder 新旧列 fixture 均通过，真实旧库脱敏副本完成 apply 与第二次 no-op。
- 待完成：真实两来源最终对账缺少 Personal 导出；自动化同 BVID/冲突/tombstone 对账已通过。
- 通过：真实 qoder 第二次导入全部 unchanged；Personal fixture 第二次导入为 no-op。
- 通过：导入与恢复所有规定故障点证明事务/替换回滚。
- 通过：普通备份排除 DPAPI 凭据并扫描禁用 secret/settings key 与残页。
- 通过：`.pwbk` 精确条目、bytes、SHA-256、app/schema、integrity 和 foreign keys 均验证。
- 通过：跨进程停服 CLI 完成 backup→mutate→restore→reopen→逻辑校验。
- 通过：`docs/OPERATIONS.md` 记录自动回退、pre-restore 和人工恢复路径。
- 待完成：最终切换后的两个旧项目 30 天只读保留期尚未开始/满足。

## 阶段 8 额外切换门槛

- 通过：目标 fixture 的 7 个常用查询无明显业务大表全表扫描。
- 通过：正式构建浏览器报告覆盖 5 个页面、日期/搜索/系列编辑/回顾 4 个交互及系列展开态；
  页面 ≤3s、交互 ≤1.5s、DOM ≤5,000。
- 通过：至少一份 `.pwbk` 已跨进程真实恢复并验证。
- 待完成：旧项目与 vNext 并行使用 3–7 天。
- 待完成：用户确认每日任务、固定任务、小记、总览、回顾、单/多P、系列、同步与恢复没有缺失。

当前严格计数为最终清单 33/37；另有 2 项阶段 8 使用/确认门槛待完成（“Windows CI”同时也是
最终清单内未完成项，不重复计数）。证据报告位于
`docs/reports/`，状态摘要位于 `docs/STATUS.md`。
