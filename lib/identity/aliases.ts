import { isAddress } from "viem";
import { hasUnsafeIdentityDisplayCharacters } from "./display-safety";

// Keep the deployed key so existing YBC labels remain available in both apps.
export const ADDRESS_ALIASES_STORAGE_KEY =
  "yearn.ybc.member-aliases.v1";
export const ADDRESS_ALIASES_VERSION = 1;
export const ADDRESS_ALIAS_MAX_LENGTH = 40;
export const ADDRESS_ALIASES_MAX_ENTRIES = 128;
export const ADDRESS_ALIASES_MAX_STORAGE_LENGTH = 32_768;

export type AddressAliases = Record<string, string>;

type AddressAliasesEnvelope = {
  version: typeof ADDRESS_ALIASES_VERSION;
  aliases: AddressAliases;
};

type StorageLike = Pick<Storage, "getItem" | "removeItem" | "setItem">;

const ADJECTIVES = [
  "Brisk",
  "Clever",
  "Curious",
  "Daring",
  "Gentle",
  "Keen",
  "Lively",
  "Nimble",
  "Patient",
  "Sly",
  "Steady",
  "Wise",
] as const;

const ANIMALS = [
  "Badger",
  "Falcon",
  "Fox",
  "Heron",
  "Lynx",
  "Otter",
  "Owl",
  "Panda",
  "Raven",
  "Stoat",
  "Turtle",
  "Wombat",
] as const;

export function normalizeAddressAlias(value: string): string | null {
  const unicodeNormalized = value.normalize("NFC");
  if (hasUnsafeIdentityDisplayCharacters(unicodeNormalized)) return null;

  const normalized = unicodeNormalized.trim().replace(/\s+/gu, " ");
  const characterCount = Array.from(normalized).length;

  if (
    characterCount === 0 ||
    characterCount > ADDRESS_ALIAS_MAX_LENGTH
  ) {
    return null;
  }

  return normalized;
}

export function loadAddressAliases(
  storage: StorageLike | null
): AddressAliases {
  if (!storage) return {};

  try {
    const rawValue = storage.getItem(ADDRESS_ALIASES_STORAGE_KEY);
    if (!rawValue) return {};
    if (rawValue.length > ADDRESS_ALIASES_MAX_STORAGE_LENGTH) {
      removeStoredAddressAliases(storage);
      return {};
    }

    const parsedValue = JSON.parse(rawValue) as unknown;
    if (!isAddressAliasesEnvelope(parsedValue)) return {};
    if (
      Object.keys(parsedValue.aliases).length >
      ADDRESS_ALIASES_MAX_ENTRIES
    ) {
      removeStoredAddressAliases(storage);
      return {};
    }

    return sanitizeAddressAliases(parsedValue.aliases);
  } catch {
    return {};
  }
}

export function saveAddressAliases(
  storage: StorageLike | null,
  aliases: AddressAliases
): boolean {
  if (!storage) return false;
  if (Object.keys(aliases).length > ADDRESS_ALIASES_MAX_ENTRIES) {
    return false;
  }

  const payload: AddressAliasesEnvelope = {
    version: ADDRESS_ALIASES_VERSION,
    aliases: sanitizeAddressAliases(aliases),
  };
  if (
    Object.keys(payload.aliases).length > ADDRESS_ALIASES_MAX_ENTRIES
  ) {
    return false;
  }

  try {
    const serializedPayload = JSON.stringify(payload);
    if (serializedPayload.length > ADDRESS_ALIASES_MAX_STORAGE_LENGTH) {
      return false;
    }

    storage.setItem(ADDRESS_ALIASES_STORAGE_KEY, serializedPayload);
    return storage.getItem(ADDRESS_ALIASES_STORAGE_KEY) === serializedPayload;
  } catch {
    return false;
  }
}

export function clearAddressAliases(storage: StorageLike | null): boolean {
  if (!storage) return false;

  try {
    storage.removeItem(ADDRESS_ALIASES_STORAGE_KEY);
    return storage.getItem(ADDRESS_ALIASES_STORAGE_KEY) === null;
  } catch {
    return false;
  }
}

export function getAddressPseudonym(address: string): string {
  const normalizedAddress = address.toLowerCase();
  const adjectiveHash = hashString(normalizedAddress);
  const animalHash = hashString([...normalizedAddress].reverse().join(""));

  return `${ADJECTIVES[adjectiveHash % ADJECTIVES.length]} ${
    ANIMALS[animalHash % ANIMALS.length]
  } ${adjectiveHash.toString(36)}`;
}

export function buildAddressGeneratedLabels(addresses: string[]): Record<string, string> {
  return Object.fromEntries(addresses.map((address) => [
    address.toLowerCase(), getAddressPseudonym(address),
  ]));
}

function sanitizeAddressAliases(
  aliases: AddressAliases
): AddressAliases {
  return Object.fromEntries(
    Object.entries(aliases)
      .slice(0, ADDRESS_ALIASES_MAX_ENTRIES)
      .flatMap(([address, alias]) => {
        const normalizedAlias = normalizeAddressAlias(alias);
        if (!isAddress(address) || !normalizedAlias) return [];

        return [[address.toLowerCase(), normalizedAlias]];
      })
  );
}

function removeStoredAddressAliases(storage: StorageLike): void {
  try {
    storage.removeItem(ADDRESS_ALIASES_STORAGE_KEY);
  } catch {
    // Reads should still fail closed when storage removal is blocked.
  }
}

function isAddressAliasesEnvelope(
  value: unknown
): value is AddressAliasesEnvelope {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  if (record.version !== ADDRESS_ALIASES_VERSION) return false;
  if (!record.aliases || typeof record.aliases !== "object") return false;
  if (Array.isArray(record.aliases)) return false;

  return Object.values(record.aliases).every(
    (alias) => typeof alias === "string"
  );
}

function hashString(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}
