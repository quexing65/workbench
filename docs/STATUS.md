# vNext 实施状态

## 当前阶段

- 阶段：6
- 状态：完成
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
|    6 | 凭据/CDP/同步      | 完成   | 本阶段提交，主题 `feat: secure Bilibili credential sync` |
|    7 | 旧数据导入         | 未开始 |                                                          |
|    8 | 备份/恢复/切换     | 未开始 |                                                          |

## 本阶段变更

- 新增凭据状态、保存/清除、浏览器连接、同步启动和运行状态共享 contract；API 只返回通用状态、运行 ID、计数和安全错误码。
- `BiliCredentialStore` 提供 Memory 测试实现和 Windows CurrentUser DPAPI 正式实现；加密 blob 独立保存在 `credentials/credentials.bin`，秘密只经固定 PowerShell 脚本 stdin 传入。
- 凭据保存前先访问导航接口验证，清除后立即失效；错误、日志和响应不回显值、长度、片段、hash、Cookie、命令参数或绝对路径。
- CDP 默认只在固定 9222–9230 loopback 端口被动发现并校验浏览器身份/WebSocket 地址；不自动杀进程。Edge 强制重启必须经过 409 和 UI 二次确认，Chrome 136+ 返回安全替代说明。
- 历史客户端覆盖旧分页与 cursor fallback、限流、超时、破损/过大响应、登录失效和多分P位置；全部测试使用脱敏 fixture，零真实 B站请求。
- 同步服务使用进程内互斥和 `sync_runs` 持久化状态，启动时恢复中断任务；只合并已导入资源的有效观察，重复观察幂等，旧观察不能越过 reset 门槛。
- 学习页新增连接、清除、页数选择、运行中轮询和结束后刷新；密码输入不持久化，mutation 结束即清空，运行中禁用重复启动。
- 安全验证覆盖真实 CurrentUser DPAPI 随机合成值 roundtrip，以及 API、日志、SQLite 和子进程 argv 的 sentinel 扫描；阶段 6 尚不生成普通备份。

## 验证结果

| 命令/检查               | 结果 | 测试数/备注                                                                                       |
| ----------------------- | ---- | ------------------------------------------------------------------------------------------------- |
| `npm run format:check`  | 通过 | 全部文件符合 Prettier                                                                             |
| `npm run lint`          | 通过 | ESLint 0 error、0 warning                                                                         |
| `npm run typecheck`     | 通过 | Server/Web/Shared 严格类型检查通过                                                                |
| `npm ci`                | 通过 | 干净重装 479 packages                                                                             |
| `npm run test`          | 通过 | 37 files、192 tests（Server 105、Web 34、Shared 53）                                              |
| `npm run test:coverage` | 通过 | Server 96.65/85.98/96.92；Web 97.07/91.06/88.78；Shared 100/98.52/100（lines/branches/functions） |
| `npm run build`         | 通过 | 学习 chunk 16.05 KiB；最大 JS chunk 224.63 KiB；首屏 JS gzip 117.35 KiB；预算通过                 |
| `npm run check:all`     | 通过 | format、lint、typecheck、192 tests、build、7 Chromium E2E 全部通过                                |
| 凭据/DPAPI              | 通过 | Memory、保存/验证/清除、覆盖写、错误脱敏、实际 CurrentUser DPAPI 随机合成值 roundtrip             |
| CDP/进程安全            | 通过 | loopback/身份/大小校验、默认零进程操作、Edge 二次确认、固定路径参数、Chrome 136+ 安全说明         |
| 同步/进度               | 通过 | 互斥、恢复、旧分页/cursor、多分P、幂等、reset 门槛、未知资源跳过、安全失败                        |
| 秘密扫描                | 通过 | API、日志、SQLite、argv 不含 sentinel；无真实 Cookie、真实浏览器控制或真实 B站请求                |
| 只读/清理               | 通过 | Personal HEAD/status、qoder 22 项源码 manifest 与数据库 hash 均一致；无本项目残留 Node 进程       |
| 关键覆盖率              | 通过 | migration 100/96.55；progress merge 100/100；credential 98.40/95.88（lines/branches）             |

## 数据迁移

- 新增 migration：无（继续使用 `0001-initial.sql`）
- migration SHA-256：`103858fe38bbdfdc4ed2af86fa5894b71b0203aa2ab756ded9c859eabbfd08ac`
- schema version：1
- 真实数据导入：无

## 未完成项

- 下一阶段：阶段 7 Personal JSON 与 qoder SQLite 的只读、两阶段导入、预览、冲突和对账。

## 已知风险

- qoder 不含 Git 元数据，只能依靠关键文件 hash 证明未修改。
- Personal 基线原本不是完全干净，已有未跟踪执行规范；验收以“前后状态相同”为准。
- npm 报告 `glob@10.5.0`、`whatwg-encoding@3.1.1` 间接依赖提示，等待上游测试工具链升级。
- npm `allow-scripts` 提示 esbuild postinstall 尚未显式审批；当前干净安装、构建和测试均通过。
- 截图基线当前针对项目规定的 Windows Chromium CI；浏览器或字体栈升级需显式审阅基线变化。
- 手动学习导入和用户主动同步会访问 B站接口；自动调度仍由 `BILI_SYNC_ENABLED=false` 默认关闭。
- SESSDATA 由 Windows CurrentUser DPAPI 绑定当前用户/环境；普通恢复或换用户后需要重新连接。
- B站历史接口并非稳定公开合同，响应变更会令当次同步安全失败，但不影响本地任务、小记与既有学习数据。
- Chrome 136+ 对默认用户目录远程调试有限制；vNext 不绕过该限制，建议使用已启用 CDP 的 Edge 或手动凭据。

## 兼容性影响

- 首次服务启动会在 `WORKBENCH_DATA_DIR`（开发默认 `.local`）创建目录和 `data/workbench.sqlite`。
- 正式环境未显式配置时使用 `%LOCALAPPDATA%\PersonalWorkbenchVNext`。
- 已应用 migration 文件不可修改；后续 schema 变化只能新增编号 migration。
- 总览/回顾读取现有 vNext 数据但仍未导入旧数据；两个旧项目继续独立运行。
- 新增 `/api/v1/learning` 资源、进度和系列接口；既有任务、小记、总览和回顾接口不变。
- 学习进度使用 migration 0001 已存在的表，未新增或修改已应用 migration；schema version 仍为 1。
- B站故障只影响当次学习导入，任务、小记等本地工作流保持可用。
- 新增 `/api/v1/bili/credential`、`/api/v1/bili/credential/browser`、`/api/v1/learning/sync` 和运行状态接口；既有 API 保持不变。
- 凭据文件位于业务 SQLite 之外且不属于普通备份；schema version 与 migration checksum 均保持不变。

## 旧项目状态

- Personal-Workbench 被修改：否
- Personl-Workbench-qoder 被修改：否

## 退出条件

- 阶段 6 实现与自动验收已通过；`npm ci`、覆盖率、完整门禁、秘密扫描、旧项目只读和运行时清理均通过。
