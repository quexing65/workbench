# 旧项目迁移指南

## 原则

Personal JSON 与 qoder SQLite 都先 preflight，再审阅 machine-readable 报告，最后显式 apply。
来源永远只读，缺行不等于删除；apply 前创建一致快照并在单事务中写入。导入是合并，
`data:restore` 是整库时间点替换，两者不能混用。

本文只覆盖"旧项目数据 → vNext"。开发数据目录与桌面正式数据目录之间的迁移（`.local` ↔
`%LOCALAPPDATA%\PersonalWorkbenchVNext`）见 `docs/OPERATIONS.md`"跨数据目录迁移"。

真实迁移建议始终使用一个新的 vNext 数据目录演练，确认后再切换正式目录。旧项目至少保留
30 天，不把旧目录加入 workspace、symlink 或运行时依赖。

## Personal JSON

先在旧 Personal 页面导出 v1/v2/v3 JSON。不要把仓库内的 `package.json` 等配置文件当作业务
导出。只读预检：

```powershell
npm run import:personal -- --file 'D:\Export\personal-backup.json' --dry-run
```

核对 fatal/warnings/conflicts、每类 read/add/update/unchanged/reject、固定任务边界、多P链接、
tombstone 和 source SHA-256。CLI dry-run 保存短期 run 后按输出 runId 应用：

```powershell
npm run import:apply -- --run '<run-id>'
```

也可以在“数据”页上传、预检并勾选确认。相同来源第二次导入应为 0 added、0 conflict、全部
unchanged。若源与 vNext 同时修改，默认保留 vNext 并报告 conflict。

## qoder SQLite

不要在旧 qoder 服务运行且存在 WAL 时直接复制主库。先停止旧服务并制作一致只读快照，再明确
来源时区：

```powershell
npm run import:qoder -- --file 'D:\Export\workbench.db' --source-timezone Asia/Shanghai --dry-run
npm run import:apply -- --run '<run-id>'
```

检查器只接受已知 table/column allowlist，验证 SQLite magic、大小、页数、行数、integrity、
foreign keys、状态、日期、pages_json、系列关系、BVID 与进度范围。`bili_sessdata` 只报告
detected=true/migrated=false；不会读取、显示或迁移其值。`bili_browser` 仅允许 edge/chrome。

需要给演练或审计人员准备脱敏副本时，使用：

```powershell
npm run qoder:sanitize -- `
  --source 'D:\Export\workbench.db' `
  --output 'D:\Temp\qoder-sanitized.sqlite' `
  --source-timezone Asia/Shanghai
```

该命令只复制 allowlist 业务列，settings 只 SELECT/复制允许的 `bili_browser`；目标生成后再通过
同一只读检查器确认 credentialsDetected=false。脱敏副本仍含个人任务、笔记或视频标题时应按
个人数据保护，演练结束删除，不提交 Git。

## 对账与抽样

每个来源至少保存 preflight/apply 报告，并复核：

- 源文件 SHA-256 导入前后不变；
- `integrity_check=ok`、`foreign_key_check` 为空；
- 10 个任务、10 条小记、所有固定任务边界和所有多P视频；
- 完成、取消、重置各一例；furthest 不退，resume 可回退，旧历史不跨 manual override；
- 重复导入为 no-op；冲突未静默覆盖本地；凭据 migrated 始终 false。

阶段 8 已完成真实旧 qoder 的临时脱敏演练，报告见
`docs/reports/qoder-rehearsal.json`。当前 Personal 仓库没有真实业务导出文件；用户提供导出并完成
上述演练前，不得把阶段 8 标记完成。

## 切换与回退

1. 从 vNext 数据页下载 `.pwbk` 并执行一次“备份→修改测试库→停服恢复→逻辑 checksum 回归”。
2. 并行使用旧项目和 vNext 3–7 天，记录缺失工作流和差异。
3. 用户确认每日任务、固定任务、小记、总览、回顾、单/多P学习、系列、同步、备份恢复均可用。
4. 切换后旧项目保持只读至少 30 天。
5. 需要回退时停止 vNext，按 `docs/OPERATIONS.md` 恢复 pre-restore `.pwbk`，或暂时继续使用旧项目；
   不删除 vNext 数据，不反向写旧库。
