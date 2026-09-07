import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
test("name, surname, unknown, PNG save and mobile width", async ({ page }) => {
  await page.goto("http://localhost:3000");
  await expect(page.locator(".sample-ticket")).toHaveCount(0);
  await expect(page.locator(".sample-form")).toHaveCount(0);
  await expect(page.locator("#year")).toHaveCount(0);
  await page.getByRole("button", { name: "じゅん", exact: true }).click();
  await page.getByRole("button", { name: "世界の名前を見る" }).click();
  await expect(page.locator(".rank strong")).toHaveText("#365");
  await expect(page.getByText("2025年の調査を使用")).toBeVisible();
  await expect(
    page.getByRole("article").filter({ hasText: "United States" }),
  ).toContainText("#365");
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "結果を画像保存" }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe("namae-story.png");
  await download.saveAs("test-results/namae-story.png");
  const png = await readFile("test-results/namae-story.png");
  expect(png.readUInt32BE(16)).toBe(1080);
  expect(png.readUInt32BE(20)).toBe(1920);
  await page.evaluate(() => {
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: () => true,
    });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data: ShareData) => {
        if (data.files?.[0]?.type !== "image/png")
          throw new Error("Expected PNG");
      },
    });
  });
  await page.getByRole("button", { name: "シェア", exact: false }).click();
  await expect(page.getByRole("status")).toHaveText(
    "共有先に結果を渡しました。",
  );
  await page.goto("http://localhost:3000/surname");
  await expect(page.locator("#year")).toHaveCount(0);
  await page.locator("#name").fill("佐藤");
  await page.getByRole("button", { name: "世界の苗字を見る" }).click();
  await expect(
    page
      .getByRole("article")
      .filter({ hasText: "United States" })
  ).toContainText("#1");
  await page.goto("http://localhost:3000/name");
  await page.locator("#name").fill("大翔");
  await page.locator("#reading").fill("はると");
  await page.getByRole("button", { name: "世界の名前を見る" }).click();
  await expect(page.locator(".rank strong")).not.toHaveText("データ未収録");
  await page.goto("http://localhost:3000/name");
  await page.locator("#name").fill("未収録名");
  await page.getByRole("button", { name: "世界の名前を見る" }).click();
  await expect(page.getByText("データ未収録", { exact: true })).toBeVisible();
  await expect(page.getByText("算出不可", { exact: true })).toBeVisible();
  await page.goto("http://localhost:3000/name");
  await page.locator("#name").fill("ああす");
  await page.getByRole("button", { name: "世界の名前を見る" }).click();
  await expect(page.getByText("総合推定順位", { exact: true })).toBeVisible();
  await expect(page.locator(".rank strong")).toContainText("#");
  await page.goto("http://localhost:3000/name");
  await page.locator("#name").fill("はやし");
  await page.getByRole("button", { name: "世界の名前を見る" }).click();
  await expect(page.getByText("苗字として診断しました。", { exact: false })).toBeVisible();
  await expect(page.locator(".rank strong")).toHaveText("#18");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.reload();
  await expect(
    page.getByRole("link", { name: "診断をはじめる" }),
  ).toBeVisible();
  await page.goto("http://localhost:3000");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
