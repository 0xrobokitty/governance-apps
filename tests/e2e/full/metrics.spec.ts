import { expect, test } from "@playwright/test";
test.skip(process.env.NEXT_PUBLIC_ENABLE_METRICS_PREVIEW !== "true", "The metrics design preview is opt-in.");

test("metrics handles ranking, outflows, partial coverage and unavailable snapshots", async ({ page }) => {
  await page.goto("/metrics");
  const table = page.getByRole("table", { name: /Product activity/ });
  await expect(table.locator("tbody tr")).toHaveCount(5);
  await page.getByRole("button", { name: "View all 8" }).click();
  await expect(table.locator("tbody tr")).toHaveCount(8);
  await page.getByRole("combobox", { name: "Rank products by" }).selectOption("depositors");
  const counts = await table.locator("tbody tr td:last-child").allTextContents();
  expect(counts.map(Number)).toEqual(counts.map(Number).sort((a, b) => b - a));
  await page.getByRole("combobox", { name: "Preview scenario" }).selectOption("outflows");
  await expect(page.getByRole("region", { name: "Capital summary" })).toContainText("−$");
  await page.getByRole("combobox", { name: "Preview scenario" }).selectOption("partial");
  await expect(page.getByRole("status")).toContainText("Base is missing");
  await expect(page.getByRole("button", { name: "View USDC on Base" })).toHaveCount(0);
  await page.getByRole("combobox", { name: "Preview scenario" }).selectOption("unavailable");
  await expect(page.getByRole("heading", { name: "This snapshot is unavailable" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Capital summary" })).toHaveCount(0);
  await page.getByRole("button", { name: "Show complete example" }).click();
  await expect(page.getByRole("region", { name: "Capital summary" })).toBeVisible();
});

test("metrics works at mobile width and preserves keyboard access to definitions and data", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/metrics");
  await expect(page.getByRole("heading", { name: "Daily overview" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const chart = page.locator('main svg[role="img"]');
  await expect.poll(() => chart.evaluate(element => {
    const svg = element as SVGSVGElement;
    return Math.abs(svg.getBoundingClientRect().width - svg.viewBox.baseVal.width);
  })).toBeLessThanOrEqual(1);
  await page.getByRole("button", { name: "30D", exact: true }).click();
  await page.getByRole("button", { name: "In / out", exact: true }).click();
  await page.getByText("View chart data", { exact: true }).click();
  await expect(page.getByRole("table", { name: /Capital flows in USD/ }).locator("tbody tr")).toHaveCount(30);
  await page.getByRole("button", { name: "How to read this" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("not a person");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "How to read this" })).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath("metrics-mobile.png"), fullPage: true });
});


test("metrics fee amounts reflow without overlap at enlarged text size", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/metrics");
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  const rectangles = await page.getByTestId("metrics-fees").locator("p.font-number").evaluateAll(elements => elements.map(element => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const rect = range.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
  }));
  expect(rectangles).toHaveLength(3);
  for (let index = 1; index < rectangles.length; index++) {
    const a = rectangles[index - 1], b = rectangles[index];
    expect(a.right <= b.left || a.bottom <= b.top).toBe(true);
  }
});
