// lib/hooks/useStyfi.ts
"use client";

import { useCallback, useEffect } from "react";
import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { useAccount } from "wagmi";
import { useProtocol } from "@/state/protocol";
import { StyfiStakeMode, type StyfiClient } from "@/lib/clients/styfi";
import { useTx } from "@/lib/tx/useTx";
import { E2E_MOCK_ADDRESS } from "@/lib/constants";
import { formatPercent } from "@/lib/format";
import { getRefetchOnWindowFocus } from "@/lib/query/focus-refetch-policy";
import { useDocumentVisibility, useIsRouteActive } from "@/lib/hooks/usePollingGate";
import {
  getEpochWindowFromBase,
  resolveEpochClockBase,
} from "@/lib/epochClock";

function toNumber(value?: string | number | null) {
  if (value === null || value === undefined) return null;
  const numeric = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(numeric) ? numeric : null;
}

function toBigInt(value?: string | number | null) {
  if (value === null || value === undefined) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

const REWARD_PPS_SCALE = 10n ** 18n;
const STYFI_STATS_OVERRIDE_MAX_MS = 10 * 60_000;

// --- Query Keys ---
export const styfiKeys = {
  all: ["styfi"] as const,
  account: (address?: string) =>
    [...styfiKeys.all, "account", address] as const,
  epoch: () => [...styfiKeys.all, "epoch"] as const,
  apy: () => [...styfiKeys.all, "apy"] as const,
  stats: () => [...styfiKeys.all, "stats"] as const,
  statsOverride: () => [...styfiKeys.all, "statsOverride"] as const,
};

function setStyfiStatsOverride(queryClient: QueryClient) {
  queryClient.setQueryData(styfiKeys.statsOverride(), Date.now());
}

async function refreshStyfiStatsFromChain(
  styfi: StyfiClient,
  queryClient: QueryClient
) {
  if (styfi.getStatsFromChain) {
    try {
      const stats = await styfi.getStatsFromChain();
      queryClient.setQueriesData({ queryKey: styfiKeys.stats() }, stats);
      setStyfiStatsOverride(queryClient);
      return;
    } catch (error) {
      console.warn("Failed to refresh stYFI stats from chain", error);
    }
  }

  await queryClient.invalidateQueries({ queryKey: styfiKeys.stats() });
}

function toMsTimestamp(value: number | null | undefined) {
  if (value === null || value === undefined) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
}

// --- Read Hooks ---

export function useStyfiAccount() {
  const { styfi, publicClient, usesMockBackend } = useProtocol();
  const { address: wagmiAddress } = useAccount();
  const isVisible = useDocumentVisibility();
  const isPollingRoute = useIsRouteActive(["/styfi", "/veyfi"]);
  const isE2E = process.env.NEXT_PUBLIC_E2E === "true";
  const address =
    wagmiAddress ?? (isE2E && usesMockBackend ? E2E_MOCK_ADDRESS : undefined);
  const isEnabled = !!address && (usesMockBackend || !!publicClient);
  const shouldPoll = isVisible && isPollingRoute;

  return useQuery({
    queryKey: styfiKeys.account(address),
    queryFn: async () => {
      if (!address) return null;
      return styfi.getAccountState(address);
    },
    enabled: isEnabled,
    // Poll every 30s to update rewards/balances
    refetchInterval: shouldPoll ? 30_000 : false,
    // Always refetch when user returns to tab
    refetchOnWindowFocus: getRefetchOnWindowFocus("styfi.account"),
    // Data is considered fresh for 20s, allowing immediate re-use but ensuring background updates
    staleTime: 20_000,
  });
}

export function useStyfiEpoch() {
  const { publicClient, globalData } = useProtocol();

  return useQuery({
    queryKey: styfiKeys.epoch(),
    queryFn: async () => {
      const base = await resolveEpochClockBase({ publicClient, globalData });
      const { currentEpoch, epochEnd } = getEpochWindowFromBase(base);
      return {
        currentEpoch,
        epochEnd,
        nextEpochStart: epochEnd,
      };
    },
    // Epochs are very stable (14 days), but we poll gently to catch transitions
    refetchInterval: 60_000,
    staleTime: 60_000,
  });
}

export function useStyfiApy() {
  const { styfi, globalData, usesMockBackend } = useProtocol();
  const globalVersion = globalData?.meta?.timestamp ?? null;
  const hasApySource = usesMockBackend || !!globalData;

  return useQuery({
    queryKey: [...styfiKeys.apy(), globalVersion] as const,
    queryFn: () => styfi.getApy(),
    // APY changes slowly
    enabled: hasApySource,
    refetchInterval: 60_000,
    staleTime: 60_000,
  });
}

export function useStyfiStats() {
  const { styfi, globalData, publicClient, usesMockBackend } = useProtocol();
  const queryClient = useQueryClient();
  const globalVersion = globalData?.meta?.timestamp ?? null;
  const connected = usesMockBackend || !!publicClient;
  const chainId = publicClient?.chain?.id ?? null;
  const hasStatsSource = usesMockBackend || !!globalData || !!publicClient;
  const hasOnchainStats = !!styfi.getStatsFromChain;
  const { data: overrideSince = 0 } = useQuery({
    queryKey: styfiKeys.statsOverride(),
    queryFn: async () => 0,
    initialData: 0,
    staleTime: Infinity,
    refetchOnWindowFocus: getRefetchOnWindowFocus("styfi.statsOverride"),
  });
  const globalTimestampMs = toMsTimestamp(globalVersion);
  const hasFreshGlobal =
    globalTimestampMs !== null && globalTimestampMs >= overrideSince;

  useEffect(() => {
    if (!overrideSince) return;
    const id = setTimeout(() => {
      queryClient.setQueryData(styfiKeys.statsOverride(), 0);
      queryClient.invalidateQueries({ queryKey: styfiKeys.stats() });
    }, STYFI_STATS_OVERRIDE_MAX_MS);
    return () => clearTimeout(id);
  }, [overrideSince, queryClient]);

  useEffect(() => {
    if (overrideSince > 0 && hasFreshGlobal) {
      queryClient.setQueryData(styfiKeys.statsOverride(), 0);
    }
  }, [overrideSince, hasFreshGlobal, queryClient]);

  const preferOnchain = connected && hasOnchainStats;

  return useQuery({
    queryKey: [...styfiKeys.stats(), globalVersion, connected, chainId] as const,
    queryFn: () =>
      preferOnchain && styfi.getStatsFromChain
        ? styfi.getStatsFromChain()
        : styfi.getStats(),
    // Global stats (TVL/Supply)
    enabled: hasStatsSource,
    refetchInterval: 60_000,
    staleTime: 60_000,
  });
}

export function useRewardTokenInfo() {
  const { globalData } = useProtocol();
  const rewards = globalData?.global?.rewards;
  const pps = toBigInt(rewards?.pps);
  const apyBps = toNumber(rewards?.apyBps);
  const apy = apyBps === null ? null : formatPercent(apyBps / 10000);

  const convertBalanceToUsd = useCallback(
    (balance: bigint) => {
      if (pps === null) return null;
      return (balance * pps) / REWARD_PPS_SCALE;
    },
    [pps]
  );

  return { apy, apyBps, pps, convertBalanceToUsd };
}

// --- Write Hooks ---

export function useStyfiStake() {
  const { styfi, usesMockBackend } = useProtocol();
  const { execute, state } = useTx();
  const queryClient = useQueryClient();
  const { address: wagmiAddress } = useAccount();
  const isE2E = process.env.NEXT_PUBLIC_E2E === "true";
  const address =
    wagmiAddress ?? (isE2E && usesMockBackend ? E2E_MOCK_ADDRESS : undefined);

  const write = async (mode: StyfiStakeMode, amount: bigint) => {
    const prepare = await styfi.prepareStake(mode, amount);

    await execute(prepare, {
      invalidate: async () => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["styfi", "apr"] }),
          queryClient.invalidateQueries({ queryKey: ["styfi", "voting-power"] }),
        ]);
        await queryClient.invalidateQueries({
          queryKey: styfiKeys.account(address),
        });
        await refreshStyfiStatsFromChain(styfi, queryClient);
      },
      skipWaitForReceipt: usesMockBackend,
    });
  };

  return { write, state };
}

export function useStyfiStartCooldown() {
  const { styfi, usesMockBackend } = useProtocol();
  const { execute, state } = useTx();
  const queryClient = useQueryClient();
  const { address: wagmiAddress } = useAccount();
  const isE2E = process.env.NEXT_PUBLIC_E2E === "true";
  const address =
    wagmiAddress ?? (isE2E && usesMockBackend ? E2E_MOCK_ADDRESS : undefined);

  const write = async (mode: StyfiStakeMode, amount: bigint) => {
    const prepare = await styfi.prepareStartCooldown(mode, amount);

    await execute(prepare, {
      invalidate: async () => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["styfi", "apr"] }),
          queryClient.invalidateQueries({ queryKey: ["styfi", "voting-power"] }),
        ]);
        await queryClient.invalidateQueries({
          queryKey: styfiKeys.account(address),
        });
        await refreshStyfiStatsFromChain(styfi, queryClient);
      },
      skipWaitForReceipt: usesMockBackend,
    });
  };

  return { write, state };
}

export function useStyfiWithdraw() {
  const { styfi, usesMockBackend } = useProtocol();
  const { execute, state } = useTx();
  const queryClient = useQueryClient();
  const { address: wagmiAddress } = useAccount();
  const isE2E = process.env.NEXT_PUBLIC_E2E === "true";
  const address =
    wagmiAddress ?? (isE2E && usesMockBackend ? E2E_MOCK_ADDRESS : undefined);

  const write = async (mode: StyfiStakeMode) => {
    const prepare = await styfi.prepareWithdraw(mode);

    await execute(prepare, {
      invalidate: async () => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["styfi", "apr"] }),
          queryClient.invalidateQueries({ queryKey: ["styfi", "voting-power"] }),
        ]);
        await queryClient.invalidateQueries({
          queryKey: styfiKeys.account(address),
        });
        await refreshStyfiStatsFromChain(styfi, queryClient);
      },
      skipWaitForReceipt: usesMockBackend,
    });
  };

  return { write, state };
}

export function useStyfiClaimRewards() {
  const { styfi, usesMockBackend } = useProtocol();
  const { execute, state } = useTx();
  const queryClient = useQueryClient();
  const { address: wagmiAddress } = useAccount();
  const isE2E = process.env.NEXT_PUBLIC_E2E === "true";
  const address =
    wagmiAddress ?? (isE2E && usesMockBackend ? E2E_MOCK_ADDRESS : undefined);

  const write = async () => {
    const prepare = await styfi.prepareClaimRewards();

    await execute(prepare, {
      invalidate: async () => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["styfi", "apr"] }),
          queryClient.invalidateQueries({ queryKey: ["styfi", "voting-power"] }),
        ]);
        await queryClient.invalidateQueries({
          queryKey: styfiKeys.account(address),
        });
      },
      skipWaitForReceipt: usesMockBackend,
    });
  };

  return { write, state };
}
