import { expect, test } from '@playwright/test';

test('persists a daily task, recurring task and note through page refreshes', async ({ page }) => {
  const suffix = `${Date.now()}`;
  const taskTitle = `端到端任务 ${suffix}`;
  const recurringTitle = `端到端固定任务 ${suffix}`;
  const noteContent = `端到端小记 ${suffix}`;
  const date = '2026-12-31';

  await page.goto('/tasks');
  const taskEditor = page.locator('form.editor-card');
  await taskEditor.getByLabel('标题').fill(taskTitle);
  await taskEditor.getByLabel('日期').fill(date);
  await taskEditor.getByRole('button', { name: '添加任务' }).click();
  await expect(page.getByRole('heading', { name: taskTitle })).toBeVisible();
  await page.reload();
  await page.getByLabel('切换日期').fill(date);
  await expect(page.getByRole('heading', { name: taskTitle })).toBeVisible();

  await page.goto('/recurring');
  const recurringEditor = page.locator('form.editor-card');
  await recurringEditor.getByLabel('标题').fill(recurringTitle);
  await recurringEditor.getByLabel('开始').fill(date);
  await recurringEditor.getByRole('button', { name: '创建' }).click();
  await expect(page.locator(`input[value="${recurringTitle}"]`)).toBeVisible();
  await page.reload();
  await expect(page.locator(`input[value="${recurringTitle}"]`)).toBeVisible();

  await page.goto('/tasks');
  await page.getByLabel('切换日期').fill(date);
  await expect(page.getByRole('heading', { name: taskTitle })).toBeVisible();
  await expect(page.getByRole('heading', { name: recurringTitle })).toBeVisible();

  await page.goto('/notes');
  const noteEditor = page.locator('form.editor-card');
  await noteEditor.getByLabel('内容').fill(noteContent);
  await noteEditor.getByRole('button', { name: '保存小记' }).click();
  await expect(page.getByText(noteContent)).toBeVisible();
  await page.reload();
  await expect(page.getByText(noteContent)).toBeVisible();

  await page.goto('/learning');
  await page.getByRole('button', { name: '学习系列' }).click();
  const seriesName = `端到端学习系列 ${suffix}`;
  await page.getByLabel('新系列名称').fill(seriesName);
  await page.getByRole('button', { name: '创建系列' }).click();
  await expect(
    page.getByRole('region', { name: '学习系列', exact: true }).getByText(seriesName, {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole('button', { name: `编辑系列 ${seriesName}` }).click();
  await expect(page.locator(`input[value="${seriesName}"]`)).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: '学习系列' }).click();
  await expect(
    page.getByRole('region', { name: '学习系列', exact: true }).getByText(seriesName, {
      exact: true,
    }),
  ).toBeVisible();
});

test('business pages fit a 360px viewport without page-level horizontal overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });

  for (const path of [
    '/overview',
    '/tasks',
    '/overdue',
    '/recurring',
    '/notes',
    '/learning',
    '/review',
  ]) {
    await page.goto(path);
    await expect(page.locator('h1')).toBeVisible();
    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  }
});
