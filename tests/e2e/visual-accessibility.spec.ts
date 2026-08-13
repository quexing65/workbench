import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const fixedTime = new Date('2026-08-13T04:00:00.000Z');

test('matches the desktop and mobile review references', async ({ page }) => {
  await page.clock.setFixedTime(fixedTime);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/review');
  await expect(page.getByRole('heading', { name: '回顾' })).toBeVisible();
  await expect(page).toHaveScreenshot('review-desktop.png', { animations: 'disabled' });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page).toHaveScreenshot('review-mobile.png', { animations: 'disabled' });
});

test('supports core task and note flows from the keyboard', async ({ page }) => {
  await page.clock.setFixedTime(fixedTime);
  const suffix = String(Date.now());
  const taskTitle = `键盘任务 ${suffix}`;
  const noteContent = `键盘小记 ${suffix}`;

  await page.goto('/tasks');
  const taskEditor = page.locator('form.editor-card');
  await taskEditor.getByLabel('标题').focus();
  await page.keyboard.type(taskTitle);
  await page.keyboard.press('Tab');
  await page.keyboard.type('只使用键盘保存');
  await taskEditor.getByRole('button', { name: '添加任务' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: taskTitle })).toBeVisible();
  await page.getByRole('button', { name: '完成' }).last().focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('已完成').last()).toBeVisible();

  await page.goto('/notes');
  await page.locator('form.editor-card').getByLabel('内容').focus();
  await page.keyboard.type(noteContent);
  await page.keyboard.press('Control+Enter');
  await expect(page.getByText(noteContent)).toBeVisible();
});

test('honors reduced motion and has no blocking mobile accessibility violations', async ({
  page,
}) => {
  await page.clock.setFixedTime(fixedTime);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/overview');
  await expect(page.getByRole('heading', { name: '把今天，安稳地放在眼前。' })).toBeVisible();
  const duration = await page
    .locator('.nav-link')
    .first()
    .evaluate((element) => Number.parseFloat(getComputedStyle(element).transitionDuration));
  expect(duration).toBeLessThanOrEqual(0.000_01);

  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter(
      (violation) => violation.impact === 'serious' || violation.impact === 'critical',
    ),
  ).toEqual([]);
});
