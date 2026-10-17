import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { normalizeInputName } from "../src/lib/reference-lookup.mjs";

test("expanded Chinese dictionary names work as male and female inputs with bounded data requests", async ({ page }) => {
  test.setTimeout(120000);
  const data = JSON.parse(readFileSync("src/reference-data/cn/given_name.json", "utf8"));
  const primary = JSON.parse(readFileSync("src/data/cn/given-name/onomaverse.json", "utf8"));
  const known = new Set(primary.records.flatMap((r: { name: string; aliases?: string[]; gender: string }) => [r.name, ...(r.aliases ?? [])].map((name) => `${r.gender}|${normalizeInputName(name)}`)));
  for (const gender of ["male", "female"]) {
    const candidate = data.records.find((r: { name: string; gender: string; sourceIds: string[]; evidenceRank?: unknown }) => r.gender === gender && r.sourceIds.includes("wgnd2-country-original") && !r.evidenceRank && !known.has(`${gender}|${normalizeInputName(r.name)}`));
    expect(candidate).toBeTruthy();
    const requests: string[] = [];
    page.on("request", (request) => requests.push(request.url()));
    await page.goto("http://localhost:3000/name");
    await page.locator(".country-select-trigger").click();
    await page.locator(".country-select").getByRole("combobox").fill("中国");
    await page.getByRole("option").first().click();
    await expect(page.locator('.form-card button[type="submit"]')).toBeEnabled();
    await page.locator(`.gender-options label:has(input[value="${gender}"])`).click();
    await page.locator("#name").fill(candidate.name.toUpperCase());
    await page.locator('.form-card button[type="submit"]').click();
    await expect(page.locator(".original")).toContainText("CHINA", { timeout: 30000 });
    await expect(page.locator(".rank strong")).not.toContainText("#");
    await expect(page.locator(".match-grid article").first()).toBeVisible();
    expect(requests.some((path) => path.includes("/data/lookup/cn/"))).toBe(true);
    expect(requests.filter((path) => path.includes("/data/references/cn/")).length).toBeLessThanOrEqual(2);
  }
});

test("a Japanese family name outside the primary ranking is recognized from its dictionary", async ({ page }) => {
  const reference = JSON.parse(readFileSync("src/reference-data/jp/surname.json", "utf8"));
  expect(reference.records.some((r: { name: string }) => r.name === "逢川")).toBe(true);
  await page.goto("http://localhost:3000/surname");
  await page.locator("#name").fill("逢川");
  await page.getByRole("button", { name: "世界の苗字を見る" }).click();
  await expect(page.locator(".original")).toContainText("逢川", { timeout: 30000 });
  await expect(page.locator(".rank strong")).not.toContainText("#");
  await expect(page.locator(".original")).not.toContainText("データ未収録");
  await expect(page.locator(".match-grid article").first()).toBeVisible();
});
