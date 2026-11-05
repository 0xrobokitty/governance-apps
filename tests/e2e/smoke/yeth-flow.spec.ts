import { test, expect } from "@playwright/test";
import {
  E2E_ADDRESS,
  resetBridge,
  setNow,
  setYethPreset,
  waitForTestBridge,
} from "../utils";

const OPEN_CLAIM_WINDOW_NOW = 1_770_000_000;
const YETH_MANUAL_RECOVERY_CLAIM_URL =
  "https://github.com/yearn/yeth-manual-recovery-claims/issues/new?template=manual-yeth-claim.yml";

test("claim, stay, redeem, claim-ended, and empty-state flows", async ({ page }) => {
  test.skip(process.env.NEXT_PUBLIC_YETH_RECOVERY_PREVIEW === "true", "The mock recovery milestone replaces the legacy claim surface.");
  test.setTimeout(120_000);

  await page.goto("/yeth");
  await waitForTestBridge(page);
  await resetBridge(page);
  await setNow(page, OPEN_CLAIM_WINDOW_NOW);

  await setYethPreset(page, "claimable");
  await page.waitForFunction(
    async ({ addr }: { addr: typeof E2E_ADDRESS }) => {
      const state = await window.__TEST__?.getState(addr);
      return state ? Number(state.yeth.claimableNow) > 0 : false;
    },
    { addr: E2E_ADDRESS }
  );

  await page
    .getByRole("button", { name: /Deposit claim into Recovery Vault/i })
    .click();
  await page
    .getByLabel(/I understand and accept these risks/i)
    .click();
  await page.getByRole("button", { name: /^Continue$/i }).click();

  await page.waitForFunction(
    async ({ addr }: { addr: typeof E2E_ADDRESS }) => {
      const state = await window.__TEST__?.getState(addr);
      if (!state) return false;
      return (
        Number(state.yeth.claimableNow) === 0 &&
        Number(state.yeth.recoveryShares) > 0
      );
    },
    { addr: E2E_ADDRESS }
  );
  await expect(
    page.getByRole("heading", { name: /Recovery Position/i })
  ).toBeVisible();

  const redeemButton = page.getByRole("button", { name: /^Exit with .* ETH$/i });
  await expect(redeemButton).toBeVisible();
  await redeemButton.click();

  await page.waitForFunction(
    async ({ addr }: { addr: typeof E2E_ADDRESS }) => {
      const state = await window.__TEST__?.getState(addr);
      return state ? Number(state.yeth.recoveryShares) === 0 : false;
    },
    { addr: E2E_ADDRESS }
  );
  await expect(
    page.getByRole("heading", { name: /Recovery Position/i })
  ).toHaveCount(0);

  await setYethPreset(page, "claimable");
  await expect(
    page.getByRole("button", { name: /^Claim .* ETH & Exit$/i })
  ).toBeVisible();
  await page.getByRole("button", { name: /^Claim .* ETH & Exit$/i }).click();

  await page.waitForFunction(
    async ({ addr }: { addr: typeof E2E_ADDRESS }) => {
      const state = await window.__TEST__?.getState(addr);
      if (!state) return false;
      return (
        Number(state.yeth.claimableNow) === 0 &&
        Number(state.yeth.recoveryShares) === 0
      );
    },
    { addr: E2E_ADDRESS }
  );
  await expect(
    page.getByRole("button", { name: /^Claim .* ETH & Exit$/i })
  ).toHaveCount(0);

  await setYethPreset(page, "claimable");
  await setNow(page, 2_000_000_000);
  await expect(
    page.getByRole("heading", { name: /Claim Window Closed/i })
  ).toBeVisible();
  const manualClaimLink = page.getByRole("link", {
    name: /Open manual yETH claim request/i,
  });
  await expect(manualClaimLink).toBeVisible();
  await expect(manualClaimLink).toHaveAttribute(
    "href",
    YETH_MANUAL_RECOVERY_CLAIM_URL
  );

  await setNow(page, OPEN_CLAIM_WINDOW_NOW);
  await setYethPreset(page, "empty");
  await page.waitForFunction(
    async ({ addr }: { addr: typeof E2E_ADDRESS }) => {
      const state = await window.__TEST__?.getState(addr);
      if (!state) return false;
      return (
        Number(state.yeth.claimableNow) === 0 &&
        Number(state.yeth.recoveryShares) === 0
      );
    },
    { addr: E2E_ADDRESS }
  );
  await expect(
    page.getByRole("button", { name: /^Claim .* ETH & Exit$/i })
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Deposit claim into Recovery Vault/i })
  ).toHaveCount(0);
});
