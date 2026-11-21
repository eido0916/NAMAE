import { test, expect as baseExpect } from '@playwright/test';
import { countryNativeNames, getUiCopy, getCountryPickerCopy } from '../src/lib/ui-copy';
import { getDetailCopy, getDetailReadingCopy } from '../src/lib/detail-copy';

const additions = ['IT','ES','PT','BR','CN','TW','NL','SE','DK','NO','FI','PL','RU','TR'];
const expect = baseExpect.configure({ timeout: 30000 });
test('new language choices localize the form, country search and validation', async ({ page }) => {
  test.setTimeout(300000);
  for (const code of additions) {
    await page.goto('http://localhost:3000/name');
    await page.locator('.country-select-trigger').click();
    await page.locator('.country-select').getByRole('combobox').fill(countryNativeNames[code]);
    await page.getByRole('option').filter({ hasText: countryNativeNames[code] }).first().click();
    const copy = getUiCopy(code);
    await expect(page.locator('html')).toHaveAttribute('lang', copy.lang);
    await expect(page.locator('.gender-options')).toContainText(copy.male);
    await expect(page.locator('.gender-options')).toContainText(copy.female);
    await expect(page.getByRole('button', { name: copy.submitName })).toBeVisible();
    await page.locator('#name').fill('123');
    await page.getByRole('button', { name: copy.submitName }).click();
    await expect(page.locator('#form-error')).toContainText(copy.invalidName);
    await page.locator('.country-select-trigger').click();
    await expect(page.locator('.country-select').getByRole('combobox')).toHaveAttribute('placeholder', getCountryPickerCopy(code).search);
  }
});

test('new languages persist through results and Japan detail errors', async ({ page }) => {
  test.setTimeout(300000);
  await page.route('**/data/name-details/manifest.json', route => route.abort());
  await page.route('**/api/name-details', route => route.fulfill({ json: { people: [], characters: [], lookup: { state: 'unavailable' } } }));
  for (const code of ['IT','BR','TW','RU','TR']) {
    await page.goto('http://localhost:3000/name');
    await page.locator('.country-select-trigger').click();
    await page.locator('.country-select').getByRole('combobox').fill(countryNativeNames[code]);
    await page.getByRole('option').filter({ hasText: countryNativeNames[code] }).first().click();
    await page.locator('.examples button').first().click();
    const copy = getUiCopy(code);
    await page.getByRole('button', { name: copy.submitName }).click();
    await expect(page.locator('.result-heading h1')).toHaveText(copy.resultTitle);
    const japan = page.locator('.match-card').filter({ hasText: 'Japan' });
    await expect(japan).toBeVisible();
    await japan.getByRole('button').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toHaveAttribute('lang', copy.lang);
    await expect(dialog.getByRole('alert')).toContainText(getDetailCopy(code).error);
    await expect(dialog.locator('.detail-reading')).toHaveText(getDetailReadingCopy(code).missing);
    await expect(dialog.getByRole('button', { name: getDetailCopy(code).retry })).toBeVisible();
    if (code === 'TW') await dialog.screenshot({ path: 'test-results/traditional-chinese-details.png', animations: 'disabled' });
  }
});
