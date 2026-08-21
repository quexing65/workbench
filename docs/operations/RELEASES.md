# 桌面发布版本台账

本文件是桌面安装包的版本控制记录：安装包二进制不进入 Git（避免仓库膨胀），
分发源是 GitHub Releases；每个版本在此登记变更摘要与 SHA-256 校验和，用于
验证下载或本地归档的安装包是否完好。本地归档按版本存放在
`apps/desktop/release/v<version>/`（不入库），构建时由
`apps/desktop/scripts/dist.mjs` 自动生成同目录 `SHA256SUMS.txt`。

发版流程见 `docs/operations/OPERATIONS.md` 的"桌面应用发布"一节。版本号规则：语义化
X.Y.Z——修 bug 升 patch、加功能或数据库 schema 变更升 minor、不兼容改动升
major；阶段 8 验收通过、正式切换完成后升 1.0。

## v1.0.0（2026-08-21）

正式版。阶段 8 全部门槛通过（工程实现、远程 CI、桌面分发、7 天并行使用、用户确认），
vNext 正式上线；用户 quexing65 主动取消旧项目 30 天保留期，立即发布。

- 变更基线：commit `6037fc6`（chore: final acceptance passed, bump version to 1.0.0；与 tag `v1.0.0` 一致）
- 配套文档提交：`22e9b20`（取消保留期并宣布 GA）+ 本次 RELEASES.md 登记
- GitHub Release：<https://github.com/quexing65/workbench/releases/tag/v1.0.0>

| 产物                                 | SHA-256                                                            |
| ------------------------------------ | ------------------------------------------------------------------ |
| PersonalWorkbench-Setup-1.0.0.exe    | `aaa10d89d7973d6033e38f412b64b4d40428570f96444c492c8e9e846845d07f` |
| PersonalWorkbench-Portable-1.0.0.exe | `2d68a563414535bbbbce00afeed90074924044f1d9cdf1f9c0c671eb261d1a5b` |

注意：NSIS 打包非确定性（内嵌时间戳），同代码重新构建字节会不同；本表以
`apps/desktop/release/v1.0.0/` 归档产物及其 `SHA256SUMS.txt` 为准。若 GitHub Release
上是更早的构建（哈希不符），重新上传该目录的两个 exe 即可对齐。

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
