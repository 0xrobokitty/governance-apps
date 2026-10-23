import { isAddress } from "viem";
import type { VerifiedEnsIdentities } from "./ens";
import { normalizeEnsDisplayName } from "./ens";
import {
  buildAddressGeneratedLabels,
  getAddressPseudonym,
  normalizeAddressAlias,
  type AddressAliases,
} from "./aliases";

export type AddressIdentitySource = "local" | "ens" | "default" | "generated";

export type DisplayAddressIdentity = {
  address: string;
  label: string;
  source: AddressIdentitySource;
};

export type AddressIdentityMap = Record<string, DisplayAddressIdentity>;

type IdentityRecord = { address: string; ens?: string | null };

export type BuildAddressIdentityMapOptions = {
  aliases?: AddressAliases;
  trustRecordEns?: boolean;
  verifiedEns?: VerifiedEnsIdentities;
  visibleAddresses?: string[];
  defaultLabels?: Record<string, string>;
};

export function buildAddressIdentityMap(
  members: IdentityRecord[],
  operators: IdentityRecord[] = [],
  {
    aliases = {},
    trustRecordEns = true,
    verifiedEns = {},
    visibleAddresses = [],
    defaultLabels = {},
  }: BuildAddressIdentityMapOptions = {}
): AddressIdentityMap {
  const recordsByAddress = new Map<string, IdentityRecord>();
  for (const address of [
    ...visibleAddresses,
    ...Object.keys(verifiedEns),
  ]) {
    if (isAddress(address)) {
      recordsByAddress.set(address.toLowerCase(), { address, ens: null });
    }
  }
  for (const record of [...operators, ...members]) {
    recordsByAddress.set(record.address.toLowerCase(), record);
  }

  const records = [...recordsByAddress.values()];
  const generatedLabels = buildAddressGeneratedLabels(
    records.map((record) => record.address)
  );

  return Object.fromEntries(
    records.map((record) => {
      const identity = getAddressBaseIdentity(
        record,
        {
          aliases,
          generatedLabel: generatedLabels[record.address.toLowerCase()],
          trustRecordEns,
          verifiedEns,
          defaultLabels,
        }
      );
      return [identity.address.toLowerCase(), identity];
    })
  );
}

export function getAddressBaseIdentity(
  record: IdentityRecord,
  {
    aliases = {},
    generatedLabel,
    trustRecordEns = true,
    verifiedEns = {},
    defaultLabels = {},
  }: BuildAddressIdentityMapOptions & {
    generatedLabel?: string;
  } = {}
): DisplayAddressIdentity {
  const normalizedAddress = record.address.toLowerCase();
  const aliasValue = aliases[normalizedAddress];
  const alias = aliasValue
    ? normalizeAddressAlias(aliasValue)
    : null;
  if (alias) {
    return {
      address: record.address,
      label: alias,
      source: "local",
    };
  }

  const ensValue =
    verifiedEns[normalizedAddress] ??
    (trustRecordEns ? record.ens : null);
  const ensName = ensValue
    ? normalizeEnsDisplayName(ensValue)
    : null;
  if (ensName) {
    return {
      address: record.address,
      label: ensName,
      source: "ens",
    };
  }

  const defaultLabel = normalizeAddressAlias(defaultLabels[normalizedAddress] ?? "");
  if (defaultLabel) return { address: record.address, label: defaultLabel, source: "default" };
  return getAddressFallbackIdentity(record.address, generatedLabel);
}

export function getAddressIdentity(
  identities: AddressIdentityMap,
  address: string
): DisplayAddressIdentity {
  return identities[address.toLowerCase()] ?? getAddressFallbackIdentity(address);
}

function getAddressFallbackIdentity(
  address: string,
  generatedLabel?: string
): DisplayAddressIdentity {
  return {
    address,
    label: generatedLabel ?? getAddressPseudonym(address),
    source: "generated",
  };
}
