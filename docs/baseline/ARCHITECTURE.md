# vNext 架构基线

- 状态：现行基线。阶段 0–8 已全部实施，v1.0.0（2026-08-21）通过最终验收正式上线
- 日期：2026-08-13 制定，2026-08-24 更新
- 默认时区：Asia/Shanghai

本文件定义 vNext 的架构边界。任何实质变化都必须先新增 ADR。

## 目标与非目标

vNext 是运行在当前 Windows 用户环境中的 local-first 工作台，覆盖任务、固定任务、小记、
总览、回顾和 B站学习。不做云同步、账号、多用户、D1/R2、公网监听、局域网共享或任意网站
学习追踪。桌面壳（Electron）已由 ADR 0007 引入，是当前主要分发形态。

两个旧项目只用于只读参考和一次性导入，不得成为 workspace、软链接或运行时依赖。

## 不可变约束

1. SQLite 是唯一业务数据源。
2. 本机 Node 服务是唯一业务后端。
3. 浏览器只能通过 `/api/v1` 读写业务数据。
4. localStorage 只保存非业务 UI 偏好。
5. SESSDATA 不进入 SQLite、日志、API 响应或普通备份。
6. Schema 只通过有 checksum 的不可变编号迁移改变。
7. 所有写操作必须有 pending、成功、失败和并发冲突状态。
8. 旧项目和旧数据源永远只读。

## 运行拓扑

```text
React page
  → typed API client
  → TanStack Query
  → Express route
  → Zod contract
  → domain service
  → repository / external adapter
  → SQLite / Bilibili / DPAPI
```

开发时 Web 监听 `127.0.0.1:5190`，API 监听 `127.0.0.1:8790`。正式运行由
Express 在 `127.0.0.1:8790` 同源托管静态页面和 `/api/v1`。桌面壳（`apps/desktop`，
ADR 0007）在 Electron 主进程内嵌同一 Express 服务并加载同源地址，不改变监听拓扑、
安全边界或数据目录约定。

## 模块边界

- route 只做 HTTP 适配，不执行 SQL。
- service 承载业务规则和事务编排。
- repository 不依赖 Express Request/Response。
- BiliClient 不操作数据库，BiliSyncService 负责编排。
- CredentialStore 与学习仓库分离。
- Web 页面不使用裸 fetch，只使用共享 typed API client。
- `packages/shared` 不依赖 React、Express 或 SQLite。
- 生产源码目标低于 300 行；超过 400 行须拆分或写 ADR。

## 数据与协议约定

- API JSON 使用 camelCase，SQLite 使用 snake_case。
- 数据库时间使用 UTC epoch milliseconds；API 返回 UTC ISO 8601。
- 业务日使用 `YYYY-MM-DD`，按 `APP_TIME_ZONE`（默认 Asia/Shanghai）解释，不做 UTC 换日。
- 时长统一使用非负整数秒；ID 由服务端生成 UUID。
- 可编辑实体使用 revision 乐观并发控制，冲突返回 409。
- 创建返回 201，异步任务（如 B站同步）返回 202，删除成功返回 204。
- 列表返回对象而不是裸数组，便于将来扩展分页与元数据。
- 错误统一为 `{error:{code,message,requestId,details}}`，不暴露 SQL、栈、路径或秘密。

## 运行时数据

开发数据位于 `.local/`。稳定版数据位于
`%LOCALAPPDATA%\PersonalWorkbenchVNext`，包含 `data/`、`credentials/`、
`backups/`、`logs/` 和 `tmp/imports/`。测试只能使用临时目录。

## 关键子系统

- Migration：编号、SHA-256、事务、已应用文件不可修改。
- Import：preflight 与 apply 两阶段，来源只读，应用前快照，单事务写入和对账。
- Backup：SQLite 一致快照、manifest、hash、integrity；不含 credential。
- Restore：停服 CLI、pre-restore 快照、原子替换和失败回退。
- Background jobs：B站同步互斥，状态写 sync_runs，不记录敏感内容。
- Credential：正式环境使用 CurrentUser DPAPI 独立文件；API 只返回通用状态，秘密只通过
  PowerShell 子进程 stdin 传递。
- Browser：默认仅被动发现固定 loopback CDP 端口；只有 Edge 在用户二次确认后可按固定路径和
  参数重启，Chrome 136+ 仅提供安全说明。
- Bili sync：单进程互斥、持久化运行状态、启动恢复中断任务；历史观察继续使用统一进度纯函数，
  不直接覆盖学习进度。
- Legacy import：Personal v1/v2/v3 JSON 与 qoder SQLite 只经复制到随机临时目录后读取；
  preflight 生成有 TTL 的不可变计划，apply 重新校验源、计划和目标基线，先做一致快照再以
  `BEGIN IMMEDIATE` 单事务写入。来源贡献与 tombstone 分开记录，冲突默认保留本地。
  **该模块已于 v1.1.0 退役**（ADR 0005 使命完成，运行时代码移除）；相关数据表保留在
  schema 中用于历史审计，详见 `docs/baseline/DATA_MODEL.md`。
- Performance：查询计划审计与正式构建浏览器审计共用 10k tasks、10k notes、1k videos 隔离
  fixture；首屏列表必须有界，用户可显式逐步展开全部数据，自动门禁检查完成加载、交互和 DOM
  预算。

## 质量门槛

静态检查：TypeScript strict、ESLint 0 warning、Prettier 格式检查，全部通过 Windows CI
（`.github/workflows/ci.yml`）。

覆盖率（全局）：lines/functions/statements ≥ 85%，branches ≥ 80%；migration、进度合并
（progress merge）和凭据（credential）模块要求 lines ≥ 95%、branches ≥ 90%。不得用无意义
断言或排除关键文件追求数字。原 import 模块的独立覆盖率阈值已随 v1.1.0 模块退役移除。

测试矩阵（改动对应区域时必须覆盖的最低面）：

| 层级           | 必测内容                                           |
| -------------- | -------------------------------------------------- |
| Shared 纯函数  | 日期、固定任务范围、URL、进度合并、字段校验        |
| Repository     | CRUD、软删除、唯一约束、事务、revision 冲突        |
| Migration      | 空库、逐版本升级、checksum、重复启动、失败回滚     |
| API            | 正常、4xx、404、409、Host/Origin、并发、重启持久化 |
| Web            | loading、empty、error、retry、busy、409、草稿保留  |
| Bili fixture   | 单/多P、下架、限流、超时、坏响应、旧历史、重置     |
| Credential     | DPAPI roundtrip、清除、日志脱敏、备份排除          |
| Backup/restore | 快照、manifest、hash、integrity、失败自动回退      |
| Security       | SSRF、路径穿越、跨站写、SQL 参数化、秘密扫描       |
| E2E            | 任务、小记、固定任务、总览、学习、备份、移动导航   |
| Accessibility  | 键盘、焦点、标签、对比、reduced motion、axe        |

提交前最低命令集：

```powershell
npm run check          # format:check + lint + typecheck + test + build
npm run test:e2e       # 涉及页面/交互改动时
npm run check:all      # 发版或大改动前（另含浏览器性能审计）
```

CI 约束：Windows runner 必需；CI 禁止访问真实 B站，禁止包含真实数据库、Cookie、日志或
备份；新迁移必须带迁移测试。

> 原 `EXECUTION_PLAN.md` §14 为本节来源，该文件已于 2026-08-24 归档为历史文档；
> 其测试要求以本节为现行版本。

## 关联决策

- `docs/adr/0001-local-first-sqlite.md`
- `docs/adr/0002-single-business-data-source.md`
- `docs/adr/0003-learning-progress-semantics.md`
- `docs/adr/0004-credential-storage.md`
- `docs/adr/0005-legacy-imports.md`
- `docs/baseline/DATA_MODEL.md`
- `docs/baseline/SECURITY.md`
