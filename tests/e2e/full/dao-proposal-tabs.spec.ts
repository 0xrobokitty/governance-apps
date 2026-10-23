import { expect, test, type Page } from "@playwright/test";
import { DAO_MOCK_HISTORICAL_YEA_VOTER_ADDRESS } from "@/lib/clients/dao/fixtures";
import { resetBridge, waitForTestBridge } from "../utils";

test.beforeEach(async ({ page }) => {
  await page.goto("/dao");
  await waitForTestBridge(page);
  await resetBridge(page);
});

test("opens Proposal for discussion, voting, executed, and flagged proposals", async ({ page }) => {
  for (const id of [1, 2, 6, 11]) {
    await page.goto(`/dao/proposals/${id}`);
    await expect(page.getByRole("tablist", { name: "Proposal sections" })).toBeVisible();
    await expectSelectedPanel(page, "Proposal");
    await expect(page.getByRole("heading", { name: "Proposal content", exact: true })).toBeVisible();
    await expect(page.getByRole("table", { name: "Proposal votes" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Lifecycle", exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Vote results", exact: true })).toBeVisible();
  }
});

test("keeps vote results and the selected action outside all three panels", async ({ page }) => {
  await page.evaluate(async () => { await window.__TEST__?.setDaoFixture?.("voting"); });
  await page.goto("/dao/proposals/2");
  const results = page.getByLabel("Vote results", { exact: true });
  const totals = await results.getByTestId("dao-canonical-vote-totals").innerText();
  const nay = page.getByRole("radio", { name: /^Nay(?: Selected)?$/ });
  await nay.check();
  await expect(page.getByRole("tab", { name: /^Votes/ })).toHaveAccessibleName("Votes 2");

  for (const panel of ["Votes", "Details", "Proposal"] as const) {
    await page.getByRole("tab", { name: panel === "Votes" ? /^Votes/ : panel, exact: panel !== "Votes" }).click();
    await expectSelectedPanel(page, panel);
    await expect(results).toBeVisible();
    await expect(results.getByTestId("dao-canonical-vote-totals")).toHaveText(totals, { useInnerText: true });
    await expect(nay).toBeChecked();
    await expect(page.getByRole("button", { name: "Review vote", exact: true })).toBeEnabled();
    expect(await results.evaluate((element) => element.closest('[role="tabpanel"]') === null)).toBe(true);
    expect(await nay.evaluate((element) => element.closest('[role="tabpanel"]') === null)).toBe(true);
  }

  await page.getByRole("button", { name: "Review vote", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Confirm your vote" }).getByRole("button", { name: "Vote Nay" })).toBeEnabled();
});

for (const width of [1280, 1920]) {
  test(`aligns vote results with the active content card at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1080 });
    await page.goto("/dao/proposals/2");
    await expectHeaderMetadata(page, 2);

    for (const panel of ["Proposal", "Votes", "Details"] as const) {
      await page.getByRole("tab", { name: panel === "Votes" ? /^Votes/ : panel, exact: panel !== "Votes" }).click();
      await expectSelectedPanel(page, panel);
      await expect.poll(async () => {
        const layout = await readCardLayout(page);
        return Math.abs(layout.results.top - layout.content.top);
      }).toBeLessThanOrEqual(1);
      const layout = await readCardLayout(page);
      expect(layout.results.left).toBeGreaterThanOrEqual(layout.content.right);
      expect(layout.results.top).toBeGreaterThanOrEqual(layout.strip.bottom - 1);
      expect(layout.content.top).toBeGreaterThanOrEqual(layout.strip.bottom - 1);
      expect(layout.strip.left).toBeLessThanOrEqual(layout.content.left + 1);
      expect(layout.strip.right).toBeGreaterThanOrEqual(layout.results.right - 1);
      await expectNoDocumentOverflow(page);
    }
  });
}

test("keeps individual-voter search and sort when returning to Votes", async ({ page }) => {
  await page.goto("/dao/proposals/2");
  await page.getByRole("link", { name: "View votes", exact: true }).click();
  await expectSelectedPanel(page, "Votes");
  await expect(page.getByRole("tabpanel", { name: /^Votes/ })).toBeFocused();
  const search = page.getByRole("searchbox", { name: "Search name or address" });
  const sort = page.getByRole("combobox", { name: "Sort votes" });
  await search.fill(DAO_MOCK_HISTORICAL_YEA_VOTER_ADDRESS);
  await sort.selectOption("oldest");
  const rows = page.getByRole("rowgroup", { name: "Individual voters" }).getByRole("row");
  await expect(rows).toHaveCount(1);
  await expect(page.getByRole("tab", { name: /^Votes/ })).toHaveAccessibleName("Votes 2");

  await page.getByRole("tab", { name: "Details", exact: true }).click();
  await page.getByRole("tab", { name: "Proposal", exact: true }).click();
  await page.getByRole("tab", { name: /^Votes/ }).click();
  await expect(search).toHaveValue(DAO_MOCK_HISTORICAL_YEA_VOTER_ADDRESS);
  await expect(sort).toHaveValue("oldest");
  await expect(rows).toHaveCount(1);
  await expect(rows.first().getByRole("link", { name: `View Ethereum address ${DAO_MOCK_HISTORICAL_YEA_VOTER_ADDRESS} on Etherscan`, exact: true })).toBeVisible();
  await expect(page.getByRole("rowgroup", { name: "Current YBC vote" }).getByText("6 YFI", { exact: true })).toBeVisible();
});

test("restores deep-linked tabs on refresh and browser Back and Forward", async ({ page }) => {
  await page.goto("/dao/proposals/2?from=active#dao-proposal-votes");
  await expectSelectedPanel(page, "Votes");
  await page.reload();
  await expectSelectedPanel(page, "Votes");
  await page.getByRole("tab", { name: "Details", exact: true }).click();
  await expect(page).toHaveURL(/\/dao\/proposals\/2\?from=active#dao-proposal-details$/);
  await page.getByRole("tab", { name: "Proposal", exact: true }).click();
  await expect(page).toHaveURL(/#dao-proposal-content$/);
  await page.goBack();
  await expectSelectedPanel(page, "Details");
  await page.goBack();
  await expectSelectedPanel(page, "Votes");
  await page.goForward();
  await expectSelectedPanel(page, "Details");
  await page.reload();
  await expectSelectedPanel(page, "Details");
  expect(new URL(page.url()).searchParams.get("from")).toBe("active");

  await page.goto("/dao/proposals/2#unrecognized-section");
  await expectSelectedPanel(page, "Proposal");
});

test("opens the exact script disclosure from its review link and direct URL", async ({ page }) => {
  await page.goto("/dao/proposals/17");
  await page.getByRole("tab", { name: "Details", exact: true }).click();
  for (const section of ["lifecycle", "script", "technical"]) {
    await expect(page.locator(`#dao-proposal-${section} > details`)).not.toHaveAttribute("open", "");
  }
  await page.getByRole("tab", { name: "Proposal", exact: true }).click();
  const reviewScript = page.getByRole("link", { name: "Review proposed script", exact: true });
  await reviewScript.focus();
  await page.keyboard.press("Enter");
  await expectSelectedPanel(page, "Details");
  await expect(page).toHaveURL(/#dao-proposal-script$/);
  await expect(page.locator("#dao-proposal-script")).toBeFocused();
  const script = page.locator("#dao-proposal-script > details");
  await expect(script).toHaveAttribute("open", "");
  await expect(script.getByText("Raw call data").first()).toBeVisible();
  await page.reload();
  await expectSelectedPanel(page, "Details");
  await expect(script).toHaveAttribute("open", "");
  await expect(script.getByText("Raw call data").first()).toBeVisible();

  for (const section of ["lifecycle", "technical"]) {
    await page.goto(`/dao/proposals/17#dao-proposal-${section}`);
    await expectSelectedPanel(page, "Details");
    await expect(page.locator(`#dao-proposal-${section} > details`)).toHaveAttribute("open", "");
  }

  await page.goto("/dao/proposals/21");
  const heading = page.getByRole("heading", { name: /Interoperability evidence/ });
  const headingId = await heading.getAttribute("id");
  expect(headingId).not.toBeNull();
  await page.goto(`/dao/proposals/21#${encodeURIComponent(headingId!)}`);
  await page.reload();
  await expectSelectedPanel(page, "Proposal");
  await expect(heading).toBeFocused();
  const stripBox = await page.getByTestId("dao-proposal-detail-tabs").boundingBox();
  const headingBox = await heading.boundingBox();
  expect(headingBox!.y).toBeGreaterThanOrEqual(stripBox!.y + stripBox!.height);
});

test("supports roving keyboard focus without entering hidden panels", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/dao/proposals/2");
  const proposal = page.getByRole("tab", { name: "Proposal", exact: true });
  const votes = page.getByRole("tab", { name: /^Votes/ });
  const details = page.getByRole("tab", { name: "Details", exact: true });
  await proposal.focus();
  await page.keyboard.press("ArrowRight");
  await expect(votes).toBeFocused();
  await expectSelectedPanel(page, "Votes");
  await page.keyboard.press("End");
  await expect(details).toBeFocused();
  await expectSelectedPanel(page, "Details");
  await page.keyboard.press("Home");
  await expect(proposal).toBeFocused();
  await expectSelectedPanel(page, "Proposal");
  await page.keyboard.press("ArrowLeft");
  await expect(details).toBeFocused();
  await expectSelectedPanel(page, "Details");
  await expect(votes).toHaveAttribute("tabindex", "-1");
  await expect(proposal).toHaveAttribute("tabindex", "-1");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("tabpanel", { name: "Details", exact: true })).toBeFocused();
});

for (const { width, textScale } of [{ width: 390, textScale: 100 }, { width: 1280, textScale: 100 }, { width: 390, textScale: 200 }]) {
  test(`keeps the tab strip below the header and contained at ${width}px / ${textScale}% text`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/dao/proposals/21");
    if (textScale !== 100) await page.addStyleTag({ content: `html { font-size: ${textScale}%; }` });
    await expectHeaderMetadata(page, 21);
    const strip = page.getByTestId("dao-proposal-detail-tabs");
    await expect(strip).toBeVisible();
    if (width < 1024) {
      const sidebar = page.getByRole("complementary", { name: "Proposal actions and vote results", exact: true });
      const sidebarBox = (await sidebar.boundingBox())!;
      const layout = await readCardLayout(page);
      expect(sidebarBox.y + sidebarBox.height).toBeLessThanOrEqual(layout.strip.top + 1);
      expect(layout.strip.bottom).toBeLessThanOrEqual(layout.content.top + 1);
    }
    await strip.evaluate((element) => window.scrollTo(0, element.getBoundingClientRect().top + window.scrollY + 200));
    await expect.poll(async () => strip.evaluate((element) => {
      const header = document.querySelector("header.sticky")!;
      return Math.round(element.getBoundingClientRect().top - header.getBoundingClientRect().bottom);
    })).toBe(0);

    for (const panel of ["Proposal", "Votes", "Details"] as const) {
      const tab = page.getByRole("tab", { name: panel === "Votes" ? /^Votes/ : panel, exact: panel !== "Votes" });
      const box = await tab.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(40);
      expect(box!.height).toBeGreaterThanOrEqual(40);
      await tab.click();
      await expectSelectedPanel(page, panel);
      await expectNoDocumentOverflow(page);
    }
  });
}

async function expectHeaderMetadata(page: Page, proposalId: 2 | 21) {
  const header = page.getByTestId("dao-proposal-header");
  await expect(header).toBeVisible();
  const metadata = [
    header.getByText(`Proposal #${proposalId}`, { exact: true }),
    header.getByRole("heading", { level: 1, name: proposalId === 2 ? "Fund protocol research" : "Guarded executable proposal", exact: true }),
    header.getByTestId("dao-proposal-heading-facts"),
    header.getByText("This proposal records the decision and rationale presented for DAO review.", { exact: true }),
    header.getByText("Proposed by", { exact: true }),
    header.getByRole("link", { name: /^View Ethereum address/ }),
    header.getByText(proposalId === 2 ? "Voting ends in 6 hours" : "Execution expires in 6 hours", { exact: true }),
    header.locator("time[datetime]").first(),
    header.getByRole("link", { name: "View votes", exact: true }),
    header.getByRole("link", { name: "Open this proposal's forum discussion in a new tab", exact: true }),
  ];
  const headerBox = (await header.boundingBox())!;
  for (const item of metadata) {
    await expect(item).toBeVisible();
    const box = (await item.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(headerBox.x - 1);
    expect(box.x + box.width).toBeLessThanOrEqual(headerBox.x + headerBox.width + 1);
    expect(box.y).toBeGreaterThanOrEqual(headerBox.y - 1);
    expect(box.y + box.height).toBeLessThanOrEqual(headerBox.y + headerBox.height + 1);
  }
  await expectNoDocumentOverflow(page);
}

async function readCardLayout(page: Page) {
  return page.evaluate(() => {
    const rect = (selector: string) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`Missing layout target: ${selector}`);
      const { top, bottom, left, right } = element.getBoundingClientRect();
      return { top, bottom, left, right };
    };
    return {
      strip: rect('[data-testid="dao-proposal-detail-tabs"]'),
      content: rect('[role="tabpanel"]:not([hidden]) > :first-child'),
      results: rect('[aria-label="Vote results"]'),
    };
  });
}

async function expectNoDocumentOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.width);
}

async function expectSelectedPanel(page: Page, name: "Proposal" | "Votes" | "Details") {
  const accessibleName = name === "Votes" ? /^Votes/ : name;
  await expect(page.getByRole("tab", { name: accessibleName, exact: name !== "Votes" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel", { name: accessibleName, exact: name !== "Votes" })).toBeVisible();
  await expect(page.getByRole("tabpanel")).toHaveCount(1);
}
