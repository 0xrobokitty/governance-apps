import { beforeEach, describe, expect, it } from "vitest";
import { DAO_MOCK_ACCOUNT_ADDRESS, DAO_MOCK_OPERATOR_ADDRESS, DAO_MOCK_NOW } from "@/lib/clients/dao/fixtures";
import { applyDaoMockFixture, getDaoMockSnapshot, indexDaoMockPendingAction, prepareDaoMockVote, readDaoMockAccountProposalState, resetDaoMockStore, setDaoMockAccountState, setDaoMockAlreadyVoted, setDaoMockPersona, setDaoMockSelectedProposal } from "@/lib/clients/dao/store";
import { deriveDaoWalletParticipation } from "@/lib/clients/dao/participation";
import { deriveDaoVoterRows } from "@/lib/clients/dao/votes";

const otherWallet = "0x9999999999999999999999999999999999999999";
const examples = [[3n, "yea"], [21n, "yea"], [22n, "nay"]] as const;
function proposal(id: bigint) { return getDaoMockSnapshot().feed.proposals.find((entry) => entry.ref.proposalId === id)!; }

describe("default wallet vote examples", () => {
  beforeEach(() => resetDaoMockStore({ now: DAO_MOCK_NOW }));

  it("keeps recorded votes, account choices and totals consistent while proposal 2 remains votable", () => {
    for (const [id, choice] of examples) {
      const value = proposal(id);
      expect(deriveDaoWalletParticipation(value, DAO_MOCK_ACCOUNT_ADDRESS)).toEqual({ status: "voted", choice });
      expect(readDaoMockAccountProposalState(value.ref, DAO_MOCK_ACCOUNT_ADDRESS)).toMatchObject({ hasVoted: true, voteDirection: choice });
      for (const address of [DAO_MOCK_OPERATOR_ADDRESS, otherWallet] as const) {
        expect(readDaoMockAccountProposalState(value.ref, address)).toMatchObject({ hasVoted: false, voteDirection: null });
      }
      const rows = deriveDaoVoterRows(value);
      expect(rows.reduce((sum, row) => sum + (row.weight ?? 0n), 0n)).toBe(value.totalWeight);
      expect(rows.reduce((sum, row) => sum + (row.yeaWeight ?? 0n), 0n)).toBe(value.yeaWeight);
    }
    expect(readDaoMockAccountProposalState(proposal(2n).ref, DAO_MOCK_ACCOUNT_ADDRESS)).toMatchObject({ hasVoted: false, capabilities: { canVote: true } });
  });

  it("preserves choices when selecting a detail page or changing the same wallet's role", () => {
    setDaoMockSelectedProposal("22");
    expect(getDaoMockSnapshot().account).toMatchObject({ address: DAO_MOCK_ACCOUNT_ADDRESS, hasVoted: true, voteDirection: "nay" });
    setDaoMockPersona("operator");
    expect(getDaoMockSnapshot().account).toMatchObject({ hasVoted: true, voteDirection: "nay", isOperator: true });
    setDaoMockPersona("observer");
    setDaoMockPersona("voter");
    expect(getDaoMockSnapshot().account).toMatchObject({ hasVoted: true, voteDirection: "nay" });
  });

  it("keeps specialized fixtures unvoted and restores examples after reset", () => {
    applyDaoMockFixture("late-voting");
    expect(readDaoMockAccountProposalState(proposal(3n).ref, DAO_MOCK_ACCOUNT_ADDRESS)).toMatchObject({ hasVoted: false, capabilities: { canVote: true } });
    applyDaoMockFixture("guarded-execution");
    expect(getDaoMockSnapshot().account).toMatchObject({ address: DAO_MOCK_OPERATOR_ADDRESS, hasVoted: false });
    resetDaoMockStore({ now: DAO_MOCK_NOW });
    for (const [id, choice] of examples) expect(readDaoMockAccountProposalState(proposal(id).ref, DAO_MOCK_ACCOUNT_ADDRESS)).toMatchObject({ hasVoted: true, voteDirection: choice });
  });

  it("releases or changes an explicit example through the vote control without changing totals", () => {
    setDaoMockSelectedProposal("3");
    const total = proposal(3n).totalWeight;
    const yea = proposal(3n).yeaWeight;
    setDaoMockAlreadyVoted(false);
    expect(readDaoMockAccountProposalState(proposal(3n).ref, DAO_MOCK_ACCOUNT_ADDRESS)).toMatchObject({ hasVoted: false, capabilities: { canVote: true } });
    expect(deriveDaoWalletParticipation(proposal(3n), DAO_MOCK_ACCOUNT_ADDRESS)).toEqual({ status: "not-voted", choice: null });
    setDaoMockAlreadyVoted(true, "nay");
    expect(deriveDaoWalletParticipation(proposal(3n), DAO_MOCK_ACCOUNT_ADDRESS)).toEqual({ status: "voted", choice: "nay" });
    expect(getDaoMockSnapshot().account).toMatchObject({ hasVoted: true, voteDirection: "nay" });
    setDaoMockAlreadyVoted(true, "yea");
    expect(deriveDaoWalletParticipation(proposal(3n), DAO_MOCK_ACCOUNT_ADDRESS)).toEqual({ status: "voted", choice: "yea" });
    expect(readDaoMockAccountProposalState(proposal(3n).ref, otherWallet)).toMatchObject({ hasVoted: false, voteDirection: null });
    const rows = deriveDaoVoterRows(proposal(3n));
    expect(rows.reduce((sum, row) => sum + (row.weight ?? 0n), 0n)).toBe(total);
    expect(rows.reduce((sum, row) => sum + (row.yeaWeight ?? 0n), 0n)).toBe(yea);
  });

  it("does not release or rewrite a submitted wallet vote", async () => {
    setDaoMockSelectedProposal("3");
    setDaoMockAlreadyVoted(false);
    await prepareDaoMockVote(proposal(3n).ref, DAO_MOCK_ACCOUNT_ADDRESS, "yea")();
    indexDaoMockPendingAction();
    const before = structuredClone(deriveDaoVoterRows(proposal(3n)));
    setDaoMockAlreadyVoted(false);
    setDaoMockAlreadyVoted(true, "nay");
    expect(deriveDaoVoterRows(proposal(3n))).toEqual(before);
    expect(getDaoMockSnapshot().account).toMatchObject({ hasVoted: true, voteDirection: "yea" });
  });

  it("keeps the account dropdown's explicit Already voted choice in sync with its sample event", () => {
    setDaoMockSelectedProposal("22");
    setDaoMockAccountState("already-voted");
    expect(deriveDaoWalletParticipation(proposal(22n), DAO_MOCK_ACCOUNT_ADDRESS)).toEqual({ status: "voted", choice: "yea" });
    expect(getDaoMockSnapshot().account).toMatchObject({ hasVoted: true, voteDirection: "yea" });
    setDaoMockAccountState("disconnected");
    setDaoMockAccountState("weight");
    expect(getDaoMockSnapshot().account).toMatchObject({ hasVoted: true, voteDirection: "yea" });
  });
});
