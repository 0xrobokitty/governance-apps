import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  DAO_MOCK_HISTORICAL_YEA_VOTER_ADDRESS,
  DAO_MOCK_HISTORICAL_NAY_VOTER_ADDRESS,
} from "@/lib/clients/dao/fixtures";
import { resetBridge, waitForTestBridge } from "../utils";

const VIEWPORTS = [
  { name: "phone", width: 390, height: 844 },
  { name: "desktop", width: 1_280, height: 900 },
  { name: "wide desktop", width: 1_920, height: 1_080 },
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
    const rows = table.getByRole("rowgroup", { name: "Individual voters" }).getByRole("row");
    const collective = table.getByRole("rowgroup", { name: "Current YBC vote" });
    await page.getByRole("link", { name: "View votes", exact: true }).click();
    await expect(page.getByRole("tabpanel", { name: /^Votes/ })).toBeFocused();
    // Collective replacements are combined once, outside the sortable individual list.
    await expect(rows).toHaveCount(2);
    await expect(collective.getByText("75% Yea", { exact: true })).toBeVisible();
    await expect(collective.getByText("25% Nay", { exact: true })).toBeVisible();
    await expect(collective.getByText("6 YFI", { exact: true })).toBeVisible();
    await expect(collective.getByText("54.54% of votes", { exact: true })).toBeVisible();
    await expect(table.getByText("Yea", { exact: true })).toHaveCount(1);
    await expect(table.getByText("Nay", { exact: true })).toHaveCount(1);
    await expect(collective.getByRole("button", { name: /^Edit name:/ })).toHaveCount(0);
    await expect(collective.getByRole("link", { name: "Explore YBC" })).toHaveAttribute("href", "/ybc");
    await expect(table.locator("time[datetime]")).toHaveCount(3);
    await expect(table.getByRole("link", { name: /View Ethereum transaction/ })).toHaveCount(2);
    await expectAddress(rows.first(), DAO_MOCK_HISTORICAL_NAY_VOTER_ADDRESS);
    await expectIdentityLayout(rows.first());
    const editName = rows.first().getByRole("button", { name: /^Edit name:/ });
    await page.mouse.move(0, 0);
    await expect(editName.locator("svg")).toHaveCSS("opacity", "0");
    await editName.hover();
    await expect(editName.locator("svg")).toHaveCSS("opacity", "1");
    await page.mouse.move(0, 0);
    await page.getByRole("searchbox").click();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await expect(editName).toBeFocused();
    await expect(editName.locator("svg")).toHaveCSS("opacity", "1");
    if (viewport.width >= 1_280) {
      await expectPrimaryLineAlignment(rows.first());
      expect((await rows.first().boundingBox())!.height).toBeLessThanOrEqual(90);
    }

    const sort = page.getByRole("combobox", { name: "Sort votes" });
    const chevron = sort.locator("..").locator("svg");
    await expect(sort).toHaveCSS("appearance", "none");
    const selectBox = await sort.boundingBox();
    const chevronBox = await chevron.boundingBox();
    expect(selectBox).not.toBeNull();
    expect(chevronBox).not.toBeNull();
    expect(selectBox!.x + selectBox!.width - chevronBox!.x - chevronBox!.width).toBeGreaterThanOrEqual(10);
    expect(Math.abs(chevronBox!.y + chevronBox!.height / 2 - selectBox!.y - selectBox!.height / 2)).toBeLessThanOrEqual(1);
    await sort.selectOption("oldest");
    await expectAddress(rows.first(), DAO_MOCK_HISTORICAL_YEA_VOTER_ADDRESS);
    await sort.selectOption("power");
    await expectAddress(rows.first(), DAO_MOCK_HISTORICAL_YEA_VOTER_ADDRESS);
    await expect(rows.first().getByText("27.27% of votes", { exact: true })).toBeVisible();
    await sort.selectOption("newest");
    await expectAddress(rows.first(), DAO_MOCK_HISTORICAL_NAY_VOTER_ADDRESS);

    const search = page.getByRole("searchbox", { name: "Search name or address" });
    await search.fill(DAO_MOCK_HISTORICAL_YEA_VOTER_ADDRESS);
    await expect(rows).toHaveCount(1);
    await expectAddress(rows.first(), DAO_MOCK_HISTORICAL_YEA_VOTER_ADDRESS);
    // The compact name's upward extension is also an active, nonoverlapping hit area.
    const editBox = (await rows.first().getByRole("button", { name: /^Edit name:/ }).boundingBox())!;
    await page.mouse.click(editBox.x + 8, editBox.y - 10);
    await page.getByRole("textbox", { name: "Local voter name" }).fill("Protocol research delegate");
    await expectNoHorizontalOverflow(page);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(rows.first().getByRole("button", { name: "Edit name: Protocol research delegate", exact: true })).toBeVisible();
    await expect(rows.first().getByRole("button", { name: "Edit name: Protocol research delegate", exact: true })).toHaveAttribute("title", "Edit name: Protocol research delegate");
    await expectIdentityLayout(rows.first());
    if (viewport.width >= 1_280) await expectPrimaryLineAlignment(rows.first());
    await search.fill("Protocol research delegate");
    await expect(rows).toHaveCount(1);
    await expectAddress(rows.first(), DAO_MOCK_HISTORICAL_YEA_VOTER_ADDRESS);
    await search.fill("no-matching-voter");
    await expect(rows).toHaveCount(0);
    await expect(page.getByText("No voters match your search.", { exact: true })).toBeVisible();
    await expect(collective.getByText("6 YFI", { exact: true })).toBeVisible();
    await expect(collective.getByText("75% Yea", { exact: true })).toBeVisible();

    await page.reload();
    await expect(table.getByRole("button", { name: "Edit name: Protocol research delegate", exact: true })).toBeVisible();
    await search.fill("Protocol research delegate");
    await expect(rows).toHaveCount(1);
    await expectAddress(rows.first(), DAO_MOCK_HISTORICAL_YEA_VOTER_ADDRESS);
    await search.clear();
    await expect(rows).toHaveCount(2);
    await table.scrollIntoViewIfNeeded();
    await expectNoHorizontalOverflow(page);
  });
}

test.describe("touch voter names", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test("keeps the pencil visible and opens the editor from the name", async ({ page }) => {
    await page.goto("/dao/proposals/2");
    await waitForTestBridge(page);
    await page.getByRole("tab", { name: /^Votes/ }).tap();
    const rows = page.getByRole("rowgroup", { name: "Individual voters" }).getByRole("row");
    const edit = rows.first().getByRole("button", { name: /^Edit name:/ });
    await expect(edit.locator("svg")).toHaveCSS("opacity", "1");
    await edit.tap();
    await expect(page.getByRole("textbox", { name: "Local voter name" })).toBeFocused();
    await page.getByRole("button", { name: "Cancel", exact: true }).tap();
    await expect(edit).toBeFocused();
    await expectIdentityLayout(rows.first());
    await expectNoHorizontalOverflow(page);
  });
});

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

async function expectIdentityLayout(row: Locator) {
  const edit = await row.getByRole("button", { name: /^Edit name:/ }).boundingBox();
  const address = await row.getByRole("link", { name: /^View Ethereum address/ }).boundingBox();
  const label = await row.locator("[data-identity-label]").boundingBox();
  expect(edit).not.toBeNull();
  expect(address).not.toBeNull();
  const hitExtension = await row.getByRole("button", { name: /^Edit name:/ }).evaluate((element) => -parseFloat(getComputedStyle(element, "::before").top));
  expect(edit!.height + hitExtension).toBeGreaterThanOrEqual(40);
  expect(address!.height).toBeGreaterThanOrEqual(40);
  expect(label).not.toBeNull();
  expect(address!.y - label!.y - label!.height).toBeLessThanOrEqual(1);
  expect(address!.y).toBeGreaterThanOrEqual(edit!.y + edit!.height);
  const addressText = (await row.getByRole("link", { name: /^View Ethereum address/ }).locator("code").boundingBox())!;
  expect(Math.abs(label!.x - addressText.x)).toBeLessThanOrEqual(1);
}

async function expectPrimaryLineAlignment(row: Locator) {
  const linePositions = await row.evaluate((element) => {
    const cells = element.querySelectorAll('[role="cell"]');
    const choice = Array.from(cells[1].querySelectorAll("p")).find((paragraph) => paragraph.getBoundingClientRect().height > 0)!;
    const elements = [
      cells[0].querySelector('[data-identity-label]'),
      choice.querySelector("span:last-child") ?? choice,
      cells[2].querySelector("time"),
      ...Array.from(cells[3].querySelectorAll("p")).filter((paragraph) => paragraph.getBoundingClientRect().height > 0).slice(0, 1),
    ];
    return elements.map((node) => {
      const range = document.createRange();
      range.selectNodeContents(node!);
      return range.getClientRects()[0].y;
    });
  });
  expect(linePositions).toHaveLength(4);
  expect(Math.max(...linePositions) - Math.min(...linePositions)).toBeLessThanOrEqual(1);
}
