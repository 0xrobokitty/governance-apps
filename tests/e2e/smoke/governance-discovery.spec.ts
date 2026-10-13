import { expect, test } from "@playwright/test";

const DISABLED_PRODUCTION = process.env.E2E_EXPECT_DAO_PRODUCTION_FAIL_CLOSED === "true";

for (const path of ["/styfi", "/veyfi", "/teams", "/treasury", "/ybc", "/yeth", "/dao"]) {
  test("shows the app directory on " + path, async ({ page }) => {
    test.skip(DISABLED_PRODUCTION);
    await page.goto(path, { waitUntil: "domcontentloaded" });
    const footer = page.getByTestId("governance-app-footer");
    await expect(footer).toBeVisible();
    await expect(footer.getByRole("link", { name: /Stake YFI/ })).toHaveAttribute("href", "/styfi");
    await expect(footer.getByRole("heading", { name: "Yearn DAO", exact: true })).toBeVisible();
    await expect(footer.getByRole("link", { name: /veYFI/ })).toHaveCount(1);
    await expect(footer.getByRole("link", { name: /veYFI & Liquid Lockers/ })).toHaveAttribute("href", "/veyfi");
    await expect(footer.getByRole("link", { name: /Voting & Proposals/ })).toHaveAttribute("href", "/dao");
    await expect(footer.getByRole("link", { name: /Team Finances/ })).toHaveAttribute("href", "/teams");
    await expect(footer.getByRole("link", { name: /Treasury/ })).toHaveAttribute("href", "/treasury");
    await expect(footer.getByRole("link", { name: /Builder's Collective/ })).toHaveAttribute("href", "/ybc");
    await expect(footer.getByRole("link", { name: /GitHub/ })).toHaveAttribute("href", "https://github.com/yearn/governance-apps");
  });
}

test("remembers a voting-period dismissal across app navigation and reload", async ({ page }) => {
  test.skip(DISABLED_PRODUCTION);
  await page.goto("/dao");
  await expect(page.getByTestId("governance-app-footer")).toBeVisible();
  await expect(page.getByTestId("governance-voting-notice")).toHaveCount(0);

  await page.goto("/styfi");
  const notice = page.getByTestId("governance-voting-notice");
  await expect(notice).toBeVisible();
  await expect(notice.getByRole("link", { name: "Review proposals" })).toHaveAttribute("href", "/dao");
  await notice.getByRole("button", { name: "Dismiss this voting period" }).click();
  await expect(notice).toHaveCount(0);
  await page.getByTestId("governance-app-footer").getByRole("link", { name: /veYFI & Liquid Lockers/ }).click();
  await expect(page).toHaveURL(/\/veyfi$/);
  await expect(page.getByTestId("governance-app-footer")).toBeVisible();
  await expect(page.getByTestId("governance-voting-notice")).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("governance-app-footer")).toBeVisible();
  await expect(page.getByTestId("governance-voting-notice")).toHaveCount(0);
});

for (const app of ["styfi", "veyfi"]) {
  for (const width of [390, 1280]) {
    test("places the voting notice below " + app + " statistics at " + width + "px", async ({ page }) => {
      test.skip(DISABLED_PRODUCTION);
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/" + app);
      const notice = page.getByTestId("governance-voting-notice");
      await expect(notice).toHaveCount(1);
      await expect(notice).toBeVisible();
      const statsBox = await page.getByTestId(app + "-stats").boundingBox();
      const noticeBox = await notice.boundingBox();
      expect(statsBox).not.toBeNull();
      expect(noticeBox).not.toBeNull();
      expect(Math.abs(noticeBox!.y - (statsBox!.y + statsBox!.height))).toBeLessThanOrEqual(1);
    });
  }
}

test("keeps the app directory readable at 200% text scaling", async ({ page }) => {
  test.skip(DISABLED_PRODUCTION);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dao");
  await page.addStyleTag({ content: "html { font-size: 200%; }" });
  const footer = page.getByTestId("governance-app-footer");
  await expect(footer).toBeVisible();

  // Measure text itself: overflowing glyphs can extend beyond a grid item's box.
  const layout = await footer.evaluate((element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let rightmostText = 0;
    while (walker.nextNode()) {
      if (!walker.currentNode.textContent?.trim()) continue;
      const range = document.createRange();
      range.selectNode(walker.currentNode);
      rightmostText = Math.max(rightmostText, range.getBoundingClientRect().right);
    }
    return {
      rightmostText,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    };
  });
  expect(layout.rightmostText).toBeLessThanOrEqual(layout.viewportWidth);
  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);
});
