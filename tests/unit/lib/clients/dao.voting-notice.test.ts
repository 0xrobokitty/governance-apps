import { describe, expect, it } from "vitest";
import { DAO_MOCK_FEED, DAO_MOCK_NOW } from "@/lib/clients/dao";
import { deriveDaoVotingNotice } from "@/lib/clients/dao/voting-notice";
import type { DaoSnapshot } from "@/lib/clients/dao/types";

function feed(): DaoSnapshot {
  const snapshot = structuredClone(DAO_MOCK_FEED);
  const proposal = snapshot.proposals.find(p => p.protocolStatus === "voting")!;
  snapshot.proposals = [proposal];
  snapshot.generatedAt = new Date(DAO_MOCK_NOW * 1000).toISOString();
  snapshot.canonicalBlock.timestamp = DAO_MOCK_NOW;
  return snapshot;
}

describe("DAO cross-app voting notice", () => {
  it("advertises current decision votes and their earliest deadline", () => {
    const snapshot = feed();
    const second = { ...snapshot.proposals[0], voteEndsAt: snapshot.proposals[0].voteEndsAt + 100, ref: { ...snapshot.proposals[0].ref, proposalId: 999n } };
    snapshot.proposals.push(second);
    const notice = deriveDaoVotingNotice(snapshot, DAO_MOCK_NOW, "live");
    expect(notice).toMatchObject({ proposalCount: 2, endsAt: snapshot.proposals[0].voteEndsAt, multipleDeadlines: true });
    expect(notice?.periodKeys).toHaveLength(2);
  });

  it.each(["proposed", "passed", "failed", "vetoed", "flagged", "retracted", "executed", "expired"] as const)("does not advertise %s proposals", status => {
    const snapshot = feed();
    snapshot.proposals[0].protocolStatus = status;
    expect(deriveDaoVotingNotice(snapshot, DAO_MOCK_NOW, "live")).toBeNull();
  });

  it("checks actual voting bounds even when the indexed status is voting", () => {
    const snapshot = feed();
    snapshot.proposals[0].voteStartsAt = DAO_MOCK_NOW + 1;
    expect(deriveDaoVotingNotice(snapshot, DAO_MOCK_NOW, "live")).toBeNull();
    snapshot.proposals[0].voteStartsAt = DAO_MOCK_NOW - 100;
    snapshot.proposals[0].voteEndsAt = DAO_MOCK_NOW;
    expect(deriveDaoVotingNotice(snapshot, DAO_MOCK_NOW, "live")).toBeNull();
  });

  it.each(["generated", "canonical"] as const)("hides stale and future %s observations", source => {
    for (const offset of [-301, 61]) {
      const snapshot = feed();
      if (source === "generated") snapshot.generatedAt = new Date((DAO_MOCK_NOW + offset) * 1000).toISOString();
      else snapshot.canonicalBlock.timestamp = DAO_MOCK_NOW + offset;
      expect(deriveDaoVotingNotice(snapshot, DAO_MOCK_NOW, "live")).toBeNull();
    }
  });

  it("does not trust unconfigured or mismatched chain proposals", () => {
    const snapshot = feed();
    snapshot.proposals[0].ref.chainId = 2;
    expect(deriveDaoVotingNotice(snapshot, DAO_MOCK_NOW, "live")).toBeNull();
    snapshot.proposals[0].ref.chainId = snapshot.chainId;
    snapshot.contracts = [];
    expect(deriveDaoVotingNotice(snapshot, DAO_MOCK_NOW, "live")).toBeNull();
  });

  it("includes still-open votes from a trusted deployment retired for new proposals", () => {
    const snapshot = feed();
    snapshot.contracts.forEach(contract => { contract.active = false; });
    expect(deriveDaoVotingNotice(snapshot, DAO_MOCK_NOW, "live")?.proposalCount).toBe(1);
  });

  it("scopes dismissals to deployment, runtime, and period without resurfacing on feed refresh", () => {
    const snapshot = feed();
    const initial = deriveDaoVotingNotice(snapshot, DAO_MOCK_NOW, "live")!;
    snapshot.generatedAt = new Date((DAO_MOCK_NOW + 1) * 1000).toISOString();
    snapshot.proposals[0].ref.proposalId += 1n;
    expect(deriveDaoVotingNotice(snapshot, DAO_MOCK_NOW, "live")?.periodKeys).toEqual(initial.periodKeys);
    expect(deriveDaoVotingNotice(snapshot, DAO_MOCK_NOW, "mock")?.periodKeys).not.toEqual(initial.periodKeys);
    snapshot.proposals[0].voteEndsAt += 100;
    expect(deriveDaoVotingNotice(snapshot, DAO_MOCK_NOW, "live")?.periodKeys).not.toEqual(initial.periodKeys);
  });

  it("hides missing, empty, and malformed-date snapshots", () => {
    expect(deriveDaoVotingNotice(undefined, DAO_MOCK_NOW, "live")).toBeNull();
    expect(deriveDaoVotingNotice({ ...feed(), proposals: [] }, DAO_MOCK_NOW, "live")).toBeNull();
    expect(deriveDaoVotingNotice({ ...feed(), generatedAt: "invalid" }, DAO_MOCK_NOW, "live")).toBeNull();
  });
});
