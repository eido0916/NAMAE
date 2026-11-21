import { expect, test } from "@playwright/test";

const base = process.env.NAMAE_PREVIEW_URL;
test.skip(!base, "Set NAMAE_PREVIEW_URL to a built release");

test("static release leaves unattested Japanese names unranked", async ({ page }) => {
  for (const name of ["いまぬえる", "井沼エル"]) {
    await page.goto(base + "/name/");
    await page.locator("#name").fill(name);
    await page.locator(".form-card button[type=submit]").click();
    await expect(page.locator(".rank strong")).toHaveText("データ未収録");
    await expect(page.locator(".match-card-interactive")).toHaveCount(0);
  }
});

test("reviewed abbreviations and administrative labels have no name rank", async ({ page }) => {
  test.setTimeout(60000);
  for (const [country, path, name] of [
    ["Afghanistan", "name", "إتش."],
    ["Spain", "name", "master of ..."],
    ["Brazil", "surname", "masculino"],
    ["Vietnam", "name", "male"],
    ["United States", "name", "Noname"],
    ["Poland", "surname", "DR. VARGA"],
  ]) {
    await page.goto(base + "/" + path + "/");
    await page.locator(".country-select-trigger").click();
    await page.locator(".country-select").getByRole("combobox").fill(country);
    await page.getByRole("option").filter({ hasText: country }).first().click();
    await page.locator("#name").fill(name);
    await page.locator(".form-card button[type=submit]").click();
    await expect(page.locator(".rank strong")).toBeVisible();
    await expect(page.locator(".rank strong")).not.toHaveText(/^#/);
    await expect(page.locator(".match-card-interactive")).toHaveCount(0);
  }
});

test("Japanese names verified in municipal birth statistics are searchable", async ({ page }) => {
  await page.goto(base + "/name/");
  await page.locator('.gender-options label:has(input[value="female"])').click();
  await page.locator("#name").fill("陽葵");
  await page.locator(".form-card button[type=submit]").click();
  await expect(page.locator(".original h2")).toHaveText("陽葵");
  await expect(page.locator(".original")).toContainText("船橋市");
  await expect(page.locator(".rank strong")).toContainText("#");
});

test("Korean names verified in regional birth registration statistics are searchable", async ({ page }) => {
  await page.goto(base + "/name/");
  await page.locator(".country-select-trigger").click();
  await page.locator(".country-select").getByRole("combobox").fill("South Korea");
  await page.getByRole("option").filter({ hasText: "South Korea" }).first().click();
  await page.locator('.gender-options label:has(input[value="female"])').click();
  await page.locator("#name").fill("서아");
  await page.locator(".form-card button[type=submit]").click();
  await expect(page.locator(".original h2")).toHaveText("서아");
  await expect(page.locator(".original")).toContainText("대한민국 대법원");
  await expect(page.locator(".rank strong")).toContainText("#");
});

test("static release excludes US first-name placeholders from search", async ({ page }) => {
  await page.goto(base + "/name/");
  await page.locator(".country-select-trigger").click();
  await page.locator(".country-select").getByRole("combobox").fill("United States");
  await page.getByRole("option").filter({ hasText: "United States" }).first().click();
  await page.locator("#name").fill("Infant");
  await page.locator(".form-card button[type=submit]").click();
  await expect(page.locator(".rank strong")).toHaveText("Data unavailable");
  await expect(page.locator(".match-card-interactive")).toHaveCount(0);
});

test("static release keeps malformed birth registry entries out of searches", async ({ page }) => {
  for (const [country, name] of [["Australia", "Un-Named"], ["Canada", "OLIVIERXXXXXXXXXXXXX"]]) {
    await page.goto(base + "/name/");
    await page.locator(".country-select-trigger").click();
    await page.locator(".country-select").getByRole("combobox").fill(country);
    await page.getByRole("option").filter({ hasText: country }).first().click();
    await page.locator("#name").fill(name);
    await page.locator(".form-card button[type=submit]").click();
    await expect(page.locator(".rank strong")).toHaveText("Data unavailable");
    await expect(page.locator(".match-card-interactive")).toHaveCount(0);
  }
});

test("Thai female names from the corpus are searchable with their evidence label", async ({ page }) => {
  await page.goto(base + "/name/");
  await page.locator(".country-select-trigger").click();
  await page.locator(".country-select").getByRole("combobox").fill("Thailand");
  await page.getByRole("option").filter({ hasText: "Thailand" }).first().click();
  await page.locator('.gender-options label:has(input[value="female"])').click();
  await page.locator("#name").fill("กชกานต์");
  await page.locator(".form-card button[type=submit]").click();
  await expect(page.locator(".original h2")).toHaveText("กชกานต์");
  await expect(page.locator(".rank strong")).toContainText("#");
  await expect(page.locator(".original")).toContainText("Recorded names (no frequency data)");
});

test("Taiwanese household registration names retain published ranks in the release", async ({ page }) => {
  await page.goto(base + "/name/");
  await page.locator(".country-select-trigger").click();
  await page.locator(".country-select").getByRole("combobox").fill("Taiwan");
  await page.getByRole("option").filter({ hasText: "Taiwan" }).first().click();
  await page.locator('.gender-options label:has(input[value="female"])').click();
  await page.locator("#name").fill("淑芬");
  await page.locator(".form-card button[type=submit]").click();
  await expect(page.locator(".original h2")).toHaveText("淑芬");
  await expect(page.locator(".rank strong")).toHaveText("#1");
  await expect(page.locator(".original")).toContainText("表五十一");
});

test("female name search handles decomposed Vietnamese accents and attested Indian aliases", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [country, name, displayed] of [
    ["Vietnam", "Thảo".normalize("NFD"), "Thảo"],
    ["India", "वैष्णवी", "Vaishnavi"],
  ]) {
    await page.goto(base + "/name/");
    await page.locator(".country-select-trigger").click();
    await page.locator(".country-select").getByRole("combobox").fill(country);
    await page.getByRole("option").filter({ hasText: country }).first().click();
    await page.locator('.gender-options label:has(input[value="female"])').click();
    await page.locator("#name").fill(name);
    await page.locator(".form-card button[type=submit]").click();
    await expect(page.locator(".original h2")).toHaveText(displayed);
    await expect(page.locator(".rank strong")).toContainText("#");
  }
});

test("Chinese and Indian female names from aggregate records are searchable with their source", async ({ page }) => {
  for (const [country, name, source] of [
    ["China", "丽娟", "shareholder records through 2018"],
    ["India", "सुनीता", "historical electoral rolls"],
  ]) {
    await page.goto(base + "/name/");
    await page.locator(".country-select-trigger").click();
    await page.locator(".country-select").getByRole("combobox").fill(country);
    await page.getByRole("option").filter({ hasText: country }).first().click();
    await page.locator('.gender-options label:has(input[value="female"])').click();
    await page.locator("#name").fill(name);
    await page.locator(".form-card button[type=submit]").click();
    await expect(page.locator(".original h2")).toHaveText(name);
    await expect(page.locator(".rank strong")).toHaveText(/^#\d+$/);
    await expect(page.locator(".original")).toContainText(source);
  }
});

test("static release finds names, compares list positions and saves an image", async ({ page }) => {
  test.setTimeout(120000);
  const fetched: string[] = [];
  page.on("request", request => fetched.push(new URL(request.url()).pathname));
  await page.goto(base + "/surname/");
  await page.locator("#name").fill("清田");
  await page.locator(".form-card button[type=submit]").click();
  await expect(page.locator(".rank strong")).toContainText("#");
  await expect(page.locator(".rarity")).toContainText("上位");
  expect(fetched.some(path => path.startsWith("/data/app-lookup/"))).toBe(true);
  expect(new Set(fetched.filter(path => path.startsWith("/data/app/jp/"))).size).toBeLessThan(4);
  await page.locator(".result-country-picker summary").click();
  await page.locator(".result-country-options label").filter({ hasText: "グリーンランド" }).click();
  const greenland = page.getByRole("article").filter({ hasText: "Greenland" });
  await expect(greenland).toContainText("相当");
  await expect(greenland).toContainText("リスト内で近い位置");
  await greenland.getByRole("button").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(fetched).not.toContain("/api/name-details");
  await page.keyboard.press("Escape");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "結果を画像保存" }).click();
  expect((await download).suggestedFilename()).toBe("namae-story.png");
});
