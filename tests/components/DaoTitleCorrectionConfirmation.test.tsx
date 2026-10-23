import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { DaoProposalActionPanelView } from "@/app/dao/proposals/[id]/DaoProposalActionPanel";
import { applyDaoMockFixture, getDaoMockSnapshot, readDaoMockAccountProposalState, resetDaoMockStore } from "@/lib/clients/dao";

vi.mock("@/public/dao-title-overrides.json", async () => {
  const { createDaoMockFeed } = await import("@/lib/clients/dao/fixtures");
  const proposal = createDaoMockFeed().proposals.find(proposal => proposal.ref.proposalId === 2n)!;
  return { default: { version: 1, overrides: [{ ...proposal.ref, proposalId: "2", contentDigest: proposal.content.digest, title: "Corrected research proposal" }] } };
});

it("keeps the original-title disclosure beside the corrected title in vote confirmation", () => {
  resetDaoMockStore();
  applyDaoMockFixture("voting");
  const runtime = getDaoMockSnapshot();
  const proposal = runtime.feed.proposals.find(proposal => proposal.ref.proposalId === runtime.selectedProposalId)!;
  const onVote = vi.fn();
  render(<DaoProposalActionPanelView
    proposal={proposal}
    account={readDaoMockAccountProposalState(proposal.ref, runtime.account.address)}
    accountError={false} accountLoading={false} activeAction={null}
    executionGuard={runtime.executionGuard} pendingAction={null} txState={{ status: "idle" }}
    onVote={onVote} onExecute={vi.fn()} onFlag={vi.fn()} onRetract={vi.fn()} onVeto={vi.fn()}
  />);
  fireEvent.click(screen.getByRole("radio", { name: "Yea" }));
  fireEvent.click(screen.getByRole("button", { name: "Review vote" }));
  const dialog = screen.getByRole("dialog", { name: "Confirm your vote" });
  const title = within(dialog).getByText("Corrected research proposal");
  const fact = title.closest("dd")!;
  const trigger = within(fact).getByRole("button", { name: "Title edited" });
  fireEvent.focus(trigger);
  expect(trigger).toHaveAccessibleDescription(expect.stringContaining("Original title: Fund protocol research"));
  expect(within(dialog).getByText("The published proposal text is unchanged.")).toBeVisible();
  expect(onVote).not.toHaveBeenCalled();
});
