import { formatTokenAmount } from "@/lib/format";
import { formatDaoBasisPoints } from "./read-display";
import type { DaoProposal, DaoProposalEvent } from "./types";

export type DaoVoterRow = {
  address: string;
  event: DaoProposalEvent;
  choice: "yea" | "nay" | "split" | "unknown";
  yeaBps: number | null;
  yeaWeight: bigint | null;
  nayWeight: bigint | null;
  weight: bigint | null;
  formattedWeight: string | null;
  shareBps: number | null;
  formattedShare: string | null;
};

/** Chain order, rather than feed array order or timestamps, determines replacement votes. */
export function compareDaoVoteEvents(a: DaoProposalEvent, b: DaoProposalEvent): number {
  if (a.log.blockNumber !== b.log.blockNumber) return a.log.blockNumber < b.log.blockNumber ? -1 : 1;
  return a.log.transactionIndex - b.log.transactionIndex || a.log.logIndex - b.log.logIndex;
}

/** A collective can replace its vote; its earlier weights must never be added again. */
export function getLatestDaoVoteEvents(proposal: Pick<DaoProposal, "events">): DaoProposalEvent[] {
  const latest = new Map<string, DaoProposalEvent>();
  for (const event of proposal.events) {
    if (event.type !== "vote" || !event.actor) continue;
    const key = event.actor.toLowerCase();
    const previous = latest.get(key);
    if (!previous || compareDaoVoteEvents(previous, event) < 0) latest.set(key, event);
  }
  return [...latest.values()].sort((a, b) => compareDaoVoteEvents(b, a));
}

export function deriveDaoVoterRows(proposal: Pick<DaoProposal, "events" | "totalWeight">): DaoVoterRow[] {
  return getLatestDaoVoteEvents(proposal).map((event) => {
    const yeaBps = event.yeaBps !== null && Number.isInteger(event.yeaBps) && event.yeaBps >= 0 && event.yeaBps <= 10_000
      ? event.yeaBps : null;
    const weight = event.weight !== null && event.weight >= 0n ? event.weight : null;
    const yeaWeight = weight !== null && yeaBps !== null ? weight * BigInt(yeaBps) / 10_000n : null;
    const shareBps = weight !== null && proposal.totalWeight > 0n
      ? Number((weight * 10_000n / proposal.totalWeight) > 10_000n ? 10_000n : weight * 10_000n / proposal.totalWeight) : null;
    return {
      address: event.actor!, event,
      choice: yeaBps === null ? "unknown" : yeaBps === 10_000 ? "yea" : yeaBps === 0 ? "nay" : "split",
      yeaBps, yeaWeight, nayWeight: weight !== null && yeaWeight !== null ? weight - yeaWeight : null,
      weight, formattedWeight: weight === null ? null : formatTokenAmount(weight, 18, 4),
      shareBps, formattedShare: shareBps === null ? null : formatDaoBasisPoints(shareBps),
    };
  });
}
