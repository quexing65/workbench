# vNext 实施状态

## 当前阶段

- 阶段：1
- 状态：完成
- 最后更新：2026-08-13

## 阶段状态

| 阶段 | 内容               | 状态   | 验收提交                                                        |
| ---: | ------------------ | ------ | --------------------------------------------------------------- |
|    0 | 决策基线           | 完成   | `dff2c62` `chore: establish vNext execution baseline`           |
|    1 | Monorepo 骨架      | 完成   | 本阶段提交，主题 `feat: establish runnable monorepo foundation` |
|    2 | SQLite/migration   | 未开始 |                                                                 |
|    3 | 任务/固定任务/小记 | 未开始 |                                                                 |
|    4 | 产品壳/总览/回顾   | 未开始 |                                                                 |
|    5 | B站学习模型        | 未开始 |                                                                 |
|    6 | 凭据/CDP/同步      | 未开始 |                                                                 |
|    7 | 旧数据导入         | 未开始 |                                                                 |
|    8 | 备份/恢复/切换     | 未开始 |                                                                 |

## 本阶段变更

- 建立 `@workbench/web`、`@workbench/server`、`@workbench/shared` 三个 npm workspace 和唯一根锁文件。
- 建立严格 TypeScript、ESLint 0 warning、Prettier、Vitest、Playwright 和 Windows CI 工具链。
- 实现 Express app factory、统一安全错误、服务端 request ID、Host/Origin/跨站写保护和 Pino 日志脱敏。
- 实现基础 `/api/v1/health`；数据库状态按计划留到阶段 2，不伪造 schema 状态。
- 实现 React/Vite 应用壳、七个固定路由、TanStack Query health 状态、桌面侧栏和移动底栏。
- 实现正式 Express 静态托管和非 API SPA fallback；补齐单元、集成及浏览器 E2E。

## 验证结果

| 命令/检查                     | 结果 | 测试数/备注                                                                         |
| ----------------------------- | ---- | ----------------------------------------------------------------------------------- |
| `npm ci --no-audit --no-fund` | 通过 | 479 packages；唯一根 `package-lock.json` 可复现                                     |
| `npm run format:check`        | 通过 | 全部文件符合 Prettier                                                               |
| `npm run lint`                | 通过 | ESLint 0 error、0 warning                                                           |
| `npm run typecheck`           | 通过 | Server/Web/Shared 严格类型检查通过                                                  |
| `npm run test`                | 通过 | 7 files、23 tests（Server 12、Web 10、Shared 1）                                    |
| `npm run test:coverage`       | 通过 | Server 81.05/73.23/89.28/81.05%；Web 88.88/91.17/85.71/88.88%；Shared contract 100% |
| `npm run build`               | 通过 | 初始 JS 325.46 KB raw / 98.85 KB gzip                                               |
| `npm run check`               | 通过 | format、lint、typecheck、test、build 聚合门槛通过                                   |
| `npm run test:e2e`            | 通过 | Chromium 2 tests；应用壳、Web 代理 health、服务状态和 axe serious/critical=0        |
| 开发运行态                    | 通过 | Web 5190 与代理 health 均 200；停止后无新增 Node 进程                               |
| 正式运行态                    | 通过 | health、`/`、`/overview` 均 200；SPA 页面包含 root 节点                             |
| HTTP 安全/日志                | 通过 | 非法 Host/Origin、跨站写、写请求标记、JSON 类型与秘密扫描测试通过                   |
| 旧项目状态复核                | 通过 | Personal HEAD/status 未变；20/20 manifest 匹配；qoder DB size/hash 未变             |

## 数据迁移

- 新增 migration：无
- schema version：0
- 真实数据导入：无

## 未完成项

- 下一阶段：阶段 2 SQLite 和 migration 基础；本阶段未提前创建数据库或正式 schema。

## 已知风险

- qoder 不含 Git 元数据，只能依靠关键文件 hash 证明未修改。
- Personal 基线原本不是完全干净，已有未跟踪执行规范；验收以“前后状态相同”为准。
- npm 安装报告 `glob@10.5.0` 为间接依赖的弃用/安全提示；后续跟随上游工具链升级复核。
- npm 11 的脚本审批提示暂缓 `esbuild@0.28.2` postinstall，但 Vite build 和 E2E 均已实际通过。
- 阶段 1 覆盖率按 workspace 分别输出；全局阈值从阶段 3 起强制。

## 兼容性影响

- 运行时要求 Node.js `>=24 <25`，监听地址固定为 `127.0.0.1`。
- API 开发端口为 8790，Web 开发端口为 5190；正式服务在 8790 同源托管 Web 与 API。
- 阶段 1 尚无数据库、业务数据或旧数据导入，不影响两个旧项目继续运行。

## 旧项目状态

- Personal-Workbench 被修改：否
- Personl-Workbench-qoder 被修改：否

## 退出条件

- 阶段 1 任务及验收项已实现并验证；旧项目只读复核通过，提交前完成敏感文件、diff 和暂存区检查。
