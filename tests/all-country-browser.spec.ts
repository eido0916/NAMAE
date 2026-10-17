import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

test("deep surname inputs receive clearly identified country dictionary candidates", async ({ page }) => {
  test.setTimeout(90000);
  const japan = JSON.parse(readFileSync("src/data/jp/surname/sample.json", "utf8"));
  const source = japan.records.find((r: { rank: number }) => r.rank === 10000);
  await page.goto("http://localhost:3000/surname");
  await page.locator("#name").fill(source.name);
  await page.getByRole("button", { name: "世界の苗字を見る" }).click();
  await expect(page.locator(".rank strong")).toHaveText("#10000", { timeout: 20000 });
  for (const country of ["Germany", "South Korea"]) {
    const card = page.getByRole("article").filter({ hasText: country });
    await expect(card).toContainText(/人気順位のない名前辞書|資料内参考順位/, { timeout: 20000 });
    await expect(card).not.toContainText("#undefined");
  }
  await page.locator(".result-country-picker summary").click();
  for (const [label, country] of [["バングラデシュ", "Bangladesh"], ["モルディブ", "Maldives"], ["スリナム", "Suriname"]]) {
    await page.locator(".result-country-options label").filter({ hasText: label }).click();
    const card = page.getByRole("article").filter({ hasText: country });
    await expect(card).toContainText(/資料内参考順位|名前辞書/, { timeout: 20000 });
    await expect(card).not.toContainText("データを読み込めませんでした");
  }
});

test("countries formerly missing given-name datasets work for male and female inputs", async ({ page }) => {
  test.setTimeout(90000);
  for (const [name, gender] of [["じゅん", "男性"], ["さゆき", "女性"]]) {
    await page.goto("http://localhost:3000/name");
    await page.locator("#name").fill(name);
    await page.locator(".gender-options label").filter({ hasText: gender }).click();
    await page.getByRole("button", { name: "世界の名前を見る" }).click();
    await expect(page.locator(".rank strong")).toContainText("#", { timeout: 20000 });
    await page.locator(".result-country-picker summary").click();
    for (const [label, country] of [["キューバ", "Cuba"], ["ドミニカ共和国", "Dominican Republic"], ["フィジー", "Fiji"]]) {
      await page.locator(".result-country-options label").filter({ hasText: label }).click();
      const card = page.getByRole("article").filter({ hasText: country });
      await expect(card).toContainText(/資料内参考順位|名前辞書/, { timeout: 20000 });
      await expect(card).not.toContainText("データを読み込めませんでした");
    }
  }
});
