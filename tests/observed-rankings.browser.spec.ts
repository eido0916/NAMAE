import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

test("China supplies evidence-ranked male, female and family-name results", async ({ page }) => {
  test.setTimeout(120000);
  const japan = JSON.parse(readFileSync("src/data/jp/surname/sample.json", "utf8"));
  for (const [path, name, gender, submit] of [["/name", "ああす", "男性", "世界の名前を見る"], ["/name", "さゆき", "女性", "世界の名前を見る"], ["/surname", japan.records.find((r: { rank: number }) => r.rank === 10000).name, "", "世界の苗字を見る"]]) {
    await page.goto(`http://localhost:3000${path}`);
    await page.locator("#name").fill(name);
    if (gender) await page.locator(".gender-options label").filter({ hasText: gender }).click();
    await page.getByRole("button", { name: submit }).click();
    await expect(page.locator(".rank strong")).toContainText("#", { timeout: 20000 });
    await page.locator(".result-country-picker summary").click();
    await page.locator(".result-country-options label").filter({ hasText: "中国" }).click();
    const card = page.getByRole("article").filter({ hasText: "China" });
    await expect(card).toContainText("資料内参考順位", { timeout: 20000 });
    await expect(card).not.toContainText("日本と同じ順位");
    await expect(card.locator(".rank-evidence")).toHaveCount(0);
  }
  const china = page.getByRole("article").filter({ hasText: "China" });
  await expect(china).toHaveCSS("opacity", "1");
  await china.screenshot({ path: "test-results/china-reference-ranking.png", animations: "disabled" });
});

test("small-country reference ranks stay concise without claiming Japanese rank equivalence", async ({ page }) => {
  test.setTimeout(120000);
  const japan = JSON.parse(readFileSync("src/data/jp/surname/sample.json", "utf8"));
  for (const [path, name, gender, submit] of [["/name", "ああす", "男性", "世界の名前を見る"], ["/name", "さゆき", "女性", "世界の名前を見る"], ["/surname", japan.records.find((r: { rank: number }) => r.rank === 10000).name, "", "世界の苗字を見る"]]) {
    await page.goto(`http://localhost:3000${path}`);
    await page.locator("#name").fill(name);
    if (gender) await page.locator(".gender-options label").filter({ hasText: gender }).click();
    await page.getByRole("button", { name: submit }).click();
    await expect(page.locator(".rank strong")).toContainText("#", { timeout: 20000 });
    await page.locator(".result-country-picker summary").click();
    for (const [label, country] of [["モルディブ", "Maldives"], ["カンボジア", "Cambodia"], ["モンゴル", "Mongolia"]]) {
      await page.locator(".result-country-options label").filter({ hasText: label }).click();
      const card = page.getByRole("article").filter({ hasText: country });
      await expect(card).toContainText("資料内参考順位", { timeout: 20000 });
      await expect(card.locator(".match-source")).toHaveCount(0);
      await expect(card).not.toContainText("日本と同じ順位");
      await expect(card.locator(".rank-evidence")).toHaveCount(0);
      await expect(page.getByRole("dialog")).toHaveCount(0);
    }
  }
  await page.getByRole("article").filter({ hasText: "Maldives" }).screenshot({ path: "test-results/observed-ranking-card.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
