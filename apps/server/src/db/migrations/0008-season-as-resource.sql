-- 合集改为单资源形态：合集=learning_resources 一行，分集=learning_parts 一行。
-- 回退 0007 的系列耦合（合集不再落成系列），
-- 资源表新增 bili_season_id 作为合集幂等键，分P表新增 episode_bvid 支撑分集跳转与同步匹配。
DROP INDEX IF EXISTS learning_series_bili_season;
ALTER TABLE learning_series DROP COLUMN bili_season_id;

ALTER TABLE learning_resources ADD COLUMN bili_season_id INTEGER;
CREATE UNIQUE INDEX learning_resources_bili_season
ON learning_resources(bili_season_id)
WHERE deleted_at_ms IS NULL AND bili_season_id IS NOT NULL;

ALTER TABLE learning_parts ADD COLUMN episode_bvid TEXT;
CREATE UNIQUE INDEX learning_parts_episode_bvid
ON learning_parts(resource_id, episode_bvid)
WHERE episode_bvid IS NOT NULL AND deleted_at_ms IS NULL;
