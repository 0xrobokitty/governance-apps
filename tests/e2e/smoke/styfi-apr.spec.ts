import { expect, test, type Page } from "@playwright/test";
import { resetBridge, seedExternalPortfolio, setBalance, waitForTestBridge } from "../utils";

async function selectScenario(page: Page, label: string) {
  await page.getByRole("button", { name: "🛠️ Debug", exact: true }).click();
  await page.getByRole("button", { name: label, exact: true }).click();
  await page.getByRole("button", { name: "Close debug controls", exact: true }).click();
}

test("explains current APR and distinguishes applied boost from next-epoch participation", async ({ page }, testInfo) => {
  await page.goto("/styfi");
  await waitForTestBridge(page);
  await resetBridge(page);
  await selectScenario(page, "Some votes");

  await expect(page.getByTestId("styfi-stats").getByRole("button", { name: "stYFIx APR", exact: true })).toHaveText("20%");
  await expect(page.getByTestId("styfi-total-apr")).toHaveText("14%");
  await expect(page.getByTestId("styfi-vote-boost")).toHaveText("1.75×");
  await expect(page.getByTestId("styfi-apr-calculation")).not.toBeVisible();
  await expect(page.getByText("3 of 6 proposals", { exact: true }).first()).not.toBeVisible();

  const total = page.getByRole("button", { name: "Current APR", exact: true });
  await total.focus();
  const contributions = page.getByTestId("styfi-apr-contributions");
  await expect(contributions.getByText("stYFI base rewards").locator("..")).toContainText("8%");
  await expect(contributions.getByText("Vote Boost rewards", { exact: true }).locator("..")).toContainText("6%");
  await expect(page.getByText(/Current rewards: epoch \d+\. Vote Boost uses participation through epoch \d+\./)).toBeVisible();
  await total.press("Escape");
  await expect(page.getByTestId("styfi-apr-calculation")).not.toBeVisible();

  const boost = page.getByRole("button", { name: /Applied Vote Boost:/ });
  await boost.focus();
  await expect(page.getByText("1 + (2.5 − 1) × 3 / 6", { exact: true })).toBeVisible();
  await expect(page.getByText(/The boost for epoch \d+ uses participation through epoch \d+\./)).toBeVisible();
  await expect(page.getByText("Next epoch participation", { exact: true })).toBeVisible();
  await expect(page.getByText(/Updates affect rewards from the next epoch/)).toBeVisible();
  await boost.press("Escape");

  await selectScenario(page, "All votes");
  await expect(page.getByTestId("styfi-total-apr")).toHaveText("20%");
  await expect(page.getByTestId("styfi-vote-boost")).toHaveText("2.5×");
  await selectScenario(page, "No votes");
  await expect(page.getByTestId("styfi-total-apr")).toHaveText("8%");
  await expect(page.getByTestId("styfi-vote-boost")).toHaveText("1×");
  await selectScenario(page, "YBC member");
  await expect(page.getByTestId("styfi-total-apr")).toHaveText("25%");
  const membership = page.getByTestId("ybc-membership-row");
  await expect(membership).toContainText("6.25 YFI");
  await expect(membership).toContainText("6.25%");
  await expect(membership.getByRole("link", { name: "View YBC membership" })).toHaveAttribute("href", "/ybc");
  await total.focus();
  await expect(contributions.getByText("YBC income").locator("..")).toContainText("5%");
  await expect(page.getByTestId("styfi-voting-power")).toHaveCount(0);
  await expect(page.getByTestId("dao-voting-power")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("styfi-ybc-desktop.png"), fullPage: true, animations: "disabled" });
});

test("opens the APR calculation by touch without mobile overflow", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/styfi");
  await waitForTestBridge(page);
  await resetBridge(page);
  await setBalance(page, "stYFI", "25");
  await seedExternalPortfolio(page);
  await page.evaluate(async () => window.__TEST__?.setStyfiAprScenario("ybc"));

  await page.getByRole("button", { name: "Current APR", exact: true }).click();
  await expect(page.getByText(/Vote Boost combines your eligible positions/)).toBeVisible();
  await expect(page.getByTestId("styfi-personal-apr")).toHaveCount(0);
  await expect(page.getByTestId("styfi-apr-contributions").getByText("YBC income")).toBeVisible();
  await expect(page.getByTestId("styfi-total-apr")).not.toContainText("Unavailable");
  await expect(page.getByTestId("ybc-membership-row")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const bounds = await page.getByTestId("styfi-apr-calculation").boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: testInfo.outputPath("styfi-ybc-mobile.png"), fullPage: true, animations: "disabled" });
});

test("keeps mode estimates above both stake and unstake controls", async ({ page }) => {
  await page.goto("/styfi");
  await waitForTestBridge(page);
  await resetBridge(page);

  const onboarding = page.getByRole("button").filter({ has: page.getByTestId("staking-apr-styfi") });
  await expect(onboarding).toContainText("8%–20%");
  await expect(onboarding).not.toContainText("1×–2.5× Vote Boost");
  await onboarding.click();
  const stake = page.locator("#stake-manage");
  await expect(stake.getByTestId("staking-apr-styfi")).toContainText("8%–20%");
  const estimateBounds = await stake.getByTestId("staking-apr-styfi").boundingBox();
  const tabBounds = await stake.getByRole("tab", { name: "Stake", exact: true }).boundingBox();
  expect(estimateBounds).not.toBeNull();
  expect(tabBounds).not.toBeNull();
  expect(estimateBounds!.y + estimateBounds!.height).toBeLessThan(tabBounds!.y);

  await stake.getByRole("tab", { name: "Unstake", exact: true }).click();
  await expect(stake.getByTestId("staking-apr-styfi")).toBeVisible();
  await stake.getByRole("button", { name: "stYFIx", exact: true }).click();
  await expect(stake.getByTestId("staking-apr-styfix")).toContainText("20%");
  await expect(stake.getByText("Estimated APR", { exact: true })).toHaveCount(1);
  await stake.getByRole("tab", { name: "Stake", exact: true }).click();
  await expect(stake.getByTestId("staking-apr-styfix")).toBeVisible();

  await page.getByRole("button", { name: "Compare modes", exact: true }).click();
  const compare = page.getByRole("heading", { name: "Compare modes", exact: true }).locator("../..");
  await expect(compare.getByTestId("staking-apr-styfi")).toContainText("8%–20%");
  await expect(compare.getByTestId("staking-apr-styfix")).toContainText("20%");
  await expect(compare.getByText("Delegate your vote to YBC to earn maximum APR.", { exact: true })).toBeVisible();
});
