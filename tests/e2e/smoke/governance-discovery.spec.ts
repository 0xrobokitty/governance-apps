import { expect, test } from "@playwright/test";

const DISABLED_PRODUCTION = process.env.E2E_EXPECT_DAO_PRODUCTION_FAIL_CLOSED === "true";

for (const path of ["/styfi", "/veyfi", "/teams", "/treasury", "/ybc", "/yeth", "/dao"]) {
  test("shows the app directory on " + path, async ({ page }) => {
    test.skip(DISABLED_PRODUCTION);
    await page.goto(path, { waitUntil: "domcontentloaded" });
    const footer = page.getByTestId("governance-app-footer");
    await expect(footer).toBeVisible();
    await expect(footer.getByRole("link", { name: /Stake YFI/ })).toHaveAttribute("href", "/styfi");
    await expect(footer.getByRole("link", { name: /veYFI migration/ })).toHaveAttribute("href", "/veyfi#migration-card");
    await expect(footer.getByRole("link", { name: /Liquid Lockers/ })).toHaveAttribute("href", "/veyfi#llyfi-ledger");
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
  await page.getByTestId("governance-app-footer").getByRole("link", { name: /Liquid Lockers/ }).click();
  await expect(page).toHaveURL(/\/veyfi#llyfi-ledger$/);
  await expect(page.getByTestId("governance-app-footer")).toBeVisible();
  await expect(page.getByTestId("governance-voting-notice")).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("governance-app-footer")).toBeVisible();
  await expect(page.getByTestId("governance-voting-notice")).toHaveCount(0);
});
