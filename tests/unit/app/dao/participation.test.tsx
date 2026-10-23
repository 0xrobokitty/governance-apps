import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { DaoYbcVoteCard } from "@/app/dao/components/DaoYbcVoteCard";
import { DaoParticipationBadge } from "@/app/dao/components/DaoParticipationBadge";
import { DAO_MOCK_FEED } from "@/lib/clients/dao/fixtures";

afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

describe("DAO participation presentation", () => {
  it("hides wallet status when disconnected and qualifies displayed votes", () => {
    const view = render(<DaoParticipationBadge />);
    expect(screen.queryByTestId("dao-participation-badge")).toBeNull();
    view.rerender(<DaoParticipationBadge status="voted" />);
    expect(screen.getByTestId("dao-participation-badge")).toHaveAccessibleName(/Voted.*snapshot/);
    view.rerender(<DaoParticipationBadge status="pending" />);
    expect(screen.getByText("Vote pending")).toBeInTheDocument();
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
