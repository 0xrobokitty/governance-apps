import { describe, expect, it, vi } from "vitest";
import type { PublicClient } from "viem";
import { OnchainStyfiClient } from "@/lib/clients/styfi/onchain";
import { STAKING_MIDDLEWARE } from "@/lib/constants";

const USER = "0x1111111111111111111111111111111111111111" as const;

function createPublicClient(options: {
  readContract: (args: Record<string, unknown>) => Promise<unknown>;
}) {
  const multicall = vi.fn().mockResolvedValue([
    100n,
    50n,
    [0n, 20n, 5n],
    2n,
    25n,
    [0n, 10n, 3n],
    1n,
    0n,
    0n,
  ]);
  const simulateContract = vi.fn().mockResolvedValue({ result: 7n });
  const getBlock = vi.fn().mockResolvedValue({ timestamp: 1_800_000_000n });
  const readContract = vi.fn(options.readContract);

  return {
    multicall,
    simulateContract,
    getBlock,
    readContract,
  } as unknown as PublicClient;
}

describe("OnchainStyfiClient blacklist probing", () => {
  it("reads the deployed middleware's canonical blacklist getter", async () => {
    const publicClient = createPublicClient({
      readContract: async ({ address, functionName }) => {
        if (address === STAKING_MIDDLEWARE && functionName === "blacklist") return true;
        if (functionName === "decimals") return 6;
        throw new Error("unsupported");
      },
    });
    const state = await new OnchainStyfiClient(publicClient, null).getAccountState(USER);
    expect(state.blacklistStatus).toBe("blocked");
    const probes = vi.mocked(publicClient.readContract).mock.calls.filter(([args]) => args.address === STAKING_MIDDLEWARE);
    expect(probes).toHaveLength(1);
    expect(probes[0][0].functionName).toBe("blacklist");
  });

  it("uses middleware fallback probes and maps true blacklist status", async () => {
    const publicClient = createPublicClient({
      readContract: async ({ address, functionName }) => {
        if (address === STAKING_MIDDLEWARE && functionName === "isBlacklisted") {
          return true;
        }
        if (functionName === "decimals") {
          return 18;
        }
        throw new Error("unsupported");
      },
    });

    const client = new OnchainStyfiClient(publicClient, null);
    const state = await client.getAccountState(USER);

    expect(state.isBlacklisted).toBe(true);
    expect(state.blacklistStatus).toBe("blocked");

    const middlewareProbeCalls = vi
      .mocked(publicClient.readContract)
      .mock.calls.filter(([args]) => args.address === STAKING_MIDDLEWARE);
    expect(middlewareProbeCalls.length).toBeGreaterThan(0);
  });

  it("defaults to non-blacklisted when middleware probes are unavailable", async () => {
    const publicClient = createPublicClient({
      readContract: async ({ functionName }) => {
        if (functionName === "decimals") {
          return 18;
        }
        throw new Error("probe not available");
      },
    });

    const client = new OnchainStyfiClient(publicClient, null);
    const state = await client.getAccountState(USER);

    expect(state.isBlacklisted).toBe(false);
    expect(state.blacklistStatus).toBe("unknown");
  });
});
