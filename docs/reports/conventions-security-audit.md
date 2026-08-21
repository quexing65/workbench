# 规范符合性与安全审计报告

- 日期：2026-08-21
- 范围：`apps/server`、`apps/web`、`apps/desktop`、`packages/shared` 全部生产源码，对照
  `docs/ARCHITECTURE.md`、`docs/SECURITY.md`、`docs/PROJECT_STRUCTURE.md` 逐项核查
- 方法：静态代码审查（只读），全部结论附 文件:行号 证据；无法静态确认的项在文末
  「需动态验证清单」单独列出

## 执行摘要

- **未发现 critical/high 级别安全漏洞。** 文档化的安全基线（loopback 防护、凭据隔离、
  SSRF 白名单、SQL 参数化、备份恢复原子性、Electron 壳加固）在代码中真实落地，
  防护链方向均为 fail-closed。
- 发现 **3 项 medium**、**12 项 low**、**10 项信息级** 加固建议，均不构成可被
  loopback 恶意网页直接利用的攻击路径，按本审计 spec 范围仅记录不修复，建议按
  「处理建议优先级」章节排期跟进。
- 规范符合性：架构 8 条不可变约束、模块边界、数据约定全部符合；目录规范仅 1 项
  low 级登记缺口（`.trae/`）；文件规模最大 397 行，无超 400 行文件。

| 严重级别      | 数量 | 编号             |
| ------------- | ---- | ---------------- |
| critical/high | 0    | —                |
| medium        | 3    | M-01、M-02、M-03 |
| low           | 12   | L-01 ~ L-12      |
| 信息          | 10   | I-01 ~ I-10      |

## 一、规范符合性结果

### 1.1 架构不可变约束（ARCHITECTURE.md）

| #   | 约束                                | 结论 | 关键证据                                                                                                                                                         |
| --- | ----------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | SQLite 是唯一业务数据源             | 通过 | 前端无 indexedDB/sessionStorage/业务 JSON 落盘；服务端持久化仅 SQLite 与文档允许的运行时产物                                                                     |
| 2   | 本机 Node 服务是唯一业务后端        | 通过 | web 源码无直连外部服务调用，B 站请求全部在服务端 `apps/server/src/modules/bili/session-client.ts`                                                                |
| 3   | 浏览器仅经 `/api/v1` 读写           | 通过 | `apps/server/src/app.ts:158-159` 全部业务路由挂载 `/api/v1`，其余 `/api` 404                                                                                     |
| 4   | localStorage 只存非业务 UI 偏好     | 通过 | 仅 `apps/web/src/app/AppShell.tsx:29,39` 存侧边栏折叠布尔值                                                                                                      |
| 5   | SESSDATA 不进 SQLite/日志/API/备份  | 通过 | migrations 无凭据列；`apps/server/src/http/logger.ts:8-16` redact 覆盖；`credentials/service.ts:12-18` 只返回状态；备份前 `backups/snapshot.ts:26-35` 扫描禁用键 |
| 6   | Schema 只经 checksum 不可变迁移     | 通过 | `apps/server/src/db/migrate.ts:9,28-30,87-95` 编号命名 + SHA-256 + 已应用校验                                                                                    |
| 7   | 写操作含 pending/成功/失败/冲突状态 | 通过 | 五个 service 用 `RevisionConflictError`→409；sync 状态机 `sync/service.ts:53,76-89`；前端 `isPending`/`isRevisionConflict` 分支齐备                              |
| 8   | 旧数据源永远只读                    | 通过 | 三处源库打开均 `readOnly: true`（`imports/snapshot.ts:6`、`qoder-inspector.ts:253`、`sanitized-snapshot.ts:33`），源文件先复制进随机临时目录                     |

### 1.2 模块边界（ARCHITECTURE.md）

| 规则                               | 结论 | 证据                                                        |
| ---------------------------------- | ---- | ----------------------------------------------------------- |
| route 不执行 SQL                   | 通过 | 全部 `*/route.ts` 无 `node:sqlite/prepare/run/all` 命中     |
| repository 不依赖 Express          | 通过 | 全部 `repository.ts` 无 express import                      |
| shared 不依赖 React/Express/SQLite | 通过 | `packages/shared/src` 零命中，仅 zod 与纯函数               |
| Web 页面不用裸 fetch               | 通过 | `fetch(` 仅存在于 `src/shared/api/`（见 I-09 两处合规例外） |
| BiliClient 不操作数据库            | 通过 | `learning/bili-client.ts` 仅 zod + 纯 HTTP                  |
| CredentialStore 与学习仓库分离     | 通过 | 仅在组合根 app.ts 与 sync 编排服务汇合                      |

### 1.3 数据约定与文件规模

- camelCase API / snake_case SQLite、UTC epoch ms（`*_ms` 列 + `utc-time.ts` 出口转
  ISO 8601）、revision 乐观并发 409、统一错误 `{error:{code,message,requestId,details}}`
  （`http/errors.ts:94-101`）：**全部符合**。
- 文件规模（生产源码，排除测试）：最大 `apps/web/src/pages/review/ReviewPage.tsx`
  **397 行**，无超 400 行文件，符合「超过 400 行须拆分或写 ADR」红线；但超过 300 行
  目标值，列为观察项（见 I-10）。其余 250 行以上文件：`DataPage.tsx` 289、
  `OverviewPage.tsx` 287、`personal-parser.ts` 279、`resource-repository.ts` 272、
  `learning-writer.ts` 263、`performance/audit.ts` 260、`qoder-inspector.ts` 253。

## 二、漏洞发现

严重级别定义：critical/high = 可被 loopback 恶意网页或恶意导入文件直接利用；
medium = 防御纵深缺口或违反文档化硬性不变量、需特定前置条件；low = 加固项；
信息 = 观察/文档一致性。

### M-01 [medium] 全链路缺少 Content-Security-Policy，XSS 场景无纵深约束

- 位置：`apps/server/src/http/security-headers.ts:8-12`、`apps/web/index.html`（无 CSP meta）
- 描述：响应头仅有 `X-Content-Type-Options`、`Referrer-Policy`、`X-Frame-Options`。
  当前前端未发现 XSS 注入点（`dangerouslySetInnerHTML` 等零命中），但一旦未来引入，
  攻击脚本将在 `http://127.0.0.1:8790` 同源上下文执行，可直接携带
  `X-Workbench-Request: 1` 调用全部写 API（写凭据、删任务、触发同步）。CSP 可将
  损失限制为 `default-src 'self'`。
- 复现方式：静态确认——全仓库无任何 `Content-Security-Policy` 设置点。
- 修复建议：在 `securityHeaders` 追加
  `Content-Security-Policy: default-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`（Vite 产物若含内联样式需为
  `style-src` 补 `'unsafe-inline'`，落地前先核对构建产物）；可选补
  `Cross-Origin-Resource-Policy: same-origin`。

### M-02 [medium] Electron 未注册权限请求处理器，设备权限默认放行

- 位置：`apps/desktop/src/main.ts:75-79`（webPreferences 三项开关正确，但全文件无
  `setPermissionRequestHandler` / `setPermissionCheckHandler`）
- 描述：Electron 在无处理器时对权限请求默认放行。若渲染进程未来出现 XSS（当前未发现），
  攻击代码可静默获得摄像头/麦克风/地理位置/通知等能力，与同源 API 写权限叠加扩大泄露面。
- 复现方式：静态确认——主进程零权限处理器注册。
- 修复建议：默认全拒：
  `session.setPermissionRequestHandler((_wc, _p, cb) => cb(false))` 与
  `session.setPermissionCheckHandler(() => false)`，未来按需白名单。

### M-03 [medium] cli-import 绕过数据目录排他锁，破坏「恢复仅在停服+排他锁下执行」不变量

- 位置：`apps/server/src/modules/imports/cli-import.ts:11-19`（直接
  `openWorkbenchDatabase`，未调用 `acquireDataDirectoryLock`）；对照
  `apps/server/src/modules/backups/restore.ts:99`（恢复第一步取锁）与
  `apps/server/src/db/data-lock.ts:33`（锁 API 已存在，owner 仅 `'server' | 'restore'`）
- 描述：`cli restore` 执行期间（服务已停、restore 持锁），若另一终端并发运行
  `import:personal/import:qoder/import:apply`，导入连接会在恢复移动/替换主库文件的
  窗口内对同一库发起 `BEGIN IMMEDIATE` 写入，可造成 WAL 写丢失、恢复校验失败或
  回退链触发，最坏产生损坏的恢复结果。违反 `docs/SECURITY.md`「恢复仅在停服和
  排他锁下执行」的硬性条款。前置条件为本机操作者并发执行两条 CLI，非远程可利用。
- 复现方式：终端 A 执行 `npm run data:restore -- --file x.pwbk`，终端 B 同时执行
  `npm run import:personal -- --file y.json`——B 不会因锁存在而失败（A-1 实证：
  cli-import.ts 全文件无锁调用）。
- 修复建议：`cli-import.ts` 入口先
  `acquireDataDirectoryLock(config.dataDirectory, 'import')`（扩展 `LockRecord['owner']`
  联合类型），失败即退出；`ImportService` 构造期孤儿计划清扫同理被锁覆盖。

### L-01 [low] Sec-Fetch-Site 为黑名单式精确相等匹配，重复头拼接可跳过该层

- 位置：`apps/server/src/http/origin-guard.ts:57`
- 描述：`=== 'cross-site'` 黑名单下，重复头被 Node 拼接为 `"cross-site, cross-site"`
  即不命中。缓解：Sec-Fetch-\* 属浏览器 forbidden header，网页 JS 无法设置；后两层
  （Origin 白名单、`X-Workbench-Request`）仍生效。属防御纵深弱化而非可利用漏洞。
- 修复建议：改白名单 `['same-origin','same-site','none'].includes(site)`，天然拒绝
  含逗号拼接值。

### L-02 [low] Pino redact 为精确路径枚举，嵌套字段不覆盖

- 位置：`apps/server/src/http/logger.ts:8-16`
- 描述：当前安全依赖 `serializeRequest` 白名单序列化这一单点（不输出 headers/body）；
  redact 仅覆盖 `req.body.sessdata` 等精确路径，未来若直记 `logger.info({ req })`
  或 serializer 增强，嵌套凭据（如 `req.body.nested.sessdata`）不会被遮蔽。
- 修复建议：追加通配变体（`req.body.*.sessdata` 等），或加测试锁定
  `serializeRequest` 输出键集合。

### L-03 [low] errorHandler 未检查 headersSent，二次异常落入框架兜底

- 位置：`apps/server/src/http/errors.ts:94-101`
- 描述：响应流已开始后再 `.json()` 会抛 `ERR_HTTP_HEADERS_SENT` 移交 finalhandler；
  客户端不泄露信息（连接销毁），但服务端行为脱离统一错误通道，且 4xx 不落请求日志
  不利溯源。
- 修复建议：handler 开头 `if (response.headersSent) { response.destroy(); return; }`。

### L-04 [low] 打包产物仍响应 `--dev` 参数，跳过内嵌服务加载固定 5190 端口

- 位置：`apps/desktop/src/main.ts:11`（`isDevelopment` 未结合 `app.isPackaged`）、
  `main.ts:136-141`
- 描述：给正式 exe 附加 `--dev` 启动会加载 `http://127.0.0.1:5190`；本机恶意进程
  抢占该端口可投递仿冒页面诱导重录 SESSDATA（后端不存在、沙箱限制，实际危害有限）。
- 修复建议：改为 `!app.isPackaged && process.argv.includes('--dev')`。

### L-05 [low] 契约层 `sourceUrl`/`coverUrl` 未约束协议与域名

- 位置：`packages/shared/src/contracts/learning.ts:44,46`（仅 `z.string().url()`，
  `javascript:`/`data:` 均可通过）；渲染点 `apps/web/src/pages/learning/LearningResourceCard.tsx:100-126`
- 描述：已有四层下游缓解（入库前 `bili-url.ts:31-33` 白名单、React 19 拦截
  `javascript:` URL、`will-navigate` 同源限制、`setWindowOpenHandler` 仅 http/https），
  故降级 low；属纵深缺口。`coverUrl` 当前无任何渲染点（潜在隐患）。
- 修复建议：契约改用复用 `isAllowedBiliHostname` 的 refinement，或渲染前断言 `https:`。

### L-06 [low] ZIP 数据库条目缺内联流式字节计数，极端声明值下存在瞬态磁盘放大

- 位置：`apps/server/src/modules/backups/archive.ts:63-66`（`writeEntry` 管道直写不
  计数，依赖中央目录声明预检 + yauzl `validateEntrySizes` 终局校验）
- 描述：恶意 `.pwbk` 声明 512MB/5.2MB 通过 100:1 比例闸后，若 yauzl 仅在条目流结束
  时比对字节数，错误中止前最多约 5GB 数据落入 stage 临时目录；随后校验失败即清理，
  不持久化、不触正式库，属可用性噪声。攻击者需本机调用 CLI，门槛高。
- 修复建议：`writeEntry` 插入计数 `Transform` 超限即销毁（与 `readEntry` 的
  `archive.ts:54-58` 做法对齐）；yauzl 中途截断行为需动态验证。

### L-07 [low] 恢复回退链各步骤自身抛错会掩盖原始错误并可留中间态

- 位置：`apps/server/src/modules/backups/restore.ts:150-163`
- 描述：catch 内 `removeDatabaseSet`/两次 `moveDatabaseSet`/验证打开均无独立
  try/catch；Windows 杀毒/索引器瞬时锁定文件可致 `EBUSY/EPERM` 覆盖原始错误，
  活动目录可能处于「新库已移入 failed-restore、rollback 未搬回」中间态（数据仍可由
  persistent pre-restore 快照人工恢复）。
- 修复建议：回退每步独立 try/catch 并聚合错误（保留 cause）；完成后统一做三件套
  存在性断言再抛出。

### L-08 [low] 锁文件损坏时永久死锁（fail-closed 但无自愈），release 缺属主校验

- 位置：`apps/server/src/db/data-lock.ts:24-31`（JSON 解析失败返回 false → 永久阻塞）、
  `data-lock.ts:57-65`（release 无条件删文件）
- 描述：崩溃半写锁文件将阻塞 server/restore/import 启动，只能手工删除；「持有者被
  误判死但实际存活」时 release 可能误删新属主锁（`processExists` 的 Windows
  `kill(pid,0)`/EPERM 语义需动态验证）。
- 修复建议：release 前读回记录比对 pid+owner；解析失败的锁文件按 mtime 阈值判 stale。

### L-09 [low] 恢复/导入孤儿产物与 pre-import 快照无启动清扫

- 位置：`apps/server/src/modules/backups/restore.ts:102-104`（`.restore-stage-*`、
  `.restore-rollback-*`、`failed-restore-*` 仅创建无清理）、
  `apps/server/src/modules/imports/snapshot.ts:31`（`pre-import-<runId>.sqlite` 每次导入
  新增且永不回收）
- 描述：进程恢复中途被硬杀会在活动目录留下含完整库的 stage 目录；每次导入在 backups
  目录累积全量业务数据快照。均在本机同盘、无直接泄露通道，但扩大敏感数据落盘面与
  磁盘占用。
- 修复建议：server 启动（持锁后）清扫上述孤儿目录；导入成功或 preflight 过期后删除
  对应 `pre-import-*.sqlite`。

### L-10 [low] 学习进度秒数与时长类整数无上限，可污染统计报表

- 位置：`apps/server/src/modules/imports/personal/personal-schema.ts:80`
  （`lastPositionSec` 仅 nonnegative）、`apps/server/src/modules/imports/qoder/qoder-inspector.ts:174`
  （duration 同）
- 描述：恶意 Personal JSON / qoder 库可写入天文数字时长并累加进
  `learning_watch_daily` 等统计。纯数据质量攻击，不越权不崩溃。
- 修复建议：为秒数类字段加 `.max()`（如 ≤ 86_400 × 天数上限量级）并在 writer 层 clamp。

### L-11 [low] DPAPI 凭据写入的崩溃残留临时文件无清扫

- 位置：`apps/server/src/modules/credentials/dpapi-store.ts:46-58`（write 的 tmp→rename
  窗口崩溃残留 `.credentials-<uuid>.tmp`）、`dpapi-store.ts:61-67`（clear 只删主文件）
- 描述：残留为 DPAPI 密文而非明文，风险限于本地磁盘取证可见密文残页，违反最小残留
  原则。
- 修复建议：启动或 clear 时对 credentials 目录做 `.credentials-*.tmp` 孤儿清扫。

### L-12 [low] 顶层目录 `.trae/` 未登记 PROJECT_STRUCTURE.md 也未入 .gitignore

- 位置：`.gitignore:39-45`（AI 工作目录段仅有 `.workbuddy/`、`.qoder/`）
- 描述：违反 PROJECT_STRUCTURE.md「新增顶层目录前先更新本文」及 AI 工作目录不入库
  的既有约定；`.trae/specs/` 属个人工作痕迹，可能被误提交。
- 修复建议：在 `.gitignore` 增加 `.trae/`（与 `.workbuddy/`、`.qoder/` 并列）。

### 信息级发现

| 编号 | 摘要                                                                                                                                                  | 位置                                                            |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| I-01 | Express Router 自动 OPTIONS 返回 Allow 头，同机进程可枚举 API 面（跨站预检已被 Origin 拦截）                                                          | `apps/server/src/app.ts:89-158`                                 |
| I-02 | dotfile 探测（`/.env` 等）经 SPA fallback 返回 200 index.html，不泄露内容但语义非常规 404                                                             | `apps/server/src/http/static-web.ts:32,40-53`                   |
| I-03 | 打包桌面壳仍接受 `WORKBENCH_DATA_DIR`/`PORT` 等 env 覆盖（能设用户环境变量者等价已代码执行，非独立攻击路径；HOST 已被 `z.literal('127.0.0.1')` 锁死） | `apps/server/src/config.ts:58-80`                               |
| I-04 | dev 分支未显式 `NODE_ENV='development'`：全局导出 production 时写请求全 403（可用性脚枪，fail-closed 方向正确）                                       | `apps/desktop/src/main.ts:136-141`                              |
| I-05 | `mode 0o600` 在 Windows 不生效，实际保护依赖 `%LOCALAPPDATA%` NTFS ACL + DPAPI CurrentUser 双层（建议 `icacls` 动态确认）                             | `apps/server/src/modules/credentials/dpapi-store.ts:52`         |
| I-06 | `cover_url` 无协议/host 约束可被恶意 qoder 导入注入任意字符串；当前前端无 `<img>` 渲染点，若未来渲染将成为外域/内网 GET 信标                          | `learning/bili-client.ts:182-194`、`qoder-inspector.ts:187-188` |
| I-07 | Personal 导入 Zod schema 为 strip 而非 strict（多余键静默剥离，不达库无注入路径，但与「严格 Zod」措辞有偏差并掩盖字段漂移）                           | `imports/personal/personal-schema.ts:102-114`                   |
| I-08 | 学习 URL 分 P 参数无业务上限（可存极大值，仅数据卫生）                                                                                                | `packages/shared/src/domain/bili-url.ts:35-39`                  |
| I-09 | `shared/api` 两处直接 fetch 属合规例外（blob 下载、multipart 上传，均走 `/api/v1` 且带齐标记头），建议加注释说明                                      | `apps/web/src/shared/api/backups.ts:12`、`imports.ts:18`        |
| I-10 | `apps/web/src/styles.css` 聚合入口未在 PROJECT_STRUCTURE.md 样式章节描述；另 ReviewPage.tsx 397 行超过 300 行目标值，建议关注拆分时机                 | `apps/web/src/styles.css`、`ReviewPage.tsx`                     |

## 三、已修复项与回归测试

**无。** 本次审计确认的发现中不含 critical/high 级别；按审计 spec 的修复范围约定
（仅 critical/high 且方案明确者实施修复并附回归测试），全部发现以本报告记录并给出
修复建议，留待产品决策后排期。未修改任何业务代码。

## 四、未处理项及原因

- **M-01 / M-02（CSP、权限处理器）**：属纵深加固，需先核对 Vite 构建产物内联情况与
  未来权限需求，建议单独排期（优先级最高）。
- **M-03（cli-import 取锁）**：改动涉及 `LockRecord['owner']` 类型扩展与 CLI 行为，
  建议随下一次导入/恢复相关迭代实施并补并发回归测试。
- **L-01 ~ L-12**：均为低风险加固，建议合并为一次「安全加固批次」处理，每项附
  回归测试。
- **I-01 ~ I-10**：记录备查，其中 I-05（NTFS ACL）转入需动态验证清单。

## 五、需动态验证清单

1. Node 实际运行时对重复 `Sec-Fetch-Site` 头的拼接行为（影响 L-01 触发面描述）。
2. yauzl `validateEntrySizes` 是否在条目流中途截断超限流（影响 L-06 的放大上限）。
3. Windows 下 `process.kill(pid, 0)`/`EPERM` 语义与 `renameSync` 高干扰环境原子性
   （影响 L-08 误判面与恢复原子性假设）。
4. `credentials/` 目录 NTFS ACL 实际仅 SYSTEM/Administrators/当前用户可访问（I-05）。
5. `trusted_schema=OFF` 对恶意 virtual table 的运行时拦截效果（qoder 导入路径）。
6. b23.tv 真实网络下多级跳转与边缘 3xx 行为（CI 不触网，静态无法覆盖）。
7. Vite 构建产物是否含内联脚本/事件处理器（决定 M-01 CSP 能否免 `unsafe-inline`）。
8. `.trae/` 是否已被 git 追踪（决定 L-12 处理方式）。
