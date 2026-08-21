# ADR 0007：使用 Electron 桌面壳分发本机应用

- Status: Accepted
- Date: 2026-08-21

## Context

vNext 的正式运行方式是本机 Node 服务在 `127.0.0.1:8790` 同源托管页面与 `/api/v1`，
用户需要手动执行命令并保持终端窗口。用户希望获得双击图标即可使用的桌面应用体验；
云端部署（Vercel 等）已评估并放弃，local-first 约束不变。ARCHITECTURE 原始非目标中的
“Electron”指第一版不做，本 ADR 正式修订该边界。

## Decision

新增 `apps/desktop` Electron 壳：

- 主进程内嵌启动现有 Express 服务（复用 `loadConfig`、`openWorkbenchDatabase`、
  `acquireDataDirectoryLock`、`createApp`），不复制业务代码，不引入第二个后端。
- 生产数据目录仍为 `%LOCALAPPDATA%\PersonalWorkbenchVNext`，与 CLI 正式运行一致。
- 窗口加载 `http://127.0.0.1:8790`，沿用 loopback guard、安全头与同源约束；
  不开启 nodeIntegration，`contextIsolation` 与 `sandbox` 保持开启。
- 主进程用 esbuild 单文件打包 server 源码；migrations、`dpapi.ps1`、web dist
  作为显式资源随包分发，路径全部通过参数注入（`migrationDirectory`、
  `WindowsDpapiProtector(scriptPath)`、`webDistDirectory`），不依赖
  `import.meta.url` 相对默认值。
- 打包产物（NSIS 安装包、便携版）不入库，仅提交源码与配置。

## Alternatives considered

- 继续命令行启动 + 浏览器收藏：体验割裂，黑框终端易被误关。
- Edge `--app` 模式启动器：零依赖但无单实例控制、无启动失败反馈、无原生窗口生命周期。
- 云端部署：违背 ADR 0001 local-first 前提，serverless 文件系统不兼容 SQLite。
- Tauri：需 Rust 工具链且 Node sidecar 复杂，收益有限。

## Consequences

正面：双击即用、单实例、启动失败有原生对话框反馈；DPAPI 与 CDP 本地能力不受影响。
负面：安装包体积增加约 100MB；Electron 内置 Node 版本成为运行时约束（要求主版本 ≥24，
`main.ts` 启动时强制校验）；打包链新增 esbuild 与 electron-builder 步骤。

## Migration and rollback

首次使用桌面版时业务库为空：在旧运行方式下创建 `.pwbk` 备份，停服后按
`docs/operations/OPERATIONS.md` 用 `data:restore` 恢复到正式数据目录。回滚即卸载桌面壳，
CLI 启动方式不受任何影响。

## Testing and verification

`npm run check` 全量门禁不受影响；桌面壳验证包括：Electron 启动后
`GET /api/v1/health` 可用、`GET /api/v1/bili/credential/status` 可读
（证明打包内 DPAPI 脚本路径注入正确）、单实例锁生效、NSIS/portable 产物生成。

## Related

ARCHITECTURE.md 运行拓扑、ADR 0001、ADR 0004、`docs/operations/OPERATIONS.md`。
