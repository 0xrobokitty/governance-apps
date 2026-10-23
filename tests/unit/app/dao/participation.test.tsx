import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { DaoWalletAction } from "@/app/dao/components/DaoWalletAction";

afterEach(cleanup);

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
    expect(screen.queryByTestId("dao-wallet-action")).toBeNull();
  });

  it.each([ ["nay", "Voted Nay"], ["split", "Voted split"], ["unknown", "Vote registered"] ] as const)("reports a registered %s choice honestly", (choice, label) => {
    render(<DaoWalletAction participation={{ status: "voted", choice }} votingOpen href="/dao/proposals/2" />);
    expect(screen.getByRole("button", { name: new RegExp(label) })).toBeDisabled();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("keeps unavailable participation distinct from an unvoted wallet", () => {
    render(<DaoWalletAction participation={{ status: "unknown", choice: null }} votingOpen href="/dao/proposals/2" />);
    expect(screen.getByRole("button", { name: /Vote unavailable/ })).toBeDisabled();
    expect(screen.queryByRole("link")).toBeNull();
  });

});
