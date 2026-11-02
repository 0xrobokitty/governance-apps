import { expect, test } from "@playwright/test";
test.skip(process.env.NEXT_PUBLIC_ENABLE_METRICS_PREVIEW !== "true", "The metrics design preview is opt-in.");

test("metrics mock is labeled, filters capital, and keeps protocol-wide scope explicit", async ({ page }) => {
  await page.goto("/metrics");
  await expect(page.getByRole("heading", { name: "Daily overview", exact: true })).toBeVisible();
  await expect(page.getByText("Sample data · not live", { exact: true })).toBeVisible();
  await expect(page.locator("header")).not.toContainText("0xf39F");
  await page.getByRole("combobox", { name: "Asset group" }).selectOption("ETH");
  await expect(page.getByRole("button", { name: "View USDC on Ethereum" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "View WETH on Ethereum" })).toBeVisible();
  await expect(page.getByText("Protocol-wide", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "1D", exact: true }).click();
  await expect(page.getByTestId("metrics-range")).toHaveText("1 Nov 2026");
  await page.getByRole("button", { name: "View WETH on Ethereum" }).click();
  await expect(page.getByRole("dialog")).toContainText("Fictional product example");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
