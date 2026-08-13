import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('renders the application shell and exposes health through the web origin', async ({
  page,
  request,
}) => {
  const healthResponse = await request.get('/api/v1/health');

  expect(healthResponse.ok()).toBe(true);
  const healthBody: unknown = await healthResponse.json();
  expect(healthBody).toMatchObject({
    status: 'ok',
    timeZone: 'Asia/Shanghai',
  });

  await page.goto('/');

  await expect(page).toHaveTitle(/Personal Workbench/i);
  await expect(page.locator('main')).toBeVisible();
  await expect(page.getByText('本机服务正常').first()).toBeVisible();
});

test('has no serious or critical accessibility violations', async ({ page }) => {
  await page.goto('/overview');
  await expect(page.getByText('本机服务正常').first()).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();
  const blockingViolations = results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  );

  expect(blockingViolations).toEqual([]);
});
