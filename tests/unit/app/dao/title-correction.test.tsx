// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createDaoMockFeed } from "@/lib/clients/dao/fixtures";
import { parseDaoProposalContent } from "@/lib/clients/dao/content";
import { getDaoDisplayTitle } from "@/lib/clients/dao/title-overrides";
import { ProposalTitleCorrection } from "@/app/dao/components/ProposalTitleCorrection";

vi.mock("@/public/dao-title-overrides.json", async () => {
  const { createDaoMockFeed } = await import("@/lib/clients/dao/fixtures");
  const proposal = createDaoMockFeed().proposals[0];
  return { default: { version: 1, overrides: [{
    ...proposal.ref,
    proposalId: proposal.ref.proposalId.toString(),
    contentDigest: proposal.content.digest,
    title: "DAO-ops corrected title",
  }] } };
});

describe("proposal title correction transparency", () => {
  it("explains the original title on focus without changing content", async () => {
    const user = userEvent.setup();
    const proposal = createDaoMockFeed().proposals[0];
    const original = structuredClone(proposal.content);
    const parsed = parseDaoProposalContent(proposal.content.value!);
    expect(getDaoDisplayTitle(proposal.ref, proposal.content.digest, parsed.title)).toBe("DAO-ops corrected title");
    render(<ProposalTitleCorrection proposal={proposal} originalTitle={parsed.title} />);
    await user.tab();
    expect(screen.getByRole("button", { name: "Title edited" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Title edited" })).toHaveAccessibleDescription(expect.stringContaining(`Original title: ${parsed.title}`));
    expect(screen.getByText(`Original title: ${parsed.title}`)).toBeVisible();
    expect(screen.getByText("The published proposal text is unchanged.")).toBeVisible();
    expect(proposal.content).toEqual(original);
    expect(parseDaoProposalContent(proposal.content.value!).title).toBe(parsed.title);
  });

  it("does not imply a correction for another proposal", () => {
    const proposal = createDaoMockFeed().proposals[1];
    render(<ProposalTitleCorrection proposal={proposal} originalTitle="Original title" />);
    expect(screen.queryByRole("button", { name: "Title edited" })).not.toBeInTheDocument();
  });
});
