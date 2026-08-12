# Personal Workbench vNext

一个全新的 local-first 个人工作台。产品设计参考 `Personal-Workbench`，本机
SQLite/B站能力参考 `Personl-Workbench-qoder`，但本仓库不把两个旧项目作为运行时依赖。

当前处于阶段 0：只建立执行规范、架构决策、数据与安全边界，尚未生成应用骨架或安装依赖。

开始开发前必须阅读：

- `EXECUTION_PLAN.md`
- `docs/STATUS.md`
- `docs/ARCHITECTURE.md`
- `docs/DATA_MODEL.md`
- `docs/SECURITY.md`

核心原则：SQLite 是唯一业务数据源；本机 Node 服务是唯一后端；B站凭据不进入
SQLite、日志、API 响应或普通备份。
