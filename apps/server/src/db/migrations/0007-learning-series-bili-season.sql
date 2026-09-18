-- 学习系列关联 B站合集（ugc_season）：
-- 合集导入时按 bili_season_id 复用系列，唯一索引防止同一合集建出重复系列。
ALTER TABLE learning_series ADD COLUMN bili_season_id INTEGER;

CREATE UNIQUE INDEX learning_series_bili_season
ON learning_series(bili_season_id)
WHERE deleted_at_ms IS NULL AND bili_season_id IS NOT NULL;
