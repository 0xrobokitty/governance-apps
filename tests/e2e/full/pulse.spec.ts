import { expect, test } from "@playwright/test";
test.skip(process.env.NEXT_PUBLIC_ENABLE_PULSE_PREVIEW !== "true", "Pulse preview is opt-in.");

test("Pulse exposes normalization, dated chart values and historical governance views", async ({ page }) => {
  await page.goto("/pulse");
  await page.getByRole("group", { name: "TVL scale" }).getByRole("button", { name: "Start = 100" }).click();
  await page.getByRole("button", { name: "Details: Total value locked", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("table").locator("tbody tr").first()).toContainText("100");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Details: Total value locked", exact: true })).toBeFocused();
  await page.getByRole("group", { name: "Flow aggregation" }).getByRole("button", { name: "Cumulative" }).click();
  await page.getByRole("group", { name: "Flow units" }).getByRole("button", { name: "USD", exact: true }).click();
  await expect(page.getByTestId("pulse-flows")).toContainText("At movement prices");
  await page.getByRole("group", { name: "YFI governance measure" }).getByRole("button", { name: "Voting", exact: true }).click();
  await expect(page.getByTestId("pulse-governance")).toContainText("gaps are not zeros");
  await page.getByRole("button", { name: "Details: YFI Governance", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("No observation");
  await page.keyboard.press("Escape");
  await page.getByRole("group", { name: "YFI governance measure" }).getByRole("button", { name: "APR", exact: true }).click();
  await expect(page.getByTestId("pulse-governance")).toContainText("No assumed compounding");
  await page.getByRole("group", { name: "YFI governance measure" }).getByRole("button", { name: "YFI price", exact: true }).click();
  await page.getByRole("group", { name: "YFI price currency" }).getByRole("button", { name: "ETH", exact: true }).click();
  await expect(page.getByTestId("pulse-governance")).toContainText("YFI / ETH");
});

test("Pulse handles common missing coverage, unavailable data and focus view", async ({ page }) => {
  await page.goto("/pulse");
  await page.getByRole("combobox", { name: "Preview scenario" }).selectOption("partial");
  await expect(page.getByRole("status")).toContainText("same remaining coverage");
  await page.getByRole("combobox", { name: "Preview scenario" }).selectOption("unavailable");
  await expect(page.getByRole("heading", { name: "Trend data is unavailable" })).toBeVisible();
  await expect(page.locator('main svg[role="img"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Show example history" }).click();
  await page.getByRole("button", { name: "Focus view", exact: true }).click();
  await expect(page.locator("header")).toBeHidden();
  await expect(page.getByRole("heading", { name: "Product movers" })).toHaveCount(0);
  await expect(page.locator('main svg[role="img"]')).toHaveCount(6);
  await page.getByRole("button", { name: "Exit focus view" }).click();
  await expect(page.locator("header")).toBeVisible();
});

test("Pulse charts stay readable on mobile and expose keyboard inspection", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/pulse");
  await expect(page.getByRole("heading", { name: "Pulse", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const chart = page.getByRole("img", { name: /TVL over time/ });
  await expect.poll(() => chart.evaluate(element => {
    const svg = element as SVGSVGElement;
    return Math.abs(svg.getBoundingClientRect().width - svg.viewBox.baseVal.width);
  })).toBeLessThanOrEqual(1);
  await chart.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("pulse-tvl").locator('[aria-live="polite"]')).toContainText("Nov");
  await page.getByRole("button", { name: "How we measure", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("not a pure deposit-growth measure");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "How we measure", exact: true })).toBeFocused();
});
