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
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.getByRole("button", { name: "Focus view", exact: true }).click();
  await expect(page.locator("header")).toBeHidden();
  await expect(page.getByRole("heading", { name: "Product movers" })).toHaveCount(0);
  await expect(page.locator('main svg[role="img"]')).toHaveCount(9);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
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


test("yLockers compares both products with shared controls, weekly rewards and coverage gaps", async ({ page }) => {
  await page.goto("/pulse");
  const section = page.getByTestId("pulse-ylockers");
  await expect(section.locator('svg[role="img"]')).toHaveCount(3);
  await expect(section.getByRole("button", { name: "Both products", exact: true })).toHaveAttribute("aria-pressed", "true");
  const peg = page.getByTestId("ylockers-peg");
  const before = await peg.innerText();
  await page.getByRole("combobox", { name: "Capital asset group" }).selectOption("eth");
  await expect(peg).toHaveText(before, { useInnerText: true });
  await section.getByRole("button", { name: "yYB", exact: true }).click();
  for (const id of ["ylockers-rewards", "ylockers-peg", "ylockers-flows"]) {
    await expect(page.getByTestId(id)).toContainText("yYB");
    await expect(page.getByTestId(id)).not.toContainText("yCRV");
  }
  await section.getByRole("button", { name: "Both products", exact: true }).click();
  await page.getByRole("group", { name: "History window" }).getByRole("button", { name: "7D", exact: true }).click();
  await section.getByRole("button", { name: "Details: yLockers crvUSD to stakers", exact: true }).click();
  await expect(page.getByRole("dialog").locator("tbody tr")).toHaveCount(1);
  await expect(page.getByRole("dialog")).toContainText("not prorated");
  await page.keyboard.press("Escape");
  await page.getByRole("group", { name: "History window" }).getByRole("button", { name: "365D", exact: true }).click();
  await expect(section.getByRole("status")).toContainText("Example yYB history starts");
  await section.getByRole("button", { name: "Details: yLockers Peg", exact: true }).click();
  await expect(page.getByRole("dialog").locator("tbody tr").first()).toContainText("No observation");
  await page.keyboard.press("Escape");
  await section.getByRole("group", { name: "yLockers flow smoothing" }).getByRole("button", { name: "Daily", exact: true }).click();
  await section.getByRole("button", { name: "Details: yLockers Net deposits", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("yCRV · daily tokens");
  await expect(page.getByRole("dialog")).toContainText("yYB · daily tokens");
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("img", { name: /yLockers peg over time/ }).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(peg.locator('[aria-live="polite"]')).toContainText("yCRV / CRV");
});
