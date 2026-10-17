import { test, expect as baseExpect } from "@playwright/test";
const expect = baseExpect.configure({ timeout: 30000 });
test.describe.configure({ timeout: 120000 });

test("Chinese surname aliases ask for Han selection and show the correct national rank", async ({ page }) => {
  await page.goto("http://localhost:3000/surname/");
  await page.locator(".country-select-trigger").click();
  await page.locator(".country-select").getByRole("combobox").fill("中国");
  await page.getByRole("option").filter({ hasText: "China" }).click();
  const submit = page.locator('.form-card button[type="submit"]');
  await expect(submit).toBeEnabled();
  await expect(page.locator(".examples")).toContainText("李");
  await page.locator("#name").fill("Li");
  await expect(page.locator(".chinese-surname-options")).toContainText("李（Lǐ）");
  await expect(page.locator(".chinese-surname-options")).toContainText("黎（Lí）");
  await expect(submit).toBeDisabled();
  await page.locator(".chinese-surname-options").getByRole("button", { name: /李（Lǐ）/ }).click();
  await expect(page.locator("#name")).toHaveValue("李");
  await submit.click();
  await expect(page.locator(".original h2")).toHaveText("李（Lǐ）");
  await expect(page.locator(".rank strong")).toHaveText("#2");
  await expect(page.locator(".rarity b")).toContainText("2");
  await expect(page.locator(".original")).toContainText("2020");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /保存图片/ }).click();
  expect((await download).suggestedFilename()).toBe("namae-story.png");
  await page.screenshot({ path: "test-results/chinese-li-national-rank.png", fullPage: true });

  await page.goto("http://localhost:3000/surname/");
  await page.locator(".country-select-trigger").click();
  await page.locator(".country-select").getByRole("combobox").fill("中国");
  await page.getByRole("option").filter({ hasText: "China" }).click();
  await expect(page.locator('.form-card button[type="submit"]')).toBeEnabled();
  await page.locator("#name").fill("Lí");
  await page.locator('.form-card button[type="submit"]').click();
  await expect(page.locator(".original h2")).toHaveText("黎（Lí）");
  await expect(page.locator(".rank strong")).toHaveText("#82");
});
