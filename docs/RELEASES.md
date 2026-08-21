# 桌面发布版本台账

本文件是桌面安装包的版本控制记录：安装包二进制不进入 Git（避免仓库膨胀），
分发源是 GitHub Releases；每个版本在此登记变更摘要与 SHA-256 校验和，用于
验证下载或本地归档的安装包是否完好。本地归档按版本存放在
`apps/desktop/release/v<version>/`（不入库），构建时由
`apps/desktop/scripts/dist.mjs` 自动生成同目录 `SHA256SUMS.txt`。

发版流程见 `docs/OPERATIONS.md` 的"桌面应用发布"一节。版本号规则：语义化
X.Y.Z——修 bug 升 patch、加功能或数据库 schema 变更升 minor、不兼容改动升
major；正式切换验收完成前保持 0.x。

## v0.1.0（2026-08-21）

首个桌面版本。Electron 壳内嵌正式 Express 服务与静态页面（ADR 0007），单实例
窗口；NSIS 向导式安装（可选安装位置、卸载保留用户数据）与便携版两种产物。

- 变更基线：commit `2177c3d`（feat: add Electron desktop shell）
- 修复记录：asar 内 DPAPI 脚本外部进程不可读（asarUnpack）；生产模式 origin
  guard 放行同源静态资源
- GitHub Release：<https://github.com/quexing65/workbench/releases/tag/v0.1.0>

| 产物                                 | SHA-256                                                            |
| ------------------------------------ | ------------------------------------------------------------------ |
| PersonalWorkbench-Setup-0.1.0.exe    | `a6ea5de4b5d1cc19afef43cb60e1d61352f4cdb23d83f3ade3960cc439b1d333` |
| PersonalWorkbench-Portable-0.1.0.exe | `f21ae82a9c23bad0a686af865e1400ddbc36f38c8d6fd65ea92b78dff3d8f5d0` |

注意：NSIS 打包非确定性（内嵌时间戳），同代码重新构建字节会不同；本表以
`apps/desktop/release/v0.1.0/` 归档产物及其 `SHA256SUMS.txt` 为准。若 GitHub Release
上是更早的构建（哈希不符），重新上传该目录的两个 exe 即可对齐。

应用未做代码签名，首次运行 Windows SmartScreen 会提示未知发布者，
"更多信息 → 仍要运行"即可；也可用上表校验和确认文件未被篡改。
