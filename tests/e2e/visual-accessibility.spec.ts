import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const fixedTime = new Date('2026-08-13T04:00:00.000Z');

test('matches the desktop and mobile review references', async ({ page }) => {
  await page.clock.setFixedTime(fixedTime);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/review');
  await expect(page.getByRole('heading', { name: '回顾' })).toBeVisible();
  // 等待连接状态就绪，避免快照在“正在连接/已连接”之间摇摆。
  await expect(page.locator('.health.health--ok').first()).toBeVisible();
  // 再等待回顾数据加载完成：健康指示器就绪时 /review 请求可能仍在途中，
  // 此时指标卡显示占位符，直接截图会与已加载的基准图产生竞态差异。
  // 固定时钟窗口内无计划数据，空态文案是确定性的加载完成标志。
  await expect(page.getByText('这段时间还没有计划，因此不计算完成率。')).toBeVisible();
  // CI runner 与本地存在稳定约 2% 的字体/渲染差异（中文字形抗锯齿不同），
  // 逐像素比对天然无法跨环境一致；给予 3% 容差覆盖环境噪声，
  // 真实 UI 回归（布局、文案、配色）远超该量级，仍会被捕获。
  await expect(page).toHaveScreenshot('review-desktop.png', {
    animations: 'disabled',
    maxDiffPixelRatio: 0.03,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  // 移动端顶栏有独立的连接状态展示，截图前同样等它就绪。
  await expect(page.locator('.mobile-header .health.health--ok')).toBeVisible();
  // 健康状态文案存在亚像素级的字体渲染抖动，与回顾页内容无关，遮罩后比较；
  // 遮罩框边缘仍可能残留个位数像素偏移，给予极小容差。
  await expect(page).toHaveScreenshot('review-mobile.png', {
    animations: 'disabled',
    mask: [page.locator('.mobile-header .health')],
    maxDiffPixels: 16,
  });
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
