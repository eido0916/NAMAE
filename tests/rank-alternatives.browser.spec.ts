import { test, expect } from '@playwright/test';
import { getUiCopy } from '../src/lib/ui-copy';

test('Argentina Leo and Japan show the same published rank with the correct Japanese survey year', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('http://localhost:3000/name');
  await page.locator('.country-select-trigger').click();
  await page.locator('.country-select').getByRole('combobox').fill('Argentina');
  await page.getByRole('option').filter({ hasText: 'Argentina' }).first().click();
  await page.locator('#name').fill('leo');
  await page.getByRole('button', { name: getUiCopy('AR').submitName }).click();
  await expect(page.locator('.rank strong')).toHaveText('#76', { timeout: 30000 });
  const japan = page.locator('.match-card').filter({ hasText: 'Japan' });
  await expect(japan.locator('h3')).toHaveText('だん');
  await expect(japan.locator('.match-bottom b')).toHaveText('#76');
  await expect(japan.locator('.match-source')).toContainText('2024');
  await page.setViewportSize({ width: 390, height: 844 });
  await japan.screenshot({ path: 'test-results/japan-same-rank-76.png', animations: 'disabled' });
});
