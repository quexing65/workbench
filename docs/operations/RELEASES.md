# 桌面发布版本台账

本文件是桌面安装包的版本控制记录：安装包二进制不进入 Git（避免仓库膨胀），
分发源是 GitHub Releases；每个版本在此登记变更摘要与 SHA-256 校验和，用于
验证下载或本地归档的安装包是否完好。本地归档按版本存放在
`apps/desktop/release/v<version>/`（不入库），构建时由
`apps/desktop/scripts/dist.mjs` 自动生成同目录 `SHA256SUMS.txt`。

发版流程见 `docs/operations/OPERATIONS.md` 的"桌面应用发布"一节。版本号规则：语义化
X.Y.Z——修 bug 升 patch、加功能或数据库 schema 变更升 minor、不兼容改动升
major；阶段 8 验收通过、正式切换完成后升 1.0。

## v1.4.0（2026-09-03）

次要版。总览与回顾呈现改版、侧边栏三档自适应（无数据库 schema 变更，可直接覆盖
安装）：总览页全部重排——今日焦点全宽主卡、近 26 周滚动窗口贡献轨迹（与回顾页
共用泛化后的 ContributionHeatmap）、过期待办/继续学习/最近小记三列辅助，「轻量
回望」近 7 天柱状图退役；回顾页年度贡献下方移除每日明细表，年内无数据日期（未来
日子）与无任务格子同样渲染，整年网格完整可读。侧边栏按宽度三档自适应：宽档完整
侧栏可手动折叠，641–1100px 自动收窄为纯图标栏（底部状态只留圆点，修复文字竖排
溢出），不超过 640px 时收进屏外，由左侧淡色把手呼出抽屉（遮罩、Esc、选路自动
收起）。配套修复性能审计脚本适配年份选择器交互，并补齐贡献图滚动区域键盘可达性。

- 功能提交：`8b785dc`（feat(web): 贡献图贯穿总览与回顾页）、`8a65d8d`（feat(web): 侧边栏按宽度三档自适应）
- 变更基线：commit `a1d9e06`（chore: 更新版本号至 1.4.0）；tag `v1.4.0` 打在 `fb8dd16`（CI 全绿点，应用代码与基线一致）
- GitHub Release：<https://github.com/quexing65/workbench/releases/tag/v1.4.0>

| 产物                                 | SHA-256                                                            |
| ------------------------------------ | ------------------------------------------------------------------ |
| PersonalWorkbench-Setup-1.4.0.exe    | `d8895f2095a477020b49e9bd13d233f4c3524c730aba1814248ceabe9adcadbb` |
| PersonalWorkbench-Portable-1.4.0.exe | `dedb559aecec91cf975068b7110faa5e53fe6887f1a130050ffdaeab3fbf2c29` |

注意：NSIS 打包非确定性（内嵌时间戳），同代码重新构建字节会不同；本表以
`apps/desktop/release/v1.4.0/` 归档产物及其 `SHA256SUMS.txt` 为准。若 GitHub Release
上是更早的构建（哈希不符），重新上传该目录的两个 exe 即可对齐。

## v1.3.0（2026-08-27）

次要版。清单卡片体系重设计、导航图标语义升级与动效增强（无数据库 schema 变更，
可直接覆盖安装）：清单卡片改为状态条 + 紧凑单行布局（状态胶囊与标题同行、操作
按钮收至右侧），任务页与逾期页共用同一套 `.task-card` 结构，完成态标题划线降噪；
全站卡片统一悬停浮起与胶囊操作按钮，小记置顶卡加暖色侧条，空列表改为虚线框占位；
导航图标按语义换装（Phosphor 同库：总览/任务/小记/学习/回顾），滑块弹簧带回弹、
激活图标提亮；主内容区补 viewTransition 翻页过渡（尊重系统减动效偏好）。

- 功能提交：`e35fa48`（feat(web): 重设计清单卡片并升级图标动效）
- 变更基线：commit `bbbb663`（chore: 更新版本号至 1.3.0；与 tag `v1.3.0` 一致）
- GitHub Release：<https://github.com/quexing65/workbench/releases/tag/v1.3.0>

| 产物                                 | SHA-256                                                            |
| ------------------------------------ | ------------------------------------------------------------------ |
| PersonalWorkbench-Setup-1.3.0.exe    | `87bd76dc59bf54256641f300ce753feadbb9cb3ff078919d3ce436401973c540` |
| PersonalWorkbench-Portable-1.3.0.exe | `49961bc5f3b4eff01f15b712a412ebd3ff36e124558d65628c5d27dcf33e2882` |

注意：NSIS 打包非确定性（内嵌时间戳），同代码重新构建字节会不同；本表以
`apps/desktop/release/v1.3.0/` 归档产物及其 `SHA256SUMS.txt` 为准。若 GitHub Release
上是更早的构建（哈希不符），重新上传该目录的两个 exe 即可对齐。

## v1.2.1（2026-08-24）

补丁版。侧边栏交互与布局打磨（无功能、API 与数据库 schema 变更，可直接覆盖安装）：
W 徽标与收起按钮合一，悬停或键盘聚焦时 W 与方向箭头交叉淡化（展开态左箭头、
收起态右箭头）；修复收起侧边栏时品牌文字隐藏导致导航整体上移 28px 的跳动，
两态品牌区等高、导航纵向位置逐像素一致；删除"个人工作台"副标题，Workbench
与品牌区垂直居中。

- 功能提交：`0ffbdcf`（feat(web): 侧边栏品牌区与收起按钮合一）
- 变更基线：commit `5c25186`（chore: bump version to 1.2.1；与 tag `v1.2.1` 一致）
- GitHub Release：<https://github.com/quexing65/workbench/releases/tag/v1.2.1>

| 产物                                 | SHA-256                                                            |
| ------------------------------------ | ------------------------------------------------------------------ |
| PersonalWorkbench-Setup-1.2.1.exe    | `d7ba68f0bdc5831573288a1350469578c2ede900644408c807666a70b76ce0a8` |
| PersonalWorkbench-Portable-1.2.1.exe | `72cb544eb8c92fdf03e4ac04f4e3cc92310b67d6b935b424f4d986795eab9326` |

注意：NSIS 打包非确定性（内嵌时间戳），同代码重新构建字节会不同；本表以
`apps/desktop/release/v1.2.1/` 归档产物及其 `SHA256SUMS.txt` 为准。若 GitHub Release
上是更早的构建（哈希不符），重新上传该目录的两个 exe 即可对齐。

## v1.2.0（2026-08-24）

次要版。界面改版与动效增强（无数据库 schema 变更，可直接覆盖安装）：视觉切换为
极简生产力风格（浅灰白画布、纯白卡片、1px 细线分层、去衬线标题，保留深绿侧栏与
品牌绿），设计令牌全面重构；Inter Variable + Noto Sans SC + JetBrains Mono 全部
本地打包（产物增大约 5MB）；侧边栏启用 Phosphor 线稿/填充双态图标与弹簧滑动指示条，
列表接入 auto-animate 增删动效，页面切换启用 viewTransition（均尊重系统减动效偏好）。
e2e 新增端口占用守卫（防测试数据写入真实库）与备用端口并行运行支持。

- 改版基线：merge commit `b63bf00`（feat: 合并界面改版；阶段明细见 `docs/plan/ui-redesign-plan.md`）
- 变更基线：commit `e9614f3`（chore: bump version to 1.2.0；与 tag `v1.2.0` 一致）
- GitHub Release：<https://github.com/quexing65/workbench/releases/tag/v1.2.0>

| 产物                                 | SHA-256                                                            |
| ------------------------------------ | ------------------------------------------------------------------ |
| PersonalWorkbench-Setup-1.2.0.exe    | `8e1c489381e8bfee7279adff42488a83b46317cec039159ff8ba180e088238ff` |
| PersonalWorkbench-Portable-1.2.0.exe | `86a2979ec880c92160a594a94b50aa9cdc0b4436fa2ec8b077df7a09b7f86a17` |

注意：NSIS 打包非确定性（内嵌时间戳），同代码重新构建字节会不同；本表以
`apps/desktop/release/v1.2.0/` 归档产物及其 `SHA256SUMS.txt` 为准。若 GitHub Release
上是更早的构建（哈希不符），重新上传该目录的两个 exe 即可对齐。

## v1.1.0（2026-08-23）

次要版。移除遗留数据导入功能（minor 功能移除，无数据库 schema 变更，可直接覆盖安装）：
qoder 脱敏数据已两次导入并验证幂等、Personal 旧项目已于终验时声明弃用，一次性迁移
引擎完成使命后退役（`f1c648a`，净删约 5,900 行）。数据页仅保留备份下载；
`/api/v1/data/imports` 端点与 `import:*`、`qoder:sanitize` 脚本一并移除，
imports 的 90%/95% 覆盖率阈值随模块删除。桌面壳沿用 v1.0.1 的内存优化。

- 功能移除提交：`f1c648a`（refactor: retire legacy imports module）
- 变更基线：commit `e0d4996`（chore: bump version to 1.1.0；与 tag `v1.1.0` 一致）
- GitHub Release：<https://github.com/quexing65/workbench/releases/tag/v1.1.0>

| 产物                                 | SHA-256                                                            |
| ------------------------------------ | ------------------------------------------------------------------ |
| PersonalWorkbench-Setup-1.1.0.exe    | `f953f2c8dc98418544dbc7eb3be0a363b382a372642a06055080d6686ea23a56` |
| PersonalWorkbench-Portable-1.1.0.exe | `d46e8b1042b194165b1ecc64a3dd2bf706ab29e7eb02a5e53ecc5e2546be5f97` |

注意：NSIS 打包非确定性（内嵌时间戳），同代码重新构建字节会不同；本表以
`apps/desktop/release/v1.1.0/` 归档产物及其 `SHA256SUMS.txt` 为准。若 GitHub Release
上是更早的构建（哈希不符），重新上传该目录的两个 exe 即可对齐。

## v1.0.1（2026-08-23）

补丁版。桌面壳内存优化，无功能、API 与数据库 schema 变更，可直接覆盖安装：
窗口默认软件渲染（GPU 进程约 140MB → 80MB，四进程总内存约 398MB → 345MB，实测；
掉帧时可设 `WORKBENCH_SOFTWARE_RENDERING=false` 恢复硬件加速）、关闭纯中文界面
用不上的内置拼写检查。

- 优化提交：`08f7e49`（perf(desktop): enable software rendering and disable spellcheck to cut memory）
- 变更基线：commit `ad16ce5`（chore: bump version to 1.0.1；与 tag `v1.0.1` 一致）
- GitHub Release：<https://github.com/quexing65/workbench/releases/tag/v1.0.1>

| 产物                                 | SHA-256                                                            |
| ------------------------------------ | ------------------------------------------------------------------ |
| PersonalWorkbench-Setup-1.0.1.exe    | `5d6be8e9ee8902b63ce139df4d140728988fdad78f2287d69c942708ad12d1bd` |
| PersonalWorkbench-Portable-1.0.1.exe | `f078ed25c18964d256f078efe47bb0be107b38bb54c2bc4135cb0a392a0deb52` |

注意：NSIS 打包非确定性（内嵌时间戳），同代码重新构建字节会不同；本表以
`apps/desktop/release/v1.0.1/` 归档产物及其 `SHA256SUMS.txt` 为准。若 GitHub Release
上是更早的构建（哈希不符），重新上传该目录的两个 exe 即可对齐。

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
