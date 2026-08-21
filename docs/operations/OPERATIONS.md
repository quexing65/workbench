# Personal Workbench vNext 运维手册

## 运行形态

项目有两种运行形态，共用同一份 server 源码、schema 和安全边界：

|          | Web 开发模式                                      | 桌面应用模式                                        |
| -------- | ------------------------------------------------- | --------------------------------------------------- |
| 启动方式 | `npm run dev`                                     | 开始菜单 / 快捷方式（安装版或便携版 exe）           |
| 进程拓扑 | Vite `127.0.0.1:5190` + tsx 服务 `127.0.0.1:8790` | 单 Electron 进程，内嵌正式 Express `127.0.0.1:8790` |
| NODE_ENV | development                                       | production                                          |
| 数据目录 | `apps/server/.local`                              | `%LOCALAPPDATA%\PersonalWorkbenchVNext`             |
| 适用场景 | 开发调试、运行测试                                | 日常使用                                            |

一个数据目录同一时间只允许一个 server / restore / 桌面应用持有者；桌面应用启动时
同样获取数据目录排他锁，与 CLI 互斥。

## 开发运行

```powershell
npm ci
npm run dev
```

Web 只监听 `127.0.0.1:5190`，API 只监听 `127.0.0.1:8790`。开发默认数据目录 `.local`，
也可通过 `WORKBENCH_DATA_DIR` 指定。

数据目录包括：

- `data/workbench.sqlite`：唯一业务事实源；
- `credentials/credentials.bin`：CurrentUser DPAPI 加密的 B站凭据；
- `backups/`：导入前、恢复前和持久备份；
- `tmp/imports/`：导入临时文件与短期确认计划。

不要手工复制正在使用的 SQLite 主库，也不要把运行目录、日志、凭据或真实备份提交到 Git。

## 桌面应用

安装版（NSIS 向导）可选择安装位置，写入开始菜单与可选桌面快捷方式；便携版双击即用。
两者功能与数据目录完全一致。桌面壳特性见 ADR 0007：

- 单实例：重复启动聚焦已有窗口；
- 启动失败（端口占用、数据目录被锁）弹出原生错误对话框并退出；
- 卸载不删除用户数据（`deleteAppDataOnUninstall: false`）；
- 未签名分发：首次运行 Windows SmartScreen 提示未知发布者，"更多信息 → 仍要运行"即可；
  可用版本台账中的 SHA-256 校验安装包完整性。

开发调试桌面壳：`npm run desktop:dev`（需先 `npm run dev` 启动 Vite）。

## 桌面应用发布

1. 确定版本号并更新 `apps/desktop/package.json` 与根 `package.json` 的 `version`
   （规则见 `docs/operations/RELEASES.md`：修 bug 升 patch，加功能或 schema 变更升 minor）。
2. 构建：`npm run desktop:dist`。产物归档到 `apps/desktop/release/v<version>/`：
   - `PersonalWorkbench-Setup-<version>.exe`（安装版）
   - `PersonalWorkbench-Portable-<version>.exe`（便携版）
   - `SHA256SUMS.txt`（全部产物的 SHA-256 与字节数，自动生成）
   - `win-unpacked/`（解包目录，仅供本地快速验证，可删）
3. 打 tag 并推送：`git tag -a v<version> -m "<摘要>" && git push origin v<version>`。
4. 在 GitHub Releases 基于 tag 创建发布，拖入两个 exe 作为附件（安装包不进 Git）。
5. 在 `docs/operations/RELEASES.md` 登记版本：变更摘要、commit 基线、GitHub Release 链接与
   SHA-256，随代码一起提交。

安装包二进制永不进入 Git；版本的可追溯性由 RELEASES.md 台账 + 校验和 + tag 承载。

## 跨数据目录迁移

把开发数据（`.local`）迁移到桌面正式目录，或换机迁移，流程一致：

1. 启动旧数据目录上的服务（dev 或 `npm run start -w @workbench/server`），在"数据"页
   创建并下载 `.pwbk` 备份。
2. 停止服务并确认 8790 不再响应。
3. 以正式模式恢复（写入 `%LOCALAPPDATA%\PersonalWorkbenchVNext`）：

   ```powershell
   $env:NODE_ENV='production'
   npm run data:restore -- --file '<备份文件>.pwbk'
   ```

4. B站凭据不在备份内：同一 Windows 用户下可复制
   `<旧目录>\credentials\credentials.bin` 到 `<新目录>\credentials\`；换用户或换机
   需在学习页重新连接登录态。
5. 启动桌面应用验证：数据页正常、`GET /api/v1/bili/credential/status` 返回预期状态。

## 普通备份

在"数据"页选择"创建并下载备份"。下载的 `.pwbk` 是受控 ZIP，只包含：

```text
manifest.json
workbench.sqlite
```

快照通过 `VACUUM INTO` 生成，并验证 app ID、schema、`integrity_check`、foreign keys、bytes 和
SHA-256。凭据目录不进入备份；若业务 settings 中出现疑似 authorization/cookie/credential/
SESSDATA key，备份会 fail closed。下载完成或失败都会清理服务端临时包。

将备份保存到独立磁盘或受信任位置。`.pwbk` 未加密；它不含登录凭据，但仍包含个人业务数据。

## 整库时间点恢复

恢复不是导入、合并或撤销单条修改，它会把整库回到备份时间点。先停止 `npm run dev`/正式
服务/桌面应用并确认 8790 不再响应，再运行：

```powershell
npm run data:restore -- --file 'D:\Backup\personal-workbench-....pwbk'
```

恢复器会取得数据目录排他锁，拒绝额外/重复/加密/链接/遍历/超限 ZIP 条目；校验 manifest、
hash、integrity、foreign keys 和 app ID；在 staging 副本应用可兼容 migration；为当前库创建
并验证 `pre-restore` 备份；checkpoint/关闭句柄后同卷替换主库；最后重开并复验。

成功输出只包含文件名、schema 和逻辑校验和，不含绝对路径。B站凭据不会被替换或恢复；换机、
换 Windows 用户或凭据失效后请重新登录。

### 恢复失败与回退

- 替换前失败：活动库不动，临时目录自动清理。
- 替换后失败：恢复器自动把旧数据库集合放回活动路径并重开验证。
- 替换后的失败副本保存在 `backups/failed-restore-*`，可供离线诊断；不要上传含个人数据的文件。
- 每次正式恢复前生成的 `personal-workbench-*.pwbk` 保存在 `backups/`。如需人工回退，保持服务
  停止，使用同一 `data:restore` 命令恢复这份 pre-restore 备份，不要手工移动 WAL/SHM。
- `.workbench.lock` 只在能确认对应进程已结束时才处理；格式损坏的锁默认按"仍在使用"拒绝，
  不应盲删。

## 数据库与性能检查

```powershell
npm run db:migrate
npm run performance:audit -- --output docs/reports/performance-audit.json
npm run performance:browser -- --output docs/reports/browser-performance-audit.json
```

性能审计只在系统临时目录生成 10,000 任务、10,000 小记和 1,000 视频，运行常用页面查询与
`EXPLAIN QUERY PLAN`。浏览器审计会构建正式 Web/Server、启动隔离的正式同源服务，测量总览、
任务、小记、学习和回顾的完成加载时间、日期/搜索/系列编辑/回顾交互和首屏/系列展开态 DOM 数。两个命令结束后都删除 fixture；
报告不含业务标题、正文、绝对路径或凭据。

浏览器门槛为页面完成加载不超过 3 秒、日期切换/搜索/回顾范围切换不超过 1.5 秒、单页 DOM
不超过 5,000。总览逾期任务和学习库按 20 项逐步显示，避免大数据量首屏渲染全部实体，同时
保留继续显示全部数据的入口。该基准使用本机合成数据，不能替代 3–7 天真实使用观察。

## 故障处理

- `Workbench data directory is already in use`：停止另一个 server/restore/桌面应用，确认进程退出后重试。
- migration checksum mismatch：不要修改历史 SQL；从代码与数据的匹配版本启动，或先恢复备份。
- backup/restore validation failed：保留原文件，重新生成备份；不要用解压重打包来绕过校验。
- B站凭据错误：任务、小记和学习库仍可离线使用；清除并重新捕获凭据，不要写入 settings。
- 桌面应用窗口未弹出：查看是否弹出错误对话框（端口 8790 被占用最常见，结束旧进程后重试）。
- 桌面应用 B站连接报"登录态已失效"：先在状态页确认凭据 present；若解密失败为 CredentialProtectionError，
  说明凭据文件与当前 Windows 用户不匹配，清除后重新登录。

## 最终切换与保留

正式切换已于 2026-08-21 完成：`npm ci`、`npm run check:all`、真实 qoder 脱敏对账、真实恢复
演练、3–7 天并行使用和用户核心工作流确认均通过，vNext v1.0.0 当日上线。原定的旧项目
30 天只读保留期由用户 quexing65 于同日主动声明取消，旧项目文件可由用户自行处置；vNext
不依赖旧项目，回退任何时候都用已验证的 `.pwbk` 备份执行 `npm run data:restore` 整库恢复。
