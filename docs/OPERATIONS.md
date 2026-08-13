# Personal Workbench vNext 运维手册

## 启动与数据目录

开发运行：

```powershell
npm ci
npm run dev
```

Web 只监听 `127.0.0.1:5190`，API 只监听 `127.0.0.1:8790`。正式数据目录默认为
`%LOCALAPPDATA%\PersonalWorkbenchVNext`；开发默认 `.local`，也可通过
`WORKBENCH_DATA_DIR` 指定。一个数据目录同一时间只允许一个 server 或 restore 持有者。

数据目录包括：

- `data/workbench.sqlite`：唯一业务事实源；
- `credentials/credentials.bin`：CurrentUser DPAPI 加密的 B站凭据；
- `backups/`：导入前、恢复前和持久备份；
- `tmp/imports/`：导入临时文件与短期确认计划。

不要手工复制正在使用的 SQLite 主库，也不要把运行目录、日志、凭据或真实备份提交到 Git。

## 普通备份

在“数据”页选择“创建并下载备份”。下载的 `.pwbk` 是受控 ZIP，只包含：

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
服务并确认 8790 不再响应，再运行：

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
- `.workbench.lock` 只在能确认对应进程已结束时才处理；格式损坏的锁默认按“仍在使用”拒绝，
  不应盲删。

## 数据库与性能检查

```powershell
npm run db:migrate
npm run performance:audit -- --output docs/reports/performance-audit.json
```

性能审计只在系统临时目录生成 10,000 任务、10,000 小记和 1,000 视频，运行常用页面查询与
`EXPLAIN QUERY PLAN`，结束后删除 fixture。报告不含业务标题、正文或凭据。

## 故障处理

- `Workbench data directory is already in use`：停止另一个 server/restore，确认进程退出后重试。
- migration checksum mismatch：不要修改历史 SQL；从代码与数据的匹配版本启动，或先恢复备份。
- backup/restore validation failed：保留原文件，重新生成备份；不要用解压重打包来绕过校验。
- B站凭据错误：任务、小记和学习库仍可离线使用；清除并重新捕获凭据，不要写入 settings。

## 最终切换与保留

正式切换前必须完成 `npm ci`、`npm run check:all`、真实 Personal/qoder 对账、一次真实恢复、
3–7 天并行使用和用户核心工作流确认。两个旧项目切换后至少保留 30 天，只读且可回退；未经
确认不得删除、移动或修改旧数据。
