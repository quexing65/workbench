import { expect, test } from '@playwright/test';

const fixedTime = new Date('2026-08-13T04:00:00.000Z');

/**
 * 空态视觉基线。本文件按文件名排在其他用例之前运行，此时端到端数据目录仍是空的，
 * 因此每一页都渲染确定的空态；其他用例写入的数据不会影响这里的像素。
 * 已加载数据后的页面基线仍由 visual-accessibility.spec.ts 覆盖。
 */
const pages = [
  ['/overview', '把今天，安稳地放在眼前。'],
  ['/tasks', '任务'],
  ['/overdue', '逾期'],
  ['/recurring', '固定任务'],
  ['/notes', '小记'],
  ['/learning', '学习'],
  ['/review', '回顾'],
  ['/data', '数据'],
  ['/settings', '设置'],
] as const;

test('matches the empty-state reference of every page', async ({ page }) => {
  await page.clock.setFixedTime(fixedTime);
  await page.setViewportSize({ width: 1440, height: 900 });

  for (const [route, heading] of pages) {
    await page.goto(route);
    await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible();
    await expect(page.locator('.health.health--ok').first()).toBeVisible();
    // 等本页的数据查询全部落地，避免截到加载态。
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot(`empty${route.replaceAll('/', '-')}.png`, {
      animations: 'disabled',
      maxDiffPixelRatio: 0.03,
    });
  }
});
