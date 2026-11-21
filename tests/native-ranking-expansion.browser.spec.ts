import { test, expect } from '@playwright/test';

test('expanded Egyptian names and Russian surnames work in the delivered datasets', async ({page}) => {
  test.setTimeout(120000);
  for (const [path, country, name, rank] of [
    ['/name/', 'Egypt', 'محمد', '#3'],
    ['/surname/', 'Russia', 'Захаров', '#84'],
  ]) {
    await page.goto(`http://localhost:3000${path}`);
    await page.locator('.country-select-trigger').click();
    await page.locator('.country-select').getByRole('combobox').fill(country);
    await page.getByRole('option').filter({hasText:country}).first().click();
    await expect(page.locator('.form-card button[type="submit"]')).toBeEnabled({timeout:30000});
    await page.locator('#name').fill(name);
    await page.locator('.form-card button[type="submit"]').click();
    await expect(page.locator('.original h2')).toHaveText(name, {timeout:30000});
    await expect(page.locator('.rank strong')).toHaveText(rank);
    await expect(page.locator('.original')).toContainText('Onomaverse');
  }
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
