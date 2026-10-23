"use client";

import { useQuery } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { useIdentity } from "@/state/identity";
import { useProtocol } from "@/state/protocol";
import { useStyfiAccount } from "@/lib/hooks/useStyfi";
import { useVeyfiAccount } from "@/lib/hooks/useVeyfi";
import { useYbcData } from "@/lib/hooks/useYbcData";
import { useDocumentVisibility } from "@/lib/hooks/usePollingGate";
import { getStyfiMockScenario, subscribeStyfiMockScenario } from "@/lib/clients/styfi/scenarios";
import { createMockStyfiVotingPowerFromAccounts, readStyfiVotingPower } from "@/lib/clients/styfi/voting-power";
import { nowSeconds } from "@/lib/mocks/time";

export function useStyfiVotingPower() {
  const scenario = useSyncExternalStore(subscribeStyfiMockScenario, getStyfiMockScenario, getStyfiMockScenario);
  const { address, isConnected, isWrongNetwork, chainId } = useIdentity();
  const { mainnetPublicClient, usesMockBackend } = useProtocol();
  const { data: account } = useStyfiAccount();
  const { data: veyfiAccount } = useVeyfiAccount();
  const isVisible = useDocumentVisibility();
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
  const mock = usesMockBackend && address && account && veyfiAccount
    ? createMockStyfiVotingPowerFromAccounts({
      address, account, veyfiAccount, timestamp: nowSeconds(),
      isYbcMember: scenario === "ybc",
    })
    : null;
  return {
    data: !enabled ? null : usesMockBackend ? mock : query.isError ? null : query.data ?? null,
    isLoading: enabled && (usesMockBackend ? !mock : query.isLoading),
    isConnected: enabled,
    isError: !usesMockBackend && query.isError,
  };
}
