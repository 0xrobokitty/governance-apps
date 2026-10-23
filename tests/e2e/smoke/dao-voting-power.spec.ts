import { expect, test } from "@playwright/test";
import { resetBridge, waitForTestBridge } from "../utils";

test("shows a compact DAO voting total and labels the YBC estimate", async ({ page }, testInfo) => {
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

  await page.getByRole("button", { name: "🛠️ Debug", exact: true }).click();
  await page.getByRole("checkbox", { name: "YBC member", exact: true }).check();
  await page.getByRole("button", { name: "Close debug controls", exact: true }).click();
  await expect(power).toContainText("Including YBC · estimate");
  await expect(power).toContainText("310 YFI");

  const details = power.getByRole("button", { name: "Voting power breakdown", exact: true });
  await details.click();
  const tooltip = power.getByRole("tooltip");
  await expect(tooltip.getByText("stYFIx via YBC").locator("..")).toContainText("200 YFI");
  await expect(tooltip.getByText("YBC stake").locator("..")).toContainText("10 YFI");
  await expect(tooltip.getByText("Share of YBC member weight").locator("..")).toContainText("10%");
  await expect(tooltip).toContainText("Assumes all YBC members vote");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const bounds = await tooltip.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: testInfo.outputPath("dao-voting-power-mobile.png"), fullPage: true, animations: "disabled" });
  await details.press("Escape");
  await expect(tooltip).not.toBeVisible();

  await page.evaluate(async () => window.__TEST__?.setDaoAccountState?.("disconnected"));
  await expect(power).toHaveCount(0);
});
