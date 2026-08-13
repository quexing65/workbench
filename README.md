# Personal Workbench vNext

一个全新的 local-first 个人工作台。产品设计参考 `Personal-Workbench`，本机
SQLite/B站能力参考 `Personl-Workbench-qoder`，但本仓库不把两个旧项目作为运行时依赖。

阶段 8 的 `.pwbk` 一致备份、停服恢复、性能基线和 qoder 脱敏演练已经实现；真实 Personal
导出、3–7 天并行运行与用户核心工作流确认完成前，项目仍处于阶段 8 进行中，不宣布最终切换。

开始开发前必须阅读：

- `EXECUTION_PLAN.md`
- `docs/STATUS.md`
- `docs/ARCHITECTURE.md`
- `docs/DATA_MODEL.md`
- `docs/SECURITY.md`
- `docs/OPERATIONS.md`
- `docs/MIGRATION_GUIDE.md`

核心原则：SQLite 是唯一业务数据源；本机 Node 服务是唯一后端；B站凭据不进入
SQLite、日志、API 响应或普通备份。
