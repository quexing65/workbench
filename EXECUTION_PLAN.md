# Personal Workbench vNext 重建执行规范

> 目标路径：`E:\Workspace\Personal-Workbench-vNext`  
> 本文件在新项目中的最终文件名：`EXECUTION_PLAN.md`  
> 文档状态：实施基线（Baseline）  
> 制定日期：2026-08-13  
> 默认时区：`Asia/Shanghai`

---

## 0. 如何使用这份文件

本文件不是建议清单，而是新项目的实施合同。创建
`E:\Workspace\Personal-Workbench-vNext` 后，把本文件复制到新项目根目录并重命名为
`EXECUTION_PLAN.md`。

之后每次让 Codex 或其他开发者继续工作时，只执行一个阶段：

1. 先完整阅读 `EXECUTION_PLAN.md` 和 `docs/STATUS.md`。
2. 检查当前 Git 状态、当前阶段和已经通过的验收项。
3. 只读查看两个旧项目中与本阶段有关的源码。
4. 只实现当前阶段，不顺带实现后续功能。
5. 运行当前阶段规定的全部检查。
6. 将结果、测试数量、风险和下一步写入 `docs/STATUS.md`。
7. 当前阶段验收全部通过后才允许进入下一阶段。

如果实现过程中需要改变本文件的架构决定，必须先新增 ADR（架构决策记录），说明：

- 为什么原决定无法继续；
- 考虑过哪些替代方案；
- 数据迁移、回滚和测试影响；
- 最终选择及日期。

未经 ADR，不得临时更换技术栈、数据语义或备份格式。

### 后续任务的固定提示词

把下面内容交给编码代理，并把 `[阶段编号]` 替换为实际阶段：

```text
请完整阅读根目录 EXECUTION_PLAN.md 和 docs/STATUS.md，只执行阶段 [阶段编号]。
两个旧项目仅可只读参考，不得修改：
- E:\Workspace\Personal-Workbench
- E:\Workspace\Personl-Workbench-qoder

开始前列出本阶段预计修改的模块；完成后运行该阶段全部验收命令，更新
docs/STATUS.md，并报告修改文件、迁移、测试结果、未完成项和风险。
不要提前实现后续阶段。
```

---

## 1. 最终目标和边界

在全新目录中建立一个 local-first 个人工作台：

- 产品结构和体验以 `Personal-Workbench` 为参考；
- SQLite、B站、分P、进度和本机能力以 `Personl-Workbench-qoder` 为参考；
- 新项目不把任一旧项目作为运行时依赖；
- 两个旧项目只作为只读源码来源和一次性数据迁移来源；
- 新项目完成前，两个旧项目必须继续可运行。

### 1.1 不可更改的核心约束

1. SQLite 是唯一业务数据源。
2. 本机 Node 服务是唯一后端和业务入口。
3. 浏览器只能通过 `/api/v1` 访问业务数据。
4. `localStorage` 只能保存主题、折叠状态等非业务偏好。
5. 前端、API、SQLite、日志和普通备份中都不得出现明文 SESSDATA。
6. 所有正式 SQL schema 变更必须通过不可变的编号迁移完成。
7. 所有写操作必须有失败状态；UI 不得在 API 失败时假装成功。
8. 两个旧项目永远只读；导入成功后也不自动删除旧数据。

### 1.2 第一版明确不做

- 云同步、D1、R2、账号系统和多人协作；
- Electron、手机原生应用或浏览器扩展；
- 公网监听、远程访问和局域网共享；
- 任意网站学习追踪；第一版只支持 B 站；
- 后台常驻系统服务和自动更新；
- 把两个旧项目的全部文件直接复制进新项目；
- 在正式导入前双写 localStorage 与 SQLite。

### 1.3 完成定义

只有同时满足以下条件，vNext 才算完成：

- 全新克隆后 `npm ci` 和 `npm run check:all` 通过；
- 可完成每日任务、固定任务、小记、总览、回顾和完整 B站学习流程；
- 刷新页面、重启服务后数据不丢失；
- B站同步支持单P、多P、系列、最远进度和真实续播位置；
- 普通备份不包含登录凭据，并完成过真实恢复演练；
- Personal JSON 与 qoder SQLite 都能先 dry-run，再事务导入并生成对账报告；
- 相同来源第二次导入为幂等 no-op；
- 桌面和移动端核心 E2E 通过；
- axe 没有 serious 或 critical 问题；
- 两个旧项目至少保留 30 天只读回退期。

---

## 2. 两个旧项目的职责

### 2.1 `E:\Workspace\Personal-Workbench`

只复用思想、界面结构和经过验证的纯逻辑，不照搬其运行时：

- 总览、任务、小记、学习、回顾、数据等信息架构；
- 固定任务“日期范围内每天出现，每天状态独立”的语义；
- 响应式、移动底栏、safe-area、焦点恢复和 reduced motion；
- 日期、统计、链接规范化等可验证纯函数；
- 数据边界校验、迁移测试和 tombstone 处理经验。

不得继承：

- localStorage 作为业务数据库；
- Vinext/Cloudflare 作为第一版本机运行时；
- 整个 `WorkbenchProvider` 的同步状态模型；
- 普通 `<a>` 全页刷新作为最终导航方案；
- 两套 CSS 规则叠加覆盖的组织方式。

### 2.2 `E:\Workspace\Personl-Workbench-qoder`

只迁移经过理解和测试的领域规则，不整块复制大文件：

- `node:sqlite`、WAL、一致快照和安全关闭经验；
- B站视频信息、历史同步、分P和系列；
- “最远学习进度”与“真实续播位置”分离；
- `override_at` 防止旧历史复活手动重置结果；
- CDP/Cookie 获取及浏览器限制处理；
- Host、Origin、参数校验和前端竞态保护经验。

不得继承：

- 明文 SESSDATA 写入 `settings`；
- 800 行单体服务端和 450 行单体学习组件；
- 没有 migration runner、自动测试和类型检查的结构；
- 直接把旧数据库当成新数据库继续写；
- 强制获取模式默认关闭或重启用户浏览器。

---

## 3. 固定技术方案

本机已确认可用：Node `24.18.0`、npm `11.16.0`、Git `2.55.0.windows.3`。

| 层级 | 固定选择 |
|---|---|
| 运行时 | Node.js 24.x |
| 包管理 | npm workspaces，提交唯一根 `package-lock.json` |
| 前端 | React + TypeScript + Vite |
| 路由 | React Router |
| 服务端状态 | TanStack Query |
| 后端 | Express + TypeScript |
| 数据库 | Node 内置 `node:sqlite` |
| 契约/校验 | Zod；共享 DTO 放 `packages/shared` |
| 日志 | Pino + 请求 ID + 强制脱敏 |
| 单元/集成测试 | Vitest |
| API 测试 | Supertest |
| UI 测试 | Testing Library |
| E2E | Playwright |
| 无障碍 | `@axe-core/playwright` |
| 静态检查 | ESLint，warning 为 0 |
| 格式化 | Prettier |
| 开发前端 | `127.0.0.1:5190` |
| 开发 API | `127.0.0.1:8790` |
| 正式运行 | Express 在 `127.0.0.1:8790` 同源托管 Web 与 `/api` |

所有 TypeScript 项目开启：

```json
{
  "strict": true,
  "noUncheckedIndexedAccess": true,
  "exactOptionalPropertyTypes": true,
  "noImplicitOverride": true,
  "useUnknownInCatchVariables": true
}
```

禁止无说明的 `any`、`@ts-ignore`、跳过测试和不受控类型断言。

---

## 4. 目标目录结构

```text
Personal-Workbench-vNext/
├─ .github/
│  └─ workflows/
│     └─ ci.yml
├─ apps/
│  ├─ web/
│  │  ├─ src/
│  │  │  ├─ app/
│  │  │  │  ├─ providers.tsx
│  │  │  │  └─ router.tsx
│  │  │  ├─ pages/
│  │  │  │  ├─ overview/
│  │  │  │  ├─ tasks/
│  │  │  │  ├─ recurring/
│  │  │  │  ├─ notes/
│  │  │  │  ├─ learning/
│  │  │  │  ├─ review/
│  │  │  │  └─ data/
│  │  │  ├─ features/
│  │  │  │  ├─ tasks/
│  │  │  │  ├─ recurring/
│  │  │  │  ├─ notes/
│  │  │  │  ├─ learning/
│  │  │  │  └─ data/
│  │  │  └─ shared/
│  │  │     ├─ api/
│  │  │     ├─ ui/
│  │  │     └─ lib/
│  │  └─ tests/
│  └─ server/
│     ├─ src/
│     │  ├─ index.ts
│     │  ├─ app.ts
│     │  ├─ config.ts
│     │  ├─ http/
│     │  │  ├─ errors.ts
│     │  │  ├─ origin-guard.ts
│     │  │  ├─ request-id.ts
│     │  │  └─ validation.ts
│     │  ├─ db/
│     │  │  ├─ connection.ts
│     │  │  ├─ migrate.ts
│     │  │  └─ migrations/
│     │  │     └─ 0001-initial.sql
│     │  ├─ modules/
│     │  │  ├─ tasks/
│     │  │  ├─ recurring/
│     │  │  ├─ notes/
│     │  │  ├─ overview/
│     │  │  ├─ review/
│     │  │  ├─ learning/
│     │  │  ├─ bili/
│     │  │  ├─ credentials/
│     │  │  ├─ imports/
│     │  │  └─ backups/
│     │  └─ jobs/
│     └─ tests/
│        ├─ unit/
│        ├─ integration/
│        └─ fixtures/
├─ packages/
│  └─ shared/
│     └─ src/
│        ├─ contracts/
│        ├─ domain/
│        └─ index.ts
├─ tests/
│  └─ e2e/
├─ docs/
│  ├─ ARCHITECTURE.md
│  ├─ DATA_MODEL.md
│  ├─ MIGRATION_GUIDE.md
│  ├─ SECURITY.md
│  ├─ STATUS.md
│  ├─ OPERATIONS.md
│  └─ adr/
├─ .env.example
├─ .gitignore
├─ .node-version
├─ eslint.config.js
├─ package.json
├─ package-lock.json
├─ playwright.config.ts
├─ tsconfig.base.json
├─ vitest.config.ts
└─ EXECUTION_PLAN.md
```

### 4.1 文件大小规则

- 生产源码目标少于 300 行；
- 超过 400 行必须拆分，或在 ADR 中说明不可拆原因；
- route 只负责 HTTP 适配，不写 SQL；
- repository 不引用 Express Request/Response；
- Bili client 不写数据库；
- 页面组件不直接调用裸 `fetch`；
- `packages/shared` 不依赖 React、Express 或 SQLite。

### 4.2 本地数据目录

开发环境：

```text
E:\Workspace\Personal-Workbench-vNext\.local\
```

稳定版运行时：

```text
%LOCALAPPDATA%\PersonalWorkbenchVNext\
```

至少包含：

```text
data/workbench.sqlite
credentials/credentials.bin
backups/
logs/
tmp/imports/
```

`.local/`、数据库、WAL、凭据、日志、真实备份、覆盖率和测试报告必须进入
`.gitignore`。测试必须使用系统临时目录，禁止读写真实数据目录。

---

## 5. 初始化命令和 workspace 约定

用户创建空目录后执行：

```powershell
Set-Location 'E:\Workspace\Personal-Workbench-vNext'
git init
npm init -y
New-Item -ItemType Directory -Force `
  'apps\server', `
  'packages\shared', `
  'tests\e2e', `
  'docs\adr', `
  '.github\workflows'
npm create vite@latest apps/web -- --template react-ts
```

三个 workspace 包名固定为：

- `@workbench/web`
- `@workbench/server`
- `@workbench/shared`

根 `package.json` 至少包含：

```json
{
  "name": "personal-workbench-vnext",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "engines": { "node": ">=24 <25" },
  "scripts": {
    "dev": "concurrently \"npm run dev -w @workbench/server\" \"npm run dev -w @workbench/web\"",
    "build": "npm run build -ws --if-present",
    "format": "prettier . --write",
    "format:check": "prettier . --check",
    "lint": "eslint . --max-warnings 0",
    "typecheck": "npm run typecheck -ws --if-present",
    "test": "npm run test -ws --if-present",
    "test:coverage": "npm run test:coverage -ws --if-present",
    "test:e2e": "playwright test",
    "check": "npm run format:check && npm run lint && npm run typecheck && npm run test && npm run build",
    "check:all": "npm run check && npm run test:e2e",
    "db:migrate": "npm run db:migrate -w @workbench/server",
    "import:personal": "npm run import:personal -w @workbench/server --",
    "import:qoder": "npm run import:qoder -w @workbench/server --",
    "import:apply": "npm run import:apply -w @workbench/server --",
    "data:restore": "npm run data:restore -w @workbench/server --"
  }
}
```

创建三个 workspace 的 `package.json` 后再安装依赖。至少需要：

```powershell
npm install -w @workbench/web `
  react react-dom react-router-dom @tanstack/react-query

npm install -w @workbench/server `
  express pino pino-http zod multer @workbench/shared

npm install -w @workbench/shared zod

npm install -D `
  typescript tsx concurrently prettier `
  eslint @eslint/js typescript-eslint eslint-plugin-react-hooks `
  vitest @vitest/coverage-v8 supertest @types/supertest `
  @types/node @types/express @types/multer `
  @testing-library/react @testing-library/jest-dom jsdom `
  @playwright/test @axe-core/playwright
```

依赖安装后必须提交根 `package-lock.json`，不得保留多个锁文件。

`.env.example` 固定为：

```dotenv
HOST=127.0.0.1
PORT=8790
WEB_DEV_ORIGIN=http://127.0.0.1:5190
WORKBENCH_DATA_DIR=./.local
APP_TIME_ZONE=Asia/Shanghai
LOG_LEVEL=info
BILI_SYNC_ENABLED=false
IMPORT_MAX_BYTES=52428800
```

不得在 `.env.example` 或任何启动命令中加入 SESSDATA。

---

## 6. 总体架构和调用边界

```text
React page
  → typed API client
  → TanStack Query
  → Express route
  → Zod request contract
  → domain service
  → repository / external adapter
  → SQLite / Bilibili / DPAPI
```

### 6.1 API 统一规则

- 所有 API 前缀为 `/api/v1`；
- 请求和响应 JSON 使用 camelCase；
- SQLite 列使用 snake_case；
- 数据库时间存 UTC epoch milliseconds；
- API 时间返回 ISO 8601 UTC 字符串；
- 业务日期始终为 `YYYY-MM-DD`，按 `APP_TIME_ZONE` 解释，不能做 UTC 换日；
- 时长统一为非负整数秒；
- 新实体 ID 使用服务端 `crypto.randomUUID()`；
- 可修改实体包含整数 `revision`；
- 更新必须携带当前 revision，冲突返回 HTTP 409；
- 创建返回 201，异步任务返回 202，删除成功返回 204；
- 列表返回对象而不是裸数组，方便将来扩展分页和元数据。

统一错误格式：

```json
{
  "error": {
    "code": "TASK_NOT_FOUND",
    "message": "任务不存在",
    "requestId": "c4d0...",
    "details": []
  }
}
```

`details` 只能包含可安全展示的字段错误，不得包含 SQL、Cookie、请求头或栈。

### 6.2 SQLite 启动配置

每次创建正式连接后执行并验证：

```sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA busy_timeout = 5000;
PRAGMA temp_store = MEMORY;
```

测试数据库也必须启用 `foreign_keys`。测试结束必须显式关闭连接。

### 6.3 Migration runner

迁移文件命名：

```text
0001-initial.sql
0002-add-xxx.sql
```

规则：

1. 按文件名升序执行；
2. 文件内容计算 SHA-256；
3. 已应用迁移的 checksum 不一致时拒绝启动；
4. 每个迁移在事务中执行；
5. 成功后写 `schema_migrations`；
6. 已合并迁移永远不修改，只能新增；
7. 每条迁移必须有空库、升级和重复执行测试。

---

## 7. 初始数据库模型

以下是 `0001-initial.sql` 的语义基线。实施时可以拆成多个编号迁移，但字段、约束和语义不得减少。

```sql
CREATE TABLE schema_migrations (
  id TEXT PRIMARY KEY,
  checksum TEXT NOT NULL,
  applied_at_ms INTEGER NOT NULL CHECK (applied_at_ms >= 0)
) STRICT;

CREATE TABLE app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= 0)
) STRICT;

INSERT INTO app_meta (key, value, updated_at_ms)
VALUES ('app_id', 'personal-workbench-vnext', 0);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL CHECK (json_valid(value_json)),
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= 0)
) STRICT;

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 500),
  description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 20000),
  task_date TEXT NOT NULL CHECK (
    task_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
  ),
  status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'cancelled', 'expired')),
  completed_at_ms INTEGER CHECK (completed_at_ms IS NULL OR completed_at_ms >= 0),
  cancelled_at_ms INTEGER CHECK (cancelled_at_ms IS NULL OR cancelled_at_ms >= 0),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= 0),
  deleted_at_ms INTEGER CHECK (deleted_at_ms IS NULL OR deleted_at_ms >= 0),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1)
) STRICT;

CREATE INDEX tasks_by_date
ON tasks(task_date, status, created_at_ms)
WHERE deleted_at_ms IS NULL;

CREATE TABLE recurring_task_templates (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 500),
  description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 20000),
  schedule_type TEXT NOT NULL DEFAULT 'daily' CHECK (schedule_type = 'daily'),
  start_date TEXT NOT NULL CHECK (
    start_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
  ),
  end_date TEXT CHECK (
    end_date IS NULL OR end_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
  ),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= 0),
  deleted_at_ms INTEGER CHECK (deleted_at_ms IS NULL OR deleted_at_ms >= 0),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  CHECK (end_date IS NULL OR end_date >= start_date)
) STRICT;

CREATE TABLE recurring_task_occurrences (
  template_id TEXT NOT NULL,
  occurrence_date TEXT NOT NULL CHECK (
    occurrence_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
  ),
  status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'cancelled')),
  completed_at_ms INTEGER CHECK (completed_at_ms IS NULL OR completed_at_ms >= 0),
  cancelled_at_ms INTEGER CHECK (cancelled_at_ms IS NULL OR cancelled_at_ms >= 0),
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= 0),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  PRIMARY KEY (template_id, occurrence_date),
  FOREIGN KEY (template_id) REFERENCES recurring_task_templates(id) ON DELETE CASCADE
) STRICT;

CREATE INDEX recurring_templates_by_range
ON recurring_task_templates(start_date, end_date)
WHERE deleted_at_ms IS NULL;

CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL CHECK (length(trim(content)) BETWEEN 1 AND 20000),
  pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= 0),
  deleted_at_ms INTEGER CHECK (deleted_at_ms IS NULL OR deleted_at_ms >= 0),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1)
) STRICT;

CREATE INDEX notes_by_pinned_and_updated
ON notes(pinned DESC, updated_at_ms DESC)
WHERE deleted_at_ms IS NULL;

CREATE TABLE learning_resources (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL CHECK (platform = 'bilibili'),
  external_id TEXT COLLATE BINARY,
  source_url TEXT NOT NULL CHECK (length(source_url) BETWEEN 1 AND 2048),
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 500),
  cover_url TEXT CHECK (cover_url IS NULL OR length(cover_url) <= 2048),
  uploader_name TEXT CHECK (uploader_name IS NULL OR length(uploader_name) <= 500),
  duration_seconds INTEGER NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
  metadata_updated_at_ms INTEGER CHECK (
    metadata_updated_at_ms IS NULL OR metadata_updated_at_ms >= 0
  ),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= 0),
  deleted_at_ms INTEGER CHECK (deleted_at_ms IS NULL OR deleted_at_ms >= 0),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1)
) STRICT;

CREATE UNIQUE INDEX learning_resources_external_id
ON learning_resources(platform, external_id)
WHERE external_id IS NOT NULL AND deleted_at_ms IS NULL;

CREATE TABLE learning_parts (
  id TEXT PRIMARY KEY,
  resource_id TEXT NOT NULL,
  external_part_id TEXT COLLATE BINARY,
  part_number INTEGER NOT NULL CHECK (part_number >= 1),
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 500),
  duration_seconds INTEGER NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= 0),
  deleted_at_ms INTEGER CHECK (deleted_at_ms IS NULL OR deleted_at_ms >= 0),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  FOREIGN KEY (resource_id) REFERENCES learning_resources(id) ON DELETE CASCADE
) STRICT;

CREATE UNIQUE INDEX learning_parts_number
ON learning_parts(resource_id, part_number)
WHERE deleted_at_ms IS NULL;

CREATE UNIQUE INDEX learning_parts_external_id
ON learning_parts(resource_id, external_part_id)
WHERE external_part_id IS NOT NULL AND deleted_at_ms IS NULL;

CREATE TABLE learning_resource_progress (
  resource_id TEXT PRIMARY KEY,
  furthest_part_id TEXT,
  furthest_seconds INTEGER NOT NULL DEFAULT 0 CHECK (furthest_seconds >= 0),
  resume_part_id TEXT,
  resume_seconds INTEGER NOT NULL DEFAULT 0 CHECK (resume_seconds >= 0),
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
  completed_at_ms INTEGER CHECK (completed_at_ms IS NULL OR completed_at_ms >= 0),
  last_observed_at_ms INTEGER CHECK (last_observed_at_ms IS NULL OR last_observed_at_ms >= 0),
  manual_override_at_ms INTEGER CHECK (
    manual_override_at_ms IS NULL OR manual_override_at_ms >= 0
  ),
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= 0),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  FOREIGN KEY (resource_id) REFERENCES learning_resources(id) ON DELETE CASCADE,
  FOREIGN KEY (furthest_part_id) REFERENCES learning_parts(id),
  FOREIGN KEY (resume_part_id) REFERENCES learning_parts(id)
) STRICT;

CREATE TABLE learning_part_progress (
  part_id TEXT PRIMARY KEY,
  furthest_seconds INTEGER NOT NULL DEFAULT 0 CHECK (furthest_seconds >= 0),
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
  completed_at_ms INTEGER CHECK (completed_at_ms IS NULL OR completed_at_ms >= 0),
  last_observed_at_ms INTEGER CHECK (last_observed_at_ms IS NULL OR last_observed_at_ms >= 0),
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= 0),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  FOREIGN KEY (part_id) REFERENCES learning_parts(id) ON DELETE CASCADE
) STRICT;

CREATE TABLE learning_series (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= 0),
  deleted_at_ms INTEGER CHECK (deleted_at_ms IS NULL OR deleted_at_ms >= 0),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1)
) STRICT;

CREATE TABLE learning_series_items (
  series_id TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 0),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  PRIMARY KEY (series_id, resource_id),
  FOREIGN KEY (series_id) REFERENCES learning_series(id) ON DELETE CASCADE,
  FOREIGN KEY (resource_id) REFERENCES learning_resources(id) ON DELETE CASCADE
) STRICT;

CREATE UNIQUE INDEX learning_series_item_position
ON learning_series_items(series_id, position);

CREATE TABLE unresolved_learning_links (
  id TEXT PRIMARY KEY,
  normalized_url TEXT NOT NULL UNIQUE CHECK (length(normalized_url) <= 2048),
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 500),
  requested_part_number INTEGER NOT NULL DEFAULT 1 CHECK (requested_part_number >= 1),
  position_seconds INTEGER NOT NULL DEFAULT 0 CHECK (position_seconds >= 0),
  status TEXT NOT NULL CHECK (status IN ('not_started', 'learning', 'completed')),
  last_opened_at_ms INTEGER CHECK (last_opened_at_ms IS NULL OR last_opened_at_ms >= 0),
  resolved_resource_id TEXT,
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= 0),
  deleted_at_ms INTEGER CHECK (deleted_at_ms IS NULL OR deleted_at_ms >= 0),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  FOREIGN KEY (resolved_resource_id) REFERENCES learning_resources(id)
) STRICT;

CREATE TABLE sync_runs (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider = 'bilibili'),
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
  requested_pages INTEGER NOT NULL CHECK (requested_pages BETWEEN 1 AND 5),
  history_count INTEGER NOT NULL DEFAULT 0 CHECK (history_count >= 0),
  updated_count INTEGER NOT NULL DEFAULT 0 CHECK (updated_count >= 0),
  safe_error_code TEXT,
  started_at_ms INTEGER,
  finished_at_ms INTEGER,
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0)
) STRICT;

CREATE TABLE import_runs (
  id TEXT PRIMARY KEY,
  source_system TEXT NOT NULL CHECK (source_system IN ('personal-json', 'qoder-sqlite')),
  source_sha256 TEXT NOT NULL,
  source_schema TEXT NOT NULL,
  source_timezone TEXT,
  importer_version TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('preflight', 'apply')),
  status TEXT NOT NULL CHECK (status IN ('running', 'ready', 'succeeded', 'failed')),
  counts_json TEXT NOT NULL CHECK (json_valid(counts_json)),
  warnings_json TEXT NOT NULL CHECK (json_valid(warnings_json)),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  finished_at_ms INTEGER CHECK (finished_at_ms IS NULL OR finished_at_ms >= 0)
) STRICT;

CREATE TABLE source_refs (
  source_system TEXT NOT NULL CHECK (source_system IN ('personal-json', 'qoder-sqlite')),
  source_kind TEXT NOT NULL,
  source_id TEXT NOT NULL,
  target_kind TEXT NOT NULL,
  target_id TEXT NOT NULL,
  last_source_hash TEXT NOT NULL,
  last_imported_target_hash TEXT NOT NULL,
  last_imported_at_ms INTEGER NOT NULL CHECK (last_imported_at_ms >= 0),
  import_run_id TEXT NOT NULL,
  PRIMARY KEY (source_system, source_kind, source_id),
  FOREIGN KEY (import_run_id) REFERENCES import_runs(id)
) STRICT;

CREATE INDEX source_refs_target
ON source_refs(target_kind, target_id);

CREATE TABLE deletion_markers (
  source_system TEXT NOT NULL CHECK (source_system = 'personal-json'),
  entity_kind TEXT NOT NULL,
  source_id TEXT NOT NULL,
  canonical_key TEXT,
  deleted_at_ms INTEGER NOT NULL CHECK (deleted_at_ms >= 0),
  import_run_id TEXT NOT NULL,
  PRIMARY KEY (source_system, entity_kind, source_id),
  FOREIGN KEY (import_run_id) REFERENCES import_runs(id)
) STRICT;
```

`import_runs` 的生命周期必须落实为两条记录或等价的父子运行模型：preflight 记录达到
`ready` 后保持不可变；apply 创建新的 `mode='apply'` 记录，并通过额外
`preflight_run_id`（实施 migration 时加入）关联 preflight。不得把同一行从 preflight
覆盖为 apply，否则无法审计两阶段结果。`source_refs.import_run_id` 和
`deletion_markers.import_run_id` 必须指向成功的 apply run。

### 7.1 数据模型必须补充的应用级校验

SQLite 的 GLOB 只检查日期形状，service 必须用严格日期函数拒绝：

- `2026-02-30`；
- 自动滚动到下月的日期；
- endDate 早于 startDate；
- 超出合理范围的 epoch；
- 秒数超过对应分P时长；
- progress 中引用了另一视频的 part；
- status 与 completedAt/cancelledAt 冲突。

### 7.2 固定任务语义

固定任务不是预先批量生成普通任务：

1. `recurring_task_templates` 描述从 startDate 到 endDate（或无限）的每日任务；
2. 某日没有 occurrence 行时，状态默认为 `active`；
3. 用户完成或取消某一天时才 upsert `recurring_task_occurrences`；
4. 查询某日任务时，API 合并 daily task 与当日有效 template；
5. 重复查询不得写入或制造重复数据；
6. 停止固定任务只是设置 endDate；
7. 删除 template 使用软删除，并保留导入映射和历史审计；
8. Personal 的 `fixedTaskDays` 完整映射到 occurrence override。

### 7.3 B站进度语义

必须先实现纯函数 `mergeLearningObservation`，所有同步、手动更新和导入都调用它。

定义：

- `furthestPart/furthestSeconds`：最远学到的位置，普通同步只进不退；
- `resumePart/resumeSeconds`：最近一次真实停留位置，可前进也可后退；
- `lastObservedAt`：最新可靠观看观察时间；
- `manualOverrideAt`：最近一次手动重置或完成操作时间门槛；
- `completed`：整部视频是否完成；
- `learning_part_progress`：某分P的局部完成和最远位置。

合并规则：

1. 先把 `(part, seconds)` 转为跨分P绝对秒数比较；
2. 普通观察的绝对位置大于当前最远位置时才更新 furthest；
3. `observedAt >= lastObservedAt` 且 `observedAt >= manualOverrideAt` 时更新 resume；
4. resume 可以回退，furthest 不得因此回退；
5. 显式 reset 将整部和各 part 进度清零、取消 completed，并写 manualOverrideAt；
6. 早于 manualOverrideAt 的历史永远不能恢复被重置的进度；
7. 显式完成整部视频时设置 completed，并写 manualOverrideAt；
8. Personal 的 completed 只代表对应链接/分P完成，不直接推断多P整部完成；
9. qoder 的 `finished=1` 可以映射为整部 completed；
10. 秒数在 service 层 clamp 到 `0..part.durationSeconds`，但严重异常输入要先记录 warning；
11. cid 是稳定分P身份；part number 只是显示和兼容字段。

纯函数必须覆盖：前进、回退、相同时间、旧历史、重置、完成、分P变化、时长变化和越界。

---

## 8. API 契约

共享 Zod schema 和 DTO 放在 `packages/shared/src/contracts`。API client 只能消费这些契约。

### 8.1 健康和应用状态

```text
GET /api/v1/health
```

返回：

```json
{
  "status": "ok",
  "version": "0.1.0",
  "database": "ok",
  "schemaVersion": 1,
  "timeZone": "Asia/Shanghai"
}
```

健康检查不得访问真实 B站，也不得返回本机绝对路径。

### 8.2 每日任务

```text
GET    /api/v1/tasks?date=YYYY-MM-DD
POST   /api/v1/tasks
PATCH  /api/v1/tasks/:id
DELETE /api/v1/tasks/:id
```

列表统一返回：

```ts
type TaskListItem =
  | {
      kind: 'daily'; id: string; title: string; description: string;
      date: string; status: 'active'|'completed'|'cancelled'|'expired'; revision: number;
    }
  | {
      kind: 'recurring'; id: string; templateId: string; title: string;
      description: string; date: string;
      status: 'active'|'completed'|'cancelled'; revision: number;
    };
```

注：expired 仅适用于每日任务的逾期处理（标记时同时置位 `cancelled_at_ms`）；固定任务
occurrence 保持三态子集，服务端对 occurrence 传入 expired 返回 400。

创建请求：

```json
{ "title": "完成报告", "description": "", "date": "2026-08-13" }
```

更新请求必须带 revision：

```json
{ "revision": 3, "status": "completed" }
```

DELETE 使用 `If-Match: 3`。revision 不匹配返回 `409 REVISION_CONFLICT` 和服务端当前实体。

`If-Match` 使用标准实体标签语法，例如 `If-Match: "3"`；服务端响应同时返回
`ETag: "3"`。如果实现团队不希望使用 HTTP ETag，可以通过 ADR 统一改为 JSON
`revision`，但不得同时存在两种互相冲突的约定。

### 8.3 固定任务

```text
GET    /api/v1/recurring-tasks
POST   /api/v1/recurring-tasks
PATCH  /api/v1/recurring-tasks/:id
DELETE /api/v1/recurring-tasks/:id
PUT    /api/v1/recurring-tasks/:id/occurrences/:date
```

创建：

```json
{
  "title": "每日复盘",
  "description": "",
  "startDate": "2026-08-13",
  "endDate": null
}
```

更新 occurrence：

```json
{ "revision": 0, "status": "completed" }
```

不存在 override 时 revision 为 0；成功创建后从 1 开始。

### 8.4 小记

```text
GET    /api/v1/notes?q=&pinned=&cursor=&limit=
POST   /api/v1/notes
PATCH  /api/v1/notes/:id
DELETE /api/v1/notes/:id
```

第一版 limit 默认 100、最大 500。搜索必须参数化；不得拼接 SQL。

### 8.5 总览和回顾

```text
GET /api/v1/overview?date=YYYY-MM-DD
GET /api/v1/review?from=YYYY-MM-DD&to=YYYY-MM-DD
```

overview 至少返回：

- 今日 daily + recurring 统一摘要；
- 逾期 active daily tasks；
- 最近 3 条小记；
- 下一条可继续学习内容；
- 近 7 天完成统计。

review 只接受最多 366 天范围，返回每天 planned/completed/cancelled、完成率和学习活动数。

### 8.6 学习资源、进度与系列

```text
GET    /api/v1/learning/resources
POST   /api/v1/learning/resources
GET    /api/v1/learning/resources/:id
DELETE /api/v1/learning/resources/:id

POST   /api/v1/learning/resources/:id/progress/observe
POST   /api/v1/learning/resources/:id/progress/complete
POST   /api/v1/learning/resources/:id/progress/reset

GET    /api/v1/learning/series
POST   /api/v1/learning/series
PATCH  /api/v1/learning/series/:id
DELETE /api/v1/learning/series/:id
PUT    /api/v1/learning/series/:id/items
```

导入 URL：

```json
{ "url": "https://www.bilibili.com/video/BV.../?p=2", "seriesId": null }
```

只允许 HTTPS，host allowlist 为：

- `bilibili.com`；
- `*.bilibili.com`；
- `b23.tv`。

服务端不得代理任意 URL。B23 解析必须限制跳转次数，并在每次跳转后重新校验协议和 host。

observe：

```json
{
  "revision": 4,
  "partId": "...",
  "seconds": 125,
  "observedAt": "2026-08-13T12:00:00.000Z",
  "source": "manual"
}
```

reset 与 complete 都必须在 UI 中显式确认。

### 8.7 B站凭据与同步

```text
GET    /api/v1/bili/credential/status
PUT    /api/v1/bili/credential
DELETE /api/v1/bili/credential
POST   /api/v1/bili/credential/fetch

POST   /api/v1/learning/sync
GET    /api/v1/learning/sync/:runId
```

手工保存凭据请求体只包含：

```json
{ "sessdata": "用户输入值" }
```

响应只允许：

```json
{ "present": true, "valid": true, "userLabel": "已连接" }
```

绝不能回传原值、长度、开头、结尾或 hash。

自动获取：

```json
{ "browser": "edge", "forceRestart": false }
```

如果必须重启，返回 409 `BROWSER_RESTART_REQUIRED`。UI 显式确认后才允许再次请求：

```json
{
  "browser": "edge",
  "forceRestart": true,
  "confirmation": "restart-browser"
}
```

同步 POST 返回 202 和 runId。同一时间只允许一个同步；第二个请求返回
`409 SYNC_ALREADY_RUNNING`。服务启动时把遗留 queued/running 标为 failed，避免永久卡死。

### 8.8 导入和备份

```text
POST /api/v1/data/imports/preflight
POST /api/v1/data/imports/:id/apply
GET  /api/v1/data/imports/:id/report
POST /api/v1/data/backups
```

preflight 使用 multipart：

- `sourceType`: `personal-json | qoder-sqlite`；
- `sourceTimezone`: qoder 必填，默认 UI 选择 `Asia/Shanghai`；
- `file`: 上传文件。

preflight 流式计算 SHA-256，存入随机临时路径，返回短期、单次、绑定文件 hash 的
confirmationToken。apply 只能引用服务器生成的 import id，不接受本机路径。

恢复第一版只提供 CLI，不提供 HTTP restore API。

---

## 9. 前端信息架构和体验要求

固定路由：

```text
/overview
/tasks
/recurring
/notes
/learning
/review
/data
```

根路由重定向 `/overview`。正式 Express 必须对所有非 `/api` 路径回退 Web
`index.html`，刷新子路由不得 404。

### 9.1 页面功能

#### 总览

- 今日任务摘要和快速新增；
- 最重要待办；
- 逾期任务移到今天；
- 最近小记；
- 继续学习；
- 近 7 天完成情况；
- 每一块有加载、空、失败和重试状态。

#### 任务

- 日期切换；
- daily 与 recurring occurrence 合并展示；
- 完成、取消、恢复、改期、编辑、删除；
- 操作有 busy 状态，重复点击不产生重复请求；
- 409 时提示“数据已在其他页面修改”，刷新当前项。

#### 固定任务

- 创建、修改标题和起止日期；
- 停止任务；
- 查看每天独立状态；
- 不批量生成无限未来记录。

#### 小记

- 新增、搜索、编辑、置顶、删除；
- Ctrl/Cmd + Enter 保存；
- 搜索防抖但不丢最后一次请求；
- 删除前确认，保存失败保留草稿。

#### 学习

- 登录状态、浏览器选择、手动凭据和自动获取；
- 导入 B站链接；
- 视频封面、UP、总时长、分P、系列；
- 最远进度、真实续播点分别显示；
- 同步状态可追踪；
- 完成和重置必须确认；
- B站失败不应阻止本地任务和小记使用。

#### 回顾

- 7 天/30 天切换；
- planned/completed/cancelled；
- 学习活动数量；
- 图表必须有隐藏数据表或等价文本；
- 空数据不显示误导性的 0% 成绩。

#### 数据

- 创建一致备份；
- Personal JSON preflight/apply/report；
- qoder SQLite preflight/apply/report；
- 清楚区分“迁移/合并”和“整库恢复”；
- 显示凭据不进入普通备份；
- 不在页面中暴露服务器真实绝对路径。

### 9.2 响应式与无障碍

必须覆盖：

- 桌面基准 `1440×900`；
- 移动基准 `390×844`；
- 360px 宽度不产生页面级水平滚动；
- 移动端固定底栏和 safe-area；
- 关键触控目标至少 44×44px；
- 清晰 `:focus-visible`；
- 键盘完成核心任务、小记和学习操作；
- dialog 打开后聚焦首控件，关闭后恢复原焦点；
- `prefers-reduced-motion` 关闭非必要动画；
- forced-colors 和高对比模式可辨识；
- 所有图标按钮有可访问名称；
- axe serious/critical 为 0。

不要直接复制 Personal 的整份 CSS。先提取 tokens、layout、components、utilities，避免重复
`:root` 和同选择器多轮覆盖。

---

## 10. 凭据与本机安全

### 10.1 CredentialStore

定义接口：

```ts
interface BiliCredentialStore {
  has(): Promise<boolean>;
  read(): Promise<string | null>;
  write(sessdata: string): Promise<void>;
  clear(): Promise<void>;
}
```

实现：

- 测试：`MemoryCredentialStore`；
- Windows：CurrentUser 范围 DPAPI；
- 加密 blob 单独放 `credentials/credentials.bin`；
- 不能放进 SQLite、settings、备份或 Git。

如果使用 PowerShell 调用 `ProtectedData`：

- 固定脚本文件，不拼接脚本文本；
- 使用 `-NoProfile -NonInteractive -File`；
- 秘密只通过 stdin 传递，不进入参数；
- stdout 只能返回 base64 加密结果或明文结果给父进程内存；
- stderr、异常和日志不得包含输入；
- 读取后尽快释放引用；
- 单元测试不得使用真实 SESSDATA。

### 10.2 HTTP 防护

- 只监听 `127.0.0.1`；
- 校验 Host，只允许配置的 loopback host/port；
- 校验 Origin，开发只允许 `WEB_DEV_ORIGIN`，正式只允许同源；
- 拒绝 `Sec-Fetch-Site: cross-site` 的写请求；
- 所有写请求要求 JSON 或受控 multipart；
- 写请求要求自定义 `X-Workbench-Request: 1`；
- JSON 默认限制 1MB；导入文件默认限制 50MB；
- 不接受 API 中的任意本机文件路径；
- SQL 全部参数化；
- URL 导入使用协议/域名 allowlist，防止 SSRF；
- 错误响应不泄露 SQL、栈、路径、Cookie；
- Pino redaction 至少覆盖 `authorization`、`cookie`、`set-cookie`、`sessdata` 和请求体凭据字段。

### 10.3 浏览器控制

- 默认只尝试连接已开启的调试端口；
- 默认不关闭、不杀死、不重启浏览器；
- 强制重启必须由 UI 二次确认；
- Chrome 136+ 默认用户目录限制应返回明确替代建议；
- 优先提供 Edge 或手动输入；
- `taskkill`/spawn 目标必须来自固定浏览器 allowlist，不能接受任意可执行路径；
- 操作前后都不能记录 Cookie。

---

## 11. 旧数据迁移规范

### 11.1 统一导入报告

```ts
type ImportReport = {
  runId: string;
  sourceType: 'personal-json' | 'qoder-sqlite';
  sourceSha256: string;
  sourceSchema: string;
  sourceTimezone?: string;
  counts: Record<string, {
    read: number;
    add: number;
    update: number;
    unchanged: number;
    conflict: number;
    reject: number;
  }>;
  conflicts: Array<{
    code: string;
    entity: string;
    sourceId: string;
    targetId?: string;
    fields: string[];
    resolution: 'keep-target' | 'source-wins' | 'manual';
  }>;
  warnings: Array<{
    code: string;
    entity?: string;
    sourceId?: string;
    message: string;
  }>;
  fatal: Array<{ code: string; message: string }>;
  credentials: { detected: boolean; migrated: false };
};
```

测试必须断言每一类计数，不能只断言 HTTP 200。

### 11.2 导入模块文件

```text
apps/server/src/modules/imports/
├─ contracts.ts
├─ import-service.ts
├─ import-repository.ts
├─ reconciliation.ts
├─ import-report.ts
├─ source-hash.ts
├─ personal/
│  ├─ personal-schema.ts
│  ├─ personal-parser.ts
│  └─ personal-mapper.ts
└─ qoder/
   ├─ qoder-inspector.ts
   ├─ qoder-mapper.ts
   └─ pages-parser.ts
```

### 11.3 Personal JSON

必须兼容：

- 正式 wrapper `{app, version, exportedAt, data}`；
- 裸 data；
- v1、v2、v3；
- v1 无 tombstone；
- v1/v2 无 fixedTasks、fixedTaskDays。

输入限制至少复刻：

- JSON ≤ 5MB；
- 普通实体每类 ≤ 5000；
- fixedTaskDays ≤ 50000；
- 标题 ≤ 500；
- note ≤ 20000；
- URL ≤ 2048；
- 日期、时间戳、状态和 URL 协议严格校验。

映射：

| Personal | vNext |
|---|---|
| task.id | 新 UUID；旧 ID 写 source_refs |
| active/completed/cancelled | 原样保留 |
| task.date | 原日历日期，不做 UTC 换日 |
| fixedTask | recurring_task_templates |
| fixedTaskDay | recurring_task_occurrences |
| note | notes，保留 pinned 和 updatedAt |
| studyItem BV:pN | resource + 指定 part 的 progress |
| 无法离线解析的 b23 | unresolved_learning_links |
| tombstone | deletion_markers + source-scoped 删除语义 |

Tombstone：

- fixed_task tombstone 按旧实现永久阻止同 ID 复活；
- 其他实体仅在 `deletedAt >= item.updatedAt` 时生效；
- marker 即使没有对应实体也必须保留；
- marker 只影响 Personal 来源，不能删除 qoder 合并到同一资源的事实。

Personal completed 学习项只完成对应分P，不推断整个多P视频完成。

### 11.4 qoder SQLite

输入必须是：

- 旧项目 `/api/backup` 产生的 `VACUUM INTO` 一致快照；或
- 旧服务完全停止后由 SQLite backup API 产生的快照。

禁止在 WAL 运行时只复制 `workbench.db`。

导入器必须以 read-only/query_only 打开，先执行：

- SQLite magic 检查；
- `PRAGMA integrity_check`；
- 已知表/列检查；
- 只 SELECT 已知表，不执行源库中的 trigger/view；
- pages_json、状态、FK、范围和时间检查。

字段映射：

| qoder | vNext |
|---|---|
| task id | 新 UUID + source_refs |
| pending/done/cancelled | active/completed/cancelled |
| task.note | task.description，不能丢弃 |
| note | pinned=false；updated=created |
| bili_series | learning_series |
| bili_videos.bvid | learning_resources.external_id |
| pages_json | learning_parts；cid 存 TEXT |
| progress_page/sec | resource furthest |
| resume_page/sec | resource resume |
| finished | resource completed |
| last_view_at | lastObservedAt，Unix 秒 × 1000 |
| override_at | manualOverrideAt，Unix 秒 × 1000 |
| bili_browser | allowlist 后迁移为普通 setting |
| bili_sessdata | 检测但永不迁移 |

旧库可能没有 resume_page、resume_sec、override_at。兼容规则：

- resume 回填 progress；
- override_at = 0；
- 不修改源库。

qoder 的 SQLite localtime 字符串没有时区。preflight 必须要求用户确认 sourceTimezone，默认
`Asia/Shanghai`，按该时区解释后转 UTC epoch ms。不得直接当 UTC。

孤儿 series_id、非法状态和不可解析 pages_json 是 fatal，不得静默跳过。

### 11.5 跨来源合并

- 普通任务即使同日期同标题，也默认都保留，只报告 possible duplicate；
- 小记默认都保留，不按内容粗暴去重；
- B站资源只在 external BVID 二进制精确相同时自动合并；
- 只有大小写近似相同的 BVID 必须报告冲突；
- qoder 的标题、封面、UP、总时长和 pages 元数据优先；
- Personal 标题可保存为来源别名或导入审计信息；
- 最远进度取可靠来源换算后的绝对秒最大值；
- resume 取最新可靠活动时间；
- qoder override_at 晚于其他候选时，qoder 手动状态优先；
- b23 无法离线解析时保留为 unresolved，不能丢弃。

### 11.6 三方合并和幂等

`source_refs` 同时保存：

- `last_source_hash`；
- `last_imported_target_hash`；
- `last_imported_at_ms`。

再次导入：

1. source hash 未变：unchanged/no-op；
2. source 变、当前 target hash 等于 baseline target hash：安全更新；
3. source 和 target 都变：产生冲突，默认保留 vNext；
4. 时间相同但内容不同：确定性冲突，不能按数组顺序决定；
5. 源文件中不再出现默认不等于删除；
6. Personal 只有显式 tombstone 才触发 source-scoped 删除；
7. qoder 没有 tombstone，缺失行只报告 missing_from_source；
8. 第二次导入相同文件必须允许执行 preflight，并报告 added=0、conflict=0、全部 unchanged。

### 11.7 实际导入事务

1. 上传并流式计算 SHA-256；
2. 严格 preflight，输出 read/add/update/unchanged/conflict/reject；
3. 有 fatal 时禁用 apply；
4. 用户确认；
5. 先为当前 vNext 创建并验证预导入快照；
6. `BEGIN IMMEDIATE`；
7. 写 staging；
8. 处理 Personal tombstone、任务、固定任务、occurrence、小记；
9. 处理 qoder series、resources、parts/progress；
10. 合并 Personal learning；
11. 同步写 source_refs；
12. 检查计数、唯一约束和 `foreign_key_check`；
13. 任一点失败全部 ROLLBACK；
14. COMMIT 后生成报告和逻辑校验和；
15. 联网补封面、分P和 b23 解析作为独立后台任务，不属于导入事务。

故障注入测试点至少包括：staging 后、tasks 后、notes 后、series 后、parts 后、commit 前。
每个点失败后，业务表、source_refs 和成功 import_runs 均不得发生变化。

CLI 必须复用相同 service：

```powershell
npm run import:personal -- --file 'D:\backup.json' --dry-run
npm run import:qoder -- --file 'D:\workbench.db' --source-timezone Asia/Shanghai --dry-run
npm run import:apply -- --run <id>
```

---

## 12. 备份与恢复

### 12.1 普通备份

使用 SQLite backup API 或 `VACUUM INTO` 创建一致快照，不直接复制 WAL 主库。

推荐 `.pwbk` 为受控 ZIP，仅允许两个条目：

```text
manifest.json
workbench.sqlite
```

manifest：

```json
{
  "app": "personal-workbench-vnext",
  "backupFormat": 1,
  "schemaVersion": 1,
  "createdAt": "2026-08-13T12:00:00.000Z",
  "dbBytes": 123456,
  "dbSha256": "...",
  "secretIncluded": false
}
```

备份流程：

1. 生成随机临时路径；
2. `VACUUM INTO`；
3. 对快照执行 `PRAGMA integrity_check`；
4. 执行 `foreign_key_check`；
5. 计算 bytes 和 SHA-256；
6. 生成 manifest；
7. 打包时只加入这两个明确文件；
8. 成功后才提供下载；
9. 下载结束或失败都清理临时文件。

凭据目录永远不进入普通备份。

如果第一版暂时不引入 ZIP 依赖，可先交付经完整性验证的 `.sqlite` 快照，但恢复阶段前必须升级为带 manifest 的 `.pwbk`，不能把临时格式宣布为最终格式。

### 12.2 整库恢复

第一版只允许停服 CLI：

```powershell
npm run data:restore -- --file 'D:\Backup\workbench.pwbk'
```

恢复不是 merge，UI/文档必须称为“整库时间点恢复”。流程必须：

1. 确认服务未运行并获得数据目录排他锁；
2. 只读取 `manifest.json` 和 `workbench.sqlite`，拒绝额外条目、绝对路径和 `..`；
3. 校验 app、格式、大小和 SHA-256；
4. 在临时目录只读打开数据库；
5. 执行 integrity_check、foreign_key_check 和 schema 兼容检查；
6. 对临时副本执行 migration dry-run/实际升级；
7. 为当前正式库创建并验证 pre-restore 快照；
8. checkpoint WAL、关闭正式连接；
9. 在同一卷执行原子替换；
10. 重开数据库并执行 health check；
11. 任一步失败自动恢复 pre-restore；
12. 保留失败文件和安全诊断信息，但不得包含凭据。

验收必须演练：备份 → 修改测试库 → 恢复 → 逻辑校验和回到备份时值。

---

## 13. 分阶段实施计划

## 阶段 0：保护旧项目与建立决策基线

### 任务

- 创建新目录并初始化 Git；
- 复制本文件为根 `EXECUTION_PLAN.md`；
- 创建 `.gitignore`、`.env.example`、`.node-version`；
- 创建 `docs/ARCHITECTURE.md`、`DATA_MODEL.md`、`SECURITY.md`、`STATUS.md`；
- 创建 ADR：
  - `0001-local-first-sqlite.md`；
  - `0002-single-business-data-source.md`；
  - `0003-learning-progress-semantics.md`；
  - `0004-credential-storage.md`；
  - `0005-legacy-imports.md`；
- 记录两个旧项目当前 Git 状态或文件 SHA，不修改它们。

### 验收

- 新项目没有指向旧项目的 symlink、workspace 或运行时 import；
- 两个旧目录没有新增修改；
- `docs/STATUS.md` 标记阶段 0 完成；
- 创建第一个提交：`chore: establish vNext execution baseline`。

## 阶段 1：可运行 monorepo 骨架

### 任务

- 建 npm workspaces；
- 配置 TypeScript、ESLint、Prettier、Vitest；
- 创建 Express app factory，测试不能直接监听端口；
- 实现统一错误、请求 ID、Host/Origin guard、日志脱敏；
- 实现 `/api/v1/health`；
- Vite 代理 `/api` 到 8790；
- 正式 Express 托管 `apps/web/dist` 并支持 SPA fallback；
- 建 Windows GitHub Actions；
- 创建基础应用壳和路由占位页。

### 验收

```powershell
npm ci
npm run check
npm run dev
```

- `http://127.0.0.1:5190` 显示应用壳；
- Web 能显示 health 状态；
- 正式 build 后 `127.0.0.1:8790/overview` 刷新不 404；
- 非法 Origin 的写请求被拒绝；
- 日志含 requestId，不含敏感请求体；
- 停止开发服务后无本项目残留 Node 进程。

## 阶段 2：SQLite 和 migration 基础

### 任务

- 实现数据目录解析和测试临时目录；
- 实现连接 PRAGMA 和关闭逻辑；
- 实现 checksum migration runner；
- 落地初始 schema；
- 实现 repository transaction helper；
- 实现 UTC epoch ms/ISO DTO 转换；
- 实现严格业务日期函数；
- health 加入数据库/schema 状态。

### 验收

- 空库能迁移到最新版本；
- 重复启动不重复执行迁移；
- 修改已应用 migration 后启动失败；
- foreign_keys 确实开启；
- 写入后重启数据存在；
- 测试结束无锁文件和未关闭连接；
- integrity_check=ok，foreign_key_check=0 行。

## 阶段 3：每日任务、固定任务和小记

### 后端

- contracts、repository、service、route 分层；
- daily task CRUD、状态、改期、软删除、revision 冲突；
- recurring template CRUD 和 occurrence override；
- notes CRUD、搜索、置顶、revision 冲突；
- 所有输入边界和结构化 4xx。

### 前端

- 任务、固定任务、小记页面；
- TanStack Query cache key 规范；
- pending/success/error/retry；
- 保存失败保留输入；
- 409 刷新和提示；
- 页面刷新后数据仍在。

### 验收

- 任务新增、编辑、完成、取消、恢复、改期、删除通过；
- 固定任务从开始日到结束日每天默认出现；
- 同一天重复查询不创建重复数据；
- 每天状态互不影响；
- 小记新增、编辑、搜索、置顶、删除通过；
- 空标题、无效日期、超长内容返回结构化 4xx；
- API 集成测试使用临时 SQLite；
- 同时发出相同 revision 的两次更新，仅一次成功，另一次 409。

## 阶段 4：产品壳、总览、回顾和响应式

### 任务

- 建立全部正式路由；
- 参考 Personal 重建而非整块复制 UI；
- 建 CSS token、layout、components、utilities 分层；
- 实现桌面导航和移动底栏；
- 实现总览 API/页面；
- 实现 7/30 天回顾；
- 如保留农历，隔离纯模块并测试闰月和边界日期；
- 页面级 lazy loading；
- 加 axe 和桌面/移动截图测试。

### 验收

- 1440×900、390×844 核心截图通过；
- 360px 不出现页面级横向滚动；
- 键盘可完成核心任务、小记操作；
- axe serious/critical 为 0；
- reduced motion 生效；
- 图表有等价文本/表格；
- 总览和回顾只读 API，不读业务 localStorage；
- 初始 JS gzip 目标 ≤ 200KB，普通单 chunk 原始体积 ≤ 350KB；超出需拆包或 ADR。

## 阶段 5：B站元数据、学习模型和 fixture

### 任务

- 实现 URL/BVID/B23 规范化；
- 抽象 `BiliClient`；
- 实现视频信息和分P；
- 实现 resource/part/series repository；
- 实现并测试 `mergeLearningObservation`；
- 使用脱敏 fixture，测试不访问真实 B站；
- 实现学习列表、详情、分P、系列、进度、完成和重置；
- URL 跳转逐次 allowlist 校验；
- b23 失败保留 unresolved。

### fixture 至少覆盖

- 单P；
- 多P；
- 空 pages；
- 分P顺序变化；
- 视频下架；
- 限流；
- 超时；
- 损坏 JSON；
- b23 多次跳转；
- 非允许域名跳转；
- 时长变化和进度越界。

### 验收

- 重复导入同 BVID 不重复；
- cid 相同的分P不因页码变化而重复；
- 最远进度普通同步不后退；
- 真实续播点可以回退；
- reset 后旧观察不能复活进度；
- 完成/重置都需确认；
- B站故障不影响任务和小记使用。

## 阶段 6：凭据、CDP 和观看历史同步

### 任务

- 实现 MemoryCredentialStore 和 DPAPI store；
- 手动保存、验证、清除凭据；
- 迁移 qoder CDP 行为但拆成 adapter/service；
- 默认只连接，不重启；
- 强制重启两段式确认；
- 实现 B站历史 fixture 和 sync service；
- in-process mutex；
- sync_runs 状态；
- 前端竞态保护和轮询；
- 服务重启后清理遗留 running 状态。

### 验收

- 测试 SESSDATA 在 API 响应、日志、SQLite、备份中均搜索不到；
- credential/status 只返回存在/有效状态；
- 同时点击同步只启动一个 run；
- 空历史、过期凭据、限流、网络失败都有明确安全错误；
- 多P同步准确；
- qoder 的 progress/resume/override 语义被 fixture 固定；
- 默认流程不会关闭 Chrome/Edge；
- 强制重启没有显式 confirmation 时被拒绝。

## 阶段 7：旧数据 preflight、导入和对账

### 任务

- 建完整 imports 目录；
- Personal v1/v2/v3 Zod 输入 schema；
- qoder read-only inspector；
- source_refs、deletion_markers 和三方合并；
- multipart preflight、confirmationToken 和 apply；
- CLI 复用同一 service；
- 导入前自动快照；
- 故障注入；
- 生成 machine-readable 报告；
- 数据页展示计数、warning、conflict、credential 策略。

### 验收 fixture

- Personal v1/v2/v3；
- wrapper/裸 data；
- 损坏/超限 JSON；
- 重复 ID；
- tombstone；
- fixedTask 孤儿 day；
- 同 BV 多个 p；
- b23 unresolved；
- qoder 旧列/新列；
- 损坏 DB；
- 非法状态；
- 坏 pages_json；
- 孤儿 series；
- 进度越界；
- SESSDATA；
- qoder 时区转换；
- 两来源同 BVID；
- 所有故障注入回滚点。

### 验收

- fatal 时无法 apply；
- 任一失败无部分业务写入；
- 报告计数等于最终数据库计数；
- 相同源第二次导入 0 added、0 conflict、全部 unchanged；
- 本地和源同时修改时产生冲突且默认保留本地；
- 两个源文件导入前后 SHA-256 不变；
- SESSDATA 只报告 detected=true、migrated=false；
- integrity_check=ok、foreign_key_check=0；
- 抽样核对至少 10 个任务、10 条小记、所有固定任务边界、所有多P视频，以及完成/取消/重置各一例。

## 阶段 8：备份、恢复、性能和最终切换

### 任务

- 实现一致 `.pwbk`；
- 实现 manifest/hash/integrity；
- 实现停服 CLI restore 和 pre-restore 回滚；
- 完整 E2E；
- 10,000 条任务/小记和 1,000 视频性能 fixture；
- 对常用查询执行 `EXPLAIN QUERY PLAN`；
- 完成 `OPERATIONS.md` 和 `MIGRATION_GUIDE.md`；
- 真实 Personal JSON 演练；
- 脱敏 qoder snapshot 演练；
- 备份—修改—恢复演练；
- 与旧项目并行使用 3–7 天。

### 最终切换门槛

- `npm run check:all` 通过；
- 所有对账报告保存；
- 关键查询无明显全表扫描；
- 常用页面在目标数据量下交互可接受；
- 至少一份备份已真正恢复验证；
- 用户确认核心工作流没有缺失；
- 回退方法写入 OPERATIONS；
- 两个旧项目至少继续保留 30 天。

---

## 14. 测试矩阵与质量门槛

| 层级 | 必测内容 |
|---|---|
| Shared 纯函数 | 日期、固定任务范围、URL、进度合并、字段校验 |
| Repository | CRUD、软删除、唯一约束、事务、revision 冲突 |
| Migration | 空库、逐版本升级、checksum、重复启动、失败回滚 |
| API | 正常、4xx、404、409、Host/Origin、并发、重启持久化 |
| Web | loading、empty、error、retry、busy、409、草稿保留 |
| Bili fixture | 单/多P、下架、限流、超时、坏响应、旧历史、重置 |
| Credential | DPAPI roundtrip、清除、日志脱敏、备份排除 |
| Import | 两源各版本、重复、冲突、损坏、超限、时区、回滚 |
| Backup/restore | 快照、manifest、hash、integrity、失败自动回退 |
| Security | SSRF、路径穿越、跨站写、SQL 参数化、秘密扫描 |
| E2E | 任务、小记、固定任务、总览、学习、备份、移动导航 |
| Accessibility | 键盘、焦点、标签、对比、reduced motion、axe |

覆盖率从阶段 3 开始强制：

- 全局 lines/functions/statements ≥ 85%，branches ≥ 80%；
- migration、import、progress merge、credential ≥ 95% lines、≥ 90% branches；
- 不得用无意义断言或排除关键文件追求数字。

每次 PR/阶段完成至少运行：

```powershell
npm ci
npm run format:check
npm run lint
npm run typecheck
npm run test:coverage
npm run build
npm run test:e2e
```

CI：

- Windows runner 必需；
- Linux 可验证不依赖 Windows 的模块；
- CI 禁止访问真实 B站；
- CI 禁止包含真实数据库、Cookie、日志或备份；
- 新迁移必须带迁移测试；
- ESLint warning 必须为 0。

---

## 15. `docs/STATUS.md` 固定模板

```markdown
# vNext 实施状态

## 当前阶段

- 阶段：0
- 状态：未开始
- 最后更新：YYYY-MM-DD

## 阶段状态

| 阶段 | 内容 | 状态 | 验收提交 |
|---:|---|---|---|
| 0 | 决策基线 | 未开始 | |
| 1 | Monorepo 骨架 | 未开始 | |
| 2 | SQLite/migration | 未开始 | |
| 3 | 任务/固定任务/小记 | 未开始 | |
| 4 | 产品壳/总览/回顾 | 未开始 | |
| 5 | B站学习模型 | 未开始 | |
| 6 | 凭据/CDP/同步 | 未开始 | |
| 7 | 旧数据导入 | 未开始 | |
| 8 | 备份/恢复/切换 | 未开始 | |

## 本阶段变更

- 待填写

## 验证结果

| 命令 | 结果 | 测试数/备注 |
|---|---|---|
| npm run format:check | 未运行 | |
| npm run lint | 未运行 | |
| npm run typecheck | 未运行 | |
| npm run test:coverage | 未运行 | |
| npm run build | 未运行 | |
| npm run test:e2e | 未运行 | |

## 数据迁移

- 新增 migration：无
- schema version：0

## 未完成项

- 待填写

## 已知风险

- 待填写

## 旧项目状态

- Personal-Workbench 被修改：否
- Personl-Workbench-qoder 被修改：否
```

---

## 16. 每阶段交付报告

完成一个阶段后必须报告：

1. 新增、修改和删除的文件；
2. 新增 migration 及 schema version；
3. 实际运行的命令；
4. 测试数量、通过、失败、跳过；
5. 覆盖率；
6. 未完成项和已知风险；
7. 数据兼容影响；
8. 是否修改两个旧项目——正确答案始终应为“否”；
9. 当前阶段是否满足全部退出条件；
10. 下一阶段是什么，但不得提前实现。

如果某验收失败，阶段保持“进行中”，不能为了推进而修改验收定义。

---

## 17. 明确禁止事项

- 不把任一旧项目整目录复制进 vNext；
- 不整块复制 800 行服务端或 450 行组件后再承诺以后拆；
- 不让 localStorage 和 SQLite 同时成为业务主数据源；
- 不让 route 直接执行 SQL；
- 不让 React 页面访问 SQLite、B站或 DPAPI；
- 不修改已应用 migration；
- 不在 CI 调用真实 B站；
- 不把 SESSDATA 写入 SQLite、settings、日志、错误、URL、命令行参数或备份；
- 不默认关闭或重启用户浏览器；
- 不让 API 接受任意本机文件路径；
- 不直接写旧 qoder 数据库；
- 不因源文件中缺少某行就删除 vNext 数据；
- 不在导入成功前删除旧数据；
- 不按标题或小记内容自动粗暴去重；
- 不把 Personal 某个分P完成误判为整部视频完成；
- 不把 resume 与 furthest 合成一个字段；
- 不把 qoder 无时区 localtime 当 UTC；
- 不在第一版加入云同步、账号、D1、Electron 或公网监听；
- 不以“页面能打开”代替数据持久化、并发、回滚和恢复测试；
- 不在没有备份恢复演练的情况下切换正式使用。

---

## 18. 最终验收清单

### 工程

- [ ] 单一根锁文件；
- [ ] TypeScript strict；
- [ ] Lint 0 warning；
- [ ] 全部自动检查通过；
- [ ] Windows CI 通过；
- [ ] 旧项目未被修改。

### 数据

- [ ] SQLite 是唯一业务数据源；
- [ ] integrity_check=ok；
- [ ] foreign_key_check=0；
- [ ] migration checksum 有效；
- [ ] 重启不丢数据；
- [ ] revision 冲突不会静默覆盖。

### 功能

- [ ] 每日任务完整；
- [ ] 固定任务每天默认出现且每天状态独立；
- [ ] 小记新增/搜索/编辑/置顶/删除；
- [ ] 总览和 7/30 天回顾；
- [ ] B站单P/多P/系列；
- [ ] furthest 不退、resume 可退；
- [ ] reset 后旧历史不复活；
- [ ] 同步互斥和失败状态；
- [ ] 桌面/移动/键盘/axe 通过。

### 安全

- [ ] 只监听 127.0.0.1；
- [ ] Host/Origin/cross-site 写保护；
- [ ] SSRF allowlist；
- [ ] 凭据使用 DPAPI；
- [ ] API、日志、SQLite、备份秘密扫描通过；
- [ ] 默认不重启浏览器。

### 迁移和恢复

- [ ] Personal v1/v2/v3 preflight/apply；
- [ ] qoder 新旧列 preflight/apply；
- [ ] 两来源对账完成；
- [ ] 相同源二次导入为 no-op；
- [ ] 故障注入证明事务回滚；
- [ ] 普通备份不含凭据；
- [ ] `.pwbk` hash/integrity 通过；
- [ ] 真实 restore 演练通过；
- [ ] 回退方法已记录；
- [ ] 旧项目保留 30 天。

全部勾选前，不宣布 vNext 完成。
