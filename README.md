# Personal Workbench vNext

一个 local-first 个人工作台：任务、固定任务、小记、总览、回顾与 B站学习。
所有数据保存在你自己的电脑上（SQLite），不依赖任何云服务。

- 下载安装：见下方「下载与安装」
- 连接 B站同步学习记录：见「连接 B站」教程
- 从源码构建开发：见「从源码运行」

## 下载与安装

所有安装包都通过 GitHub Releases 分发：

<https://github.com/quexing65/workbench/releases>

每个版本提供两种产物，功能完全一致：

| 产物                                    | 说明                                                                          |
| --------------------------------------- | ----------------------------------------------------------------------------- |
| `PersonalWorkbench-Setup-<版本>.exe`    | 安装版。NSIS 向导式安装，可选安装位置，创建开始菜单快捷方式，卸载不会删除数据 |
| `PersonalWorkbench-Portable-<版本>.exe` | 便携版。双击即用，不写注册表，适合 U 盘 / 免安装场景                          |

安装说明：

- 系统要求：Windows 10/11（64 位）
- 应用未做代码签名，首次运行 Windows SmartScreen 会提示"未知发布者"：
  点击**更多信息 → 仍要运行**即可
- 可用版本台账（[docs/RELEASES.md](docs/RELEASES.md)）中的 SHA-256 校验安装包完整性
- 卸载后用户数据仍保留在数据目录（见下），可随时重装继续使用

## 数据保存在哪

正式数据目录固定为：

```text
%LOCALAPPDATA%\PersonalWorkbenchVNext
```

（在资源管理器地址栏直接粘贴上面的路径回车即可打开。）

目录内包含业务数据库（`data/workbench.sqlite`）、加密的 B站凭据
（`credentials/credentials.bin`）和备份（`backups/`）。不要手工编辑或复制
正在运行中的数据库文件，备份请通过应用内"数据"页完成。

## 连接 B站（获取 SESSDATA 教程）

连接后，应用可以同步你的 B站观看记录到"学习"页。连接需要你从浏览器复制
一份 B站的登录凭证（`SESSDATA` Cookie），步骤如下：

1. 用 Edge 或 Chrome 打开并登录 <https://www.bilibili.com>
2. 按 `F12` 打开开发者工具
3. 切换到顶部**「应用程序」**（Application）标签；
   若看不到，点击 `>>` 展开更多标签
4. 在左侧展开**「存储」→「Cookie」**，点击 `https://www.bilibili.com`
5. 在 Cookie 列表中找到名为 `SESSDATA` 的行，双击**「值」**列，
   全选复制（一长串字符，不要带引号）
6. 回到本应用的**「学习」页 → 「B站连接」**，粘贴到
   「手工录入 SESSDATA」输入框，点击**「验证并安全保存」**
7. 右上角状态变为已连接即成功，之后无需重复录入

关于安全：

- SESSDATA 验证后使用 Windows DPAPI（当前用户）加密保存在本机
  `credentials/credentials.bin`，不进入数据库、日志或备份
- 想断开连接：学习页点击「清除本机登录态」
- B站登录态过期或换电脑/换 Windows 用户后，需要重新录入一次
- 录入的 SESSDATA 等同于你的 B站登录态，请像保管密码一样保管，
  只粘贴进本应用，不要发给他人

## 数据备份与迁移

- **创建备份**：应用内「数据」页 →「创建并下载备份」，得到 `.pwbk` 备份文件，
  建议保存到独立磁盘
- **恢复备份**：先退出应用，然后运行
  `npm run data:restore -- --file '<备份文件>.pwbk'`
  （详见 [docs/OPERATIONS.md](docs/OPERATIONS.md)）
- B站凭据不在备份内；换机后需按上节教程重新连接

## 从源码运行

开发模式（Web 监听 `127.0.0.1:5190`，API 监听 `127.0.0.1:8790`，要求 Node 24）：

```powershell
npm ci
npm run dev
```

开发模式数据在 `apps/server/.local`，与桌面正式数据目录互不影响。

构建桌面安装包（NSIS 安装版 + 便携版，产物归档在
`apps/desktop/release/v<version>/`，含自动生成的 `SHA256SUMS.txt`）：

```powershell
npm run desktop:dist
```

发版流程（打 tag → GitHub Release → 登记台账）见
[docs/OPERATIONS.md](docs/OPERATIONS.md)。

## 仓库结构

- `apps/web`：React SPA（总览/任务/小记/学习/回顾/数据页面）
- `apps/server`：Express + SQLite（`node:sqlite`），唯一业务后端
- `apps/desktop`：Electron 桌面壳（esbuild 单文件打包 + electron-builder）
- `packages/shared`：前后端共享契约（Zod）与纯领域逻辑
- `tests/e2e`：跨前后端端到端与视觉回归测试

开始开发前必须阅读：

- `EXECUTION_PLAN.md`
- `docs/STATUS.md`
- `docs/ARCHITECTURE.md`
- `docs/PROJECT_STRUCTURE.md`
- `docs/DATA_MODEL.md`
- `docs/SECURITY.md`
- `docs/OPERATIONS.md`
- `docs/MIGRATION_GUIDE.md`
- `docs/RELEASES.md`
- `docs/FINAL_ACCEPTANCE.md`

## 当前状态与核心原则

当前状态：阶段 8（备份/恢复/最终切换）工程实现与自动验收完成；真实 Personal 导出、
远程 Windows CI、3–7 天并行运行与用户核心工作流确认完成前，不宣布最终切换。
桌面分发已通过 Electron 壳落地（ADR 0007）。

核心原则：SQLite 是唯一业务数据源；本机 Node 服务是唯一后端；浏览器只通过
`/api/v1` 读写业务数据；B站凭据不进入 SQLite、日志、API 响应或普通备份。
