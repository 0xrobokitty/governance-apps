import { describe, expect, it, vi } from "vitest";
import type { PublicClient } from "viem";
import { OnchainVeyfiClient } from "@/lib/clients/veyfi/onchain";
import { EPOCH_LENGTH, GENESIS, LIQUID_LOCKERS } from "@/lib/constants";
const address = "0x1111111111111111111111111111111111111111";
const timestamp = GENESIS + 2n * BigInt(EPOCH_LENGTH);
function fixture() {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const read = ({ functionName }: { functionName: string }) => {
    switch (functionName) {
      case "locked": return [20n, timestamp + 1n];
      case "check_lock": return [20n, 0n];
      case "locks": return { amount: 20n, boost_epochs: 104n, unlock_time: timestamp + 1n };
      case "last_claimed": return 0n;
      case "streams": return [0n, 10n, 2n];
      case "fee": case "used": return 0n;
      case "capacity": case "capacities": return 1000n;
      default: return 5n;
    }
  };
  const rpc = {
    multicall: vi.fn(async ({ contracts }: { contracts: Array<{ functionName: string }> }) => { await gate; return contracts.map(read); }),
    getBlock: vi.fn(async () => { await gate; return { timestamp }; }),
    readContract: vi.fn(async () => { await gate; return { slope: 1n, weight: 1n }; }),
  };
  return { rpc, release, client: new OnchainVeyfiClient(rpc as unknown as PublicClient, null) };
}
describe("veYFI independent reads", () => {
  it("starts account, legacy position, and time reads together", async () => {
    const { client, rpc, release } = fixture();
    const pending = client.getAccountState(address);
    expect(rpc.multicall).toHaveBeenCalledTimes(2);
    expect(rpc.getBlock).toHaveBeenCalledOnce();
    release();
    const result = await pending;
    expect(result.veYfi?.migrationEligible).toBe(true);
    expect(result.llyfiTokens).toHaveLength(LIQUID_LOCKERS.length);
    expect(result.llyfiTokens[0].walletBalance).toBe(5n);
  });
  it("starts both nudge batches without waiting for either", async () => {
    const { client, rpc, release } = fixture();
    const pending = client.getNudgeState(address);
    expect(rpc.multicall).toHaveBeenCalledTimes(2);
    release();
    expect((await pending).migrationEligible).toBe(true);
  });
  it("reads static global totals while resolving the epoch", async () => {
    const { client, rpc, release } = fixture();
    const pending = client.getGlobalStatsFromChain();
    expect(rpc.multicall).toHaveBeenCalledOnce();
    expect(rpc.getBlock).toHaveBeenCalledOnce();
    expect(rpc.readContract).not.toHaveBeenCalled();
    release();
    const result = await pending;
    expect(result.tokens).toHaveLength(LIQUID_LOCKERS.length);
    expect(rpc.readContract).toHaveBeenCalledWith(expect.objectContaining({ functionName: "total_weights", args: [2n] }));
  });
});
