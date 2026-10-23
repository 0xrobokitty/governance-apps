import { describe, expect, it } from "vitest";
import { DAO_MOCK_FEED, DAO_MOCK_YBC_AGGREGATE_ADDRESS } from "@/lib/clients/dao/fixtures";
import { deriveDaoVoteResults } from "@/lib/clients/dao/vote-results";
import { deriveDaoVoteDisplay } from "@/lib/clients/dao/read-display";
import type { DaoProposal } from "@/lib/clients/dao/types";

function proposal() {
  return structuredClone(DAO_MOCK_FEED.proposals.find((value) => value.ref.proposalId === 2n)!);
}

function setYbc(value: DaoProposal, weight: bigint | null, yeaBps: number | null) {
  const vote = value.events.findLast((event) => event.actor === DAO_MOCK_YBC_AGGREGATE_ADDRESS)!;
  vote.weight = weight;
  vote.yeaBps = yeaBps;
}

describe("canonical vote result highlighting", () => {
  it("partitions the latest YBC vote without changing canonical totals or their boundary", () => {
    const value = proposal();
    const result = deriveDaoVoteResults(value, DAO_MOCK_YBC_AGGREGATE_ADDRESS);
    expect(result.state).toBe("ready");
    expect(result.vote).toEqual(deriveDaoVoteDisplay(value));
    expect(result.ybc).toMatchObject({ state: "voted", yeaWeight: 15n * 10n ** 17n, nayWeight: 5n * 10n ** 17n });
    expect(result.highlightedSegments.map((part) => part.kind)).toEqual(["ybc-yea", "yea", "nay", "ybc-nay"]);
    expect(result.highlightedSegments.map((part) => part.shareOfTotalPercent)).toEqual(["13.64%", "54.55%", "27.27%", "4.55%"]);
    expect(result.highlightedSegments.reduce((sum, part) => sum + part.weight, 0n)).toBe(value.totalWeight);
    expect(result.highlightedSegments.reduce((sum, part) => sum + part.units, 0)).toBe(1_000_000);
    for (const side of ["yea", "nay"] as const) {
      const parts = result.highlightedSegments.filter((part) => part.kind === side || part.kind === `ybc-${side}`);
      expect(parts.reduce((sum, part) => sum + part.units, 0)).toBe(result.canonicalSegments.find((part) => part.kind === side)!.units);
      expect(parts.reduce((sum, part) => sum + part.weight, 0n)).toBe(value[side === "yea" ? "yeaWeight" : "nayWeight"]);
    }
  });

  it.each([1n, 3n, 7n, 10_001n, (2n ** 256n - 1n) / 2n])("keeps exact segment sums and nonnegative widths for weight %s", (weight) => {
    const value = proposal();
    value.yeaWeight = weight;
    value.nayWeight = weight;
    value.totalWeight = weight * 2n;
    setYbc(value, weight, 3_333);
    const result = deriveDaoVoteResults(value, DAO_MOCK_YBC_AGGREGATE_ADDRESS);
    expect(result.ybc.state).toBe("voted");
    expect(result.highlightedSegments.reduce((sum, part) => sum + part.weight, 0n)).toBe(value.totalWeight);
    expect(result.highlightedSegments.reduce((sum, part) => sum + part.units, 0)).toBe(1_000_000);
    expect(result.highlightedSegments.every((part) => part.weight >= 0n && part.units >= 0 && part.units <= 1_000_000 && Number.isFinite(part.widthPercent))).toBe(true);
    expect(result.highlightedSegments[0].weight).toBe(weight * 3_333n / 10_000n);
  });

  it("does not enlarge a contribution that rounds below one visible bar unit", () => {
    const value = proposal();
    value.yeaWeight = 10n ** 40n;
    value.nayWeight = 0n;
    value.totalWeight = value.yeaWeight;
    setYbc(value, 1n, 10_000);
    const result = deriveDaoVoteResults(value, DAO_MOCK_YBC_AGGREGATE_ADDRESS);
    expect(result.highlightedSegments[0]).toMatchObject({ weight: 1n, units: 0, widthPercent: 0, shareOfTotalPercent: "<0.01%" });
    expect(result.highlightedSegments[1]).toMatchObject({ units: 1_000_000, shareOfTotalPercent: ">99.99%" });
  });

  it.each([
    [0n, "0%"], [1n, "<0.01%"], [9n, "<0.01%"], [10n, "0.01%"],
    [99_990n, "99.99%"], [99_991n, ">99.99%"], [99_999n, ">99.99%"], [100_000n, "100%"],
  ])("formats %s of total weight without rounding a positive share to zero or a partial share to all", (weight, share) => {
    const value = proposal();
    value.yeaWeight = weight;
    value.nayWeight = 100_000n - weight;
    value.totalWeight = 100_000n;
    expect(deriveDaoVoteResults(value, null).canonicalSegments[0].shareOfTotalPercent).toBe(share);
  });

  it("keeps zero totals empty and never divides by zero", () => {
    const value = proposal();
    value.yeaWeight = value.nayWeight = value.totalWeight = 0n;
    setYbc(value, 0n, 10_000);
    const result = deriveDaoVoteResults(value, DAO_MOCK_YBC_AGGREGATE_ADDRESS);
    expect(result.state).toBe("empty");
    expect(result.ybc.state).toBe("not-voted");
    expect(result.canonicalSegments.every((part) => part.units === 0)).toBe(true);
    expect(result.canonicalSegments.every((part) => part.shareOfTotalPercent === "0%")).toBe(true);
  });

  it.each(["missing", "negative", "incoherent"])("does not draw %s canonical totals", (kind) => {
    const value = proposal();
    if (kind === "missing") value.totalWeight = undefined as unknown as bigint;
    if (kind === "negative") value.yeaWeight = -1n;
    if (kind === "incoherent") value.totalWeight += 1n;
    expect(deriveDaoVoteResults(value, DAO_MOCK_YBC_AGGREGATE_ADDRESS)).toMatchObject({
      state: "unavailable", vote: null, canonicalSegments: [], highlightedSegments: [],
    });
  });

  it.each([null, -1n, 101n])("leaves canonical results intact when the aggregate is invalid or too large: %s", (weight) => {
    const value = proposal();
    value.yeaWeight = 100n;
    value.nayWeight = 0n;
    value.totalWeight = 100n;
    setYbc(value, weight, 10_000);
    const result = deriveDaoVoteResults(value, DAO_MOCK_YBC_AGGREGATE_ADDRESS);
    expect(result.state).toBe("ready");
    expect(result.ybc.state).toBe("unavailable");
    expect(result.highlightedSegments).toEqual(result.canonicalSegments);
  });

  it("rejects a YBC side that exceeds its canonical side even when the total fits", () => {
    const value = proposal();
    value.yeaWeight = 9n;
    value.nayWeight = 1n;
    value.totalWeight = 10n;
    setYbc(value, 2n, 0);
    const result = deriveDaoVoteResults(value, DAO_MOCK_YBC_AGGREGATE_ADDRESS);
    expect(result.ybc.state).toBe("unavailable");
    expect(result.highlightedSegments).toEqual(result.canonicalSegments);
  });

  it("does not infer a missing collective or resurrect an older zeroed vote", () => {
    const value = proposal();
    expect(deriveDaoVoteResults(value, null).ybc.state).toBe("unavailable");
    setYbc(value, 0n, 10_000);
    expect(deriveDaoVoteResults(value, DAO_MOCK_YBC_AGGREGATE_ADDRESS).ybc.state).toBe("not-voted");
    value.events = value.events.filter((event) => event.actor !== DAO_MOCK_YBC_AGGREGATE_ADDRESS);
    expect(deriveDaoVoteResults(value, DAO_MOCK_YBC_AGGREGATE_ADDRESS).ybc.state).toBe("not-voted");
  });
});
