import { describe, expect, it, vi } from "vitest";
import type { Address, PublicClient } from "viem";
import feedExample from "@/docs/apps/ybc/onchain-integration-plan/examples/ybc-feed.example.json";
import { YbcFeedSchema } from "@/lib/schemas/ybc-feed";
import { STYFI_GOVERNANCE } from "@/lib/clients/styfi/deployment";
import { createMockDaoVotingPower, createMockStyfiVotingPower, deriveYbcVotingInfluence, readStyfiVotingPower } from "@/lib/clients/styfi/voting-power";

const ACCOUNT = "0x1111111111111111111111111111111111111111" as Address;
const OTHER = "0x2222222222222222222222222222222222222222" as Address;
const REMOVED = "0x3333333333333333333333333333333333333333" as Address;
const DELEGATED = "0x9c42461aa8422926e3aef7b1c6e3743597149d79" as Address;
const ETHER = 10n ** 18n;
const HASH = `0x${"a".repeat(64)}`;
const feed = YbcFeedSchema.parse(feedExample);
const roster = {
  ...feed,
  members: [ACCOUNT, OTHER, REMOVED].map((address, index) => ({
    ...feed.members[0], address, status: index === 2 ? "removed" as const : "active" as const,
    // Deliberately inaccurate feed weights: only the addresses are consumed.
    effectiveWeight: "99999999999999999999999",
  })),
};

function makeClient(options: { member?: boolean; count?: bigint; failPower?: boolean; reorg?: boolean; directPower?: bigint; memberWeight?: bigint } = {}) {
  let blocks = 0;
  const getBlock = vi.fn(async () => {
    blocks += 1;
    return { number: 123n, hash: options.reorg && blocks > 1 ? `0x${"b".repeat(64)}` : HASH, timestamp: 1_800_000_000n };
  });
  const multicall = vi.fn(async ({ contracts }: { contracts: Array<{ address: string; functionName: string; args?: readonly unknown[] }> }) => contracts.map((contract) => {
    const address = contract.address.toLowerCase();
    const account = String(contract.args?.[0]).toLowerCase();
    switch (contract.functionName) {
      case "weight_measure": return STYFI_GOVERNANCE.weightMeasure;
      case "voter": return STYFI_GOVERNANCE.voter;
      case "weight_aggregator": return STYFI_GOVERNANCE.weightAggregator;
      case "delegated_staking": return DELEGATED;
      case "ybc": return feed.deployment.ybc;
      case "ybc_weight_aggregator": return feed.deployment.ybcWeightAggregator;
      case "members": return options.member !== false && (account === ACCOUNT || account === OTHER);
      case "num_members": return options.count ?? 2n;
      case "balanceOf": return 50n * ETHER;
      case "weight": {
        if (options.failPower) throw new Error("RPC failed");
        if (address === STYFI_GOVERNANCE.weightMeasure.toLowerCase()) {
          if (account === ACCOUNT) return options.directPower ?? 100n * ETHER;
          if (account === DELEGATED) return 1_000n * ETHER;
          if (account === feed.deployment.ybc.toLowerCase()) return 100n * ETHER;
        }
        if (address === STYFI_GOVERNANCE.weightAggregator.toLowerCase()) return options.directPower === 0n ? 0n : 80n * ETHER;
        if (address === feed.deployment.ybcWeightAggregator.toLowerCase()) return account === ACCOUNT ? options.memberWeight ?? 20n * ETHER : 80n * ETHER;
        throw new Error(`Unexpected weight ${address} ${account}`);
      }
      default: throw new Error(`Unexpected read ${contract.functionName}`);
    }
  }));
  const client = { chain: { id: 1 }, getChainId: vi.fn(async () => 1), getBlock, multicall } as unknown as PublicClient;
  return { client, multicall, getBlock };
}

describe("stYFI governance voting power", () => {
  it("reads exact direct power and estimates both YBC pools from matured roster weights", async () => {
    const { client, multicall, getBlock } = makeClient();
    const result = await readStyfiVotingPower({ publicClient: client, account: ACCOUNT, ybcFeed: roster });
    expect(result).toMatchObject({
      directPower: 100n * ETHER,
      stakedPower: 80n * ETHER,
      migratedVePower: 20n * ETHER,
      delegatedBalance: 50n * ETHER,
      isYbcMember: true,
      ybcInfluence: { delegatedPower: 200n * ETHER, collectivePower: 20n * ETHER, totalPower: 320n * ETHER, memberShareBps: 2_000n },
    });
    expect(result.directPower).toBe(result.stakedPower + result.migratedVePower);
    for (const [request] of multicall.mock.calls) expect(request).toMatchObject({ blockNumber: 123n, allowFailure: false });
    expect(getBlock).toHaveBeenLastCalledWith({ blockNumber: 123n });
    expect(multicall.mock.calls.flatMap(([request]) => request.contracts).some(({ functionName }) => functionName === "supply" || functionName === "totalSupply")).toBe(false);
  });

  it("does not treat a stYFIx holder's balance as direct or member voting power", async () => {
    const { client } = makeClient({ member: false });
    const result = await readStyfiVotingPower({ publicClient: client, account: ACCOUNT });
    expect(result.directPower).toBe(100n * ETHER);
    expect(result.ybcInfluence?.totalPower).toBe(100n * ETHER);
    expect(result.ybcInfluence?.delegatedPower).toBe(0n);
  });

  it.each([undefined, roster])("retains exact direct power when the roster is missing or incomplete", async (ybcFeed) => {
    const { client } = makeClient({ count: 3n });
    const result = await readStyfiVotingPower({ publicClient: client, account: ACCOUNT, ybcFeed });
    expect(result.directPower).toBe(100n * ETHER);
    expect(result.ybcInfluence).toBeNull();
  });

  it("does not grant pool influence without positive personal power", async () => {
    const { client } = makeClient({ directPower: 0n });
    const result = await readStyfiVotingPower({ publicClient: client, account: ACCOUNT, ybcFeed: roster });
    expect(result.ybcInfluence?.totalPower).toBe(0n);
    expect(result.ybcInfluence?.delegatedPower).toBe(0n);
  });

  it("does not grant pool influence to a new member with zero matured weight", async () => {
    const { client } = makeClient({ memberWeight: 0n });
    const result = await readStyfiVotingPower({ publicClient: client, account: ACCOUNT, ybcFeed: roster });
    expect(result.ybcInfluence?.totalPower).toBe(100n * ETHER);
    expect(result.ybcInfluence?.delegatedPower).toBe(0n);
  });

  it("rejects failed reads instead of reporting zero voting power", async () => {
    const { client } = makeClient({ failPower: true });
    await expect(readStyfiVotingPower({ publicClient: client, account: ACCOUNT })).rejects.toThrow("RPC failed");
  });

  it("rejects a block replacement during the snapshot", async () => {
    const { client } = makeClient({ reorg: true });
    await expect(readStyfiVotingPower({ publicClient: client, account: ACCOUNT })).rejects.toThrow("snapshot changed");
  });
});

describe("DAO mock voting summary", () => {
  const account = { address: ACCOUNT, connected: true, correctChain: true, votingWeight: 100n * ETHER };

  it("uses the DAO fixture's base weight and observation time", () => {
    const result = createMockDaoVotingPower({ account, timestamp: 1_700_000_000, isYbcMember: true });
    expect(result).toMatchObject({ address: ACCOUNT, timestamp: 1_700_000_000, directPower: 100n * ETHER, migratedVePower: 0n });
    expect(result?.ybcInfluence?.totalPower).toBe(310n * ETHER);
  });

  it.each(["connected", "correctChain"] as const)("does not expose another wallet's power when %s is false", (field) => {
    expect(createMockDaoVotingPower({ account: { ...account, [field]: false }, timestamp: 1_700_000_000, isYbcMember: true })).toBeNull();
  });
});

describe("YBC voting influence calculation", () => {
  it("keeps the rounded component rows additive for very large values", () => {
    const directPower = 10n ** 35n;
    const result = deriveYbcVotingInfluence({ directPower, memberWeight: 1n, totalMemberWeight: 3n, delegatedPoolPower: 10n, collectivePoolPower: 11n });
    expect(result.totalPower).toBe(directPower + result.delegatedPower + result.collectivePower);
    expect(result.delegatedPower).toBe(3n);
    expect(result.collectivePower).toBe(3n);
  });

  it("rejects an inconsistent roster denominator", () => {
    expect(() => deriveYbcVotingInfluence({ directPower: 10n, memberWeight: 2n, totalMemberWeight: 1n, delegatedPoolPower: 10n, collectivePoolPower: 10n })).toThrow("complete roster");
  });

  it("provides deterministic member and non-member mock states", () => {
    const input = { address: ACCOUNT, stakedPower: 100n * ETHER, migratedVePower: 10n * ETHER, delegatedBalance: 50n * ETHER };
    const ordinary = createMockStyfiVotingPower(input);
    const member = createMockStyfiVotingPower({ ...input, isYbcMember: true });
    expect(ordinary.directPower).toBe(110n * ETHER);
    expect(ordinary.ybcInfluence?.totalPower).toBe(ordinary.directPower);
    expect(member.ybcInfluence?.totalPower).toBe(320n * ETHER);
    expect(createMockStyfiVotingPower({ ...input, isYbcMember: true })).toEqual(member);
  });
});
