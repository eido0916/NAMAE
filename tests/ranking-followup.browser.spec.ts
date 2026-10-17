import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

test("expanded US male and female ranks are usable without evidence panels", async ({ page }) => {
  test.setTimeout(120000);
  const dataset = JSON.parse(readFileSync("src/data/us/given-name/sample.json", "utf8"));
  for (const gender of ["male", "female"]) {
    const row = dataset.records.filter((record: { gender: string }) => record.gender === gender).at(-1);
    await page.goto("http://localhost:3000/name");
    await page.locator(".country-select-trigger").click();
    await page.locator(".country-select").getByRole("combobox").fill("United States");
    await page.getByRole("option").filter({ hasText: "United States" }).first().click();
    await page.locator("#name").fill(row.name);
    await page.locator(`.gender-options label:has(input[value="${gender}"])`).click();
    await page.getByRole("button", { name: "Find my world names" }).click();
    await expect(page.locator(".rank strong")).toHaveText(`#${row.rank}`, { timeout: 30000 });
    await expect(page.locator(".rank-evidence, .data-details")).toHaveCount(0);
    await expect(page.locator(".match-grid article").first()).toBeVisible();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/ranking-followup-mobile.png", fullPage: true });
});
