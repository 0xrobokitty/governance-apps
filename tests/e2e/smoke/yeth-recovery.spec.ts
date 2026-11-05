import { test, expect } from "@playwright/test";
test.skip(process.env.NEXT_PUBLIC_YETH_RECOVERY_PREVIEW !== "true", "Requires the explicit mock recovery milestone.");

test("full auction is the only exit offer and preserves the original claim", async ({ page }) => {
  await page.goto("/yeth");
  await expect(page.getByRole("heading", { name: "Your recovery today" })).toBeVisible();
  await expect(page.getByText("Design preview", { exact: false })).toBeVisible();
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.getByTestId("recovery-headline")).toHaveText("48.5%");
  await expect(page.getByTestId("recovery-timeline").getByRole("slider")).toHaveCount(0);
  await expect(page.getByText(/watching ·/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Exit position" })).toHaveCount(0);
  await page.getByRole("button", { name: "Review full exit" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Approve shares · simulation", exact: true }).click();
  await dialog.getByRole("button", { name: "Take offer · simulation", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Your auction exit is complete", { exact: false })).toBeVisible();
  await expect(page.getByText("10.00 ETH", { exact: true })).toBeVisible();
  await expect(page.getByTestId("recovery-headline")).toHaveText("69.0%");
  await expect(page.getByRole("button", { name: "Review full exit" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Exit position" })).toHaveCount(0);
});

test("partial auction can resume the second exit after close and failure", async ({ page }) => {
  await page.goto("/yeth");
  await page.getByLabel("Preview state").selectOption("redeem-error");
  await expect(page.getByRole("radio", { name: "Exit fully", exact: true })).toBeChecked();
  await expect(page.getByTestId("exit-scope")).toHaveText("Exit your whole remaining position");
  await expect(page.getByTestId("exit-payout")).toHaveText("5.068 WETH");
  await expect(page.getByTestId("exit-rate")).toHaveText("50.7%");
  await page.getByRole("radio", { name: "Take auction only", exact: true }).check();
  await expect(page.getByTestId("exit-payout")).toHaveText("0.750 WETH");
  await expect(page.getByTestId("exit-rate")).toHaveText("69.0%");
  await page.getByRole("radio", { name: "Exit fully", exact: true }).check();
  await page.getByRole("button", { name: "Review full exit" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByTestId("review-choice")).toContainText("Exit fully");
  await expect(dialog.getByText("Estimated total exit")).toBeVisible();
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Approve shares · simulation", exact: true }).click();
  await dialog.getByRole("button", { name: "Take offer · simulation", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Step 2 · Redeem the rest" })).toBeVisible();
  await expect(dialog.getByText("0.750 WETH already received from the auction.")).toBeVisible();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Continue remaining redemption" }).click();
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Redeem shares · simulation" }).click();
  await expect(dialog.getByRole("alert")).toContainText("auction payout is safe");
  await expect(dialog.getByRole("button", { name: "Take offer · simulation" })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Redeem shares · simulation" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId("recovery-headline")).toHaveText("50.7%");
  await expect(page.getByRole("button", { name: "Continue remaining redemption" })).toHaveCount(0);
});

test("inactive auctions allow direct exits and unavailable positions fail closed", async ({ page }) => {
  await page.goto("/yeth");
  for (const state of ["waiting", "empty", "ended", "no-position", "stale", "disconnected"]) {
    await page.getByLabel("Preview state").selectOption(state);
    await expect(page.getByRole("button", { name: "Review full exit" })).toHaveCount(0);
    if (["no-position", "stale", "disconnected"].includes(state)) await expect(page.getByRole("button", { name: "Exit position" })).toHaveCount(0);
    else await expect(page.getByRole("button", { name: "Exit position" })).toBeEnabled();
  }
  await page.getByLabel("Preview state").selectOption("error");
  await expect(page.getByRole("heading", { name: "Recovery data unavailable" })).toBeVisible();
  await page.getByRole("button", { name: "Retry preview" }).click();
  await expect(page.getByRole("button", { name: "Review full exit" })).toBeEnabled();
  await page.getByLabel("Preview state").selectOption("waiting");
  await page.getByRole("button", { name: "Exit position" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Redeem shares · simulation" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId("recovery-headline")).toHaveText("48.5%");
  await expect(page.getByRole("button", { name: "Exit position" })).toHaveCount(0);
});
