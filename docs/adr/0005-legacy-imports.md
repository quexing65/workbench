# ADR 0005：旧项目通过两阶段导入迁移

- Status: Accepted
- Date: 2026-08-13

## Context

Personal JSON 与 qoder SQLite 的 ID、状态、时间和学习模型不同；直接复用或复制旧数据库会丢失语义和凭据边界。

## Decision

Personal JSON 和 qoder 一致 SQLite 快照仅作为只读输入。所有实体生成新 UUID，并通过
source_refs 保存来源映射和三方合并基线。流程固定为 preflight → 用户确认 → apply；apply 前创建
vNext 快照，单事务导入并生成对账报告。

confirmation token 绑定 runId、source hash/type/timezone 与 plan digest，设置 TTL 并仅能原子消费一次；
apply 在取得 `BEGIN IMMEDIATE` 后重新校验源 hash、当前 target baseline 和 plan digest，任何变化都要求
重新 preflight。source/target hash 使用带版本的单实体规范化投影，不把无关来源字段、revision 或审计字段
混入冲突判断。

Personal tombstone 保留为来源级 deletion marker；qoder 无 tombstone，缺行不视为删除。qoder
无时区 localtime 要求用户确认来源时区。相同源可重复 dry-run，第二次导入必须为 no-op。
marker 保留 source ID 与 canonical key 的组合语义；删除先移除来源贡献，若仍有其他来源或用户贡献则不
全局软删除。SESSDATA 仅通过布尔存在性查询检测，不读取值且不迁移。

## Alternatives considered

- 直接使用旧 DB：schema 和安全边界不兼容。
- 双写旧/新项目：故障和冲突不可控。
- 按标题/内容去重：会错误合并真实不同任务和小记。
- 单次无预览导入：无法让用户确认冲突、时区和凭据处理。

## Consequences

正面：来源可追踪、导入幂等、冲突明确、失败可完整回滚。
负面：需要 source_refs/source contributions、import_runs、TTL 清理、fixture、故障注入和详细报告。

## Migration and rollback

apply 前创建一致快照；任一点失败回滚。旧项目至少保留 30 天，来源文件前后 SHA 必须不变。

## Testing and verification

覆盖 Personal v1/v2/v3、qoder 新旧列、时区、tombstone、多P、重复导入、三方冲突、
坏文件、确认后 target 变化、token 重放/过期、来源级删除、故障注入和 SESSDATA 排除。

## Related

`EXECUTION_PLAN.md` 第 11 节、`docs/baseline/DATA_MODEL.md`、`docs/baseline/SECURITY.md`。
