"use client";

import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { useEffect } from "react";
import { useAccount } from "wagmi";
import { useProtocol } from "@/state/protocol";
import { getRefetchOnWindowFocus } from "@/lib/query/focus-refetch-policy";
import { styfiKeys } from "@/lib/hooks/useStyfi";
import { useDocumentVisibility, useIsRouteActive } from "@/lib/hooks/usePollingGate";
import {
  LlyfiTokenId,
  type LlyfiTokenState,
  type VeyfiClient,
} from "@/lib/clients/veyfi";
import { useTx } from "@/lib/tx/useTx";
import { E2E_MOCK_ADDRESS, LIQUID_LOCKERS } from "@/lib/constants";
import { normalizeLlyfiSymbol } from "@/lib/clients/veyfi/display";

function toNumber(value?: string | number | null) {
  if (value === null || value === undefined) return null;
  const numeric = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(numeric) ? numeric : null;
}

function toBigInt(value?: string | number | null, fallback = 0n) {
  if (value === null || value === undefined) return fallback;
  try {
    return BigInt(value);
  } catch {
    return fallback;
  }
}

// --- Query Keys ---
export const veyfiKeys = {
  all: ["veyfi"] as const,
  account: (address?: string) =>
    [...veyfiKeys.all, "account", address] as const,
  stats: () => [...veyfiKeys.all, "stats"] as const,
  statsOverride: () => [...veyfiKeys.all, "statsOverride"] as const,
};

const VEYFI_STATS_OVERRIDE_MAX_MS = 10 * 60_000;

function setVeyfiStatsOverride(queryClient: QueryClient) {
  queryClient.setQueryData(veyfiKeys.statsOverride(), Date.now());
}

async function refreshVeyfiStatsFromChain(
  veyfi: VeyfiClient,
  queryClient: QueryClient
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["styfi", "apr"] }),
    queryClient.invalidateQueries({ queryKey: ["styfi", "voting-power"] }),
  ]);
  if (veyfi.getGlobalStatsFromChain) {
    try {
      const stats = await veyfi.getGlobalStatsFromChain();
      queryClient.setQueriesData({ queryKey: veyfiKeys.stats() }, stats);
      setVeyfiStatsOverride(queryClient);
      return;
    } catch (error) {
      console.warn("Failed to refresh veYFI stats from chain", error);
    }
  }

  await queryClient.invalidateQueries({ queryKey: veyfiKeys.stats() });
}

function toMsTimestamp(value: number | null | undefined) {
  if (value === null || value === undefined) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
}

// --- Read Hooks ---

export function useVeyfiAccount() {
  const { veyfi, publicClient, usesMockBackend } = useProtocol();
  const { address: wagmiAddress } = useAccount();
  const isVisible = useDocumentVisibility();
  const isPollingRoute = useIsRouteActive(["/veyfi"]);
  const isE2E = process.env.NEXT_PUBLIC_E2E === "true";
  const address =
    wagmiAddress ?? (isE2E && usesMockBackend ? E2E_MOCK_ADDRESS : undefined);
  const isEnabled = !!address && (usesMockBackend || !!publicClient);
  const shouldPoll = isVisible && isPollingRoute;

  return useQuery({
    queryKey: veyfiKeys.account(address),
    queryFn: async () => {
      if (!address) return null;
      return veyfi.getAccountState(address);
    },
    enabled: isEnabled,
    // Poll every 30s to update caps, inventory, and token status
    refetchInterval: shouldPoll ? 30_000 : false,
    refetchOnWindowFocus: getRefetchOnWindowFocus("veyfi.account"),
    staleTime: 20_000,
  });
}

export function useVeyfiStats() {
  const { veyfi, publicClient, usesMockBackend, globalData } = useProtocol();
  const queryClient = useQueryClient();
  const connected = usesMockBackend || !!publicClient;
  const globalVersion = globalData?.meta?.timestamp ?? null;
  const chainId = publicClient?.chain?.id ?? null;
  const hasStatsSource = usesMockBackend || !!globalData || !!publicClient;
  const hasOnchainStats = !!veyfi.getGlobalStatsFromChain;
  const { data: overrideSince = 0 } = useQuery({
    queryKey: veyfiKeys.statsOverride(),
    queryFn: async () => 0,
    initialData: 0,
    staleTime: Infinity,
    refetchOnWindowFocus: getRefetchOnWindowFocus("veyfi.statsOverride"),
  });
  const globalTimestampMs = toMsTimestamp(globalVersion);
  const hasFreshGlobal =
    globalTimestampMs !== null && globalTimestampMs >= overrideSince;

  useEffect(() => {
    if (!overrideSince) return;
    const id = setTimeout(() => {
      queryClient.setQueryData(veyfiKeys.statsOverride(), 0);
      queryClient.invalidateQueries({ queryKey: veyfiKeys.stats() });
    }, VEYFI_STATS_OVERRIDE_MAX_MS);
    return () => clearTimeout(id);
  }, [overrideSince, queryClient]);

  useEffect(() => {
    if (overrideSince > 0 && hasFreshGlobal) {
      queryClient.setQueryData(veyfiKeys.statsOverride(), 0);
    }
  }, [overrideSince, hasFreshGlobal, queryClient]);

  const preferOnchain = connected && hasOnchainStats;

  return useQuery({
    queryKey: [...veyfiKeys.stats(), connected, globalVersion, chainId] as const,
    queryFn: () =>
      preferOnchain && veyfi.getGlobalStatsFromChain
        ? veyfi.getGlobalStatsFromChain()
        : veyfi.getGlobalStats(),
    // Global stats (Migration %, Boost)
    enabled: hasStatsSource,
    refetchInterval: 60_000,
    staleTime: 60_000,
  });
}

/**
 * Selector hook for LLYFI tokens (Balances & Metadata)
 */
export function useLlyfiTokens() {
  const { data } = useVeyfiAccount();
  const { globalData } = useProtocol();
  const redemptionEnabledMap = globalData?.global?.veyfi?.tokens
    ? new Map(
        globalData.global.veyfi.tokens.map((token) => [
          normalizeLlyfiSymbol(token.symbol),
          token.redemption.enabled,
        ])
      )
    : null;

  if (data?.llyfiTokens?.length) {
    if (!redemptionEnabledMap) return data.llyfiTokens;
    return data.llyfiTokens.map((token) => {
      const enabled = redemptionEnabledMap.get(token.symbol);
      if (enabled === undefined || enabled === token.redemption.enabled) {
        return token;
      }
      return {
        ...token,
        redemption: {
          ...token.redemption,
          enabled,
        },
      };
    });
  }
  if (!globalData?.global?.veyfi || !globalData?.llyfi) return [];

  const feeBps = toNumber(globalData.global.veyfi.inventory.feeBps) ?? 0;
  const fee = BigInt(Math.trunc(feeBps)) * 10n ** 14n;
  const maxBoostBps = toNumber(globalData.global.maxBoostBps) ?? 0;
  const maxBoost = maxBoostBps > 0 ? maxBoostBps / 10000 : 1;

  const redemptionMap = new Map(
    globalData.global.veyfi.tokens.map((token) => [
      normalizeLlyfiSymbol(token.symbol),
      token.redemption,
    ])
  );
  const llyfiMap = new Map(
    globalData.llyfi.map((token) => [normalizeLlyfiSymbol(token.symbol), token])
  );

  return LIQUID_LOCKERS.map((locker) => {
    const redemption = redemptionMap.get(locker.symbol);
    const llyfi = llyfiMap.get(locker.symbol);
    const capacity = redemption
      ? toBigInt(redemption.capacity, locker.capacity)
      : locker.capacity;
    const used = redemption ? toBigInt(redemption.used) : 0n;
    const inventory = redemption ? toBigInt(redemption.inventory) : 0n;
    const enabled = redemption?.enabled ?? true;
    const stakedYfi = llyfi
      ? toBigInt(llyfi.staked) + toBigInt(llyfi.unstaking)
      : 0n;

    return {
      symbol: locker.symbol,
      name: locker.name,
      address: locker.token,
      depositorAddress: locker.depositor,
      walletBalance: 0n,
      stakedBalance: 0n,
      cooldownBalance: 0n,
      withdrawable: 0n,
      cooldown: null,
      allowance: 0n,
      redemptionAllowance: 0n,
      lockedYfi: capacity,
      veyfiBoost: maxBoost,
      totalSupply: 0n,
      stakedAssets: stakedYfi * locker.scale,
      depositorTotalSupply: stakedYfi,
      depositorCapacity: capacity,
      exchangeRate: locker.scale,
      redemption: {
        enabled,
        capacity,
        used,
        inventory,
        fee,
      },
    } satisfies LlyfiTokenState;
  });
}

/**
 * Selector hook for Protocol Inventory availability
 */
export function useVeyfiInventory() {
  const { data } = useVeyfiAccount();
  return data?.inventory ?? null;
}

// --- Write Hooks ---

export function useVeyfiMigration() {
  const { veyfi, usesMockBackend } = useProtocol();
  const { execute, state } = useTx();
  const queryClient = useQueryClient();
  const { address: wagmiAddress } = useAccount();
  const isE2E = process.env.NEXT_PUBLIC_E2E === "true";
  const address =
    wagmiAddress ?? (isE2E && usesMockBackend ? E2E_MOCK_ADDRESS : undefined);

  const write = async () => {
    const prepare = await veyfi.prepareMigrateVeYfi();

    await execute(prepare, {
      invalidate: async () => {
        // Invalidate Account State (to update card to "Migrated" state)
        await queryClient.invalidateQueries({
          queryKey: veyfiKeys.account(address),
        });
        // Refresh Global Stats (to update "Migrated veYFI" top bar)
        await refreshVeyfiStatsFromChain(veyfi, queryClient);
      },
      skipWaitForReceipt: usesMockBackend,
    });
  };

  return { write, state };
}

export function useLlyfiStake() {
  const { veyfi, usesMockBackend } = useProtocol();
  const { execute, state } = useTx();
  const queryClient = useQueryClient();
  const { address: wagmiAddress } = useAccount();
  const isE2E = process.env.NEXT_PUBLIC_E2E === "true";
  const address =
    wagmiAddress ?? (isE2E && usesMockBackend ? E2E_MOCK_ADDRESS : undefined);

  const write = async (symbol: LlyfiTokenId, amount: bigint) => {
    const prepare = await veyfi.prepareStakeLlyfi(symbol, amount);

    await execute(prepare, {
      invalidate: async () => {
        await queryClient.invalidateQueries({
          queryKey: veyfiKeys.account(address),
        });
        await refreshVeyfiStatsFromChain(veyfi, queryClient);
      },
      skipWaitForReceipt: usesMockBackend,
    });
  };

  return { write, state };
}

export function useLlyfiStartCooldown() {
  const { veyfi, usesMockBackend } = useProtocol();
  const { execute, state } = useTx();
  const queryClient = useQueryClient();
  const { address: wagmiAddress } = useAccount();
  const isE2E = process.env.NEXT_PUBLIC_E2E === "true";
  const address =
    wagmiAddress ?? (isE2E && usesMockBackend ? E2E_MOCK_ADDRESS : undefined);

  const write = async (symbol: LlyfiTokenId, amount: bigint) => {
    const prepare = await veyfi.prepareStartCooldownLlyfi(symbol, amount);

    await execute(prepare, {
      invalidate: async () => {
        await queryClient.invalidateQueries({
          queryKey: veyfiKeys.account(address),
        });
        await refreshVeyfiStatsFromChain(veyfi, queryClient);
      },
      skipWaitForReceipt: usesMockBackend,
    });
  };

  return { write, state };
}

export function useLlyfiWithdraw() {
  const { veyfi, usesMockBackend } = useProtocol();
  const { execute, state } = useTx();
  const queryClient = useQueryClient();
  const { address: wagmiAddress } = useAccount();
  const isE2E = process.env.NEXT_PUBLIC_E2E === "true";
  const address =
    wagmiAddress ?? (isE2E && usesMockBackend ? E2E_MOCK_ADDRESS : undefined);

  const write = async (symbol: LlyfiTokenId) => {
    const prepare = await veyfi.prepareWithdrawLlyfi(symbol);

    await execute(prepare, {
      invalidate: async () => {
        await queryClient.invalidateQueries({
          queryKey: veyfiKeys.account(address),
        });
        await refreshVeyfiStatsFromChain(veyfi, queryClient);
      },
      skipWaitForReceipt: usesMockBackend,
    });
  };

  return { write, state };
}

export function useLlyfiRedeem() {
  const { veyfi, usesMockBackend } = useProtocol();
  const { execute, state } = useTx();
  const queryClient = useQueryClient();
  const { address: wagmiAddress } = useAccount();
  const isE2E = process.env.NEXT_PUBLIC_E2E === "true";
  const address =
    wagmiAddress ?? (isE2E && usesMockBackend ? E2E_MOCK_ADDRESS : undefined);

  const write = async (symbol: LlyfiTokenId, amount: bigint) => {
    const prepare = await veyfi.prepareRedeemLlyfi(symbol, amount);

    await execute(prepare, {
      invalidate: async () => {
        await queryClient.invalidateQueries({
          queryKey: styfiKeys.account(address),
        });
        await queryClient.invalidateQueries({
          queryKey: veyfiKeys.account(address),
        });
        await refreshVeyfiStatsFromChain(veyfi, queryClient);
      },
      skipWaitForReceipt: usesMockBackend,
    });
  };

  return { write, state };
}

export function useLlyfiMint() {
  const { veyfi, usesMockBackend } = useProtocol();
  const { execute, state } = useTx();
  const queryClient = useQueryClient();
  const { address: wagmiAddress } = useAccount();
  const isE2E = process.env.NEXT_PUBLIC_E2E === "true";
  const address =
    wagmiAddress ?? (isE2E && usesMockBackend ? E2E_MOCK_ADDRESS : undefined);

  const write = async (symbol: LlyfiTokenId, amount: bigint) => {
    const prepare = await veyfi.prepareMintLlyfi(symbol, amount);

    await execute(prepare, {
      invalidate: async () => {
        await queryClient.invalidateQueries({
          queryKey: styfiKeys.account(address),
        });
        await queryClient.invalidateQueries({
          queryKey: veyfiKeys.account(address),
        });
        await refreshVeyfiStatsFromChain(veyfi, queryClient);
      },
      skipWaitForReceipt: usesMockBackend,
    });
  };

  return { write, state };
}
