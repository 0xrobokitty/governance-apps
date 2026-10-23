"use client";

import { useQuery } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { useIdentity } from "@/state/identity";
import { useProtocol } from "@/state/protocol";
import { useStyfiAccount } from "./useStyfi";
import { useVeyfiAccount } from "./useVeyfi";
import { useDocumentVisibility } from "./usePollingGate";
import { fetchStyfiAprSnapshot } from "@/lib/clients/styfi/apr-onchain";
import { createMockStyfiAprSnapshot } from "@/lib/clients/styfi/apr-mock";
import { getStyfiMockScenario, subscribeStyfiMockScenario } from "@/lib/clients/styfi/scenarios";

export const styfiAprKeys = { all: ["styfi", "apr"] as const };

export function useStyfiApr() {
  const scenario = useSyncExternalStore(subscribeStyfiMockScenario, getStyfiMockScenario, getStyfiMockScenario);
  const { address, isConnected, isWrongNetwork } = useIdentity();
  const { mainnetPublicClient, globalData, usesMockBackend } = useProtocol();
  const accountAddress = isConnected && !isWrongNetwork ? address : undefined;
  const account = useStyfiAccount();
  const veyfiAccount = useVeyfiAccount();
  const isVisible = useDocumentVisibility();
  const query = useQuery({
    queryKey: [...styfiAprKeys.all, accountAddress ?? null, globalData?.meta.timestamp ?? null],
    queryFn: () => {
      if (!mainnetPublicClient) throw new Error("APR data is unavailable.");
      return fetchStyfiAprSnapshot(mainnetPublicClient, globalData, accountAddress);
    },
    // Mounted by stYFI surfaces only, including the stYFI subdomain's root path.
    enabled: !usesMockBackend && !!mainnetPublicClient,
    staleTime: 30_000,
    refetchInterval: isVisible ? 30_000 : false,
    refetchOnWindowFocus: true,
    retry: 1,
  });
  if (usesMockBackend) {
    const pending = !!accountAddress && (!account.data || !veyfiAccount.data);
    return {
      data: createMockStyfiAprSnapshot(
        accountAddress && !pending ? account.data : null,
        accountAddress && !pending ? veyfiAccount.data : null,
        scenario,
      ),
      isLoading: pending,
      isError: false,
    };
  }
  return {
    data: query.isError ? null : query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
