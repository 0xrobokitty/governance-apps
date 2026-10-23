import { describe, expect, it } from "vitest";
import { DAO_MOCK_ACCOUNT_ADDRESS, DAO_MOCK_FEED, DAO_MOCK_HISTORICAL_YEA_VOTER_ADDRESS, DAO_MOCK_NOW } from "@/lib/clients/dao/fixtures";
import { deriveDaoWalletParticipation, isDaoVoteReviewOpen } from "@/lib/clients/dao/participation";

function proposal(id = 2n) {
  return structuredClone(DAO_MOCK_FEED.proposals.find((entry) => entry.ref.proposalId === id)!);
}

describe("wallet vote choices and review window", () => {
  it.each([[10_000, "yea"], [0, "nay"], [7_500, "split"], [null, "unknown"], [10_001, "unknown"]] as const)("derives %s basis points as %s", (bps, choice) => {
    const value = proposal();
    value.events.find((event) => event.actor === DAO_MOCK_HISTORICAL_YEA_VOTER_ADDRESS)!.yeaBps = bps;
    expect(deriveDaoWalletParticipation(value, DAO_MOCK_HISTORICAL_YEA_VOTER_ADDRESS)).toEqual({ status: "voted", choice });
  });

  it("uses explicit mock account choices without changing the live snapshot result", () => {
    expect(deriveDaoWalletParticipation(proposal(), DAO_MOCK_ACCOUNT_ADDRESS)).toEqual({ status: "not-voted", choice: null });
    expect(deriveDaoWalletParticipation(proposal(), DAO_MOCK_ACCOUNT_ADDRESS, null, { hasVoted: true, voteDirection: "nay" })).toEqual({ status: "voted", choice: "nay" });
    expect(deriveDaoWalletParticipation(proposal(), DAO_MOCK_ACCOUNT_ADDRESS, null, { hasVoted: true, voteDirection: null })).toEqual({ status: "voted", choice: "unknown" });
  });

  it("offers review inside the voting window without inferring wallet eligibility", () => {
    const value = proposal();
    expect(isDaoVoteReviewOpen(value, value.voteStartsAt - 1)).toBe(false);
    expect(isDaoVoteReviewOpen(value, value.voteStartsAt)).toBe(true);
    expect(isDaoVoteReviewOpen(value, value.voteEndsAt - 1)).toBe(true);
    expect(isDaoVoteReviewOpen(value, value.voteEndsAt)).toBe(false);
    expect(isDaoVoteReviewOpen(proposal(1n), DAO_MOCK_NOW)).toBe(false);
    expect(isDaoVoteReviewOpen(proposal(21n), DAO_MOCK_NOW)).toBe(false);
  });

  it("allows post-veto participation but blocks flags, retractions and early vetoes", () => {
    expect(isDaoVoteReviewOpen(proposal(13n), DAO_MOCK_NOW)).toBe(true);
    for (const id of [10n, 11n, 12n]) expect(isDaoVoteReviewOpen(proposal(id), DAO_MOCK_NOW)).toBe(false);
    const vetoed = proposal(13n);
    expect(isDaoVoteReviewOpen(vetoed, vetoed.voteEndsAt)).toBe(false);
  });
});
