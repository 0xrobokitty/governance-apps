"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import { useProtocol } from "@/state/protocol";
import { useTx } from "@/lib/tx/useTx";
import { E2E_MOCK_ADDRESS } from "@/lib/constants";
import { getRefetchOnWindowFocus } from "@/lib/query/focus-refetch-policy";
import { useDocumentVisibility, useIsRouteActive } from "@/lib/hooks/usePollingGate";

export const yethKeys = {
  all: ["yeth"] as const,
  global: () => [...yethKeys.all, "global"] as const,
  account: (address?: string) => [...yethKeys.all, "account", address] as const,
};

export function useYethGlobalState() {
  const { yeth, publicClient, yethUsesMockBackend, yethGlobalData } = useProtocol();
  const canReadGlobal = yethUsesMockBackend || !!publicClient || !!yethGlobalData;

  return useQuery({
    queryKey: yethKeys.global(),
    queryFn: () => yeth.getGlobalState(),
    enabled: canReadGlobal,
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: getRefetchOnWindowFocus("yeth.global"),
  });
}

export function useYethAccountState() {
  const { yeth, publicClient, yethUsesMockBackend } = useProtocol();
  const { address: wagmiAddress } = useAccount();
  const isVisible = useDocumentVisibility();
  const isPollingRoute = useIsRouteActive(["/yeth"]);
  const isE2E = process.env.NEXT_PUBLIC_E2E === "true";
  const address = wagmiAddress ?? (isE2E ? E2E_MOCK_ADDRESS : undefined);
  const shouldPoll = isVisible && isPollingRoute;
  const canReadAccount = yethUsesMockBackend || !!publicClient;

  return useQuery({
    queryKey: yethKeys.account(address),
    queryFn: async () => {
      if (!address) return null;
      return yeth.getAccountState(address);
    },
    enabled: !!address && canReadAccount,
    staleTime: 15_000,
    refetchInterval: shouldPoll ? 15_000 : false,
    refetchOnWindowFocus: getRefetchOnWindowFocus("yeth.account"),
  });
}

export function useYethClaimAndExit() {
  const { yeth, yethUsesMockBackend } = useProtocol();
  const queryClient = useQueryClient();
  const { execute, state } = useTx();
  const { address: wagmiAddress } = useAccount();
  const isE2E = process.env.NEXT_PUBLIC_E2E === "true";
  const address = wagmiAddress ?? (isE2E ? E2E_MOCK_ADDRESS : undefined);

  const write = async () => {
    await execute(async () => {
      const prepare = await yeth.prepareClaimAndExit();
      return prepare();
    }, {
      skipWaitForReceipt: yethUsesMockBackend,
      invalidate: async () => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: yethKeys.global() }),
          queryClient.invalidateQueries({ queryKey: yethKeys.account(address) }),
        ]);
      },
    });
  };

  return { write, state };
}

export function useYethClaimAndStay() {
  const { yeth, yethUsesMockBackend } = useProtocol();
  const queryClient = useQueryClient();
  const { execute, state } = useTx();
  const { address: wagmiAddress } = useAccount();
  const isE2E = process.env.NEXT_PUBLIC_E2E === "true";
  const address = wagmiAddress ?? (isE2E ? E2E_MOCK_ADDRESS : undefined);

  const write = async () => {
    await execute(async () => {
      const prepare = await yeth.prepareClaimAndStay();
      return prepare();
    }, {
      skipWaitForReceipt: yethUsesMockBackend,
      invalidate: async () => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: yethKeys.global() }),
          queryClient.invalidateQueries({ queryKey: yethKeys.account(address) }),
        ]);
      },
    });
  };

  return { write, state };
}

export function useYethRedeemToEth() {
  const { yeth, yethUsesMockBackend } = useProtocol();
  const queryClient = useQueryClient();
  const { execute, state } = useTx();
  const { address: wagmiAddress } = useAccount();
  const isE2E = process.env.NEXT_PUBLIC_E2E === "true";
  const address = wagmiAddress ?? (isE2E ? E2E_MOCK_ADDRESS : undefined);

  const write = async () => {
    await execute(async () => {
      const prepare = await yeth.prepareRedeemToEth();
      return prepare();
    }, {
      skipWaitForReceipt: yethUsesMockBackend,
      invalidate: async () => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: yethKeys.global() }),
          queryClient.invalidateQueries({ queryKey: yethKeys.account(address) }),
        ]);
      },
    });
  };

  return { write, state };
}
