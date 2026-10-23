import { expect, test, type Page } from "@playwright/test";
import { resetBridge, seedExternalPortfolio, setBalance, waitForTestBridge } from "../utils";

async function selectScenario(page: Page, label: string) {
  await page.getByRole("button", { name: "🛠️ Debug", exact: true }).click();
  await page.getByRole("button", { name: label, exact: true }).click();
  await page.getByRole("button", { name: "Close debug controls", exact: true }).click();
}

test("separates base, personal, delegated and YBC APRs", async ({ page }, testInfo) => {
  await page.goto("/styfi");
  await waitForTestBridge(page);
  await resetBridge(page);
  await selectScenario(page, "Some votes");

  await expect(page.getByTestId("styfi-stats").getByRole("button", { name: "stYFIx APR", exact: true })).toHaveText("20%");
  await expect(page.getByTestId("styfi-personal-apr")).toHaveText("14%");
  await expect(page.getByTestId("styfi-total-apr")).toHaveText("14%");
  await expect(page.getByTestId("styfi-participation")).toHaveText("3 of 6 proposals");
  const breakdown = page.getByTestId("styfi-apr-breakdown");
  await expect(breakdown.getByText("stYFI base APR", { exact: true }).locator("..")).toContainText("8%");
  await expect(breakdown.getByText("stYFIx APR", { exact: true }).locator("..")).toContainText("20%");

  await selectScenario(page, "All votes");
  await expect(page.getByTestId("styfi-personal-apr")).toHaveText("20%");
  await selectScenario(page, "No votes");
  await expect(page.getByTestId("styfi-personal-apr")).toHaveText("8%");
  await selectScenario(page, "YBC member");
  await expect(page.getByTestId("styfi-total-apr")).toHaveText("25%");
  await expect(page.getByTestId("styfi-apr-contributions").getByText("YBC income").locator("..")).toContainText("5%");
  await expect(page.getByTestId("styfi-voting-power").getByText("Voting influence (estimate)")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("styfi-ybc-desktop.png"), fullPage: true });
});

test("shows account-wide boost for mixed holdings on mobile", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/styfi");
  await waitForTestBridge(page);
  await resetBridge(page);
  await setBalance(page, "stYFI", "25");
  await seedExternalPortfolio(page);
  await page.evaluate(async () => window.__TEST__?.setStyfiAprScenario("ybc"));

  await expect(page.getByText(/Vote Boost combines your eligible positions/)).toBeVisible();
  await expect(page.getByTestId("styfi-personal-apr")).toHaveCount(0);
  await expect(page.getByTestId("styfi-apr-contributions").getByText("YBC income")).toBeVisible();
  await expect(page.getByTestId("styfi-total-apr")).not.toContainText("Unavailable");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("styfi-ybc-mobile.png"), fullPage: true });
});
