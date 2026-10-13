import { DAO_FEED_STALE_SECONDS } from "./feed";
import { deriveDaoLifecycleFacts } from "./domain";
import type { DaoSnapshot } from "./types";

export type DaoVotingNotice = {
  proposalCount: number;
  endsAt: number;
  multipleDeadlines: boolean;
  periodKeys: string[];
};

/** Advertise decision votes only; vetoed participation votes stay on the DAO app. */
export function deriveDaoVotingNotice(
  snapshot: DaoSnapshot | undefined,
  now: number,
  mode: "mock" | "live"
): DaoVotingNotice | null {
  if (!snapshot || !Number.isSafeInteger(now)) return null;
  const generatedAt = Date.parse(snapshot.generatedAt) / 1000;
  const fresh = (timestamp: number) => Number.isFinite(timestamp) &&
    timestamp >= now - DAO_FEED_STALE_SECONDS && timestamp <= now + 60;
  if (!fresh(generatedAt) || !fresh(snapshot.canonicalBlock.timestamp)) return null;

  const proposals = snapshot.proposals.filter(proposal =>
    proposal.ref.chainId === snapshot.chainId &&
    snapshot.contracts.some(contract =>
      contract.votingAddress.toLowerCase() === proposal.ref.votingAddress.toLowerCase()) &&
    proposal.protocolStatus === "voting" &&
    !proposal.retracted && !proposal.flagged && !proposal.vetoed && !proposal.executed &&
    deriveDaoLifecycleFacts(proposal, now).moderation.votingAvailable
  );
  if (proposals.length === 0) return null;
  const endsAt = Math.min(...proposals.map(proposal => proposal.voteEndsAt));
  return {
    proposalCount: proposals.length,
    endsAt,
    multipleDeadlines: proposals.some(proposal => proposal.voteEndsAt !== endsAt),
    // Period identity stays stable as proposals close or a feed is refreshed.
    // Separate deployments and mock/live data must never share a dismissal.
    periodKeys: [...new Set(proposals.map(proposal =>
      [mode, proposal.ref.chainId, proposal.ref.votingAddress.toLowerCase(),
        proposal.voteStartsAt, proposal.voteEndsAt].join(":")
    ))].sort(),
  };
}
