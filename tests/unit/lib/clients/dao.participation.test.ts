import { describe, expect, it } from "vitest";
import { DAO_MOCK_ACCOUNT_ADDRESS, DAO_MOCK_FEED, DAO_MOCK_YBC_AGGREGATE_ADDRESS } from "@/lib/clients/dao/fixtures";
import { deriveDaoParticipation, deriveDaoYbcVote } from "@/lib/clients/dao/participation";
import type { DaoPendingAction, DaoProposal } from "@/lib/clients/dao/types";

function proposal(): DaoProposal {
  return structuredClone(DAO_MOCK_FEED.proposals.find((entry) => entry.ref.proposalId === 2n)!);
}

describe("DAO snapshot participation", () => {
  it("reports a positive current contribution and an absent account separately", () => {
    expect(deriveDaoParticipation(proposal(), DAO_MOCK_ACCOUNT_ADDRESS)).toBe("voted");
    expect(deriveDaoParticipation(proposal(), "0x0000000000000000000000000000000000000001")).toBe("not-voted");
  });

  it("does not resurrect an old vote after a zero or invalid replacement", () => {
    const value = proposal();
    const previous = value.events.find((event) => event.actor === DAO_MOCK_YBC_AGGREGATE_ADDRESS)!;
    value.events.unshift({ ...previous, log: { ...previous.log, blockNumber: previous.log.blockNumber + 1n }, weight: 0n });
    expect(deriveDaoParticipation(value, DAO_MOCK_YBC_AGGREGATE_ADDRESS)).toBe("not-voted");
    value.events[0].weight = null;
    expect(deriveDaoParticipation(value, DAO_MOCK_YBC_AGGREGATE_ADDRESS)).toBe("unknown");
  });

  it("keeps submitted votes pending until their matching account event appears", () => {
    const value = proposal();
    const pending: DaoPendingAction = {
      action: "vote", ref: value.ref, actor: DAO_MOCK_ACCOUNT_ADDRESS,
      transactionHash: `0x${"ee".repeat(32)}`, submittedAt: 1,
      direction: "yea", effectiveVotingWeight: 3n, reason: null, receiptState: "confirmed",
    };
    expect(deriveDaoParticipation(value, DAO_MOCK_ACCOUNT_ADDRESS, pending)).toBe("pending");
    expect(deriveDaoParticipation(value, DAO_MOCK_ACCOUNT_ADDRESS, { ...pending, ref: { ...pending.ref, chainId: 2 } })).toBe("voted");
    expect(deriveDaoParticipation(value, DAO_MOCK_ACCOUNT_ADDRESS, { ...pending, receiptState: "reverted" })).toBe("voted");
    const event = value.events.find((entry) => entry.type === "vote" && entry.actor === DAO_MOCK_ACCOUNT_ADDRESS)!;
    event.log.transactionHash = pending.transactionHash;
    expect(deriveDaoParticipation(value, DAO_MOCK_ACCOUNT_ADDRESS, pending)).toBe("voted");
  });
});

describe("recorded YBC vote", () => {
  it("uses the latest aggregate contribution instead of summing replacement events", () => {
    expect(deriveDaoYbcVote(proposal(), DAO_MOCK_YBC_AGGREGATE_ADDRESS)).toMatchObject({
      state: "voted", yeaWeight: 15n * 10n ** 17n, nayWeight: 5n * 10n ** 17n,
      yeaBps: 7_500, nayBps: 2_500, yeaPercent: "75%", nayPercent: "25%",
      formattedYeaWeight: "1.5", formattedNayWeight: "0.5",
    });
  });

  it("matches contract integer rounding even for less than one unit of weight", () => {
    const value = proposal();
    const latest = value.events.findLast((event) => event.actor === DAO_MOCK_YBC_AGGREGATE_ADDRESS)!;
    latest.weight = 3n;
    latest.yeaBps = 5_000;
    expect(deriveDaoYbcVote(value, DAO_MOCK_YBC_AGGREGATE_ADDRESS)).toMatchObject({
      state: "voted", yeaWeight: 1n, nayWeight: 2n, yeaBps: 3_333, nayBps: 6_667,
    });
  });

  it("does not infer the collective from other voters or use invalid prior data", () => {
    expect(deriveDaoYbcVote(proposal(), null).state).toBe("unavailable");
    expect(deriveDaoYbcVote(proposal(), "0x0000000000000000000000000000000000000001").state).toBe("not-voted");
    const value = proposal();
    value.events.findLast((event) => event.actor === DAO_MOCK_YBC_AGGREGATE_ADDRESS)!.yeaBps = 10_001;
    expect(deriveDaoYbcVote(value, DAO_MOCK_YBC_AGGREGATE_ADDRESS).state).toBe("unavailable");
    value.events.findLast((event) => event.actor === DAO_MOCK_YBC_AGGREGATE_ADDRESS)!.weight = 0n;
    expect(deriveDaoYbcVote(value, DAO_MOCK_YBC_AGGREGATE_ADDRESS).state).toBe("not-voted");
  });
});
