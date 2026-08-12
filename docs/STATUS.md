# vNext 实施状态

## 当前阶段

- 阶段：0
- 状态：完成
- 最后更新：2026-08-13

## 阶段状态

| 阶段 | 内容 | 状态 | 验收提交 |
|---:|---|---|---|
| 0 | 决策基线 | 完成 | 本基线提交，主题 `chore: establish vNext execution baseline` |
| 1 | Monorepo 骨架 | 未开始 | |
| 2 | SQLite/migration | 未开始 | |
| 3 | 任务/固定任务/小记 | 未开始 | |
| 4 | 产品壳/总览/回顾 | 未开始 | |
| 5 | B站学习模型 | 未开始 | |
| 6 | 凭据/CDP/同步 | 未开始 | |
| 7 | 旧数据导入 | 未开始 | |
| 8 | 备份/恢复/切换 | 未开始 | |

## 本阶段变更

- 创建独立 vNext Git 仓库和 main 分支。
- 复制完整执行规范到根目录。
- 建立架构、数据模型、安全和旧项目只读基线文档。
- 建立 5 份 Accepted ADR。
- 建立 `.gitignore`、`.env.example` 和 `.node-version`。
- 记录两个旧项目的 Git 状态和关键文件 SHA-256。

## 验证结果

| 命令/检查 | 结果 | 测试数/备注 |
|---|---|---|
| npm run format:check | N/A | 阶段 1 建立工具链 |
| npm run lint | N/A | 阶段 1 建立工具链 |
| npm run typecheck | N/A | 阶段 1 建立工具链 |
| npm run test:coverage | N/A | 阶段 1/3 建立并启用 |
| npm run build | N/A | 阶段 1 建立应用骨架 |
| npm run test:e2e | N/A | 阶段 1/4 建立并启用 |
| 必需文件检查 | 通过 | 13 项计划要求文件及 4 项支撑文件齐全（共 17 项） |
| EXECUTION_PLAN SHA-256 | 通过 | `b97d1cec605718a924ce0b85ee729832686f4bda5ded64d9a78d22021e53b82b` |
| symlink/junction 扫描 | 通过 | 0 个 |
| 旧路径 runtime 引用扫描 | 通过 | 0 个 |
| 敏感/运行时数据文件扫描 | 通过 | 0 个数据库、凭据或 Cookie 文件 |
| legacy SHA manifest | 通过 | 20 个关键源文件全部匹配 |
| 旧项目状态复核 | 通过 | Personal HEAD/status 未变；qoder 仍无 Git |
| git diff --cached --check | 通过 | 提交前暂存区无非预期空白错误 |

## 数据迁移

- 新增 migration：无
- schema version：0
- 真实数据导入：无

## 未完成项

- 下一阶段：阶段 1 Monorepo 可运行骨架；本阶段不提前实施。

## 已知风险

- qoder 不含 Git 元数据，只能依靠关键文件 hash 证明未修改。
- Personal 基线原本不是完全干净，已有未跟踪执行规范；验收以“前后状态相同”为准。
- 阶段 0 尚无 package.json 和工具链，npm 质量命令不可用属于预期。

## 旧项目状态

- Personal-Workbench 被修改：否
- Personl-Workbench-qoder 被修改：否
