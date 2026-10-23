import { describe, expect, it } from "vitest";
import { DAO_MOCK_FEED, DAO_MOCK_STYFIX_AGGREGATE_ADDRESS, DAO_MOCK_YBC_AGGREGATE_ADDRESS } from "@/lib/clients/dao/fixtures";
import { deriveDaoVoterRows, deriveDaoVoterTable, getLatestDaoVoteEvents } from "@/lib/clients/dao/votes";
import type { DaoProposal, DaoProposalEvent } from "@/lib/clients/dao/types";

const proposal = DAO_MOCK_FEED.proposals.find((entry) => entry.events.some((event) => event.yeaBps === 7_500))!;
const collectiveAddresses = { ybc: DAO_MOCK_YBC_AGGREGATE_ADDRESS, styfix: DAO_MOCK_STYFIX_AGGREGATE_ADDRESS };
const UNIT = 10n ** 18n;

function collectiveEvent(value: DaoProposal, role: keyof typeof collectiveAddresses): DaoProposalEvent {
  return getLatestDaoVoteEvents(value).find((event) => event.actor === collectiveAddresses[role])!;
}

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

describe("DAO individual and collective voter table", () => {
  it("partitions exact collective accounts and combines unequal weights with one common split", () => {
    const before = structuredClone(proposal);
    const table = deriveDaoVoterTable(proposal, collectiveAddresses);
    expect(table.individualRows).toEqual(deriveDaoVoterRows(proposal).filter((row) =>
      row.address !== collectiveAddresses.ybc && row.address !== collectiveAddresses.styfix));
    expect(table.individualRows).toHaveLength(2);
    expect(table.collective).toMatchObject({
      status: "complete", yeaBps: 7_500,
      weight: 6n * UNIT, formattedWeight: "6", shareBps: 5_454, formattedShare: "54.54%",
      yeaWeight: 45n * UNIT / 10n, nayWeight: 15n * UNIT / 10n,
      latestEvent: collectiveEvent(proposal, "ybc"),
      timestamp: collectiveEvent(proposal, "ybc").log.timestamp,
      sourceRows: { ybc: { weight: 2n * UNIT }, styfix: { weight: 4n * UNIT } },
    });
    expect(proposal).toEqual(before);
  });

  it("deduplicates replacements before combining and selects the latest chain event, not latest timestamp", () => {
    const value = structuredClone(proposal);
    const previous = collectiveEvent(value, "styfix");
    const latest = { ...previous, weight: 8n * UNIT, log: { ...previous.log, blockNumber: previous.log.blockNumber + 1n, timestamp: null } };
    value.events = [latest, ...value.events.toReversed()];
    value.totalWeight = 15n * UNIT;
    const collective = deriveDaoVoterTable(value, collectiveAddresses).collective;
    expect(collective).toMatchObject({ status: "complete", weight: 10n * UNIT, latestEvent: latest, timestamp: null });
    expect(collective?.sourceRows.styfix?.event).toBe(latest);
  });

  it("sums each account's rounded weights instead of rounding the combined weight", () => {
    const value = structuredClone(proposal);
    for (const role of ["ybc", "styfix"] as const) {
      Object.assign(collectiveEvent(value, role), { weight: 1n, yeaBps: 5_000 });
    }
    value.events = [collectiveEvent(value, "ybc"), collectiveEvent(value, "styfix")];
    value.totalWeight = 2n;
    expect(deriveDaoVoterTable(value, collectiveAddresses).collective).toMatchObject({
      status: "complete", yeaBps: 5_000, weight: 2n, yeaWeight: 0n, nayWeight: 2n, shareBps: 10_000,
    });
  });

  it.each([[0n, 0n], [0n, 4n], [3n, 0n]])("keeps zero contributions as current data: %s and %s", (ybcWeight, styfixWeight) => {
    const value = structuredClone(proposal);
    Object.assign(collectiveEvent(value, "ybc"), { weight: ybcWeight, yeaBps: 0 });
    Object.assign(collectiveEvent(value, "styfix"), { weight: styfixWeight, yeaBps: 0 });
    value.events = [collectiveEvent(value, "ybc"), collectiveEvent(value, "styfix")];
    value.totalWeight = ybcWeight + styfixWeight;
    expect(deriveDaoVoterTable(value, collectiveAddresses).collective).toMatchObject({
      status: "complete", yeaBps: 0, weight: value.totalWeight, yeaWeight: 0n, nayWeight: value.totalWeight,
      shareBps: value.totalWeight === 0n ? null : 10_000,
      formattedShare: value.totalWeight === 0n ? null : "100%",
    });
  });

  it.each(["ybc", "styfix"] as const)("does not present a partial total when %s is missing", (missing) => {
    const value = structuredClone(proposal);
    value.events = value.events.filter((event) => event.actor !== collectiveAddresses[missing]);
    const table = deriveDaoVoterTable(value, collectiveAddresses);
    expect(table.individualRows).toHaveLength(2);
    expect(table.collective).toMatchObject({
      status: "incomplete", yeaBps: null, weight: null, formattedWeight: null,
      yeaWeight: null, nayWeight: null, shareBps: null, formattedShare: null,
      sourceRows: { [missing]: null },
    });
  });

  it.each([
    { label: "missing weight", invalid: { weight: null } },
    { label: "negative weight", invalid: { weight: -1n } },
    { label: "non-bigint weight", invalid: { weight: 2 as unknown as bigint } },
    { label: "missing choice", invalid: { yeaBps: null } },
    { label: "negative choice", invalid: { yeaBps: -1 } },
    { label: "oversized choice", invalid: { yeaBps: 10_001 } },
    { label: "fractional choice", invalid: { yeaBps: 7_500.5 } },
    { label: "NaN choice", invalid: { yeaBps: Number.NaN } },
  ])("keeps $label unavailable without restoring an old contribution", ({ invalid }) => {
    const value = structuredClone(proposal);
    Object.assign(collectiveEvent(value, "ybc"), invalid);
    expect(deriveDaoVoterTable(value, collectiveAddresses).collective).toMatchObject({
      status: "incomplete", yeaBps: null, weight: null, formattedWeight: null,
      yeaWeight: null, nayWeight: null, shareBps: null, formattedShare: null,
    });
  });

  it("reports inconsistent fractions without inventing a shared split", () => {
    const value = structuredClone(proposal);
    collectiveEvent(value, "styfix").yeaBps = 2_500;
    expect(deriveDaoVoterTable(value, collectiveAddresses).collective).toMatchObject({
      status: "inconsistent", yeaBps: null, weight: 6n * UNIT,
      yeaWeight: 25n * UNIT / 10n, nayWeight: 35n * UNIT / 10n,
      formattedWeight: "6", formattedShare: "54.54%",
    });
  });

  it.each([5n * UNIT, 0n, -1n])("does not clamp an incoherent collective total to 100%% when the proposal total is %s", (totalWeight) => {
    const value = { ...proposal, totalWeight };
    expect(deriveDaoVoterTable(value, collectiveAddresses).collective).toMatchObject({
      status: "inconsistent", yeaBps: null, weight: 6n * UNIT, formattedWeight: "6",
      yeaWeight: 45n * UNIT / 10n, nayWeight: 15n * UNIT / 10n,
      shareBps: null, formattedShare: null,
    });
  });

  it("returns no collective when both accounts are absent or no configuration is supplied", () => {
    const value = structuredClone(proposal);
    value.events = value.events.filter((event) => event.actor !== collectiveAddresses.ybc && event.actor !== collectiveAddresses.styfix);
    expect(deriveDaoVoterTable(value, collectiveAddresses)).toEqual({ individualRows: deriveDaoVoterRows(value), collective: null });
    expect(deriveDaoVoterTable(proposal, null)).toEqual({ individualRows: deriveDaoVoterRows(proposal), collective: null });
  });

  it("matches addresses case-insensitively and leaves all other fractional or unknown rows intact", () => {
    const ybc = "0xaBcDeF0000000000000000000000000000000001";
    const styfix = "0xaBcDeF0000000000000000000000000000000002";
    const other = "0xaBcDeF0000000000000000000000000000000003";
    const event = collectiveEvent(proposal, "ybc");
    const value: Pick<DaoProposal, "events" | "totalWeight"> = {
      totalWeight: proposal.totalWeight,
      events: [
        { ...event, actor: ybc }, { ...event, actor: styfix },
        { ...event, actor: other, yeaBps: 3_333 },
        { ...event, actor: DAO_MOCK_YBC_AGGREGATE_ADDRESS, yeaBps: null },
      ],
    };
    const table = deriveDaoVoterTable(value, { ybc: ybc.toLowerCase(), styfix: styfix.toUpperCase() });
    expect(table.collective?.status).toBe("complete");
    expect(table.individualRows).toHaveLength(2);
    expect(table.individualRows.find((row) => row.address === other)).toMatchObject({ choice: "split", yeaBps: 3_333 });
    expect(table.individualRows.find((row) => row.address === DAO_MOCK_YBC_AGGREGATE_ADDRESS)).toMatchObject({ choice: "unknown", yeaBps: null });
    expect(deriveDaoVoterTable(value, { ybc: ybc.slice(0, -1), styfix: `${styfix}0` }).collective).toBeNull();
  });

  it("does not count a duplicate configured address twice", () => {
    const table = deriveDaoVoterTable(proposal, { ybc: collectiveAddresses.ybc, styfix: collectiveAddresses.ybc.toUpperCase() });
    expect(table.individualRows).toHaveLength(3);
    expect(table.collective).toMatchObject({ status: "incomplete", weight: null, sourceRows: { styfix: null } });
  });

  it("keeps large combined weights exact and only converts bounded percentages", () => {
    const value = structuredClone(proposal);
    const weight = (2n ** 256n - 1n) / 2n;
    for (const role of ["ybc", "styfix"] as const) {
      Object.assign(collectiveEvent(value, role), { weight, yeaBps: 3_333 });
    }
    value.events = [collectiveEvent(value, "ybc"), collectiveEvent(value, "styfix")];
    value.totalWeight = weight * 2n;
    expect(deriveDaoVoterTable(value, collectiveAddresses).collective).toMatchObject({
      status: "complete", weight: weight * 2n, yeaBps: 3_333,
      yeaWeight: (weight * 3_333n / 10_000n) * 2n,
      shareBps: 10_000, formattedShare: "100%",
    });
  });
});
