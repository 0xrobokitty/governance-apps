import { expect, test } from "@playwright/test";

test("links stYFI voting to DAO without making a Snapshot request", async ({ page }) => {
  const snapshotRequests: string[] = [];
  page.on("request", request => { if (request.url().includes("hub.snapshot.org")) snapshotRequests.push(request.url()); });
  await page.setViewportSize({ width: 900, height: 900 });
  await page.goto("/styfi");
  const headerLink = page.locator("header").getByRole("link", { name: /Voting & Proposals/ });
  await expect(headerLink).toBeVisible();
  await expect(headerLink).toHaveAttribute("href", "/dao");
  const headerLinkBox = await headerLink.boundingBox();
  const epochBox = await page.getByText(/^Epoch \d+$/).locator("..").boundingBox();
  expect(headerLinkBox).not.toBeNull();
  expect(epochBox).not.toBeNull();
  expect(headerLinkBox!.x + headerLinkBox!.width).toBeLessThanOrEqual(epochBox!.x);
  await expect(page.getByTestId("governance-app-footer")).toBeVisible();
  expect(snapshotRequests).toHaveLength(0);
});

test("keeps DAO voting accessible in the mobile navigation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/styfi");
  await page.getByRole("button", { name: "Open navigation menu" }).click();
  const menu = page.getByRole("dialog", { name: "Navigation menu" });
  const link = menu.getByRole("link", { name: /Voting & Proposals/ });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", "/dao");
});
