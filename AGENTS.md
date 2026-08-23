# AGENTS.md

供 AI 编程助手读取的项目约定。本文件被 git 跟踪，对所有人所有工具生效。

## Git 提交信息规范

采用 Conventional Commits 混合式风格：type 与 scope 用英文关键字，描述用中文。
本文件是此规范的唯一来源；`.trae/rules/project_rules.md` 仅是指向此处的指针（供 Trae 定位），规则变更只需改这里。

### 格式

```
<type>(<scope>): <中文描述>
```

### type 取值

| type     | 含义                       |
| -------- | -------------------------- |
| feat     | 新功能                     |
| fix      | 缺陷修复                   |
| docs     | 仅文档变更                 |
| style    | 代码格式调整（不影响逻辑） |
| refactor | 重构（非新增也非修复）     |
| perf     | 性能优化                   |
| test     | 测试相关                   |
| build    | 构建系统或依赖变更         |
| ci       | CI 配置变更                |
| chore    | 杂项维护                   |
| revert   | 回滚提交                   |

### 书写要求

- 描述使用中文祈使句，说明"做了什么"，不以句号结尾
- 首行不超过 25 个汉字（对应英文 50 字符显示宽度）
- 如需正文：首行后空一行，每行不超过 36 个汉字；正文解释"为什么改"，而非复述改动内容
- 不兼容变更在 type 后加 `!`（如 `feat!:`），并在正文中以 `BREAKING CHANGE:` 开头说明
- scope 可选，常用值：server、desktop、web、shared、docs、ci

### 示例

```
fix(server): 修复健康接口版本号硬编码导致的版本脱节

桌面壳改为注入 app.getVersion()，独立服务向上查找最近的 package.json，
使开发与打包产物的健康检查都能报告真实版本。
```
