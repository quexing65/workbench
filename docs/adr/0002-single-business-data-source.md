# ADR 0002：SQLite 作为唯一业务数据源

- Status: Accepted
- Date: 2026-08-13

## Context

localStorage 与 SQLite 双写会产生冲突、失败顺序和恢复语义问题，也会让不同页面出现不同事实。

## Decision

浏览器只通过 `/api/v1` 访问业务数据，SQLite 是唯一事实源。localStorage 仅保存主题、
折叠和上次 UI 选择等可丢失偏好。旧库与旧 JSON 永远只读。

## Alternatives considered

- localStorage 为主、SQLite 备份：无法保证一致与跨浏览器共享。
- 双写并定期合并：故障和冲突模型过于复杂。
- 直接复用旧 qoder DB：无法安全承载新 schema 和幂等导入。

## Consequences

正面：数据归属清晰，事务、备份、恢复和并发语义统一。
负面：UI 全部异步化，必须实现 loading/error/retry/busy 和 revision 409 处理。

## Migration and rollback

阶段 7 经 preflight/apply 导入旧数据。vNext 未通过对账前不关闭旧版；不实施双写回滚。

## Testing and verification

扫描业务源码禁止 localStorage；API 失败时 UI 不假成功；重启、并发冲突和回滚测试通过。

## Related

`docs/ARCHITECTURE.md`、`docs/DATA_MODEL.md`、ADR 0005。
