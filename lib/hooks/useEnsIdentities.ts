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

export function useEnsIdentities(
  publicClient: PublicClient | null,
  addresses: string[],
  enabled = true
): VerifiedEnsIdentities {
  const normalizedAddresses = [
    ...new Set(
      addresses.flatMap((address) =>
        isAddress(address) ? [address.toLowerCase()] : []
      )
    ),
  ]
    .sort()
    .slice(0, ENS_MAX_ADDRESSES_PER_QUERY);
  const query = useQuery({
    queryKey: ["identity", "verified-mainnet-ens", normalizedAddresses],
    queryFn: () =>
      resolveVerifiedMainnetEnsIdentities(
        publicClient,
        normalizedAddresses
      ),
    enabled:
      enabled &&
      normalizedAddresses.length > 0 &&
      publicClient?.chain?.id === mainnet.id,
    staleTime: 30 * 60 * 1_000,
    gcTime: 60 * 60 * 1_000,
    retry: false,
  });

  return query.data ?? EMPTY_IDENTITIES;
}
