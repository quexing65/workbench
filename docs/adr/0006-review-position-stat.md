# ADR 0006：回顾页时间统计改为「合集当前观看位置」

- Status: Accepted
- Date: 2026-08-17

## Context

ADR 0003（2026-08-15 增补）把回顾页学习时长定义为累计实际播放秒数：重看会重复计、
拖动跳过不计、倍速按原速折算，且依赖逐日增量表 `learning_watch_daily`。用户反馈该口径
不合适：想知道的是「在这个合集中，现在看到的时刻离刚开始有多远」，即按内容位置的差值，
而不是花掉的播放时间。

## Decision

回顾页「观看进度」（原「学习时长」，`ReviewResponse.learningDuration`）改为当前状态快照：

- 每个资源的位置 = 续播分P之前所有分P全长 + `resume_seconds`；`resume` 回退时位置随之
  回退，拖动跳过的内容按位置直接计入。
- 手动 `completed = 1` 的资源按全部分P全长计（用户已声明看完）。
- 系列值 = 成员资源位置之和；未归入任何系列的资源计入「未分类」桶。
- 该指标与 `from/to` 回顾区间无关，由进度表现算，不再读取 `learning_watch_daily`。

`watched_seconds` 与 `learning_watch_daily` 的封顶累计逻辑保留在数据层，未来如需
「净学习时长」类指标仍可使用。

## Consequences

正面：口径直接对应用户心智模型（看到第几个小时），回看/重置后立即反映真实位置；
不依赖逐日聚合，无跨月重复计问题。
负面：失去时间维度的环比意义（两期查询返回同一值），前端去掉该指标的环比角标；
跳过的内容也被计为已覆盖的位置。

## Testing and verification

服务端 `apps/server/tests/insights.test.ts`：续播位置、手动完成按全长、多分P前置时长、
未分类桶、与 `learning_watch_daily` 数值解耦。前端
`apps/web/src/tests/insights-pages.test.tsx`：两期同值、无环比角标、空态文案。

## Related

取代 ADR 0003 增补节中「回顾区间统计只汇总 learning_watch_daily」的口径；
`docs/baseline/DATA_MODEL.md` 学习小节。
