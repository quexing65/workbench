import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { openPromise } from 'yauzl';

test('data backup page has no blocking accessibility violations at mobile width', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/data');
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter(
      (violation) => violation.impact === 'serious' || violation.impact === 'critical',
    ),
  ).toEqual([]);
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
});

test('downloads a controlled whole-database backup through the browser', async ({ page }) => {
  await page.goto('/data');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '创建并下载备份' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^personal-workbench-.+\.pwbk$/u);
  await expect(page.getByText('备份已通过浏览器下载，请妥善保存。')).toBeVisible();

  const path = await download.path();
  if (path === null) throw new Error('Playwright did not retain the downloaded backup');
  const archive = await openPromise(path, {
    autoClose: false,
    lazyEntries: true,
    strictFileNames: true,
    validateEntrySizes: true,
  });
  try {
    const entries: string[] = [];
    for await (const entry of archive.eachEntry()) entries.push(entry.fileName);
    expect(entries.sort()).toEqual(['manifest.json', 'workbench.sqlite']);
  } finally {
    archive.close();
  }
});
