"use client";

import { useQuery } from "@tanstack/react-query";
import { isAddress, type PublicClient } from "viem";
import { mainnet } from "viem/chains";
import {
  resolveVerifiedMainnetEnsIdentities,
  ENS_MAX_ADDRESSES_PER_QUERY,
  type VerifiedEnsIdentities,
} from "@/lib/identity/ens";

const EMPTY_IDENTITIES: VerifiedEnsIdentities = {};

export type EnsIdentityLookup = { identities: VerifiedEnsIdentities; settled: boolean };

export function useEnsIdentityLookup(
  publicClient: PublicClient | null,
  addresses: string[],
  enabled = true
): EnsIdentityLookup {
  const normalizedAddresses = [
    ...new Set(
      addresses.flatMap((address) =>
        isAddress(address) ? [address.toLowerCase()] : []
      )
    ),
  ]
    .sort()
    .slice(0, ENS_MAX_ADDRESSES_PER_QUERY);
  const lookupEnabled = enabled && normalizedAddresses.length > 0 && publicClient?.chain?.id === mainnet.id;
  const query = useQuery({
    queryKey: ["identity", "verified-mainnet-ens", publicClient?.uid ?? null, normalizedAddresses],
    queryFn: () =>
      resolveVerifiedMainnetEnsIdentities(
        publicClient,
        normalizedAddresses
      ),
    enabled: lookupEnabled,
    staleTime: 30 * 60 * 1_000,
    gcTime: 60 * 60 * 1_000,
    retry: false,
  });

  return {
    identities: lookupEnabled && query.isSuccess ? query.data : EMPTY_IDENTITIES,
    settled: lookupEnabled && !query.isPending,
  };
}

export function useEnsIdentities(publicClient: PublicClient | null, addresses: string[], enabled = true): VerifiedEnsIdentities {
  return useEnsIdentityLookup(publicClient, addresses, enabled).identities;
}
