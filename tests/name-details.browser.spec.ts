import { getUiCopy } from '../src/lib/ui-copy';
import { getDetailReadingCopy } from '../src/lib/detail-copy';
import { getDetailCopy } from '../src/lib/detail-copy';
import { test, expect } from '@playwright/test';

test.beforeEach(async ({page})=>{
  await page.route('**/api/name-details',route=>route.fulfill({json:{people:[],characters:[],lookup:{state:'unavailable'}}}));
});

test('Japanese input language is retained when opening a Korean name', async ({ page }) => {
  await page.goto('http://localhost:3000/name');
  await page.locator('#name').fill('りつ');
  await page.getByRole('button', { name: '世界の名前を見る' }).click();
  const card = page.locator('.match-card').filter({ hasText: 'South Korea' });
  await expect(card.locator('h3')).toHaveText('현준');
  await card.getByRole('button').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toHaveAttribute('lang', 'ja');
  await expect(dialog).toContainText('同じ名前の著名人');
  await expect(dialog).toContainText('石鉉俊');
  await expect(dialog).toContainText('国籍: 大韓民国');
  await expect(dialog.locator('.detail-reading')).toContainText('読み方');
  await expect(dialog.getByRole('button', { name: '詳細を閉じる' })).toBeVisible();
  await dialog.screenshot({ path: 'test-results/korean-localized-details.png', animations: 'disabled' });
});

test('a missing name is collected on demand, persisted results render and lookup deduplicates on reopen',async({page})=>{
  await page.route('**/data/name-details/manifest.json',route=>route.fulfill({json:{version:1,shards:{}}}));
  await page.unroute('**/api/name-details');
  const requests: unknown[]=[];
  await page.route('**/api/name-details',async route=>{
    const request=route.request().postDataJSON();
    requests.push(request);
    if(requests.length===1) return route.fulfill({status:202,json:{people:[],characters:[],lookup:{state:'running',retryAfter:2}}});
    return route.fulfill({json:{people:[{id:'fixture:person',name:'収集結果の人物',nationalities:['アメリカ合衆国'],occupations:['俳優'],source:'https://www.wikidata.org/wiki/Q1',updatedAt:'2026-10-15',confidence:0.98}],characters:[],lookup:{state:'complete'}}});
  });
  await page.goto('http://localhost:3000');
  await page.getByRole('button',{name:'じゅん',exact:true}).click();
  await page.getByRole('button',{name:'世界の名前を見る'}).click();
  const card=page.locator('.match-card').filter({hasText:'United States'});
  const name=await card.locator('h3').textContent();
  await card.getByRole('button').click();
  await expect(page.getByRole('dialog')).toContainText('同じ名前の人物を探しています');
  await expect(page.getByRole('dialog')).toContainText('収集結果の人物',{timeout:10000});
  expect(requests).toEqual([{country:'US',type:'given_name',name},{country:'US',type:'given_name',name}]);
  await page.getByRole('button',{name:'詳細を閉じる'}).click();
  await card.getByRole('button').click();
  await expect(page.getByRole('dialog')).toContainText('収集結果の人物');
  expect(requests).toHaveLength(2);
});

test('Japanese input language is retained for every destination when data fails', async ({page}) => {
  test.setTimeout(60000);
  await page.route('**/data/name-details/manifest.json',route=>route.abort());
  await page.goto('http://localhost:3000/name');
  await page.locator('#name').fill('瑛真');
  await page.getByRole('radio',{name:'女性',exact:true}).check();
  await page.getByRole('button',{name:'世界の名前を見る'}).click();
  await expect(page).toHaveURL(/\/result\/?$/,{timeout:30000});
  for (const [country,name] of [['United States','Mary'],['United Kingdom','Olivia'],['France','MARIE'],['South Korea','서윤'],['Germany','Emilia']]) {
    const card=page.locator('.match-card').filter({hasText:country});
    await expect(card.locator('h3')).toHaveText(name);
    await card.getByRole('button').click();
    const dialog=page.getByRole('dialog');
    const copy = getDetailCopy('JP');
    await expect(dialog.locator('.detail-reading')).toContainText('読み方');
    await expect(dialog.getByRole('alert')).toBeVisible();
    await expect(dialog.getByRole('alert')).toContainText(copy.error);
    await dialog.getByRole('button',{name:copy.close}).click();
  }
});

test('mobile details are lazy, accessible, cached and recover from network failures', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let manifestRequests = 0;
  const external: string[] = [];
  page.on('request', (request) => { if (/wikidata\.org/.test(request.url())) external.push(request.url()); });
  await page.route('**/data/name-details/manifest.json', (route) => {
    manifestRequests++;
    if (manifestRequests === 1) return route.abort();
    return route.fulfill({ json: { version: 1, shards: {} } });
  });
  await page.goto('http://localhost:3000');
  await page.getByRole('button', { name: 'じゅん', exact: true }).click();
  await page.getByRole('button', { name: '世界の名前を見る' }).click();
  const trigger = page.locator('.match-detail-trigger').first();
  await expect(trigger).toBeVisible();
  expect(manifestRequests).toBe(0);
  await page.locator('.match-card').first().click({ position: { x: 4, y: 40 } });
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('alert')).toContainText('読み込めませんでした');
  await dialog.getByRole('button', { name: '再読み込み' }).click();
  await expect(dialog).toContainText('まだ確認できていません');
  await expect(dialog.getByRole('heading', { level: 2 })).not.toBeEmpty();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(dialog).toContainText('まだ確認できていません');
  expect(manifestRequests).toBe(2);
  expect(external).toEqual([]);
  await dialog.getByRole('button', { name: '詳細を閉じる' }).click();
});

test('verified reading, people and characters render in details', async ({ page }) => {
  await page.route('**/data/name-details/manifest.json', (route) => route.fulfill({ json: { version: 1, shards: Object.fromEntries(Array.from({length:64},(_,i) => [`US/given_name/${String(i).padStart(2,'0')}`,'/data/name-details/US-given_name-00.abcdef.json'])) } }));
  await page.route('**/data/name-details/US-given_name-00.abcdef.json', (route) => route.fulfill({ json: {} }));
  await page.goto('http://localhost:3000');
  await page.getByRole('button', { name: 'じゅん', exact: true }).click();
  await page.getByRole('button', { name: '世界の名前を見る' }).click();
  const card = page.locator('.match-card').filter({ hasText: 'United States' });
  const name = (await card.locator('h3').textContent())!.normalize('NFKC').trim().toLocaleLowerCase('und');
  await page.unroute('**/data/name-details/US-given_name-00.abcdef.json');
  await page.route('https://example.org/fixture-portrait.svg', (route) => route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="48" height="64"><rect width="48" height="64" fill="#bbb"/></svg>'}));
  const person = {
    id:'fixture:person',name:'表示確認用人物',nationalities:['アメリカ'],occupations:['俳優'],description:'テスト用説明',
    source:'https://www.wikidata.org/wiki/Q1',updatedAt:'2026-10-15',confidence:1,
    image:{url:'https://example.org/fixture-portrait.svg',license:'CC BY-SA 2.0',credit:'撮影者（テスト）',source:'https://commons.wikimedia.org/wiki/File:Test'},
  };
  const character = {id:'fixture:character',name:'表示確認用キャラクター',work:'表示確認用作品',nationalities:[],occupations:[],source:'https://www.wikidata.org/wiki/Q2',updatedAt:'2026-10-15',confidence:1};
  await page.route('**/data/name-details/US-given_name-00.abcdef.json', (route) => route.fulfill({ json: { [name]: { reading:{text:'テストの読み',source:'https://www.wikidata.org/wiki/Q1'},people:[person],characters:[character] } } }));
  await card.getByRole('button').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('テストの読み');
  await expect(dialog).toContainText('表示確認用人物');
  await expect(dialog).toContainText('登場作品: 表示確認用作品');
  await expect(dialog.getByRole('link', {name:'出典を見る ↗'})).toHaveCount(2);
  await expect(dialog.getByRole('img',{name:'表示確認用人物'})).toHaveJSProperty('naturalWidth',48);
  await expect(dialog.getByRole('link',{name:'撮影者（テスト）'})).toHaveAttribute('href','https://commons.wikimedia.org/wiki/File:Test');
  await expect(dialog.getByRole('link',{name:'CC BY-SA 2.0'})).toHaveAttribute('href','https://creativecommons.org/licenses/by-sa/2.0/');
});


test('reading, failures and retry controls follow the initial country even for Japan', async ({ page }) => {
  test.setTimeout(120000);
  await page.route('**/data/name-details/manifest.json', route => route.abort());
  for (const [code, country, input] of [['KR','대한민국','서준'],['US','United States','James'],['FR','France','GABRIEL'],['DE','Deutschland','Noah']]) {
    await page.goto('http://localhost:3000/name');
    await page.locator('.country-select-trigger').click();
    await page.locator('.country-select').getByRole('combobox').fill(country);
    await page.getByRole('option').filter({ hasText: country }).first().click();
    await page.locator('#name').fill(input);
    await page.getByRole('button', { name: getUiCopy(code).submitName }).click();
    const card = page.locator('.match-card').filter({ hasText: 'Japan' });
    await expect(card).toBeVisible();
    await card.getByRole('button').click();
    const dialog = page.getByRole('dialog');
    const copy = getDetailCopy(code);
    await expect(dialog.getByRole('alert')).toContainText(copy.error);
    await expect(dialog.locator('.detail-reading')).toHaveText(getDetailReadingCopy(code).missing);
    await expect(dialog.getByRole('button', { name: copy.retry })).toBeVisible();
    await expect(dialog).not.toContainText('詳細情報を読み込めませんでした');
    await expect(dialog).not.toContainText('読み方は未確認です');
    if (code === 'KR') await dialog.screenshot({ path: 'test-results/korean-input-japan-details.png', animations: 'disabled' });
    await dialog.getByRole('button', { name: copy.close }).click();
  }
});
