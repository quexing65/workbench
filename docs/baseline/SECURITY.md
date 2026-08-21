# vNext 安全基线

- 状态：阶段 8 备份与恢复条款已实现并通过自动验收，最终切换门槛待真实运行确认
- 日期：2026-08-13

## 资产与信任边界

重点保护：B站 SESSDATA、本地 SQLite、导入源、备份、日志和用户浏览器会话。
主要威胁：loopback 跨站写、SSRF、SQL 注入、路径穿越、恶意 JSON/SQLite/备份包、
日志泄密、错误浏览器进程控制和不完整恢复。

## 凭据生命周期

- 定义 BiliCredentialStore；测试用内存实现，Windows 正式版使用 CurrentUser DPAPI。
- 加密 blob 只存 `credentials/credentials.bin`。
- 禁止进入 SQLite、settings、Git、普通备份、API 响应、日志、URL 或命令行参数。
- API 只能返回 present/valid 等状态，不返回值、长度、片段或 hash。
- PowerShell 辅助程序必须是固定脚本，以 `-NoProfile -NonInteractive -File` 调用。
- 秘密只通过 stdin 传入，不拼接命令；stdout/stderr 与异常不得泄露输入。
- 普通恢复不恢复凭据，恢复或换 Windows 用户后应重新登录。

## Loopback HTTP 防护

- 只监听 `127.0.0.1`。
- 校验 Host 与 Origin；拒绝跨站写请求和 `Sec-Fetch-Site: cross-site`。
- 写请求必须带 `X-Workbench-Request: 1`。
- 默认 JSON 限制 1MB，受控 multipart 导入限制 50MB。
- API 不接受任意本机文件路径；临时文件使用随机隔离目录。
- SQL 全部参数化；错误不返回 SQL、栈、绝对路径、Cookie 或请求头。
- Pino redaction 至少覆盖 authorization、cookie、set-cookie、sessdata 和凭据请求体。

## SSRF 与外部请求

- 学习 URL 只接受 HTTPS。
- host allowlist 仅为 `bilibili.com`、`*.bilibili.com`、`b23.tv`。
- b23 每次跳转都重新校验协议和 host，并限制跳转次数。
- 服务端不提供任意 URL 代理。
- CI 和普通测试不访问真实 B站，只使用脱敏 fixture。

## 导入安全

- Personal JSON 校验类型、版本、大小、数量、状态、日期和 URL。
- qoder SQLite 以 read-only/query_only 打开，校验 magic、已知表列和 integrity。
- 同时启用 `trusted_schema=OFF`、禁用扩展；确认 allowlist 对象是 table 而非 view，不执行源库 trigger/view。
- 限制 SQLite bytes/page count、总行数、单字段/pages_json 长度、每视频分P数和总校验时间。
- 上传流式计算 SHA-256；apply 只引用服务器生成的 import ID。
- ready preflight 有 TTL；文件名不用于路径拼接；成功、失败、过期或重启恢复后都清理孤儿临时文件。
- qoder 中的 SESSDATA 仅用返回布尔存在性的定向查询检测，禁止 `SELECT *` 或读取/物化其值；
  staging、warning、错误上下文和 fixture snapshot 都不得携带它。

阶段 7 已实现上述导入约束：Personal v1/v2/v3 使用严格 Zod schema；qoder 使用
read-only/query_only、`trusted_schema=OFF`、table/column allowlist、integrity/foreign-key 与
容量边界检查。confirmation token 绑定 run/source/type/timezone/plan 且 15 分钟过期；apply
重新校验源哈希、数据库计划摘要、目标投影和 tombstone 目标投影，失败回滚并清理临时文件。
真实 SESSDATA 未被读入、复制、记录或迁移。

## 备份与恢复安全

- 普通备份只含 manifest 和一致 SQLite 快照，绝不含 credential。
- 生成普通备份前检查业务库不存在禁用的 credential/settings key，不能只信任 manifest 声明。
- 备份校验 bytes、SHA-256、integrity_check 和 foreign_key_check。
- 恢复包固定且仅允许 manifest/SQLite 两个普通文件；拒绝重复名、大小写变体、加密条目、
  symlink/reparse、额外条目、绝对路径和 `..`。流式限制压缩/解压总量、单文件大小和压缩比，
  manifest 的 dbBytes 也必须受程序硬上限约束。
- 恢复仅在停服和排他锁下执行，先生成 pre-restore 快照；执行并验证
  `wal_checkpoint(TRUNCATE)`、关闭全部句柄，将旧主库/WAL/SHM 作为一致集合移出活动路径，
  确保没有 stale sidecar 后再同卷原子替换。
- 任一步失败自动回退，诊断信息保持脱敏。
- 重开后验证 integrity、foreign keys、app ID、migration checksums 和逻辑校验和。

阶段 8 已实现受控 ZIP、流式/比例/大小/条目校验、`VACUUM INTO`、停服锁、pre-restore
快照、同卷数据库集合替换和故障自动回退；测试覆盖额外条目、大小写重复、遍历、symlink、
zip bomb、manifest/hash 不匹配、秘密残页、5 个恢复故障点以及跨进程 CLI。恢复仍不恢复凭据。

## 浏览器控制

- 默认仅连接已启用的调试端口，不关闭、杀死或重启浏览器。
- 需要重启时先返回 409，由 UI 显式二次确认。
- 浏览器和可执行文件来自固定 allowlist，不接受任意路径。
- Chrome 136+ 限制应提供 Edge 或手动输入替代方案。
- CDP 响应和 Cookie 不进入日志。

阶段 6 已实现固定端口被动发现、loopback WebSocket 校验、响应大小限制、Edge 固定可执行文件
allowlist 和 409 二次确认流程。测试通过注入进程适配器验证控制参数，不操作真实浏览器；正式
CurrentUser DPAPI 使用随机合成秘密完成 roundtrip，测试秘密扫描覆盖 API、日志和 SQLite。

## 桌面壳（ADR 0007）

- Electron 窗口 `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`；
  渲染进程与 Web 开发模式完全一致，不注入桌面特权。
- 窗口 `will-navigate` 仅放行同源地址；`window.open` 与外链一律经
  `shell.openExternal` 交给系统浏览器，且仅接受 http/https。
- 桌面壳启动时强制校验内置 Node 主版本 ≥24，与 `node:sqlite` 运行时要求一致。
- `dpapi.ps1` 通过 asarUnpack 释放为真实文件（外部进程 powershell.exe 无法读取
  asar 虚拟文件系统）；释放文件与 asar 内资源同样参与安装包完整性。
- 未签名安装包依赖 SmartScreen 提示 + `docs/operations/RELEASES.md` 的 SHA-256 台账做分发
  完整性验证；安装包不进入 Git，不存在凭据或个人数据。

## CI 与安全验证

- CI 不含真实 Cookie、数据库、备份或日志，不调用真实 B站。
- fixture 使用明显的测试秘密，并扫描 API、日志、SQLite 和备份确认不存在。
- 必测 Host/Origin、跨站写、SSRF、路径穿越、SQL 参数化、坏 SQLite、坏备份、
  凭据清除和日志脱敏。
