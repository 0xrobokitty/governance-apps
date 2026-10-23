import { expect, test } from "@playwright/test";

for (const width of [390, 1280]) {
  test(`highlights YBC within unchanged vote results at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/dao/proposals/2");
    const results = page.getByLabel("Vote results", { exact: true });
    const toggle = results.getByRole("checkbox", { name: "Highlight YBC" });
    await expect(toggle).toBeChecked();
    await expect(toggle).toHaveAccessibleDescription("YBC is included in the totals.");
    await expect(results.getByTestId("dao-total-vote-bar")).toHaveCount(1);
    const bar = results.getByTestId("dao-total-vote-bar");
    await expect(bar.locator("[data-vote-segment]")).toHaveCount(4);
    await expect(results.getByText("1.5 voting weight")).toBeVisible();
    await expect(results.getByText("0.5 voting weight")).toBeVisible();
    const totals = await results.getByTestId("dao-canonical-vote-totals").textContent();
    const yeaWidth = await bar.locator('[data-vote-segment="yea"], [data-vote-segment="ybc-yea"]').evaluateAll((parts) => parts.reduce((sum, part) => sum + part.getBoundingClientRect().width, 0));
    const target = await toggle.locator("..").boundingBox();
    expect(target!.height).toBeGreaterThanOrEqual(40);
    await toggle.focus();
    await toggle.press("Space");
    await expect(toggle).not.toBeChecked();
    await expect(toggle).toBeFocused();
    await expect(bar.locator("[data-vote-segment]")).toHaveCount(2);
    expect(await results.getByTestId("dao-canonical-vote-totals").textContent()).toBe(totals);
    expect(Math.abs((await bar.locator('[data-vote-segment="yea"]').boundingBox())!.width - yeaWidth)).toBeLessThanOrEqual(1);
    await toggle.press("Space");
    await expect(toggle).toBeChecked();
    await expect(results.getByText("1.5 voting weight")).toBeVisible();
    await expect(results.getByRole("link", { name: "Explore YBC" })).toHaveAttribute("href", "/ybc");
    await results.screenshot({ path: test.info().outputPath(`vote-results-${width}.png`) });
    const disclosure = results.getByText("About YBC votes", { exact: true });
    await expect(disclosure.locator("..")).not.toHaveAttribute("open");
    await disclosure.focus();
    await disclosure.press("Enter");
    await expect(results.getByText(/Last vote update:/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
