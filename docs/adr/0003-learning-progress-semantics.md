# ADR 0003：分离最远进度与真实续播位置

- Status: Accepted
- Date: 2026-08-13

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

## Related

`docs/DATA_MODEL.md`、`EXECUTION_PLAN.md` 第 7.3 节。
