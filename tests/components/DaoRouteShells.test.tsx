import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  DAO_MOCK_FEED,
  deriveDaoProposerState,
  getDaoMockFixture,
  type DaoProposalReadEnvelope,
} from "@/lib/clients/dao";
import { DaoBoardView } from "@/app/dao/DaoPageClient";
import { DaoProposalView } from "@/app/dao/proposals/[id]/DaoProposalPageClient";
import { DaoProposeView } from "@/app/dao/propose/DaoProposePageClient";

describe("DAO proposal board shell", () => {
  it("places the wallet voting summary on the connected proposal board", () => {
    const props = { now: DAO_MOCK_FEED.canonicalBlock.timestamp, onRetry: vi.fn(), proposals: [], state: "empty" as const, votingPower: <div>Wallet voting summary</div> };
    const { rerender } = render(<DaoBoardView {...props} isConnected />);
    expect(screen.getByText("Wallet voting summary")).toBeVisible();
    rerender(<DaoBoardView {...props} isConnected={false} />);
    expect(screen.queryByText("Wallet voting summary")).not.toBeInTheDocument();
  });

  it("renders production-shaped loading and disconnected states", () => {
    render(
      <DaoBoardView
        isConnected={false}
        now={DAO_MOCK_FEED.canonicalBlock.timestamp}
        onRetry={vi.fn()}
        proposals={[]}
        state="loading"
      />
    );

    expect(
      screen.getByRole("heading", { name: "Proposals", level: 1 })
    ).toBeVisible();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByText("Wallet not connected")).toBeVisible();
    expect(screen.getByText("Loading proposal data")).toBeVisible();
    expect(screen.queryByText(/mock|prototype/i)).not.toBeInTheDocument();
  });

  it("renders the empty shell with a proposal entry point", () => {
    render(
      <DaoBoardView
        isConnected
        now={DAO_MOCK_FEED.canonicalBlock.timestamp}
        onRetry={vi.fn()}
        proposals={[]}
        state="empty"
      />
    );

    expect(
      screen.getByRole("heading", { name: "No proposals yet" })
    ).toBeVisible();
    expect(
      screen.getAllByRole("link", { name: "Create proposal" })[0]
    ).toHaveAttribute("href", "/dao/propose");
  });

  it("renders a retryable error without exposing raw errors", () => {
    const onRetry = vi.fn();
    render(
      <DaoBoardView
        isConnected
        now={DAO_MOCK_FEED.canonicalBlock.timestamp}
        onRetry={onRetry}
        proposals={[]}
        state="error"
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Retry proposal data" })
    );
    expect(onRetry).toHaveBeenCalledOnce();
    expect(screen.queryByText(/Error:/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Proposal board" })
    ).not.toBeInTheDocument();
  });

  it("keeps the last successful proposal board visible during an outage", () => {
    const onRetry = vi.fn();
    render(
      <DaoBoardView
        isConnected
        isStale
        lastGoodSnapshotTimestamp={DAO_MOCK_FEED.canonicalBlock.timestamp}
        now={DAO_MOCK_FEED.canonicalBlock.timestamp}
        onRetry={onRetry}
        proposals={DAO_MOCK_FEED.proposals}
        state="ready"
      />
    );

    expect(
      screen.getByRole("heading", { name: "Proposal updates are unavailable" })
    ).toBeVisible();
    expect(screen.getByText("22 proposals are available.")).toBeVisible();
    expect(
      screen.getByText("Last successful snapshot", { exact: true })
    ).toBeVisible();
    expect(
      document.querySelector(
        `time[datetime="${new Date(
          DAO_MOCK_FEED.canonicalBlock.timestamp * 1_000
        ).toISOString()}"]`
      )
    ).not.toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Retry proposal data" })
    );
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("renders the typed ready count and forum navigation", () => {
    render(
      <DaoBoardView
        isConnected
        now={DAO_MOCK_FEED.canonicalBlock.timestamp}
        onRetry={vi.fn()}
        proposals={DAO_MOCK_FEED.proposals}
        state="ready"
      />
    );

    expect(screen.getByText("22 proposals are available.")).toBeVisible();
    expect(
      screen.getByRole("link", {
        name: "Open the Yearn discussion forum in a new tab",
      })
    ).toHaveAttribute("href", "https://gov.yearn.fi/");
    expect(
      document.querySelector('a[href*="dao.yearn.fi"]')
    ).not.toBeInTheDocument();
  });
});

describe("DAO proposal detail shell", () => {
  const proposal = DAO_MOCK_FEED.proposals.find(
    (entry) => entry.ref.proposalId === 2n
  );

  if (!proposal) {
    throw new Error("DAO fixture proposal #2 is required for route tests.");
  }

  it("renders a minimal client-backed proposal summary", () => {
    render(
      <DaoProposalView
        envelope={detailEnvelope(proposal)}
        onRetry={vi.fn()}
        proposalId="2"
        state="ready"
      />
    );

    expect(
      screen.getByRole("heading", {
        name: "Fund protocol research",
        level: 1,
      })
    ).toBeVisible();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    const hierarchy = screen.getByRole("navigation", {
      name: "Proposal hierarchy",
    });
    expect(
      hierarchy.querySelectorAll("li").length
    ).toBe(3);
    expect(hierarchy.querySelector("li.contents")).toBeNull();
    expect(
      screen.getByRole("link", { name: "Active" })
    ).toHaveAttribute("href", "/dao?group=active");
    expect(screen.getAllByText("Voting").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Executable").length).toBeGreaterThan(0);

    expect(screen.getByText("Proposal #2", { exact: true })).toHaveClass("font-number", "text-text-secondary");
    expect(screen.queryByText("Proposal ID", { exact: true })).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "Open this proposal's forum discussion in a new tab",
      })
    ).toHaveAttribute("target", "_blank");
  });

  it("places snapshot freshness inside the proposal overview after its title", () => {
    const { container } = render(
      <DaoProposalView
        envelope={detailEnvelope(proposal)}
        onRetry={vi.fn()}
        proposalId="2"
        snapshotNotice={<span data-testid="snapshot-freshness">Snapshot · 2m ago</span>}
        state="ready"
      />
    );
    const overview = container.querySelector("article > .bg-surface");
    expect(overview).not.toBeNull();
    expect(within(overview as HTMLElement).getByRole("heading", { level: 1 })).toBeVisible();
    expect(within(overview as HTMLElement).getByTestId("snapshot-freshness")).toBeVisible();
  });

  it("keeps detail hierarchy navigation clean on the DAO beta host", () => {
    render(
      <DaoProposalView
        envelope={detailEnvelope(proposal)}
        hostname="dao-beta.dao-ops.com"
        onRetry={vi.fn()}
        proposalId="2"
        requestedOrigin="closed"
        state="ready"
      />
    );

    expect(screen.getByRole("link", { name: "Proposals" })).toHaveAttribute(
      "href",
      "/"
    );
    expect(screen.getByRole("link", { name: "Closed" })).toHaveAttribute(
      "href",
      "/?group=closed"
    );
  });

  it("keeps route hierarchy ahead of the contextual action connection state", () => {
    render(
      <DaoProposalView
        envelope={null}
        onRetry={vi.fn()}
        proposalId="2"
        state="loading"
      />
    );

    expect(screen.queryByText("Wallet not connected")).not.toBeInTheDocument();
    expect(screen.getByText("Loading proposal details")).toBeVisible();
  });

  it("renders a safe proposal not-found shell", () => {
    render(
      <DaoProposalView
        envelope={null}
        onRetry={vi.fn()}
        proposalId="999"
        state="not_found"
      />
    );

    expect(
      screen.getByRole("heading", { name: "Proposal not found", level: 1 })
    ).toBeVisible();
    expect(screen.getAllByText("Proposal #999")).not.toHaveLength(0);
    expect(
      screen.getByRole("link", { name: "Return to proposals" })
    ).toHaveAttribute("href", "/dao");
  });

  it("renders a retryable proposal error shell", () => {
    const onRetry = vi.fn();
    render(
      <DaoProposalView
        envelope={null}
        onRetry={onRetry}
        proposalId="2"
        state="error"
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Retry proposal details" })
    );
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

function detailEnvelope(
  proposal: DaoProposalReadEnvelope["proposal"]
): DaoProposalReadEnvelope {
  return { feed: DAO_MOCK_FEED, proposal };
}

describe("DAO proposal authoring shell", () => {
  const proposer = deriveDaoProposerState(
    getDaoMockFixture("discussion").proposer
  );

  it("renders a disconnected authoring shell without a form", () => {
    render(
      <DaoProposeView
        onRetry={vi.fn()}
        proposer={null}
        state="disconnected"
      />
    );

    expect(screen.getByText("Wallet not connected")).toBeVisible();
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
  });

  it("renders loading and retryable error authoring shells", () => {
    const { rerender } = render(
      <DaoProposeView
        onRetry={vi.fn()}
        proposer={null}
        state="loading"
      />
    );
    expect(screen.getByText("Checking proposal eligibility")).toBeVisible();

    const onRetry = vi.fn();
    rerender(
      <DaoProposeView
        onRetry={onRetry}
        proposer={null}
        state="error"
      />
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Retry eligibility check" })
    );
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("renders eligibility without M2 authoring interactions", () => {
    render(
      <DaoProposeView
        onRetry={vi.fn()}
        proposer={proposer}
        state="ready"
      />
    );

    expect(
      screen.getByRole("heading", { name: "Before you propose" })
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Create proposal", level: 1 })
    ).toBeVisible();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByText("Your wallet can create a proposal")).toBeVisible();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("moves focus to the authoring heading when proposal drafting starts", async () => {
    const scrollBy = vi
      .spyOn(window, "scrollBy")
      .mockImplementation(() => undefined);
    render(
      <DaoProposeView
        onRetry={vi.fn()}
        proposer={proposer}
        state="ready"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Start proposal" }));

    const heading = screen.getByRole("heading", { name: "Proposal details" });
    expect(heading).toHaveAttribute("tabindex", "-1");
    await waitFor(() => expect(heading).toHaveFocus());
    expect(scrollBy).toHaveBeenCalled();
    scrollBy.mockRestore();
  });
});
