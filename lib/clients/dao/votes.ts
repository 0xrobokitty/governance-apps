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

export type DaoCollectiveVoteAddresses = { ybc: string; styfix: string };

export type DaoCollectiveVote = {
  status: "complete" | "incomplete" | "inconsistent";
  /** The common submitted fraction, only when both latest contributions agree. */
  yeaBps: number | null;
  weight: bigint | null;
  formattedWeight: string | null;
  shareBps: number | null;
  formattedShare: string | null;
  /** Sum each account's contract-rounded contribution, not a rounded combined weight. */
  yeaWeight: bigint | null;
  nayWeight: bigint | null;
  latestEvent: DaoProposalEvent;
  timestamp: number | null;
  sourceRows: { ybc: DaoVoterRow | null; styfix: DaoVoterRow | null };
};

export type DaoVoterTable = {
  individualRows: DaoVoterRow[];
  collective: DaoCollectiveVote | null;
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
    const yeaBps = typeof event.yeaBps === "number" && Number.isInteger(event.yeaBps) && event.yeaBps >= 0 && event.yeaBps <= 10_000
      ? event.yeaBps : null;
    const weight = typeof event.weight === "bigint" && event.weight >= 0n ? event.weight : null;
    const yeaWeight = weight !== null && yeaBps !== null ? weight * BigInt(yeaBps) / 10_000n : null;
    const shareBps = deriveShareBps(weight, proposal.totalWeight);
    return {
      address: event.actor!, event,
      choice: yeaBps === null ? "unknown" : yeaBps === 10_000 ? "yea" : yeaBps === 0 ? "nay" : "split",
      yeaBps, yeaWeight, nayWeight: weight !== null && yeaWeight !== null ? weight - yeaWeight : null,
      weight, formattedWeight: weight === null ? null : formatTokenAmount(weight, 18, 4),
      shareBps, formattedShare: shareBps === null ? null : formatDaoBasisPoints(shareBps),
    };
  });
}

/** Only configured accounts join the collective; a fractional choice never implies membership. */
export function deriveDaoVoterTable(
  proposal: Pick<DaoProposal, "events" | "totalWeight">,
  addresses: DaoCollectiveVoteAddresses | null,
): DaoVoterTable {
  const rows = deriveDaoVoterRows(proposal);
  if (!addresses) return { individualRows: rows, collective: null };

  const ybcAddress = addresses.ybc.toLowerCase();
  const styfixAddress = addresses.styfix.toLowerCase();
  const sourceRows = {
    ybc: rows.find((row) => row.address.toLowerCase() === ybcAddress) ?? null,
    // A duplicate configuration cannot turn one contribution into two accounts.
    styfix: ybcAddress === styfixAddress ? null : rows.find((row) => row.address.toLowerCase() === styfixAddress) ?? null,
  };
  const individualRows = rows.filter((row) => {
    const address = row.address.toLowerCase();
    return address !== ybcAddress && address !== styfixAddress;
  });
  const presentRows = [sourceRows.ybc, sourceRows.styfix].filter((row): row is DaoVoterRow => row !== null);
  if (presentRows.length === 0) return { individualRows, collective: null };

  const latestEvent = presentRows.reduce((latest, row) =>
    compareDaoVoteEvents(latest, row.event) < 0 ? row.event : latest, presentRows[0].event);
  const collective: DaoCollectiveVote = {
    status: "incomplete", yeaBps: null,
    weight: null, formattedWeight: null, shareBps: null, formattedShare: null,
    yeaWeight: null, nayWeight: null,
    latestEvent, timestamp: latestEvent.log.timestamp, sourceRows,
  };
  const { ybc, styfix } = sourceRows;
  if (!ybc || !styfix || ybc.weight === null || styfix.weight === null ||
      ybc.yeaBps === null || styfix.yeaBps === null ||
      ybc.yeaWeight === null || styfix.yeaWeight === null ||
      ybc.nayWeight === null || styfix.nayWeight === null) {
    return { individualRows, collective };
  }

  const weight = ybc.weight + styfix.weight;
  const consistentTotal = proposal.totalWeight >= 0n && weight <= proposal.totalWeight;
  const shareBps = consistentTotal ? deriveShareBps(weight, proposal.totalWeight) : null;
  const matchingChoice = ybc.yeaBps === styfix.yeaBps;
  const complete = matchingChoice && consistentTotal;
  return {
    individualRows,
    collective: {
      ...collective,
      status: complete ? "complete" : "inconsistent",
      yeaBps: complete ? ybc.yeaBps : null,
      weight, formattedWeight: formatTokenAmount(weight, 18, 4),
      shareBps, formattedShare: shareBps === null ? null : formatDaoBasisPoints(shareBps),
      yeaWeight: ybc.yeaWeight + styfix.yeaWeight,
      nayWeight: ybc.nayWeight + styfix.nayWeight,
    },
  };
}

function deriveShareBps(weight: bigint | null, totalWeight: bigint): number | null {
  if (weight === null || totalWeight <= 0n) return null;
  const share = weight * 10_000n / totalWeight;
  return Number(share > 10_000n ? 10_000n : share);
}
