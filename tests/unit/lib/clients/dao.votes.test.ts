import { describe, expect, it } from "vitest";
import { DAO_MOCK_FEED } from "@/lib/clients/dao/fixtures";
import { deriveDaoVoterRows, getLatestDaoVoteEvents } from "@/lib/clients/dao/votes";

const proposal = DAO_MOCK_FEED.proposals.find((entry) => entry.events.some((event) => event.yeaBps === 7_500))!;

describe("DAO voter rows", () => {
  it("replaces collective votes in chain order without counting prior weights", () => {
    const shuffled = { ...proposal, events: [...proposal.events].reverse() };
    const rows = deriveDaoVoterRows(shuffled);
    expect(rows).toHaveLength(4);
    expect(rows.reduce((total, row) => total + (row.weight ?? 0n), 0n)).toBe(proposal.totalWeight);
    expect(rows.reduce((total, row) => total + (row.yeaWeight ?? 0n), 0n)).toBe(proposal.yeaWeight);
    expect(rows.filter((row) => row.choice === "split")).toHaveLength(2);
    expect(getLatestDaoVoteEvents(shuffled)).toEqual(getLatestDaoVoteEvents(proposal));
  });

  it("uses transaction and log indexes when timestamps are missing or equal", () => {
    const latest = getLatestDaoVoteEvents(proposal)[0];
    const old = { ...latest, weight: 100n, log: { ...latest.log, transactionIndex: latest.log.transactionIndex - 1, timestamp: null } };
    expect(getLatestDaoVoteEvents({ events: [latest, old] })).toEqual([latest]);
  });

  it("shows unavailable data on malformed latest votes instead of stale prior values", () => {
    const previous = getLatestDaoVoteEvents(proposal)[0];
    const latest = { ...previous, weight: null, yeaBps: null, log: { ...previous.log, blockNumber: previous.log.blockNumber + 1n } };
    const [row] = deriveDaoVoterRows({ events: [previous, latest], totalWeight: 0n });
    expect(row).toMatchObject({ choice: "unknown", weight: null, shareBps: null, yeaWeight: null, nayWeight: null });
  });
});
