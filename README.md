# Personal Workbench vNext

一个全新的 local-first 个人工作台。产品设计参考 `Personal-Workbench`，本机
SQLite/B站能力参考 `Personl-Workbench-qoder`，但本仓库不把两个旧项目作为运行时依赖。

阶段 1 的可运行 Monorepo 骨架已经完成；当前准备进入阶段 2，落地 SQLite、迁移运行器和初始 schema。

开始开发前必须阅读：

- `EXECUTION_PLAN.md`
- `docs/STATUS.md`
- `docs/ARCHITECTURE.md`
- `docs/DATA_MODEL.md`
- `docs/SECURITY.md`

核心原则：SQLite 是唯一业务数据源；本机 Node 服务是唯一后端；B站凭据不进入
SQLite、日志、API 响应或普通备份。
