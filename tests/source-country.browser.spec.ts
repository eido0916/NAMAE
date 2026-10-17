import { test, expect as baseExpect, type Page } from "@playwright/test";
const expect = baseExpect.configure({ timeout: 30000 });
test.describe.configure({ timeout: 120000 });
async function chooseCountry(page: Page, country: string) {
  await page.locator(".country-select-trigger").click();
  await page.locator(".country-select").getByRole("combobox").fill(country);
  await page.getByRole("option").filter({ hasText: country }).first().click();
}

test("country selection updates input and US results can include Japan", async ({ page }) => {
  test.setTimeout(120000);
  await page.goto("http://localhost:3000");
  await expect(page.locator(".country-select-trigger")).toContainText("日本");
  await expect(page.locator("#reading")).toBeVisible();
  await chooseCountry(page, "United States");
  await expect(page.locator("#reading")).toHaveCount(0);
  await expect(page.locator("#name")).toHaveAttribute("placeholder", /^e.g. /);
  await page.screenshot({ path: "test-results/source-country-form.png", fullPage: true });
  await page.locator("#name").fill("Liam");
  await page.getByRole("button", { name: "Find my world names" }).click();
  await expect(page.locator(".original")).toContainText("UNITED STATES");
  await page.screenshot({ path: "test-results/source-country-result.png", fullPage: true });
  await expect(page.locator(".rank strong")).toHaveText(/#\d+/);
  await expect(page.getByRole("article").filter({ hasText: "Japan" })).toBeVisible();
  await expect(page.getByRole("article").filter({ hasText: "United States" })).toHaveCount(0);
  await page.locator(".result-country-picker summary").click();
  await expect(page.locator('.result-country-options input[value="US"]')).toHaveCount(0);
  const italy = page.locator(".result-country-options label").filter({ hasText: "Italy" });
  await italy.click();
  await expect(page.getByRole("article").filter({ hasText: "Italy" })).toBeVisible();
  await expect(page.locator(".original")).toContainText("UNITED STATES");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save image" }).click();
  expect((await download).suggestedFilename()).toBe("namae-story.png");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:3000/surname");
  await chooseCountry(page, "대한민국");
  await expect(page.getByRole("button", { name: "세계의 성씨 찾기" })).toBeEnabled();
  await page.screenshot({ path: "test-results/source-country-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "김", exact: true }).click();
  await page.getByRole("button", { name: "세계의 성씨 찾기" }).click();
  await expect(page.locator(".original")).toContainText("SOUTH KOREA");
  await expect(page.locator(".rank strong")).toHaveText("#1");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("switching countries clears reading and input data failures can be retried", async ({ page }) => {
  await page.goto("http://localhost:3000");
  await page.locator("#reading").fill("じゅん");
  await page.route("**/data/datasets/de/**", (route) => route.abort());
  await chooseCountry(page, "Deutschland");
  await expect(page.locator("#form-error")).toBeVisible();
  await page.unroute("**/data/datasets/de/**");
  await expect(page.locator("#form-error")).toContainText("Die Daten");
  await page.getByRole("button", { name: "Daten neu laden" }).click();
  await expect(page.getByRole("button", { name: "Meine Vornamen weltweit finden" })).toBeEnabled();
  await chooseCountry(page, "日本");
  await expect(page.locator("#reading")).toHaveValue("");
  await page.getByRole("button", { name: "じゅん", exact: true }).click();
  await page.getByRole("button", { name: "世界の名前を見る" }).click();
  await expect(page.locator(".rank strong")).toHaveText("#365");
  await expect(page.locator(".original")).toContainText("JAPAN");
});

test("flag choices use native names and localize labels in all supported languages", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:3000");
  const picker = page.locator("#source-country");
  await expect(picker.locator("legend")).toContainText("🌐");
  await expect(picker.locator("legend")).not.toContainText("自分の国");
  await expect(picker.locator("img")).toHaveCount(1);
  for (const [country, lang, given, surname, male] of [
    ["United States", "en", "First name", "Last name", "Male"],
    ["United Kingdom", "en", "First name", "Last name", "Male"],
    ["France", "fr", "Prénom", "Nom de famille", "Masculin"],
    ["대한민국", "ko", "이름", "성씨", "남성"],
    ["Deutschland", "de", "Vorname", "Nachname", "Männlich"],
    ["日本", "ja", "下の名前", "苗字", "男性"],
  ]) {
    await chooseCountry(page, country);
    await expect(page.locator("html")).toHaveAttribute("lang", lang);
    await expect(page.locator(".tabs").getByRole("button", { name: given })).toBeVisible();
    await expect(page.locator(".tabs").getByRole("button", { name: surname })).toBeVisible();
    await expect(page.getByRole("radio", { name: male, exact: true })).toBeVisible();
    if (lang !== "ja") await expect(page.locator(".form-card")).not.toContainText("ランキングの性別");
    await expect(page.locator('.form-card button[type="submit"]')).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.locator(".country-select-trigger").click();
  await page.locator(".country-select").getByRole("combobox").fill("USA");
  await page.keyboard.press("Enter");
  await expect(page.locator(".country-select-trigger")).toContainText("United States");
});

test("144 countries can be searched by local, English and Japanese names with keyboard selection", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:3000");
  await page.locator(".country-select-trigger").click();
  await expect(page.getByRole("option")).toHaveCount(144);
  await expect(page.getByRole("listbox").locator("img")).toHaveCount(144);
  const menuBounds = await page.locator(".country-select-menu").boundingBox();
  expect(menuBounds!.y).toBeGreaterThanOrEqual(0);
  expect(menuBounds!.y + menuBounds!.height).toBeLessThanOrEqual(844);
  await page.screenshot({ path: "test-results/country-list-mobile.png", fullPage: true });
  await page.locator(".country-select").getByRole("combobox").fill("nothing matches this country");
  await expect(page.getByRole("option")).toHaveCount(0);
  await expect(page.locator(".country-select-count")).toContainText("ありません");
  await page.locator(".country-select").getByRole("combobox").fill("ブラジル");
  await expect(page.getByRole("option")).toHaveCount(1);
  await expect(page.getByRole("option")).toContainText("Brasil");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(page.locator(".country-select-trigger")).toBeFocused();
  await chooseCountry(page, "Italia");
  await expect(page.locator('.form-card button[type="submit"]')).toBeEnabled();
  await page.locator(".examples button").first().click();
  await page.getByRole("button", { name: "Find my world names" }).click();
  await expect(page.locator(".original")).toContainText("ITALY");
  await expect(page.locator(".rank strong")).toHaveText(/#\d+/);
  await page.goto("http://localhost:3000");
  await page.locator(".country-select-trigger").click();
  await page.locator(".country-select").getByRole("combobox").fill("Kosovo");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.locator('.form-card button[type="submit"]')).toBeEnabled();
  await page.locator(".examples button").first().click();
  await page.getByRole("button", { name: "Find my world names" }).click();
  await expect(page.locator(".original")).toContainText("KOSOVO");
  await expect(page.locator(".rank strong")).not.toHaveText(/#/);
  await expect(page.locator(".mode-notice")).toContainText("reference suggestions");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
