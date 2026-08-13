# vNext 架构基线

- 状态：阶段 6 已实施
- 日期：2026-08-13
- 默认时区：Asia/Shanghai

本文件定义 vNext 的架构边界。任何实质变化都必须先新增 ADR。

## 目标与非目标

vNext 是运行在当前 Windows 用户环境中的 local-first 工作台，覆盖任务、固定任务、小记、
总览、回顾和 B站学习。第一版不做云同步、账号、多用户、D1/R2、Electron、公网监听、
局域网共享或任意网站学习追踪。

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
Express 在 `127.0.0.1:8790` 同源托管静态页面和 `/api/v1`。

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

## 质量门槛

阶段 1 建立 TypeScript strict、ESLint 0 warning、Vitest、Playwright 和 Windows CI。
阶段 3 起全局覆盖率 lines/functions/statements ≥85%、branches ≥80%；关键迁移、导入、
进度和凭据模块要求更高覆盖率。完整要求以 `EXECUTION_PLAN.md` 为准。

## 关联决策

- `docs/adr/0001-local-first-sqlite.md`
- `docs/adr/0002-single-business-data-source.md`
- `docs/adr/0003-learning-progress-semantics.md`
- `docs/adr/0004-credential-storage.md`
- `docs/adr/0005-legacy-imports.md`
- `docs/DATA_MODEL.md`
- `docs/SECURITY.md`
