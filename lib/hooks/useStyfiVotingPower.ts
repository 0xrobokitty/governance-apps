"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useIdentity } from "@/state/identity";
import { useProtocol } from "@/state/protocol";
import { useStyfiAccount } from "@/lib/hooks/useStyfi";
import { useVeyfiAccount } from "@/lib/hooks/useVeyfi";
import { useYbcData } from "@/lib/hooks/useYbcData";
import { useDocumentVisibility } from "@/lib/hooks/usePollingGate";
import { getStyfiMockScenario, subscribeStyfiMockScenario } from "@/lib/clients/styfi/scenarios";
import { createMockStyfiVotingPowerFromAccounts, readIndexedVotingPower, readStyfiVotingPower } from "@/lib/clients/styfi/voting-power";
import { fetchDaoVotingPowerSnapshot, isVotingPowerTimestampCurrent } from "@/lib/clients/dao/voting-power-snapshot";
import { nowSeconds } from "@/lib/mocks/time";

export function useStyfiVotingPower() {
  const scenario = useSyncExternalStore(subscribeStyfiMockScenario, getStyfiMockScenario, getStyfiMockScenario);
  const { address, isConnected, isWrongNetwork, chainId } = useIdentity();
  const { mainnetPublicClient, usesMockBackend } = useProtocol();
  const { data: account } = useStyfiAccount();
  const { data: veyfiAccount } = useVeyfiAccount();
  const isVisible = useDocumentVisibility();
  const [clock, setClock] = useState(() => Math.floor(Date.now() / 1_000));
  useEffect(() => {
    const interval = window.setInterval(() => setClock(Math.floor(Date.now() / 1_000)), 1_000);
    return () => window.clearInterval(interval);
  }, []);
  // Mounted only on the DAO board, including its rewritten subdomain root.
  // Component lifetime gates route polling without relying on the public URL.
  const enabled = isConnected && !isWrongNetwork && !!address;
  const ybcFeed = useYbcData(enabled && !usesMockBackend && isVisible);
  const query = useQuery({
    queryKey: ["styfi", "voting-power", usesMockBackend ? "mock" : "onchain", chainId, address, ybcFeed.data?.blockHash ?? null],
    queryFn: () => {
      if (!address || !mainnetPublicClient) throw new Error("Voting power is unavailable.");
      return readStyfiVotingPower({ publicClient: mainnetPublicClient, account: address, ybcFeed: ybcFeed.data });
    },
    enabled: enabled && !usesMockBackend && !!mainnetPublicClient && isVisible,
    staleTime: 30_000,
    refetchInterval: isVisible ? 30_000 : false,
    retry: 1,
  });
  const snapshotUrl = process.env.NEXT_PUBLIC_DAO_VOTING_POWER_URL;
  const indexed = useQuery({
    queryKey: ["styfi", "voting-power", "system", chainId, address, snapshotUrl, ybcFeed.data?.blockHash ?? null],
    queryFn: async () => {
      if (!snapshotUrl || !address || !mainnetPublicClient) throw new Error("The system voting-power snapshot is unavailable.");
      const snapshot = await fetchDaoVotingPowerSnapshot("/api/dao-voting-power");
      return readIndexedVotingPower({ publicClient: mainnetPublicClient, account: address, snapshot, ybcFeed: ybcFeed.data });
    },
    enabled: enabled && !usesMockBackend && !!snapshotUrl && !!mainnetPublicClient && isVisible,
    staleTime: 30_000,
    refetchInterval: isVisible ? 60_000 : false,
    retry: false,
  });
  const mock = usesMockBackend && address && account && veyfiAccount
    ? createMockStyfiVotingPowerFromAccounts({
      address, account, veyfiAccount, timestamp: nowSeconds(),
      isYbcMember: scenario === "ybc",
    })
    : null;
  return {
    // The indexed result includes personal and pooled reads at the total's block.
    // Never divide a newer personal weight by an older system denominator.
    data: !enabled ? null : usesMockBackend ? mock : (!indexed.isError && indexed.data && isVotingPowerTimestampCurrent(indexed.data.timestamp, clock) ? indexed.data : null) ?? (query.isError ? null : query.data ?? null),
    isLoading: enabled && (usesMockBackend ? !mock : query.isLoading),
    isConnected: enabled,
    isError: !usesMockBackend && query.isError,
    isSystemLoading: enabled && !usesMockBackend && !!snapshotUrl && indexed.isLoading,
  };
}
