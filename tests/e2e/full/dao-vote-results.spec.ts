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
    expect(await bar.locator("[data-vote-segment]").evaluateAll((parts) => parts.map((part) => part.getAttribute("data-vote-segment"))))
      .toEqual(["ybc-yea", "yea", "nay", "ybc-nay"]);
    for (const [kind, label, share] of [
      ["ybc-yea", "YBC Yea", "13.64%"], ["yea", "Remaining Yea (non-YBC)", "54.55%"],
      ["nay", "Remaining Nay (non-YBC)", "27.27%"], ["ybc-nay", "YBC Nay", "4.55%"],
    ]) {
      const part = bar.locator(`[data-vote-segment="${kind}"]`);
      await part.hover();
      const tooltip = part.locator('[role="tooltip"]');
      await expect(tooltip).toBeVisible();
      await expect(tooltip).toContainText(label);
      await expect(tooltip).toContainText(`${share} of total votes cast`);
      const bounds = (await tooltip.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
      if (kind === "ybc-yea") await results.screenshot({ path: test.info().outputPath(`vote-tooltip-${width}.png`), animations: "disabled" });
      await page.keyboard.press("Escape");
      await expect(tooltip).not.toBeVisible();
    }
    await expect(results.getByText("1.5")).toBeVisible();
    await expect(results.getByText("0.5")).toBeVisible();
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
    await expect(results.getByText("1.5")).toBeVisible();
    await expect(results.getByRole("link", { name: "Explore YBC" })).toHaveAttribute("href", "/ybc");
    await results.getByRole("heading", { name: "Vote results", exact: true }).hover();
    await expect(bar.locator('[role="tooltip"]:visible')).toHaveCount(0);
    await results.screenshot({ path: test.info().outputPath(`vote-results-${width}.png`), animations: "disabled" });
    const disclosure = results.getByText("Vote breakdown details", { exact: true });
    await expect(disclosure.locator("..")).not.toHaveAttribute("open");
    await disclosure.focus();
    await disclosure.press("Enter");
    const shares = results.getByLabel("Share of total votes cast", { exact: true });
    await expect(shares.getByText("Remaining Yea (non-YBC)", { exact: true })).toBeVisible();
    await expect(shares.getByText("13.64% of total votes cast", { exact: true })).toBeVisible();
    await expect(shares.getByText("4.55% of total votes cast", { exact: true })).toBeVisible();
    await expect(results.getByText(/Last vote update:/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test("contains hidden and open vote tooltips at 200% text scaling", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const proposalId of [2, 21]) {
    await page.goto(`/dao/proposals/${proposalId}`);
    await page.addStyleTag({ content: "html { font-size: 200%; }" });
    const bar = page.getByTestId("dao-total-vote-bar");
    await expect(bar).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    for (const part of await bar.locator("[data-vote-segment]").all()) {
      await part.hover();
      const tooltip = part.locator('[role="tooltip"]');
      await expect(tooltip).toBeVisible();
      const bounds = (await tooltip.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
      expect(await tooltip.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
      await page.keyboard.press("Escape");
      await expect(tooltip).not.toBeVisible();
    }
  }
});

test.describe("touch vote breakdown", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 900 } });
  test("exposes the same segment percentages through a large disclosure target", async ({ page }) => {
    await page.goto("/dao/proposals/2");
    const results = page.getByLabel("Vote results", { exact: true });
    const disclosure = results.getByText("Vote breakdown details", { exact: true });
    expect((await disclosure.boundingBox())!.height).toBeGreaterThanOrEqual(40);
    await disclosure.tap();
    const shares = results.getByLabel("Share of total votes cast", { exact: true });
    for (const value of ["13.64%", "54.55%", "27.27%", "4.55%"]) {
      await expect(shares.getByText(`${value} of total votes cast`, { exact: true })).toBeVisible();
    }
    await expect(shares.getByText("Remaining Nay (non-YBC)", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
