import { describe, expect, it } from "vitest";
import { assertVotingPowerSnapshotFresh, isVotingPowerTimestampCurrent, parseDaoVotingPowerSnapshot } from "@/lib/clients/dao/voting-power-snapshot";
import { EPOCH_LENGTH, GENESIS } from "@/lib/constants";
import { INDEX_DEPLOYMENT, INDEX_FROM_BLOCK, INDEX_TOKENS, buildVotingPowerSnapshot, collectVotingCandidates } from "@/scripts/build-dao-voting-power.mjs";
import { zeroAddress } from "viem";

const A = "0x1111111111111111111111111111111111111111";
const B = "0x2222222222222222222222222222222222222222";
const HASH = `0x${"a".repeat(64)}`;
const block = { number: INDEX_FROM_BLOCK + 28n, hash: HASH, timestamp: BigInt(GENESIS) + 10n * BigInt(EPOCH_LENGTH) + 1000n };
function transfer(receiver: string) { return { address: INDEX_TOKENS[0], eventName: "Transfer", args: { sender: zeroAddress, receiver } }; }
const logs = [transfer(A), transfer(INDEX_DEPLOYMENT.delegated), { address: INDEX_DEPLOYMENT.ve, eventName: "Migrate", args: { account: B } }, ...INDEX_TOKENS.map((depositor) => ({ address: INDEX_DEPLOYMENT.aggregator, eventName: "AddComponent", args: { depositor } }))];

function fakeClient() {
  return {
    getChainId: async () => 1,
    getBlockNumber: async () => block.number + 12n,
    getBlock: async () => block,
    getCode: async () => "0x",
    getLogs: async () => logs,
    multicall: async ({ contracts }: { contracts: Array<{ address: string; functionName: string; args: string[] }> }) => contracts.map(({ address, functionName, args }) => {
      const functions: Record<string, string> = { weight_measure: INDEX_DEPLOYMENT.measure, voter: "0x5069BcE8C8e371A45aB113604b128BBdF5Ee5c11", weight_aggregator: INDEX_DEPLOYMENT.aggregator, delegated_staking: INDEX_DEPLOYMENT.delegated, voting_escrow: INDEX_DEPLOYMENT.ve, ybc: INDEX_DEPLOYMENT.ybc };
      if (functionName in functions) return functions[functionName];
      if (functionName !== "weight") throw new Error("Unexpected method");
      const measure = address.toLowerCase() === INDEX_DEPLOYMENT.measure.toLowerCase();
      if (args[0] === A) return measure ? 100n : 80n;
      if (args[0] === B) return measure ? 50n : 0n;
      if (args[0] === INDEX_DEPLOYMENT.ybc.toLowerCase()) return 10n;
      if (args[0].toLowerCase() === INDEX_DEPLOYMENT.delegated.toLowerCase() && measure) return 200n;
      throw new Error("Delegated stake must not also enter the direct total");
    }),
  };
}

describe("exact DAO voting-power index", () => {
  it("includes ve-only holders and counts the delegated pool exactly once", async () => {
    const result = await buildVotingPowerSnapshot(fakeClient());
    expect(result.snapshot.totals).toEqual({ stakedPower: "90", migratedVePower: "70", delegatedPower: "200", totalPower: "360" });
    expect(result.snapshot.accounts.map((entry) => entry.address)).toContain(B);
    expect(result.snapshot.accounts.map((entry) => entry.address)).not.toContain(INDEX_DEPLOYMENT.delegated.toLowerCase());
    expect(parseDaoVotingPowerSnapshot(result.snapshot)).toEqual(result.snapshot);
  });

  it("keeps former holders as candidates and rejects an unknown component", () => {
    const candidates = new Set<string>();
    const components = new Set<string>();
    collectVotingCandidates([transfer(A), { address: INDEX_TOKENS[0], eventName: "Transfer", args: { sender: A, receiver: zeroAddress } }], candidates, components);
    expect([...candidates]).toEqual([A]);
    expect(() => collectVotingCandidates([{ address: INDEX_DEPLOYMENT.aggregator, eventName: "AddComponent", args: { depositor: B } }], candidates, components)).toThrow("unindexed");
  });

  it("rejects incomplete source history, failed reads, and reorgs", async () => {
    await expect(buildVotingPowerSnapshot({ ...fakeClient(), getLogs: async () => [] })).rejects.toThrow("Incomplete");
    await expect(buildVotingPowerSnapshot({ ...fakeClient(), getCode: async () => "0x1234" })).rejects.toThrow("does not precede");
    let reads = 0;
    await expect(buildVotingPowerSnapshot({ ...fakeClient(), getBlock: async () => ({ ...block, hash: ++reads === 1 ? HASH : `0x${"b".repeat(64)}` }) })).rejects.toThrow("replaced");
  });

  it("rejects internally inconsistent, duplicate, and pooled account snapshots", async () => {
    const { snapshot } = await buildVotingPowerSnapshot(fakeClient());
    expect(() => parseDaoVotingPowerSnapshot({ ...snapshot, totals: { ...snapshot.totals, totalPower: "361" } })).toThrow("sum mismatch");
    expect(() => parseDaoVotingPowerSnapshot({ ...snapshot, accounts: [...snapshot.accounts, snapshot.accounts[0]] })).toThrow("Duplicate");
    expect(() => parseDaoVotingPowerSnapshot({ ...snapshot, accounts: [{ ...snapshot.accounts[0], address: INDEX_DEPLOYMENT.delegated }] })).toThrow("pooled");
    expect(() => parseDaoVotingPowerSnapshot({ ...snapshot, coverage: { ...snapshot.coverage, complete: false } })).toThrow();
  });

  it("expires snapshots by both age and epoch even while no request is running", async () => {
    const { snapshot } = await buildVotingPowerSnapshot(fakeClient());
    const parsed = parseDaoVotingPowerSnapshot(snapshot);
    expect(() => assertVotingPowerSnapshotFresh(parsed, parsed.block.timestamp + 300)).not.toThrow();
    expect(() => assertVotingPowerSnapshotFresh(parsed, parsed.block.timestamp + 301)).toThrow("fresh");
    expect(isVotingPowerTimestampCurrent(parsed.block.timestamp, parsed.block.timestamp - 1)).toBe(false);
    const boundary = Number(GENESIS) + 11 * Number(EPOCH_LENGTH);
    expect(isVotingPowerTimestampCurrent(boundary - 1, boundary)).toBe(false);
  });
});
