import type { Address } from "viem";
import { deriveDaoYbcVote, type DaoYbcVote } from "./participation";
import { deriveDaoVoteDisplay, type DaoVoteDisplay } from "./read-display";
import type { DaoProposal } from "./types";

const BAR_UNITS = 1_000_000n;

export type DaoVoteResultSegment = {
  kind: "yea" | "ybc-yea" | "ybc-nay" | "nay";
  weight: bigint;
  /** Millionths of the whole bar, bounded before conversion to Number. */
  units: number;
  widthPercent: number;
};

export type DaoVoteResults = {
  state: "ready" | "empty" | "unavailable";
  vote: DaoVoteDisplay | null;
  ybc: DaoYbcVote;
  canonicalSegments: DaoVoteResultSegment[];
  highlightedSegments: DaoVoteResultSegment[];
};

/** Highlighting partitions canonical totals; it never removes or adds a vote. */
export function deriveDaoVoteResults(proposal: DaoProposal, address: Address | null): DaoVoteResults {
  const { yeaWeight, nayWeight, totalWeight } = proposal;
  if (typeof yeaWeight !== "bigint" || typeof nayWeight !== "bigint" || typeof totalWeight !== "bigint" ||
      yeaWeight < 0n || nayWeight < 0n || totalWeight < 0n || yeaWeight + nayWeight !== totalWeight) {
    return {
      state: "unavailable", vote: null, ybc: { state: "unavailable", address },
      canonicalSegments: [], highlightedSegments: [],
    };
  }

  const yeaUnits = totalWeight === 0n ? 0n : yeaWeight * BAR_UNITS / totalWeight;
  const nayUnits = totalWeight === 0n ? 0n : BAR_UNITS - yeaUnits;
  const canonicalSegments = [segment("yea", yeaWeight, yeaUnits), segment("nay", nayWeight, nayUnits)];
  let ybc = deriveDaoYbcVote(proposal, address);
  if (ybc.state === "voted" && (ybc.yeaWeight > yeaWeight || ybc.nayWeight > nayWeight)) {
    // A stale or inconsistent aggregate must not create negative remainder votes.
    ybc = { state: "unavailable", address };
  }

  let highlightedSegments = canonicalSegments;
  if (ybc.state === "voted") {
    // Allocate within each canonical side so the Yea/Nay boundary stays fixed,
    // including when small contributions round below one visible bar unit.
    const ybcYeaUnits = yeaWeight === 0n ? 0n : yeaUnits * ybc.yeaWeight / yeaWeight;
    const ybcNayUnits = nayWeight === 0n ? 0n : nayUnits * ybc.nayWeight / nayWeight;
    highlightedSegments = [
      segment("yea", yeaWeight - ybc.yeaWeight, yeaUnits - ybcYeaUnits),
      segment("ybc-yea", ybc.yeaWeight, ybcYeaUnits),
      segment("ybc-nay", ybc.nayWeight, ybcNayUnits),
      segment("nay", nayWeight - ybc.nayWeight, nayUnits - ybcNayUnits),
    ];
  }
  return {
    state: totalWeight === 0n ? "empty" : "ready", vote: deriveDaoVoteDisplay(proposal), ybc,
    canonicalSegments, highlightedSegments,
  };
}

function segment(kind: DaoVoteResultSegment["kind"], weight: bigint, units: bigint): DaoVoteResultSegment {
  return { kind, weight, units: Number(units), widthPercent: Number(units) / 10_000 };
}
