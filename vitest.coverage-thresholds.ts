/**
 * Single source of truth for the global coverage floor. Imported by the root
 * vitest.config.ts and apps/web/vite.config.ts so the thresholds cannot drift
 * apart. Stricter per-path overrides live in root vitest.config.ts only.
 */
export const baseCoverageThresholds = {
  branches: 80,
  functions: 85,
  lines: 85,
  statements: 85,
} as const;

/** 关键路径（migration、进度合并、凭据）的严格下限，见 docs/baseline/ARCHITECTURE.md。 */
export const criticalPathCoverageThresholds = {
  branches: 90,
  functions: 95,
  lines: 95,
  statements: 95,
} as const;
