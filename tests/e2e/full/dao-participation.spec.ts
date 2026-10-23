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
