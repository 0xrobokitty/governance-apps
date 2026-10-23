import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { DaoYbcVoteCard } from "@/app/dao/components/DaoYbcVoteCard";
import { DaoWalletAction } from "@/app/dao/components/DaoWalletAction";
import { DAO_MOCK_FEED } from "@/lib/clients/dao/fixtures";

afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

describe("DAO participation presentation", () => {
  it("hides wallet status when disconnected and qualifies displayed votes", () => {
    const view = render(<DaoWalletAction votingOpen href="/dao/proposals/2#dao-proposal-actions" />);
    expect(screen.queryByTestId("dao-wallet-action")).toBeNull();
    view.rerender(<DaoWalletAction participation={{ status: "voted", choice: "yea" }} votingOpen href="/dao/proposals/2" />);
    expect(screen.getByRole("button", { name: /Voted Yea.*snapshot/ })).toBeDisabled();
    view.rerender(<DaoWalletAction participation={{ status: "pending", choice: null }} votingOpen href="/dao/proposals/2" />);
    expect(screen.getByText("Vote pending")).toBeInTheDocument();
  });

  it("links an unvoted wallet to review only while voting is open", () => {
    const view = render(<DaoWalletAction participation={{ status: "not-voted", choice: null }} votingOpen href="/dao/proposals/2#dao-proposal-actions" />);
    expect(screen.getByRole("link", { name: /Review proposal and wallet eligibility/ })).toHaveAttribute("href", "/dao/proposals/2#dao-proposal-actions");
    view.rerender(<DaoWalletAction participation={{ status: "not-voted", choice: null }} votingOpen={false} href="/dao/proposals/2" />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("No vote recorded")).toBeInTheDocument();
  });

  it.each([ ["nay", "Voted Nay"], ["split", "Voted split"], ["unknown", "Vote registered"] ] as const)("reports a registered %s choice honestly", (choice, label) => {
    render(<DaoWalletAction participation={{ status: "voted", choice }} votingOpen href="/dao/proposals/2" />);
    expect(screen.getByRole("button", { name: new RegExp(label) })).toBeDisabled();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("shows a compact split with accessible non-color labels and a host-aware link", () => {
    vi.stubEnv("NEXT_PUBLIC_USE_MOCKS", "true");
    vi.stubEnv("NEXT_PUBLIC_RUNTIME_MODE", "development");
    render(<DaoYbcVoteCard proposal={DAO_MOCK_FEED.proposals.find((entry) => entry.ref.proposalId === 2n)!} hostname="dao-beta.dao-ops.com" />);
    expect(screen.getByRole("img", { name: "YBC vote: 75% for, 25% against" })).toBeInTheDocument();
    expect(screen.getByText("1.5 voting weight")).toBeInTheDocument();
    expect(screen.getByText("0.5 voting weight")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Explore YBC" })).toHaveAttribute("href", "https://ybc-beta.dao-ops.com");
    expect(screen.getByText("Recorded in this snapshot").closest("details")).not.toHaveAttribute("open");
  });

  it("shows missing weight without a misleading empty percentage bar", () => {
    vi.stubEnv("NEXT_PUBLIC_USE_MOCKS", "true");
    vi.stubEnv("NEXT_PUBLIC_RUNTIME_MODE", "development");
    render(<DaoYbcVoteCard proposal={DAO_MOCK_FEED.proposals.find((entry) => entry.ref.proposalId === 8n)!} />);
    expect(screen.getByText("No recorded YBC voting weight.")).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByRole("link", { name: "Explore YBC" })).toHaveAttribute("href", "/ybc");
  });
});
