import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProposalDetailTabs, type ProposalDetailTabsProps } from "@/app/dao/components/ProposalDetailTabs";

const labels = { navigation: "Proposal sections", proposal: "Proposal", votes: "Votes", details: "Details" };
const baseProps: ProposalDetailTabsProps = {
  proposalKey: "1:0x123:2",
  voterCount: 7,
  labels,
  proposal: <p>Proposal body</p>,
  votes: <label>Search voters<input defaultValue="" /></label>,
  details: <p>Technical information</p>,
};

const scrollIntoView = vi.fn();
let originalScroll: PropertyDescriptor | undefined;

function location(href: string) {
  window.history.replaceState({ route: "preserved" }, "", href);
}

function selectedTab(name: string | RegExp) {
  expect(screen.getByRole("tab", { name })).toHaveAttribute("aria-selected", "true");
}

async function navigate(hash: string, event: "hashchange" | "popstate" = "hashchange") {
  await act(async () => {
    location(`/dao/proposals/2${hash}`);
    window.dispatchEvent(new Event(event));
  });
}

beforeEach(() => {
  location("/dao/proposals/2");
  originalScroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: scrollIntoView });
  scrollIntoView.mockClear();
});

afterEach(() => {
  if (originalScroll) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", originalScroll);
  else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  location("/dao/proposals/2");
});

describe("DAO proposal detail tabs", () => {
  it("defaults to Proposal, renders the count, and links tabs to mounted hidden panels", () => {
    render(<ProposalDetailTabs {...baseProps} />);
    selectedTab("Proposal");
    const list = screen.getByRole("tablist", { name: labels.navigation });
    expect(within(list).getAllByRole("tab")).toHaveLength(3);
    expect(screen.getByRole("tab", { name: "Votes 7" })).toBeInTheDocument();
    expect(screen.getAllByRole("tabpanel", { hidden: true })).toHaveLength(3);
    expect(screen.getByRole("tabpanel", { name: "Proposal" })).toBeVisible();
    expect(document.getElementById("dao-proposal-votes")).toHaveAttribute("hidden");
    expect(document.getElementById("dao-proposal-details")).toHaveAttribute("hidden");
    for (const tab of within(list).getAllByRole("tab")) {
      const panel = document.getElementById(tab.getAttribute("aria-controls")!);
      expect(panel).toHaveAttribute("aria-labelledby", tab.id);
    }
    expect(window.location.hash).toBe("");
  });

  it.each([
    ["#dao-proposal-votes", /^Votes/],
    ["#dao-proposal-voter-list", /^Votes/],
    ["#dao-proposal-details", "Details"],
    ["#dao-proposal-content", "Proposal"],
    ["#markdown-heading", "Proposal"],
    ["#%E0%A4%A", "Proposal"],
  ])("selects the correct initial panel for %s without changing the fragment", (hash, expected) => {
    location(`/dao/proposals/2${hash}`);
    render(<ProposalDetailTabs {...baseProps} />);
    selectedTab(expected);
    expect(window.location.hash).toBe(hash);
  });

  it("preserves voter edits and selection across panel switches and feed updates", () => {
    const { rerender } = render(<ProposalDetailTabs {...baseProps} />);
    fireEvent.click(screen.getByRole("tab", { name: /^Votes/ }));
    const input = screen.getByRole("textbox", { name: "Search voters" });
    fireEvent.change(input, { target: { value: "saved nickname" } });
    fireEvent.click(screen.getByRole("tab", { name: "Details" }));
    expect(input).not.toBeVisible();
    expect(input).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /^Votes/ }));
    rerender(<ProposalDetailTabs {...baseProps} voterCount={9} proposal={<p>Updated status and content</p>} />);
    selectedTab("Votes 9");
    expect(screen.getByRole("textbox", { name: "Search voters" })).toBe(input);
    expect(input).toHaveValue("saved nickname");
  });

  it("starts a new proposal at Proposal when its route has no fragment", () => {
    const { rerender } = render(<ProposalDetailTabs {...baseProps} />);
    fireEvent.click(screen.getByRole("tab", { name: /^Votes/ }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "previous proposal" } });
    location("/dao/proposals/3");
    rerender(<ProposalDetailTabs {...baseProps} proposalKey="1:0x123:3" />);
    selectedTab("Proposal");
    fireEvent.click(screen.getByRole("tab", { name: /^Votes/ }));
    expect(screen.getByRole("textbox")).toHaveValue("");
  });

  it("preserves query parameters and router history state while tab navigation supports Back and Forward", async () => {
    const query = "?from=history&chain=1&voting=0x123&extra=keep";
    location(`/dao/proposals/2${query}`);
    render(<ProposalDetailTabs {...baseProps} />);
    fireEvent.click(screen.getByRole("tab", { name: /^Votes/ }));
    expect(window.location.search).toBe(query);
    expect(window.history.state).toEqual({ route: "preserved" });
    fireEvent.click(screen.getByRole("tab", { name: "Details" }));
    await act(async () => window.history.back());
    await waitFor(() => selectedTab(/^Votes/));
    await act(async () => window.history.back());
    await waitFor(() => selectedTab("Proposal"));
    await act(async () => window.history.forward());
    await waitFor(() => selectedTab(/^Votes/));
    expect(window.location.search).toBe(query);
    expect(window.location.hash).toBe("#dao-proposal-votes");
  });

  it("uses shared roving focus with Arrow keys, Home, and End", () => {
    render(<ProposalDetailTabs {...baseProps} />);
    const proposal = screen.getByRole("tab", { name: "Proposal" });
    proposal.focus();
    fireEvent.keyDown(proposal, { key: "ArrowRight" });
    const votes = screen.getByRole("tab", { name: /^Votes/ });
    expect(votes).toHaveFocus();
    expect(votes).toHaveAttribute("tabindex", "0");
    expect(proposal).toHaveAttribute("tabindex", "-1");
    fireEvent.keyDown(votes, { key: "End" });
    const details = screen.getByRole("tab", { name: "Details" });
    expect(details).toHaveFocus();
    selectedTab("Details");
    fireEvent.keyDown(details, { key: "Home" });
    expect(proposal).toHaveFocus();
    fireEvent.keyDown(proposal, { key: "ArrowLeft" });
    expect(details).toHaveFocus();
    selectedTab("Details");
  });

  it("reacts to native fragment navigation, including a same-hash header link", async () => {
    render(<><a href="#dao-proposal-votes">View votes</a><ProposalDetailTabs {...baseProps} /></>);
    await navigate("#dao-proposal-details");
    selectedTab("Details");
    // A hash may already match after history/router restoration without an event.
    location("/dao/proposals/2#dao-proposal-votes");
    const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    act(() => screen.getByRole("link", { name: "View votes" }).dispatchEvent(event));
    expect(event.defaultPrevented).toBe(false);
    selectedTab(/^Votes/);
    await waitFor(() => expect(scrollIntoView.mock.contexts).toContain(document.getElementById("dao-proposal-votes")));
    expect(document.getElementById("dao-proposal-votes")).toHaveFocus();
    await navigate("#unknown-heading");
    selectedTab("Proposal");
  });

  it.each(["dao-proposal-lifecycle", "dao-proposal-script", "dao-proposal-technical"])("opens and scrolls Details disclosure %s", async (id) => {
    location(`/dao/proposals/2#${id}`);
    render(<ProposalDetailTabs {...baseProps} details={<section id={id}><details><summary>Disclosure</summary><p>Data</p></details></section>} />);
    selectedTab("Details");
    const target = document.getElementById(id)!;
    await waitFor(() => expect(target.querySelector("details")).toHaveAttribute("open"));
    expect(scrollIntoView.mock.contexts).toContain(target);
    expect(target).toHaveFocus();
  });

  it("moves focus out of Proposal when its native link opens a Details disclosure", async () => {
    render(<ProposalDetailTabs
      {...baseProps}
      proposal={<a href="#dao-proposal-script">Review proposed script</a>}
      details={<section id="dao-proposal-script"><details><summary>Script</summary><p>Calls</p></details></section>}
    />);
    const link = screen.getByRole("link", { name: "Review proposed script" });
    link.focus();
    fireEvent.click(link);
    selectedTab("Details");
    const target = document.getElementById("dao-proposal-script")!;
    await waitFor(() => expect(target).toHaveFocus());
    expect(target).toHaveAttribute("tabindex", "-1");
    expect(target.querySelector("details")).toHaveAttribute("open");
    expect(link).not.toBeVisible();
    await waitFor(() => expect(window.location.hash).toBe("#dao-proposal-script"));
  });

  it("keeps the selected panel when a native link targets controls outside the tabs", async () => {
    render(<>
      <section id="dao-proposal-actions">Vote actions</section>
      <a href="#dao-proposal-actions">Vote now</a>
      <ProposalDetailTabs {...baseProps} />
    </>);
    fireEvent.click(screen.getByRole("tab", { name: /^Votes/ }));
    fireEvent.click(screen.getByRole("link", { name: "Vote now" }));
    selectedTab(/^Votes/);
    await waitFor(() => expect(window.location.hash).toBe("#dao-proposal-actions"));
    await navigate("#dao-proposal-actions");
    selectedTab(/^Votes/);
  });

  it("keeps one sidebar mounted outside all panels across selection and content updates", () => {
    const sidebar = <aside aria-label="Voting"><label>Vote amount<input defaultValue="" /></label></aside>;
    const { rerender } = render(<ProposalDetailTabs {...baseProps} sidebar={sidebar} />);
    const aside = screen.getByRole("complementary", { name: "Voting" });
    const input = within(aside).getByRole("textbox", { name: "Vote amount" });
    fireEvent.change(input, { target: { value: "42" } });
    expect(aside.closest('[role="tabpanel"]')).toBeNull();
    expect(aside.compareDocumentPosition(screen.getByTestId("dao-proposal-detail-tabs")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    for (const name of [/^Votes/, "Details", "Proposal"]) {
      fireEvent.click(screen.getByRole("tab", { name }));
      expect(aside).toBeVisible();
      expect(input).toHaveValue("42");
    }
    rerender(<ProposalDetailTabs {...baseProps} sidebar={sidebar} voterCount={9} />);
    expect(screen.getAllByRole("complementary", { name: "Voting" })).toEqual([aside]);
    expect(input).toHaveValue("42");
  });

  it("preserves selection for native action anchors inside the new sidebar slot", async () => {
    render(<ProposalDetailTabs
      {...baseProps}
      sidebar={<aside id="dao-proposal-actions"><a href="#dao-proposal-actions">Vote now</a><button>Cast vote</button></aside>}
    />);
    fireEvent.click(screen.getByRole("tab", { name: /^Votes/ }));
    fireEvent.click(screen.getByRole("link", { name: "Vote now" }));
    await waitFor(() => expect(window.location.hash).toBe("#dao-proposal-actions"));
    await navigate("#dao-proposal-actions");
    selectedTab(/^Votes/);
    expect(screen.getByRole("button", { name: "Cast vote" })).toBeVisible();
    expect(scrollIntoView.mock.contexts).not.toContain(document.getElementById("dao-proposal-actions"));
  });

  it("waits for a decoded Markdown heading to mount before scrolling without replacing its fragment", async () => {
    location("/dao/proposals/2#proposal%20heading");
    const { rerender } = render(<ProposalDetailTabs {...baseProps} proposal={<p>Loading content</p>} />);
    selectedTab("Proposal");
    rerender(<ProposalDetailTabs {...baseProps} proposal={<h2 id="proposal heading">Loaded heading</h2>} />);
    const heading = screen.getByRole("heading", { name: "Loaded heading" });
    await waitFor(() => expect(scrollIntoView.mock.contexts).toContain(heading));
    expect(window.location.hash).toBe("#proposal%20heading");
  });

  it("cancels pending heading scroll when the user selects another panel", async () => {
    location("/dao/proposals/2#late-heading");
    const { rerender } = render(<ProposalDetailTabs {...baseProps} />);
    fireEvent.click(screen.getByRole("tab", { name: /^Votes/ }));
    rerender(<ProposalDetailTabs {...baseProps} proposal={<h2 id="late-heading">Late heading</h2>} />);
    await act(async () => new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve())));
    selectedTab(/^Votes/);
    expect(scrollIntoView.mock.contexts).not.toContain(document.getElementById("late-heading"));
  });

  it("keeps normal links, modified clicks, downloads, and other-route links outside its navigation", () => {
    render(<>
      <a href="#dao-proposal-votes" target="_blank">New tab</a>
      <a href="#dao-proposal-votes" download>Download</a>
      <a href="https://other.example/dao/proposals/3#dao-proposal-votes">Other proposal</a>
      <a href="#dao-proposal-votes">Modified click</a>
      <ProposalDetailTabs {...baseProps} />
    </>);
    // Block jsdom's deferred navigation after the component's document listener
    // observes the click, so ignored links cannot affect the next test's URL.
    const preventNavigation = (event: MouseEvent) => event.preventDefault();
    window.addEventListener("click", preventNavigation);
    try {
      fireEvent.click(screen.getByRole("link", { name: "New tab" }));
      fireEvent.click(screen.getByRole("link", { name: "Download" }));
      fireEvent.click(screen.getByRole("link", { name: "Other proposal" }));
      fireEvent.click(screen.getByRole("link", { name: "Modified click" }), { ctrlKey: true });
      selectedTab("Proposal");
    } finally {
      window.removeEventListener("click", preventNavigation);
    }
  });

  it("measures the sticky strip and returns to the panels instead of the mobile sidebar when scrolled past the strip", async () => {
    const resize = { callback: null as ResizeObserverCallback | null, disconnect: vi.fn() };
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback: ResizeObserverCallback) { resize.callback = callback; }
      observe() {}
      disconnect() { resize.disconnect(); }
    });
    const { unmount } = render(<ProposalDetailTabs {...baseProps} sidebar={<aside>Voting controls</aside>} />);
    const strip = screen.getByTestId("dao-proposal-detail-tabs");
    const panels = screen.getByTestId("dao-proposal-detail-panels");
    const root = strip.parentElement!;
    strip.style.top = "64px";
    vi.spyOn(strip, "getBoundingClientRect").mockReturnValue({ height: 72 } as DOMRect);
    vi.spyOn(root, "getBoundingClientRect").mockReturnValue({ top: -300 } as DOMRect);
    vi.spyOn(panels, "getBoundingClientRect").mockReturnValue({ top: 300 } as DOMRect);
    act(() => resize.callback?.([], {} as ResizeObserver));
    expect(root.style.getPropertyValue("--dao-detail-tabs-height")).toBe("72px");
    fireEvent.click(screen.getByRole("tab", { name: /^Votes/ }));
    await act(async () => new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve())));
    expect(scrollIntoView).not.toHaveBeenCalled();
    vi.mocked(panels.getBoundingClientRect).mockReturnValue({ top: -300 } as DOMRect);
    fireEvent.click(screen.getByRole("tab", { name: "Details" }));
    await waitFor(() => expect(scrollIntoView.mock.contexts).toContain(panels));
    expect(scrollIntoView.mock.contexts).not.toContain(root);
    unmount();
    expect(resize.disconnect).toHaveBeenCalled();
  });
});
