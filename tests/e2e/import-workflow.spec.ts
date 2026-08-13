import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { openPromise } from 'yauzl';

function personalBackup() {
  return {
    app: 'personal-workbench',
    version: 3,
    exportedAt: '2026-08-13T12:00:00.000Z',
    data: {
      version: 3,
      revision: 1,
      updatedAt: '2026-08-13T12:00:00.000Z',
      tasks: [
        {
          id: 'e2e-import-task',
          title: '端到端导入任务',
          date: '2027-01-15',
          status: 'active',
          createdAt: '2026-08-13T01:00:00.000Z',
          updatedAt: '2026-08-13T01:00:00.000Z',
        },
      ],
      notes: [],
      studyItems: [],
      fixedTasks: [],
      fixedTaskDays: [],
      tombstones: [],
    },
  };
}

test('preflights and confirms a Personal import without exposing the token', async ({ page }) => {
  await page.goto('/data');
  await page.getByLabel('备份文件').setInputFiles({
    name: 'personal-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(personalBackup())),
  });
  await page.getByRole('button', { name: '预检并生成对账报告' }).click();
  await expect(page.getByRole('heading', { name: '可以安全应用' })).toBeVisible();
  await expect(page.getByText('task', { exact: true })).toBeVisible();
  await expect(page.getByText(/迁移状态始终为 false/)).toBeVisible();
  await expect(page.locator('body')).not.toContainText('confirmationToken');

  const applyButton = page.getByRole('button', { name: '创建快照并事务导入' });
  await expect(applyButton).toBeDisabled();
  await page.getByRole('checkbox').check();
  await applyButton.click();
  await expect(page.getByRole('heading', { name: '导入已完成' })).toBeVisible();

  await page.goto('/tasks');
  await page.getByLabel('切换日期').fill('2027-01-15');
  await expect(page.getByRole('heading', { name: '端到端导入任务' })).toBeVisible();
});

test('data import page has no blocking accessibility violations at mobile width', async ({
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
