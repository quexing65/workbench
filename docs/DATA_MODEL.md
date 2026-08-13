# vNext 数据模型基线

- 状态：阶段 3 已实施
- 当前 schema version：1
- 日期：2026-08-13

SQLite 是唯一业务事实源。localStorage 只能保存主题、折叠状态等非业务偏好；凭据不属于
业务数据库，也不得保存到 settings。

## 通用规范

- 正式表使用 STRICT，开启 foreign_keys、WAL、busy_timeout 和 synchronous=NORMAL。
- 主键使用服务端 UUID TEXT；旧 ID 只进入 source_refs。
- 时间存 UTC epoch milliseconds；API 层转换为 ISO。
- 日历日期存严格 `YYYY-MM-DD`，按应用时区解释。
- 时长存非负整数秒。
- 可编辑实体包含 revision；删除默认软删除。
- service 负责真实日期、epoch 范围、状态/时间一致性和跨表引用校验。

## 计划表与关系

### 基础设施

- `schema_migrations`：迁移 ID、checksum、应用时间。
- `app_meta`：应用标识和 schema 元信息。
- `settings`：非敏感应用设置；禁止保存 Cookie/SESSDATA。
- `sync_runs`：B站同步状态和脱敏摘要。
- `import_runs`：不可变 preflight/apply 运行记录；apply 显式引用 preflight，并记录
  plan digest、过期时间和 confirmation token 的原子消费状态。
- `source_refs`：来源 ID 到 vNext ID、贡献状态、规范化来源投影及三方合并基线。
- `deletion_markers`：Personal tombstone 的来源级删除事实。

### 通用工作台

- `tasks`：每日任务，状态为 active/completed/cancelled；更新使用 revision 原子乐观锁，
  删除为软删除。
- `recurring_task_templates`：每日固定任务的日期范围规则；查询任务列表时按日期合并，
  不预生成未来记录。
- `recurring_task_occurrences`：仅在某天状态被修改时创建 override；不存在时 revision=0，
  创建后从 1 开始，日期之间互不影响。
- `notes`：可搜索、置顶和软删除的小记；搜索全部使用参数化 SQL，更新时间参与稳定分页。
- `recurring_task_templates`：每日固定任务模板和起止日期。
- `recurring_task_occurrences`：仅保存某日完成/取消等覆盖状态。
- `notes`：内容、置顶、创建/更新时间和软删除。

### 学习

- `learning_resources`：一条 BVID 一项资源。
- `learning_parts`：分P，以 cid 为稳定外部身份，part number 只用于显示兼容。
- `learning_resource_progress`：整部最远位置、真实续播位置、完成和手动门槛。
- `learning_part_progress`：分P局部最远位置和完成状态。
- `learning_series` / `learning_series_items`：系列及有序视频关系。
- `unresolved_learning_links`：尚不能离线解析的 b23 或普通链接。

完整字段和约束以 `EXECUTION_PLAN.md` 第 7 节为实施合同。

## 固定任务不变量

1. 模板表示 startDate..endDate 内每天默认出现。
2. 不预生成无限未来普通任务。
3. 没有 occurrence 行时状态默认 active。
4. 仅用户完成或取消某天时 upsert occurrence。
5. 查询合并每日任务和有效模板，读操作不写库。
6. 停止固定任务设置 endDate。
7. 模板删除使用软删除，并保留导入映射。
8. Personal fixedTaskDays 映射为 occurrence override。

## 学习进度不变量

所有观察、手动操作和导入统一调用纯函数 `mergeLearningObservation`：

- furthest 代表跨分P最远位置，普通同步只进不退。
- resume 代表最近真实位置，可以前进或后退。
- 比较位置前先转换成跨分P绝对秒。
- lastObservedAt 只接受更新的可靠观察；相同时间但内容不同必须产生确定性冲突，不能按处理顺序覆盖。
- manualOverrideAt 是重置、完成或取消完成的时间门槛；普通观察必须满足
  `observedAt > manualOverrideAt`，相等或更旧历史不得复活进度/完成状态。
- reset 清空整部和分P进度、取消完成并更新门槛。
- complete 设置整部完成并更新门槛。
- uncomplete 取消整部完成并更新门槛。
- Personal completed 只表示其指定分P完成，不推断多P整部完成。
- qoder finished 可以表示整部完成。
- 秒数必须落在对应分P `0..duration`，跨视频 part 引用必须拒绝。
- cid 是稳定身份；页码变化不能制造重复分P。

## Import 不变量

- preflight 与 apply 是两条不可变运行记录或等价父子模型。
- apply 必须引用 preflight；source_refs/deletion_markers 只能指向成功 apply。
- confirmation token 绑定 runId、sourceHash、sourceType、sourceTimezone 与 planHash，并有 TTL；
  apply 在 `BEGIN IMMEDIATE` 后重新验证源 hash、target baseline 和 plan digest，变化即要求重新 preflight。
- source_refs 的 source hash 只覆盖单实体规范化来源字段；target hash 只覆盖该来源可写字段，
  排除 revision、导入审计、其他来源贡献和普通 B站同步字段。投影必须带版本并可诊断。
- 同一来源重复导入必须幂等；源和本地同时修改时产生冲突。
- 源文件中缺行不等于删除；Personal 仅显式 tombstone 删除来源贡献。若本地已变则冲突；
  若存在其他来源或用户贡献，只移除 Personal 贡献并重算物化值，不全局软删除。
- deletion marker 必须保留 source ID 与 normalized canonical key 的组合语义，也保留没有对应实体的 marker。
- qoder 无 tombstone，缺行只报告 missing_from_source。

## Migration 不变量

迁移采用 `0001-name.sql` 编号并记录 SHA-256。每条迁移在事务内执行；已应用文件不可修改；
checksum 不一致时拒绝启动。`0001-initial.sql` 已在阶段 2 落地完整 STRICT schema；
SHA-256 为 `103858fe38bbdfdc4ed2af86fa5894b71b0203aa2ab756ded9c859eabbfd08ac`。

## 只读聚合

阶段 4 没有改变 schema。`GET /api/v1/overview` 和 `GET /api/v1/review` 仅对已有表做
只读聚合：每日任务与有效固定任务按日期合并，缺少 occurrence 时状态为 active；小记按
更新时间取最近三条；学习活动按 `last_observed_at_ms` 归属 Asia/Shanghai 业务日。没有计划
的日期将完成率表示为 `null`，不伪造 0%。读取聚合不得创建 occurrence 或修改 revision。
