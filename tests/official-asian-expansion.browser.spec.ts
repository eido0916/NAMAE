import { test, expect as baseExpect } from '@playwright/test';
const expect = baseExpect.configure({ timeout: 30000 });
test.setTimeout(120000);

test('new Chinese and Taiwanese native rankings work through the input form', async ({ page }) => {
  for (const [country, path, name, rank, year] of [
    ['China', 'name', '沐宸', '#1', '2021'],
    ['China', 'name', '宇航', '#7', '2020'],
    ['Taiwan', 'name', '家豪', '#1', '2023'],
    ['Taiwan', 'surname', '陳', '#1', '2023'],
    ['Taiwan', 'surname', '鄧', '#54', '2023'],
  ]) {
    await page.goto(`http://localhost:3000/${path}/`);
    await page.locator('.country-select-trigger').click();
    await page.locator('.country-select').getByRole('combobox').fill(country);
    await page.getByRole('option').filter({ hasText: country }).first().click();
    const submit = page.locator('.form-card button[type="submit"]');
    await expect(submit).toBeEnabled();
    await page.locator('#name').fill(name);
    await submit.click();
    await expect(page.locator('.original h2')).toHaveText(name);
    await expect(page.locator('.rank strong')).toHaveText(rank);
    await expect(page.locator('.original')).toContainText(year);
  }
});
