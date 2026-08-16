# ADR 0003：分离最远进度与真实续播位置

- Status: Accepted
- Date: 2026-08-13（2026-08-15 增补实际观看时长口径）

## Context

B站历史可能回看旧分P。单一进度字段无法同时表达学习成果和下一次真正续播点；页码也不是稳定分P身份。

## Decision

资源、分P和进度分表；cid 为稳定分P身份。furthest 只进不退，resume 可前进或回退；
lastObservedAt 选择最新可靠观察，manualOverrideAt 阻止旧历史复活重置结果。所有来源统一调用
纯函数 `mergeLearningObservation`。

Personal completed 只完成对应分P；qoder finished 可完成整部。reset 清空整部/分P进度并更新
manualOverrideAt；complete 与 uncomplete 同样更新门槛。普通观察只有在
`observedAt > manualOverrideAt` 时才能改变被手动覆盖的状态；时间相等但内容不同必须给出
确定性冲突，不按导入或同步顺序覆盖。

## Alternatives considered

- 单一 progress：不能表达回看和最远成果。
- 只按 part number：分P重排后身份不稳定。
- 永远使用最大值续播：会把用户错误送回最远点而非最近停留点。

## Consequences

正面：进度条稳定、续播真实、重置不会被旧历史覆盖。
负面：schema、导入映射和同步规则更复杂，必须有高覆盖率纯函数测试。

## Migration and rollback

qoder progress/resume/override 分别映射；Personal BV:pN 映射到指定分P。失败时回滚导入事务。

## Testing and verification

覆盖前进、回退、旧历史、相同时间冲突、重置、完成、取消完成、多P、分P重排、时长变化和越界。

## 实际观看时长（2026-08-15 增补）

回顾页的学习时长不再以“分P最远进度之和”估算，改为累计**实际播放过的视频原速时长**：

- 相邻两次观察之间，观看增量 = `min(本次位置 − 上次位置, 墙钟间隔 × 3 + 15秒)`；
  超出封顶的推进量视为拖动跳过，不计；回退不计；首次观察只建立基准，不计时长。
- 口径是视频时间轴秒数：1.5 倍速看 40 实分钟计 60 分钟。乱序到达的旧观察不累计，避免重复计。
- 常量 `WATCH_RATE_CAP = 3`、`WATCH_GRACE_SECONDS = 15` 由 `@workbench/shared` 导出。
- 手动“看到秒数”与 B 站同步、遗留导入走同一套封顶规则（导入路径在
  `modules/imports/learning-progress-writer.ts`）。
- 累计值存入 `learning_part_progress.watched_seconds`；按天聚合存入
  `learning_watch_daily`（归属日期 = 后一次观察的 UTC+8 业务日），回顾区间统计只汇总该表，
  跨月不重复计。`reset` 只清进度，保留观看历史。
- 存量数据不回填：旧数据只有最远进度，无法还原实际观看，迁移后从 0 开始累计。

## Related

`docs/DATA_MODEL.md`、`EXECUTION_PLAN.md` 第 7.3 节。
