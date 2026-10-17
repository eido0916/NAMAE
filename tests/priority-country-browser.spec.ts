import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

test("the smallest country collections load candidates for both genders and deep surnames", async ({ page }) => {
  test.setTimeout(120000);
  const japan = JSON.parse(readFileSync("src/data/jp/surname/sample.json", "utf8"));
  const surname = japan.records.find((r: { rank: number }) => r.rank === 10000).name;
  for (const [path, name, gender, submit] of [
    ["/name", "ああす", "男性", "世界の名前を見る"],
    ["/name", "さゆき", "女性", "世界の名前を見る"],
    ["/surname", surname, "", "世界の苗字を見る"],
  ]) {
    await page.goto(`http://localhost:3000${path}`);
    await page.locator("#name").fill(name);
    if (gender) await page.locator(".gender-options label").filter({ hasText: gender }).click();
    await page.getByRole("button", { name: submit }).click();
    await expect(page.locator(".rank strong")).toContainText("#", { timeout: 20000 });
    await page.locator(".result-country-picker summary").click();
    for (const [label, country] of [["ジブチ", "Djibouti"], ["ジブラルタル", "Gibraltar"], ["トルクメニスタン", "Turkmenistan"]]) {
      await page.locator(".result-country-options label").filter({ hasText: label }).click();
      const card = page.getByRole("article").filter({ hasText: country });
      await expect(card).toContainText(/資料内参考順位|名前辞書/, { timeout: 20000 });
      await expect(card).not.toContainText("データを読み込めませんでした");
      await expect(card).not.toContainText("#undefined");
    }
  }
});
