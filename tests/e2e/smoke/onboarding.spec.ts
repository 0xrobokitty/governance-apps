import { test, expect } from "@playwright/test";
import { waitForTestBridge, resetBridge } from "../utils";

test("connects and defaults to stYFIx", async ({ page }) => {
  await page.goto("/styfi");
  await waitForTestBridge(page);
  await resetBridge(page);

  await expect(
    page.getByText("Compare stYFI and stYFIx")
  ).toBeVisible();

  await expect(page.getByText("Wallet not connected")).toHaveCount(0);

  const styfixCard = page.getByRole("button", {
    name: /^stYFIx Delegated voting Recommended/,
  });
  await expect(styfixCard).toHaveAttribute("aria-pressed", "true");
});
