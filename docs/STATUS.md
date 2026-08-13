# vNext 实施状态

## 当前阶段

- 阶段：5
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
|    5 | B站学习模型        | 完成   | 本阶段提交，主题 `feat: add Bilibili learning workflows` |
|    6 | 凭据/CDP/同步      | 未开始 |                                                          |
|    7 | 旧数据导入         | 未开始 |                                                          |
|    8 | 备份/恢复/切换     | 未开始 |                                                          |

## 本阶段变更

- 新增学习资源、分P、资源进度、分P进度、未解析短链和学习系列共享 Zod contract，以及稳定导出的 API 客户端。
- URL 归一化支持裸 BVID、HTTPS bilibili.com 子域和 b23.tv；短链逐跳验证协议/域名/跳转上限，失败可安全保留，禁止跳向非允许域名。
- BiliClient 具备超时、限流、响应大小、破损 JSON、下架、空分P、BVID 不一致、重复 cid/page 和安全封面 URL 校验；测试仅使用脱敏 fixture，不访问真实 B站。
- 资源按 BVID 幂等导入，分P以 cid 保持身份；元数据重排、分P移除、时长缩短和系列位置重排均保持引用与进度一致。
- `mergeLearningObservation` 作为纯函数实现最远进度不回退、真实续播可回退、同时间冲突、分P完成、整项完成与 reset 手动门槛；reset 后旧观察不能复活进度。
- 学习 API 支持资源列表/详情/导入/删除、观察/完成/重置，以及系列创建/改名/排序/删除；全部写入使用 revision 或 If-Match 冲突保护。
- 学习页支持导入、可选加入系列、分P进度、外部源链接、整项完成/重置/移除确认，以及系列创建、改名、增删资源和上下排序；具备 loading/empty/error/retry/unresolved 状态。
- 浏览器验收覆盖学习系列跨刷新持久化、360px 学习页无横向溢出，并继续通过全站键盘、axe、截图和 reduced-motion 门禁。

## 验证结果

| 命令/检查               | 结果 | 测试数/备注                                                                                         |
| ----------------------- | ---- | --------------------------------------------------------------------------------------------------- |
| `npm run format:check`  | 通过 | 全部文件符合 Prettier                                                                               |
| `npm run lint`          | 通过 | ESLint 0 error、0 warning                                                                           |
| `npm run typecheck`     | 通过 | Server/Web/Shared 严格类型检查通过                                                                  |
| `npm ci`                | 通过 | 干净重装 479 packages                                                                               |
| `npm run test`          | 通过 | 27 files、135 tests（Server 56、Web 31、Shared 48）                                                 |
| `npm run test:coverage` | 通过 | Server 96.24/83.22/97.34；Web 96.80/91.19/89.53；Shared 99.31/93.33/100（lines/branches/functions） |
| `npm run build`         | 通过 | 学习 chunk 11.28 KiB；最大 JS chunk 224.63 KiB；首屏 JS gzip 117.04 KiB；预算通过                   |
| `npm run check:all`     | 通过 | format、lint、typecheck、135 tests、build、7 Chromium E2E 全部通过                                  |
| 学习 API/纯函数         | 通过 | 幂等导入、cid 重排、时长缩短、最远/续播、完成/reset、系列 CRUD、冲突与引用重排                      |
| B站安全 fixture         | 通过 | single/multi/empty/unavailable/rate-limit/timeout/broken/multihop/blocked/duplicate；零真实请求     |
| 视觉/响应式             | 通过 | 1440x900/390x844 基线；360px 六个业务页无横向溢出；学习系列跨刷新持久化                             |
| 键盘/无障碍             | 通过 | 纯键盘任务/小记、reduced-motion；axe serious/critical=0                                             |
| 兼容/清理               | 通过 | 正式 SPA/API 保持兼容；E2E 隔离临时库并清理；无残留本项目 Node 进程                                 |

## 数据迁移

- 新增 migration：无（继续使用 `0001-initial.sql`）
- migration SHA-256：`103858fe38bbdfdc4ed2af86fa5894b71b0203aa2ab756ded9c859eabbfd08ac`
- schema version：1
- 真实数据导入：无

## 未完成项

- 下一阶段：阶段 6 凭据存储、CDP 浏览器接入、同步协调和手动观察合并。

## 已知风险

- qoder 不含 Git 元数据，只能依靠关键文件 hash 证明未修改。
- Personal 基线原本不是完全干净，已有未跟踪执行规范；验收以“前后状态相同”为准。
- npm 报告 `glob@10.5.0`、`whatwg-encoding@3.1.1` 间接依赖提示，等待上游测试工具链升级。
- npm `allow-scripts` 提示 esbuild postinstall 尚未显式审批；当前干净安装、构建和测试均通过。
- 截图基线当前针对项目规定的 Windows Chromium CI；浏览器或字体栈升级需显式审阅基线变化。
- 手动导入在运行时会访问 B站公开元数据接口；自动同步仍关闭，凭据/CDP 尚未实现，属于阶段 6。

## 兼容性影响

- 首次服务启动会在 `WORKBENCH_DATA_DIR`（开发默认 `.local`）创建目录和 `data/workbench.sqlite`。
- 正式环境未显式配置时使用 `%LOCALAPPDATA%\PersonalWorkbenchVNext`。
- 已应用 migration 文件不可修改；后续 schema 变化只能新增编号 migration。
- 总览/回顾读取现有 vNext 数据但仍未导入旧数据；两个旧项目继续独立运行。
- 新增 `/api/v1/learning` 资源、进度和系列接口；既有任务、小记、总览和回顾接口不变。
- 学习进度使用 migration 0001 已存在的表，未新增或修改已应用 migration；schema version 仍为 1。
- B站故障只影响当次学习导入，任务、小记等本地工作流保持可用。

## 旧项目状态

- Personal-Workbench 被修改：否
- Personl-Workbench-qoder 被修改：否

## 退出条件

- 阶段 5 实现与自动验收已通过；npm ci 重现、fixture 零真实 B站、浏览器验收、旧项目只读和运行时清理均通过。
