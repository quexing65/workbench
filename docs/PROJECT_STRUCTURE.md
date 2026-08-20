# 项目目录规范

本仓库采用 npm workspaces。业务代码按“可运行应用、共享契约、跨应用验证、运维资料”分层，新增文件必须先归入下列职责，不在仓库根目录临时堆放。

## 根目录

- `apps/`：可独立运行的应用。前端放在 `apps/web`，本机服务放在 `apps/server`。
- `packages/`：被多个应用复用的包。跨前后端的数据契约和纯领域逻辑放在 `packages/shared`。
- `tests/e2e/`：需要同时启动前后端的端到端与视觉回归测试。
- `scripts/`：跨 workspace 的构建、检查和测试入口。只服务单个应用的脚本放回对应应用的 `scripts/`。
- `docs/`：架构、数据模型、安全、运维、迁移和决策记录。机器生成但需要长期保留的审计结果放在 `docs/reports/`。
- `.github/`：持续集成与仓库自动化。
- 根目录配置文件：只放整个 workspace 共用的工具配置、包管理文件和项目入口文档。

## 前端 `apps/web`

- `src/app/`：应用装配，包括路由、全局 Provider、导航与外壳；不放具体业务逻辑。
- `src/pages/<feature>/`：按侧边栏功能划分的页面与该页面私有组件，例如 `pages/data/`。
- `src/shared/api/`：前端请求封装和查询键；不放页面组件。
- `src/shared/ui/`：两个及以上页面可复用、且不属于单一业务域的 UI。
- `src/styles/`：`base.css` 放全局变量与元素基线，`shell.css` 放应用外壳，`pages.css` 放页面通用布局；业务样式按功能文件拆分。
- `src/tests/`：前端单元与组件测试；跨应用浏览器测试仍放根目录 `tests/e2e/`。

## 服务端 `apps/server`

- `src/db/`：数据库连接、迁移、事务与数据目录管理。
- `src/http/`：HTTP 横切能力，例如错误、日志、安全与静态资源服务。
- `src/modules/<feature>/`：按业务域组织路由、服务与仓储；模块私有代码留在对应目录。
- `src/performance/`：性能审计实现。
- `tests/`：服务端集成测试与测试夹具。
- `scripts/`：仅服务端使用的辅助脚本。

## 文件去留规则

- 不提交 `node_modules/`、`dist/`、`coverage/`、`playwright-report/`、`test-results/`、运行日志、本机数据库、凭据或临时导入文件；它们必须能够由安装、构建或测试重新生成。
- “不提交凭据”指运行时凭据 blob（默认在 `.local/credentials/`）。`.gitignore` 的 `credentials/` 规则是防御性的宽匹配；`apps/server/src/modules/credentials/` 是源码模块，已通过 `!apps/server/src/modules/credentials/` 例外显式纳入版本控制。新增与凭据同名的源码目录时，必须同步检查 `git check-ignore` 确认未被误伤。
- AI 助手的工作目录（`.workbuddy/`、`.qoder/`）属于个人工作痕迹，不提交；仓库级共享约定只写入 `docs/`。
- 测试快照属于回归基线，应与对应测试放在一起并纳入版本控制。
- 迁移脚本、ADR、审计基线和恢复演练记录属于可追溯资料，不因“当前运行时未直接导入”而删除。
- 删除源码前必须确认没有代码、测试、脚本或文档引用；移动公共模块时同步更新导入路径与相关文档。
- 新增顶层目录前先更新本文，说明它与现有目录无法合并的原因及维护责任。
