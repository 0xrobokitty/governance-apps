"use client";

import { useQuery } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { useIdentity } from "@/state/identity";
import { useProtocol } from "@/state/protocol";
import { useStyfiAccount } from "@/lib/hooks/useStyfi";
import { useVeyfiAccount } from "@/lib/hooks/useVeyfi";
import { useYbcData } from "@/lib/hooks/useYbcData";
import { useDocumentVisibility, useIsRouteActive } from "@/lib/hooks/usePollingGate";
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
  const isRouteActive = useIsRouteActive(["/styfi"]);
  const enabled = isConnected && !isWrongNetwork && !!address;
  const ybcFeed = useYbcData(enabled && !usesMockBackend && isVisible && isRouteActive);
  const query = useQuery({
    queryKey: ["styfi", "voting-power", usesMockBackend ? "mock" : "onchain", chainId, address, ybcFeed.data?.blockHash ?? null],
    queryFn: () => {
      if (!address || !mainnetPublicClient) throw new Error("Voting power is unavailable.");
      return readStyfiVotingPower({ publicClient: mainnetPublicClient, account: address, ybcFeed: ybcFeed.data });
    },
    enabled: enabled && !usesMockBackend && !!mainnetPublicClient,
    staleTime: 30_000,
    refetchInterval: isVisible && isRouteActive ? 30_000 : false,
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
