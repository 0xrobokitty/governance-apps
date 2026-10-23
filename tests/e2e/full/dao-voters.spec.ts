import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  DAO_MOCK_ACCOUNT_ADDRESS,
  DAO_MOCK_STYFIX_AGGREGATE_ADDRESS,
  DAO_MOCK_YBC_AGGREGATE_ADDRESS,
} from "@/lib/clients/dao/fixtures";
import { resetBridge, waitForTestBridge } from "../utils";

const VIEWPORTS = [
  { name: "phone", width: 390, height: 844 },
  { name: "desktop", width: 1_280, height: 900 },
] as const;

for (const viewport of VIEWPORTS) {
  test(`searches, sorts and saves voter names on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/dao/proposals/2");
    await waitForTestBridge(page);
    await resetBridge(page);
    await page.evaluate(async () => { await window.__TEST__?.setDaoFixture?.("voting"); });
    await expect(page.getByRole("heading", { name: "Fund protocol research", level: 1 })).toBeVisible();

    const table = page.getByRole("table", { name: "Proposal votes" });
    const rows = table.getByRole("rowgroup").getByRole("row");
    await page.getByRole("link", { name: "View votes", exact: true }).click();
    await expect(page.getByLabel("Votes", { exact: true })).toBeFocused();
    // Six vote events yield four voters: collective replacements never become extra rows.
    await expect(rows).toHaveCount(4);
    await expect(table.getByText("75% For", { exact: true })).toHaveCount(2);
    await expect(table.getByText("25% Against", { exact: true })).toHaveCount(2);
    await expect(table.locator("time[datetime]")).toHaveCount(4);
    await expect(table.getByRole("link", { name: /View Ethereum transaction/ })).toHaveCount(4);
    await expectAddress(rows.first(), DAO_MOCK_YBC_AGGREGATE_ADDRESS);

    const sort = page.getByRole("combobox", { name: "Sort votes" });
    await sort.selectOption("oldest");
    await expectAddress(rows.first(), DAO_MOCK_ACCOUNT_ADDRESS);
    await sort.selectOption("power");
    await expectAddress(rows.first(), DAO_MOCK_STYFIX_AGGREGATE_ADDRESS);
    await expect(rows.first().getByText("36.36% of votes", { exact: true })).toBeVisible();
    await sort.selectOption("newest");
    await expectAddress(rows.first(), DAO_MOCK_YBC_AGGREGATE_ADDRESS);

    const search = page.getByRole("searchbox", { name: "Search name or address" });
    await search.fill(DAO_MOCK_STYFIX_AGGREGATE_ADDRESS);
    await expect(rows).toHaveCount(1);
    await expectAddress(rows.first(), DAO_MOCK_STYFIX_AGGREGATE_ADDRESS);
    await rows.first().getByRole("button", { name: /^Edit name:/ }).click();
    await page.getByRole("textbox", { name: "Local voter name" }).fill("Protocol research delegate");
    await expectNoHorizontalOverflow(page);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(rows.first().getByRole("button", { name: "Edit name: Protocol research delegate", exact: true })).toBeVisible();
    await search.fill("Protocol research delegate");
    await expect(rows).toHaveCount(1);
    await expectAddress(rows.first(), DAO_MOCK_STYFIX_AGGREGATE_ADDRESS);
    await search.fill("no-matching-voter");
    await expect(rows).toHaveCount(0);
    await expect(page.getByText("No voters match your search.", { exact: true })).toBeVisible();

    await page.reload();
    await expect(table.getByRole("button", { name: "Edit name: Protocol research delegate", exact: true })).toBeVisible();
    await search.fill("Protocol research delegate");
    await expect(rows).toHaveCount(1);
    await expectAddress(rows.first(), DAO_MOCK_STYFIX_AGGREGATE_ADDRESS);
    await search.clear();
    await expect(rows).toHaveCount(4);
    await table.scrollIntoViewIfNeeded();
    await expectNoHorizontalOverflow(page);
  });
}

async function expectAddress(row: Locator, address: string) {
  await expect(row.getByRole("link", { name: `View Ethereum address ${address} on Etherscan`, exact: true })).toBeVisible();
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
}
