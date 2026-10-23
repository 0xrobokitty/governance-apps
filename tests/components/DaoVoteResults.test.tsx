import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ProposalVoteSummary } from "@/app/dao/components/ProposalReadPrimitives";
import { DAO_MOCK_FEED } from "@/lib/clients/dao/fixtures";

const proposal = (id = 2n) => structuredClone(DAO_MOCK_FEED.proposals.find((value) => value.ref.proposalId === id)!);

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_USE_MOCKS", "true");
  vi.stubEnv("NEXT_PUBLIC_RUNTIME_MODE", "development");
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

describe("YBC within canonical vote results", () => {
  it("toggles only the highlight and keeps one bar, fixed totals, and source disclosure", () => {
    render(<ProposalVoteSummary proposal={proposal()} hostname="dao-beta.dao-ops.com" />);
    const checkbox = screen.getByRole("checkbox", { name: "Highlight YBC" });
    expect(checkbox).toBeChecked();
    expect(checkbox).toHaveAccessibleDescription("YBC is included in the totals.");
    expect(screen.getAllByTestId("dao-total-vote-bar")).toHaveLength(1);
    expect(screen.getByTestId("dao-total-vote-bar").querySelectorAll("[data-vote-segment]")).toHaveLength(4);
    expect(screen.getByText("YBC Yea weight")).toBeVisible();
    expect(screen.getByText("1.5")).toBeVisible();
    expect(screen.getByText("YBC Nay weight")).toBeVisible();
    expect(screen.getByText("0.5")).toBeVisible();
    expect(screen.getByRole("link", { name: "Explore YBC" })).toHaveAttribute("href", "https://ybc-beta.dao-ops.com");
    expect(screen.getByText("Vote breakdown details").closest("details")).not.toHaveAttribute("open");
    const shares = screen.getByLabelText("Share of total votes cast");
    expect(within(shares).getByText("Yea", { exact: true })).toBeInTheDocument();
    expect(within(shares).getByText("13.64% of total votes cast")).toBeInTheDocument();
    expect(within(shares).getByText("4.55% of total votes cast")).toBeInTheDocument();
    const totals = screen.getByTestId("dao-canonical-vote-totals").textContent;
    fireEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();
    expect(screen.getByTestId("dao-total-vote-bar").querySelectorAll("[data-vote-segment]")).toHaveLength(2);
    expect(screen.queryByText("YBC Yea weight")).not.toBeInTheDocument();
    expect(screen.getByTestId("dao-canonical-vote-totals")).toHaveTextContent(totals!);
    expect(within(shares).getByText("68.18% of total votes cast")).toBeInTheDocument();
    expect(within(shares).queryByText("YBC Yea", { exact: true })).not.toBeInTheDocument();
    fireEvent.click(checkbox);
    expect(screen.getByText("1.5")).toBeVisible();
    expect(screen.getByTestId("dao-canonical-vote-totals").textContent).toBe(totals);
  });

  it("keeps proposal-board summaries compact", () => {
    render(<ProposalVoteSummary compact proposal={proposal()} />);
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByText("Explore YBC")).toBeNull();
    expect(screen.queryByTestId("dao-canonical-vote-totals")).toBeNull();
    expect(screen.getByText(/Yea.*Nay/)).toBeVisible();
  });

  it("disables highlighting when the collective has no contribution", () => {
    render(<ProposalVoteSummary proposal={proposal(8n)} />);
    expect(screen.getByRole("checkbox", { name: "Highlight YBC" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Highlight YBC" })).not.toBeChecked();
    expect(screen.getByText("No recorded YBC voting weight.")).toBeVisible();
    expect(screen.getByRole("link", { name: "Explore YBC" })).toHaveAttribute("href", "/ybc");
    expect(screen.getAllByTestId("dao-total-vote-bar")).toHaveLength(1);
  });

  it("leaves a coherent total visible when the YBC contribution cannot fit", () => {
    const value = proposal();
    value.yeaWeight = value.totalWeight = 1n;
    value.nayWeight = 0n;
    render(<ProposalVoteSummary proposal={value} />);
    expect(screen.getByRole("checkbox", { name: "Highlight YBC" })).toBeDisabled();
    expect(screen.getByText("YBC vote is unavailable.")).toBeVisible();
    expect(screen.getByTestId("dao-total-vote-bar").querySelectorAll("[data-vote-segment]")).toHaveLength(1);
  });

  it("omits invented results for incoherent totals", () => {
    const value = proposal();
    value.totalWeight += 1n;
    render(<ProposalVoteSummary proposal={value} />);
    expect(screen.getByText("Vote totals are unavailable in this snapshot.")).toBeVisible();
    expect(screen.queryByTestId("dao-total-vote-bar")).toBeNull();
  });
});
