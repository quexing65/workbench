# ADR 0004：使用 CurrentUser DPAPI 独立保存 B站凭据

- Status: Accepted
- Date: 2026-08-13

## Context

qoder 将 SESSDATA 明文放入 settings，整库备份也会携带凭据。vNext 必须把业务数据和登录秘密分离。

## Decision

定义 BiliCredentialStore。测试使用 Memory 实现；Windows 正式版使用 CurrentUser DPAPI，
加密 blob 放 `credentials/credentials.bin`。API 永不回显值、长度、片段或 hash；普通备份不含凭据。

## Alternatives considered

- SQLite/settings 明文：泄漏面和备份风险不可接受。
- `.env`：不适合 UI 更新，也容易进入进程和开发输出。
- 把凭据包含在备份：扩大秘密传播范围。

## Consequences

正面：数据库和普通备份泄漏时不直接暴露登录态。
负面：凭据绑定当前 Windows 用户/环境，恢复或换用户后需要重新登录；DPAPI adapter 需要 Windows 测试。

## Migration and rollback

旧 SESSDATA 默认只检测、不迁移。用户在 vNext 中重新登录；失败可清除 blob 并改用手动输入。

## Testing and verification

Memory/DPAPI roundtrip、清除、错误脱敏；扫描 API、日志、SQLite、备份和 argv 不含测试秘密。

## Related

`docs/SECURITY.md`、ADR 0001、ADR 0005。
