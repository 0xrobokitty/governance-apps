import { expect, test } from "@playwright/test";
test.skip(process.env.NEXT_PUBLIC_ENABLE_PULSE_PREVIEW !== "true", "Pulse preview is opt-in.");

test("Pulse replaces Metrics with nine historical cards including recovery and reserves", async ({ page, request }) => {
  expect((await request.get("/metrics")).status()).toBe(404);
  await page.goto("/pulse");
  await expect(page.getByRole("heading", { name: "Pulse", exact: true })).toBeVisible();
  await expect(page.getByText("Illustrative data · not live", { exact: true })).toBeVisible();
  await expect(page.locator('main svg[role="img"]')).toHaveCount(9);
  await expect(page.getByTestId("pulse-ylockers").getByRole("heading", { name: "yLockers", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recovery & loans", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Treasury reserves", exact: true })).toBeVisible();
  await expect(page.locator("header")).not.toContainText("0xf39F");
  await page.getByRole("group", { name: "History window" }).getByRole("button", { name: "90D" }).click();
  await expect(page.getByTestId("pulse-range")).toContainText("5 Aug");
  await page.getByRole("group", { name: "History window" }).getByRole("button", { name: "365D" }).click();
  await expect(page.getByTestId("pulse-range")).toHaveText("3 Nov 2025 – 2 Nov 2026 · completed UTC days");
  await page.getByRole("button", { name: "Details: Net external flows", exact: true }).click();
  await expect(page.getByRole("dialog").locator("tbody tr")).toHaveCount(365);
  await expect(page.getByRole("dialog").locator("tbody tr").first()).toContainText("3 Nov 2025");
  await page.keyboard.press("Escape");
  await page.getByRole("combobox", { name: "Capital asset group" }).selectOption("eth");
  await expect(page.getByRole("table", { name: /Product trends/ })).not.toContainText("USDC");
  await expect(page.getByTestId("pulse-fees")).toContainText("All products");
});
