import { expect, test } from "@playwright/test";
import { resetBridge, waitForTestBridge } from "../utils";

test("shows DAO voting power above proposals with an expandable total and share breakdown", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dao");
  await waitForTestBridge(page);
  await resetBridge(page);
  await page.evaluate(async () => {
    await window.__TEST__?.setDaoAccountState?.("weight");
    await window.__TEST__?.setDaoAccountWeight?.((100n * 10n ** 18n).toString());
  });

  const power = page.getByTestId("dao-voting-power");
  await expect(power).toBeVisible();
  await expect(power).toContainText("100 YFI");
  await expect(power.getByText("Direct voting power", { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(power.getByText("3.22%", { exact: true })).toBeVisible();
  await expect(power.getByText("3,100 YFI", { exact: true }).filter({ visible: true })).toBeVisible();
  const initialBounds = await power.boundingBox();
  const proposals = await page.getByRole("heading", { name: "Proposals", exact: true }).boundingBox();
  expect(initialBounds!.y + initialBounds!.height).toBeLessThan(proposals!.y);

  await page.getByRole("button", { name: "🛠️ Debug", exact: true }).click();
  await page.getByRole("checkbox", { name: "YBC member", exact: true }).check();
  await page.getByRole("button", { name: "Close debug controls", exact: true }).click();
  await expect(power).toContainText("Including YBC · estimate");
  await expect(power).toContainText("310 YFI");

  await expect(power.getByText("10%", { exact: true }).filter({ visible: true })).toBeVisible();
  const details = power.locator("details");
  const toggle = power.locator("summary");
  await expect(details).not.toHaveAttribute("open");
  await toggle.click();
  await expect(details.getByText("stYFIx via YBC").locator("..")).toContainText("200 YFI");
  await expect(details.getByText("YBC stake").locator("..")).toContainText("10 YFI");
  await expect(details.getByText("Share of YBC member weight").locator("..")).toContainText("10%");
  await expect(details).toContainText("Assumes all YBC members vote");
  await expect(details.getByText("Delegated stYFIx pool").locator("..")).toContainText("2,000 YFI");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const bounds = await details.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: testInfo.outputPath("dao-voting-power-mobile.png"), fullPage: true, animations: "disabled" });
  await toggle.click();
  await expect(details).not.toHaveAttribute("open");

  await page.evaluate(async () => window.__TEST__?.setDaoAccountState?.("disconnected"));
  await expect(power).toHaveCount(0);
});
