import { expect, test } from "@playwright/test";
import { resetBridge, waitForTestBridge } from "../utils";

test.beforeEach(async ({ page }) => {
  await page.goto("/dao");
  await waitForTestBridge(page);
  await resetBridge(page);
});

test("updates wallet participation badges without rearranging the board", async ({ page }) => {
  await page.evaluate(async () => { await window.__TEST__?.setDaoFixture?.("voting"); });
  const row = page.getByRole("article", { name: /Fund protocol research/ });
  await expect(row.getByTestId("dao-participation-badge")).toHaveText("Not voted");
  const links = await page.getByRole("link", { name: /Open proposal #/ }).allTextContents();
  await page.evaluate(async () => { await window.__TEST__?.setDaoAlreadyVoted?.(true, "yea"); });
  await expect(row.getByTestId("dao-participation-badge")).toHaveText("Voted");
  expect(await page.getByRole("link", { name: /Open proposal #/ }).allTextContents()).toEqual(links);
  await page.evaluate(async () => { await window.__TEST__?.setDaoAccountState?.("disconnected"); });
  await expect(page.getByTestId("dao-participation-badge")).toHaveCount(0);
});

test("shows the latest YBC split on narrow and wide proposal views", async ({ page }) => {
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/dao/proposals/2");
    const card = page.getByLabel("YBC vote", { exact: true });
    await expect(card.getByRole("img", { name: "YBC vote: 75% for, 25% against" })).toBeVisible();
    await expect(card.getByText("1.5 voting weight")).toBeVisible();
    await expect(card.getByRole("link", { name: "Explore YBC" })).toHaveAttribute("href", "/ybc");
    await expect(card.locator("details")).not.toHaveAttribute("open");
    await card.locator("summary").click();
    await expect(card.getByText(/Last vote update:/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});
