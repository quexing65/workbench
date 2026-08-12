# 旧项目只读基线

- 记录日期：2026-08-13
- 运行环境：Node v24.18.0；npm 11.16.0
- 目的：证明 vNext 初始化和后续迁移没有修改两个旧项目

## Personal-Workbench

- 路径：`E:\Workspace\Personal-Workbench`
- Git：存在；branch `main`
- HEAD：`3f2ebf38a1609625dee62163b9af0f0f6128d81e`
- HEAD subject：`Add recurring fixed tasks`
- Remote：未配置
- 初始状态：仅有 `?? docs/personal-workbench-vnext-execution.md`
- 说明：该执行规范是本次创建 vNext 前已有的未跟踪文件；旧仓库并非完全干净。阶段验收要求前后状态相同，不能删除、提交或修改该文件。
- 源执行规范 SHA-256：`b97d1cec605718a924ce0b85ee729832686f4bda5ded64d9a78d22021e53b82b`

## Personl-Workbench-qoder

- 路径：`E:\Workspace\Personl-Workbench-qoder`
- Git：`NO_GIT_METADATA`，无法记录 branch/commit/status
- 保护方式：使用 `docs/legacy-source.sha256` 复核关键源码与锁文件
- 旧数据库：`server/data/workbench.db`，阶段 0 观察时为 94,208 bytes；SHA-256
  `ae8e79700fe53bec0557720c1c00d68e5b60795694495202364d49dad4517b7e`
- 安全说明：旧数据库可能包含 SESSDATA，因此只记录大小和 hash，绝不复制进本仓库或 Git。

## 验收原则

- 两个来源只读；
- vNext 中不存在指向旧目录的 symlink、junction、workspace 或运行时 import；
- 文档中出现旧路径属于说明，不算运行时依赖；
- Personal 的 HEAD/status 和 qoder 关键文件 hash 必须与本基线一致；
- 旧数据库本身不纳入源码 hash manifest，也不复制到 vNext。
