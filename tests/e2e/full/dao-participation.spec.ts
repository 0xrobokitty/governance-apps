import { expect, test } from "@playwright/test";
import { resetBridge, waitForTestBridge } from "../utils";

test.beforeEach(async ({ page }) => {
  await page.goto("/dao");
  await waitForTestBridge(page);
  await resetBridge(page);
});

test("updates the wallet action area without rearranging the board", async ({ page }) => {
  await page.evaluate(async () => { await window.__TEST__?.setDaoFixture?.("voting"); });
  const row = page.getByRole("article", { name: /Fund protocol research/ });
  await expect(row.getByRole("link", { name: /Vote. Review proposal and wallet eligibility/ })).toBeVisible();
  const links = await page.getByRole("link", { name: /Open proposal #/ }).allTextContents();
  await page.evaluate(async () => { await window.__TEST__?.setDaoAlreadyVoted?.(true, "yea"); });
  await expect(row.getByRole("button", { name: /Voted Yea/ })).toBeDisabled();
  expect(await page.getByRole("link", { name: /Open proposal #/ }).allTextContents()).toEqual(links);
  await page.evaluate(async () => { await window.__TEST__?.setDaoAccountState?.("disconnected"); });
  await expect(page.getByTestId("dao-wallet-action")).toHaveCount(0);
});

for (const width of [390, 1280]) {
  test(`shows coherent wallet choices and a separate review action at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole("article", { name: /Guarded executable proposal/ }).getByRole("button", { name: /Voted Yea/ })).toBeDisabled();
    const recorded = page.getByRole("article", { name: /Permissionless executable proposal/ }).getByRole("button", { name: /Voted Nay/ });
    await expect(recorded).toBeDisabled();
    await recorded.scrollIntoViewIfNeeded();
    const recordedBox = await recorded.boundingBox();
    expect(recordedBox).not.toBeNull();
    expect(recordedBox!.height).toBeGreaterThanOrEqual(40);
    expect(recordedBox!.width).toBeLessThan(128);
    await page.mouse.click(recordedBox!.x + recordedBox!.width / 2, recordedBox!.y + recordedBox!.height / 2);
    await expect(page).toHaveURL(/\/dao$/);
    await expect(page.getByRole("article", { name: /Renew security operations/ }).getByRole("button", { name: /Voted Yea/ })).toBeDisabled();
    const row = page.getByRole("article", { name: /Fund protocol research/ });
    const action = row.getByTestId("dao-wallet-action");
    const resultsBox = await row.getByTestId("dao-proposal-results").boundingBox();
    const actionBox = await action.boundingBox();
    expect(resultsBox).not.toBeNull();
    expect(actionBox).not.toBeNull();
    if (width >= 1024) {
      expect(actionBox!.x + actionBox!.width).toBeLessThanOrEqual(resultsBox!.x);
      const ended = page.getByRole("article", { name: /Proposal with a partially decoded script/ });
      const endedResults = await ended.getByTestId("dao-proposal-results").boundingBox();
      expect(endedResults!.x).toBe(resultsBox!.x);
      expect(endedResults!.width).toBe(resultsBox!.width);
    } else expect(actionBox!.y + actionBox!.height).toBeLessThanOrEqual(resultsBox!.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const review = action.getByRole("link", { name: /Vote. Review proposal and wallet eligibility/ });
    expect((await review.boundingBox())!.height).toBeGreaterThanOrEqual(40);
    await expect(page.getByText("Your vote", { exact: true })).toHaveCount(0);
    await expect(page.getByText("No vote recorded", { exact: true })).toHaveCount(0);
    await review.focus();
    await expect(review).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/dao\/proposals\/2.*#dao-proposal-actions$/);
    await expect(page.getByRole("heading", { name: "Fund protocol research", level: 1 })).toBeVisible();
    await page.goBack();
    await page.getByRole("link", { name: /Open proposal #3:/ }).click();
    await expect(page.getByText("Vote recorded: Yea", { exact: true })).toBeVisible();
  });
}

test("does not offer voting for upcoming or ended proposals", async ({ page }) => {
  const ended = page.getByRole("article", { name: /Proposal with a partially decoded script/ });
  await expect(ended.getByTestId("dao-wallet-action")).toHaveCount(0);
  await page.getByRole("tab", { name: /Upcoming/ }).click();
  await expect(page.getByTestId("dao-wallet-action")).toHaveCount(0);
});
