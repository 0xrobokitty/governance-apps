import type { Address } from "viem";
import { formatTokenAmount } from "@/lib/format";
import { formatDaoBasisPoints } from "./read-display";
import { getLatestDaoVoteEvents } from "./votes";
import { deriveDaoLifecycleFacts } from "./domain";
import type { DaoAccountProposalFacts, DaoPendingAction, DaoProposal } from "./types";

export type DaoParticipation = "voted" | "not-voted" | "pending" | "unknown";
export type DaoWalletParticipation = {
  status: DaoParticipation;
  choice: "yea" | "nay" | "split" | "unknown" | null;
};
export type DaoParticipationMap = Record<string, DaoWalletParticipation>;

/** An open snapshot window permits a review link, not a claim of wallet eligibility. */
export function isDaoVoteReviewOpen(proposal: DaoProposal, now: number): boolean {
  return !proposal.retracted && deriveDaoLifecycleFacts(proposal, now).moderation.votingAvailable;
}

export function deriveDaoWalletParticipation(
  proposal: DaoProposal,
  address: Address,
  pending: DaoPendingAction | null = null,
  mockAccount?: Pick<DaoAccountProposalFacts, "hasVoted" | "voteDirection">,
): DaoWalletParticipation {
  const recordedStatus = deriveDaoParticipation(proposal, address, pending);
  const status = mockAccount && recordedStatus !== "pending"
    ? mockAccount.hasVoted ? "voted" : "not-voted"
    : recordedStatus;
  if (status !== "voted") return { status, choice: null };
  if (mockAccount?.voteDirection) return { status, choice: mockAccount.voteDirection };
  const event = getLatestDaoVoteEvents(proposal).find(
    (candidate) => candidate.actor?.toLowerCase() === address.toLowerCase(),
  );
  const bps = event?.yeaBps;
  const choice = bps === 10_000 ? "yea" : bps === 0 ? "nay" :
    typeof bps === "number" && Number.isInteger(bps) && bps > 0 && bps < 10_000 ? "split" : "unknown";
  return { status, choice };
}

/** Snapshot participation is informational; it never authorizes a transaction. */
export function deriveDaoParticipation(
  proposal: DaoProposal,
  address: Address,
  pending: DaoPendingAction | null = null,
): DaoParticipation {
  const event = getLatestDaoVoteEvents(proposal).find(
    (candidate) => candidate.actor?.toLowerCase() === address.toLowerCase(),
  );
  if (pending?.action === "vote" &&
      pending.actor.toLowerCase() === address.toLowerCase() &&
      pending.ref.chainId === proposal.ref.chainId &&
      pending.ref.votingAddress.toLowerCase() === proposal.ref.votingAddress.toLowerCase() &&
      pending.ref.proposalId === proposal.ref.proposalId &&
      (pending.receiptState === undefined || pending.receiptState === "unknown" || pending.receiptState === "confirmed") &&
      !proposal.events.some((candidate) => candidate.type === "vote" &&
        candidate.actor?.toLowerCase() === address.toLowerCase() &&
        candidate.log.transactionHash?.toLowerCase() === pending.transactionHash.toLowerCase())) {
    return "pending";
  }
  if (!event) return "not-voted";
  if (event.weight === null || event.weight < 0n) return "unknown";
  // Voting.voted(account, id) is defined as the current contribution.weight > 0.
  return event.weight > 0n ? "voted" : "not-voted";
}

export type DaoYbcVote =
  | { state: "unavailable" | "not-voted"; address: Address | null }
  | {
      state: "voted";
      address: Address;
      yeaWeight: bigint;
      nayWeight: bigint;
      formattedYeaWeight: string;
      formattedNayWeight: string;
      yeaBps: number;
      nayBps: number;
      yeaPercent: string;
      nayPercent: string;
      timestamp: number | null;
    };

/** Uses only the app's configured collective address, never inferred membership. */
export function deriveDaoYbcVote(proposal: DaoProposal, address: Address | null): DaoYbcVote {
  if (!address) return { state: "unavailable", address };
  const event = getLatestDaoVoteEvents(proposal).find(
    (candidate) => candidate.actor?.toLowerCase() === address.toLowerCase(),
  );
  if (!event || event.weight === 0n) return { state: "not-voted", address };
  if (event.weight === null || event.weight < 0n || event.yeaBps === null ||
      !Number.isInteger(event.yeaBps) || event.yeaBps < 0 || event.yeaBps > 10_000) {
    return { state: "unavailable", address };
  }
  // Match Voting.vote's integer rounding, then assign the remaining weight to Nay.
  const yeaWeight = event.weight * BigInt(event.yeaBps) / 10_000n;
  const nayWeight = event.weight - yeaWeight;
  const yeaBps = Number(yeaWeight * 10_000n / event.weight);
  const nayBps = 10_000 - yeaBps;
  return {
    state: "voted", address, yeaWeight, nayWeight,
    formattedYeaWeight: formatTokenAmount(yeaWeight, 18, 4),
    formattedNayWeight: formatTokenAmount(nayWeight, 18, 4),
    yeaBps, nayBps,
    yeaPercent: formatDaoBasisPoints(yeaBps),
    nayPercent: formatDaoBasisPoints(nayBps),
    timestamp: event.log.timestamp,
  };
}
