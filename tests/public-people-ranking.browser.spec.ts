import { test, expect as baseExpect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const expect = baseExpect.configure({ timeout: 30000 });
test.setTimeout(180000);
const manifest = JSON.parse(readFileSync('public/data/manifest.json', 'utf8'));
function sourceName(country: string, type: string) {
  const entry = manifest.appRankings.find((row: {country: string; type: string}) => row.country === country && row.type === type);
  const chunk = entry.chunks.find((row: {gender?: string; records: number}) => row.records > 0 && (type === 'surname' || row.gender === 'male'));
  return JSON.parse(readFileSync('public' + chunk.path, 'utf8')).records.find((row: {rank: number}) => row.rank > 10);
}
async function choose(page: import('@playwright/test').Page, country: string, type = 'surname') {
  await page.goto('http://localhost:3000/' + (type === 'surname' ? 'surname' : 'name') + '/');
  await page.locator('.country-select-trigger').click();
  await page.locator('.country-select').getByRole('combobox').fill(country);
  await page.getByRole('option').filter({ hasText: country }).first().click();
  await expect(page.locator('.form-card button[type="submit"]')).toBeEnabled();
  await expect(page.locator('#ranking-scope')).toHaveCount(0);
}
async function checkMatchingRanks(page: import('@playwright/test').Page, rank: number) {
  await expect(page.locator('.rank strong')).toHaveText('#' + rank);
  await expect(page.locator('.estimated-ranking-note')).toBeVisible();
  await expect(page.locator('.ranking-context')).toHaveCount(0);
  for (const card of await page.locator('.match-card-interactive').all()) {
    const localRank = await card.locator('.match-bottom b').textContent();
    if (localRank !== '#' + rank) await expect(card.locator('.match-bottom > span').last()).toContainText('#' + rank);
  }
}

test('a short ranking shows the actual local rank and the source rank equivalent', async ({ page }) => {
  // The selected name is in the first chunk, which already includes its full list size.
  await page.route('**/data/manifest.json', route => route.fulfill({ json: {
    ...manifest,
    appRankings: manifest.appRankings.map((entry: { country: string; type: string; chunks: unknown[] }) =>
      entry.country === 'JP' && entry.type === 'surname' ? { ...entry, chunks: entry.chunks.slice(0, 1) } : entry),
  } }));
  await page.goto('http://localhost:3000/surname/');
  await expect(page.locator('.form-card button[type="submit"]')).toBeEnabled();
  await page.locator('#name').fill('清田');
  await page.locator('.form-card button[type="submit"]').click();
  await expect(page.locator('.rank strong')).toHaveText('#801');
  await page.locator('.result-country-picker summary').click();
  await page.locator('.result-country-options label').filter({ hasText: 'グリーンランド' }).click();
  const greenland = page.getByRole('article').filter({ hasText: 'Greenland' });
  const jp = manifest.appRankings.find((entry: {country: string; type: string}) => entry.country === 'JP' && entry.type === 'surname');
  const gl = manifest.appRankings.find((entry: {country: string; type: string}) => entry.country === 'GL' && entry.type === 'surname');
  await expect(greenland.locator('.match-bottom b')).toHaveText('#' + Math.round(801 / jp.records * gl.records));
  await expect(greenland.locator('.match-bottom')).toContainText('#801相当');
  const us = page.getByRole('article').filter({ hasText: 'United States' });
  await expect(us.locator('.match-bottom b')).toHaveText('#801');
  await expect(us.locator('.match-bottom')).not.toContainText('相当');
});

test('a dictionary-only Japanese reading has no app rank or overseas matches', async ({ page }) => {
  await page.goto('http://localhost:3000/name/');
  await expect(page.locator('.form-card button[type="submit"]')).toBeEnabled();
  await page.locator('#name').fill('いまぬえる');
  await page.locator('.form-card button[type="submit"]').click();
  await expect(page).toHaveURL(/\/result\/?$/, { timeout: 90000 });
  await expect(page.locator('.rank strong')).toHaveText('データ未収録');
  await expect(page.locator('.match-card-interactive')).toHaveCount(0);
});
test('familiar Chinese and Korean surname positions and overseas positions agree', async ({ page }) => {
  await choose(page, 'China');
  await page.locator('#name').fill('李');
  await page.locator('.form-card button[type="submit"]').click();
  await checkMatchingRanks(page, 2);
  await expect(page.locator('.original h2')).toContainText('李');
  await expect(page.locator('.match-card-interactive')).not.toHaveCount(0);
  await page.screenshot({ path: 'test-results/app-ranking-china.png', fullPage: true });
  const download = page.waitForEvent('download');
  await page.locator('.result-actions .primary').click();
  await (await download).saveAs('test-results/app-ranking-story.png');
  await choose(page, 'South Korea');
  await page.locator('#name').fill('金');
  await page.locator('.form-card button[type="submit"]').click();
  await checkMatchingRanks(page, 1);
  await expect(page.locator('.original h2')).toHaveText('김');
});
test('native spellings and matching ordinal ranks work across countries on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [code, country] of [['RU', 'Russia'], ['TH', 'Thailand'], ['EG', 'Egypt'], ['TW', 'Taiwan'], ['US', 'United States']]) {
    const type = code === 'US' ? 'surname' : 'given_name';
    const record = sourceName(code, type);
    await choose(page, country, type);
    await page.locator('#name').fill(record.name);
    await page.locator('.form-card button[type="submit"]').click();
    await expect(page.locator('.original h2')).toHaveText(record.name);
    await checkMatchingRanks(page, record.rank);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
  await page.screenshot({ path: 'test-results/app-ranking-mobile.png', fullPage: true });
});
