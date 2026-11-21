import { test, expect as baseExpect } from '@playwright/test';
const expect = baseExpect.configure({timeout:30000});
test.describe.configure({timeout:120000});
async function choose(page: import('@playwright/test').Page, country:string) {
  await page.goto('http://localhost:3000/name/');
  await page.locator('.country-select-trigger').click();
  await page.locator('.country-select').getByRole('combobox').fill(country);
  await page.getByRole('option').filter({hasText:country}).first().click();
  await expect(page.locator('.form-card button[type="submit"]')).toBeEnabled();
}
test('Chinese given names use Han, published newborn ranks and explicit homophone selection', async ({page}) => {
  await choose(page,'China');
  await expect(page.locator('.examples')).toContainText('沐宸');
  await expect(page.locator('.examples')).not.toContainText('Jack');
  await page.locator('#name').fill('Yichen');
  await expect(page.locator('.chinese-surname-options')).toContainText('奕辰');
  await expect(page.locator('.chinese-surname-options')).toContainText('亦辰');
  await expect(page.locator('.form-card button[type="submit"]')).toBeDisabled();
  await page.locator('.chinese-surname-options').getByRole('button',{name:/^奕辰/}).click();
  await page.locator('.form-card button[type="submit"]').click();
  await expect(page.locator('.original h2')).toHaveText('奕辰');
  await expect(page.locator('.rank strong')).toHaveText('#5');
  await expect(page.locator('.original')).toContainText('2021 新生儿 / newborns');
  const context = page.locator('.original .ranking-context');
  await context.locator('summary').click();
  await expect(context).toContainText('2020');
  await expect(context.getByRole('link')).toHaveAttribute('href', new RegExp('^https:'));
  const destinationContext = page.locator('.match-card-interactive .ranking-context').first();
  await destinationContext.locator('summary').click();
  await expect(destinationContext.getByRole('link')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.screenshot({path:'test-results/native-chinese-given.png',fullPage:true});
});
test('Russian romanized input is presented in Cyrillic with its source ranking', async ({page}) => {
  await choose(page,'Russia');
  await expect(page.locator('.examples')).toContainText('Александр');
  await page.locator('#name').fill('Alexander');
  await page.locator('.form-card button[type="submit"]').click();
  await expect(page.locator('.original h2')).toHaveText('Александр');
  await expect(page.locator('.rank strong')).toHaveText('#1');
  await expect(page.locator('.original')).toContainText('Onomaverse');
  await page.screenshot({path:'test-results/native-russian-given.png',fullPage:true});
});
test('Arabic native input and image saving keep the local spelling', async ({page}) => {
  await choose(page,'Saudi Arabia');
  await page.locator('#name').fill('خالد');
  await page.locator('.form-card button[type="submit"]').click();
  await expect(page.locator('.original h2')).toHaveText('خالد');
  await expect(page.locator('.original h2')).toHaveAttribute('dir','auto');
  await expect(page.locator('.rank strong')).toHaveText(/#\d+/);
  await expect(page.locator('.match-source').first()).not.toContainText('no rank match');
  const download=page.waitForEvent('download');
  await page.locator('.result-actions .primary').click();
  expect((await download).suggestedFilename()).toBe('namae-story.png');
  await page.screenshot({path:'test-results/native-arabic-given.png',fullPage:true});
});

test('missing source rank shows unavailable data without substitute names', async ({page}) => {
  await choose(page,'United States');
  await page.locator('#name').fill('UnlistedName');
  await page.locator('.form-card button[type="submit"]').click();
  await expect(page).toHaveURL(/\/result\//);
  await expect(page.locator('.match-card-interactive')).toHaveCount(0);
  const cards = page.locator('.match-card h3');
  expect(await cards.count()).toBeGreaterThan(0);
  for (const card of await cards.all()) await expect(card).toHaveText('Data unavailable');
});
