-- 学习资源自定义标题：用户可改写 B站原标题；NULL 表示未自定义，
-- 元数据同步（updateResource）只更新 title，不触碰本列。
ALTER TABLE learning_resources ADD COLUMN custom_title TEXT CHECK (
  custom_title IS NULL OR length(trim(custom_title)) BETWEEN 1 AND 500
);
