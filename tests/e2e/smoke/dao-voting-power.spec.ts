import { expect, test, type Locator, type Page } from "@playwright/test";
import { resetBridge, waitForTestBridge } from "../utils";

async function loadVotingPower(page: Page) {
  await page.goto("/dao");
  await waitForTestBridge(page);
  await resetBridge(page);
  await page.evaluate(async () => {
    await window.__TEST__?.setDaoAccountState?.("weight");
    await window.__TEST__?.setDaoAccountWeight?.((100n * 10n ** 18n).toString());
  });
}

async function expectContained(locator: Locator, page: Page) {
  const bounds = await locator.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual((await page.viewportSize())!.width);
  expect(await locator.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
}

test("keeps voting power compact in the proposal header and opens its YBC breakdown", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loadVotingPower(page);

  const power = page.getByTestId("dao-voting-power");
  const trigger = power.getByRole("button", { name: /Your voting power/ });
  const heading = page.getByRole("heading", { name: "Proposals", exact: true });
  const header = page.locator("header").filter({ has: heading });
  await expect(header.getByTestId("dao-voting-power")).toBeVisible();
  await expect(trigger).toContainText("3.22%");
  await expect(trigger).not.toContainText("of total");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(heading).toBeInViewport();
  await expect(page.getByRole("tab", { name: /Active/ })).toBeInViewport();
  const bounds = await trigger.boundingBox();
  expect(bounds!.height).toBe(44);
  await expectContained(trigger, page);

  await trigger.focus();
  const tooltip = power.getByRole("tooltip");
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText("100 YFI ÷ 3,100 YFI ≈ 3.22%");
  await expectContained(tooltip, page);
  await trigger.press("Escape");
  await expect(tooltip).not.toBeVisible();

  await page.getByRole("button", { name: "🛠️ Debug", exact: true }).click();
  await page.getByRole("checkbox", { name: "YBC member", exact: true }).check();
  await page.getByRole("button", { name: "Close debug controls", exact: true }).click();
  await expect(trigger).not.toContainText("YBC estimate");
  await expect(trigger).toContainText("10%");
  await trigger.focus();
  await trigger.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Voting power breakdown", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("stYFIx via YBC").locator("..")).toContainText("200 YFI");
  await expect(dialog.getByText("YBC stake").locator("..")).toContainText("10 YFI");
  await expect(dialog.getByText("Share of YBC member weight").locator("..")).toContainText("10%");
  await expect(dialog).toContainText("310 YFI ÷ 3,100 YFI ≈ 10%");
  await expect(dialog).toContainText("Assumes all YBC members vote");
  await expect(dialog.getByText("Delegated stYFIx pool").locator("..")).toContainText("2,000 YFI");
  await expectContained(dialog, page);
  await expect(dialog.getByRole("button", { name: "Close dialog" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Close dialog" })).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath("dao-voting-power-mobile-modal.png"), animations: "disabled" });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(heading).toBeInViewport();

  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(header.getByRole("link", { name: "Create proposal", exact: true })).toBeVisible();
  await expectContained(header, page);
  await expect(page.getByRole("tab", { name: /Active/ })).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath("dao-voting-power-header.png"), animations: "disabled" });

  await page.evaluate(async () => window.__TEST__?.setDaoAccountState?.("disconnected"));
  await expect(power).toHaveCount(0);
});

test.describe("enlarged text and touch", () => {
  test.use({ hasTouch: true });

  test("keeps the voting control, tooltip, and modal inside a 390px viewport at 200% text", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loadVotingPower(page);
    await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    const power = page.getByTestId("dao-voting-power");
    const trigger = power.getByRole("button", { name: /Your voting power/ });
    const heading = page.getByRole("heading", { name: "Proposals", exact: true });
    await expect(heading).toBeInViewport();
    await expectContained(trigger, page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await trigger.focus();
    await expect(power.getByRole("tooltip")).toBeVisible();
    await expectContained(power.getByRole("tooltip"), page);
    await trigger.press("Escape");
    await trigger.tap();
    const dialog = page.getByRole("dialog", { name: "Voting power breakdown", exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("100 YFI ÷ 3,100 YFI ≈ 3.22%");
    await expectContained(dialog, page);
    const bounds = await dialog.boundingBox();
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844);
    await dialog.getByRole("button", { name: "Close dialog" }).tap();
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
});
