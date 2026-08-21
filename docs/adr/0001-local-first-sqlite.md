# ADR 0001：采用 local-first Node + SQLite

- Status: Accepted
- Date: 2026-08-13

## Context

工作台以本机个人数据和 B站浏览器能力为核心。浏览器 localStorage 持久性不足，
Cloudflare/D1 又无法直接承担 CDP、Windows 凭据和本机浏览器操作。

## Decision

使用 Node 24 本机服务和 `node:sqlite`。正式服务只监听 127.0.0.1，SQLite 开启
WAL、foreign_keys、busy_timeout；开发数据放 `.local`，稳定版放 LOCALAPPDATA。

## Alternatives considered

- 仅 localStorage：部署简单，但不适合作为重要数据唯一副本。
- Cloudflare D1：可多设备，但不能承载本机 CDP/DPAPI，第一版复杂度过高。
- 直接续写 qoder 数据库：缺少正式迁移且旧 settings 含明文凭据。

## Consequences

正面：单机跨浏览器共享数据、一致备份、可测试迁移、本机能力自然集成。
负面：必须启动本机服务，需处理数据库锁、迁移、安全停服和恢复。

## Migration and rollback

旧数据只通过两阶段导入进入新库。切换前保留两个旧项目 30 天；失败可停止 vNext 并继续旧版。

## Testing and verification

验证 WAL/foreign keys、重启持久性、迁移 checksum、并发写入、integrity 和真实恢复演练。

## Related

`EXECUTION_PLAN.md`、`docs/baseline/ARCHITECTURE.md`、`docs/baseline/DATA_MODEL.md`。
