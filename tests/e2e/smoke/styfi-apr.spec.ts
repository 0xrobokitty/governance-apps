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
  await expect(membership.getByTestId("ybc-estimated-backing")).toHaveText("6.25 YFI");
  await expect(membership.getByText("Yearn Builders Collective", { exact: true })).toBeVisible();
  await expect(page.getByText("Other Governance Positions", { exact: true })).toHaveCount(1);
  const backing = membership.getByRole("button", { name: "Estimated backing", exact: true });
  await backing.focus();
  await expect(membership.getByRole("tooltip")).toContainText("6.25% × 100 YFI ≈ 6.25 YFI");
  await backing.press("Escape");
  await expect(membership.getByRole("tooltip")).not.toBeVisible();
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

for (const width of [1280, 390]) test(`aligns mode comparison and preserves estimates at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.goto("/styfi");
  await waitForTestBridge(page);
  await resetBridge(page);

  const onboarding = page.getByRole("button").filter({ has: page.getByTestId("staking-apr-styfi") });
  await expect(onboarding).toContainText("8%–20%");
  await expect(onboarding).not.toContainText("1×–2.5× Vote Boost");
  const delegated = page.getByRole("button").filter({ has: page.getByTestId("mode-header-styfix") });
  // The stats banner can move both cards during hydration. Measure each card
  // and its children in one frame instead of combining different page positions.
  const cardLayouts = await page.evaluate(() => ["styfi", "styfix"].map((asset) => {
    const estimate = document.querySelector<HTMLElement>(`[data-testid="staking-apr-${asset}"]`)!;
    const card = estimate.closest("button")!;
    const cardBounds = card.getBoundingClientRect();
    const estimateBounds = estimate.getBoundingClientRect();
    return { height: cardBounds.height, estimateOffset: estimateBounds.y - cardBounds.y };
  }));
  expect(Math.abs(cardLayouts[0].height - cardLayouts[1].height)).toBeLessThanOrEqual(1);
  expect(Math.abs(cardLayouts[0].estimateOffset - cardLayouts[1].estimateOffset)).toBeLessThanOrEqual(1);
  const badgePositions = await delegated.evaluate((card) => {
    const badges = Array.from(card.querySelectorAll("span")).filter((badge) =>
      badge.textContent === "Delegated" || badge.textContent === "Recommended");
    return badges.map((badge) => badge.getBoundingClientRect().y);
  });
  expect(badgePositions).toHaveLength(2);
  expect(badgePositions[0]).toBe(badgePositions[1]);
  await expect(delegated.getByTestId("staking-apr-styfix").getByText("20%", { exact: true })).toHaveCSS("color", "rgb(6, 87, 249)");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
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
  // Read both cards in one frame so the dialog's entrance animation cannot skew alignment.
  const estimateLayouts = await compare.locator('[data-testid^="staking-apr-"]').evaluateAll((estimates) => estimates.map((estimate) => {
    const bounds = estimate.getBoundingClientRect();
    const paragraphs = estimate.querySelectorAll("p");
    const label = paragraphs[0].getBoundingClientRect();
    const value = paragraphs[1].getBoundingClientRect();
    return { y: bounds.y, height: bounds.height, labelX: label.x, labelBottom: label.bottom, valueX: value.x, valueY: value.y };
  }));
  expect(estimateLayouts).toHaveLength(2);
  for (const layout of estimateLayouts) {
    expect(layout.valueY).toBeGreaterThanOrEqual(layout.labelBottom);
    expect(Math.abs(layout.valueX - layout.labelX)).toBeLessThanOrEqual(1);
  }
  if (width >= 768) {
    expect(Math.abs(estimateLayouts[0].y - estimateLayouts[1].y)).toBeLessThanOrEqual(1);
    expect(Math.abs(estimateLayouts[0].height - estimateLayouts[1].height)).toBeLessThanOrEqual(1);
  }
});
