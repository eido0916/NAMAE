import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

test("expanded surnames resolve the same deep rank through the delivered country chunks", async ({ page }) => {
  test.setTimeout(90000);
  const dataset = JSON.parse(readFileSync("src/data/jp/surname/sample.json", "utf8"));
  const source = dataset.records.find((r: { rank: number }) => r.rank === 10000);
  await page.goto("http://localhost:3000/surname");
  await page.locator("#name").fill(source.name);
  await page.getByRole("button", { name: "世界の苗字を見る" }).click();
  await expect(page.locator(".rank strong")).toHaveText("#10000", { timeout: 20000 });
  await expect(page.getByRole("article").filter({ hasText: "United Kingdom" })).toContainText("#10000", { timeout: 20000 });
  await page.locator(".result-country-picker summary").click();
  for (const [label, country] of [["ベルギー", "Belgium"], ["ノルウェー", "Norway"], ["スイス", "Switzerland"]]) {
    await page.locator(".result-country-options label").filter({ hasText: label }).click();
    await expect(page.getByRole("article").filter({ hasText: country })).toContainText("#10000", { timeout: 20000 });
  }
});

test("expanded male and female names resolve in Austria, Belgium and Norway", async ({ page }) => {
  test.setTimeout(90000);
  const dataset = JSON.parse(readFileSync("src/data/jp/given-name/sample.json", "utf8"));
  for (const [gender, button] of [["male", "男性"], ["female", "女性"]]) {
    const rank = gender === "male" ? 600 : 500;
    const source = dataset.records.find((r: { rank: number; gender: string; rankingBasis: string }) => r.rank === rank && r.gender === gender && r.rankingBasis === "overall");
    expect(source).toBeTruthy();
    await page.goto("http://localhost:3000/name");
    await page.locator("#name").fill(source.name);
    await page.locator(".gender-options label").filter({ hasText: button }).click();
    await page.getByRole("button", { name: "世界の名前を見る" }).click();
    await expect(page.locator(".rank strong")).toHaveText(`#${rank}`, { timeout: 20000 });
    await page.locator(".result-country-picker summary").click();
    for (const [label, country] of [["オーストリア", "Austria"], ["ベルギー", "Belgium"], ["ノルウェー", "Norway"]]) {
      await page.locator(".result-country-options label").filter({ hasText: label }).click();
      await expect(page.getByRole("article").filter({ hasText: country })).toContainText(`#${rank}`, { timeout: 20000 });
    }
  }
});
