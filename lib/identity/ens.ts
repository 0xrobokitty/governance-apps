import {
  getAddress,
  isAddress,
  type Address,
  type PublicClient,
} from "viem";
import { mainnet } from "viem/chains";
import { normalize as normalizeEnsName } from "viem/ens";
import { hasUnsafeIdentityDisplayCharacters } from "./display-safety";

export type VerifiedEnsIdentities = Record<string, string>;

export type ResolveEnsOptions = {
  addressTimeoutMs?: number;
  concurrency?: number;
  totalDeadlineMs?: number;
};

export const ENS_MAX_ADDRESSES_PER_QUERY = 64;
export const ENS_DEFAULT_CONCURRENCY = 4;
export const ENS_DEFAULT_ADDRESS_TIMEOUT_MS = 3_000;
export const ENS_DEFAULT_TOTAL_DEADLINE_MS = 10_000;
export const ENS_MAX_NAME_LENGTH = 255;

type EnsCacheEntry = {
  expiresAt: number;
  value: string | null;
};

type EnsResolution = {
  timely: boolean;
  value: string | null;
};

type EnsInFlightEntry = {
  promise: Promise<EnsResolution>;
};

const MAX_CONCURRENCY = 8;
const MAX_ADDRESS_TIMEOUT_MS = 10_000;
const MAX_TOTAL_DEADLINE_MS = 20_000;
const POSITIVE_CACHE_TTL_MS = 30 * 60 * 1_000;
const NEGATIVE_CACHE_TTL_MS = 2 * 60 * 1_000;
const MAX_CACHE_ENTRIES = 256;

const ensIdentityCache = new Map<string, EnsCacheEntry>();
let ensInflightByClient = new WeakMap<
  PublicClient,
  Map<string, EnsInFlightEntry>
>();

/**
 * Resolves at most 64 mainnet identities with four workers by default.
 * Each identity has a three-second budget and the entire batch stops
 * scheduling work after ten seconds.
 */
export async function resolveVerifiedMainnetEnsIdentities(
  publicClient: PublicClient | null,
  addresses: string[],
  options: ResolveEnsOptions = {}
): Promise<VerifiedEnsIdentities> {
  if (!isMainnetPublicClient(publicClient)) return {};

  const uniqueAddresses = [
    ...new Set(
      addresses.flatMap((address) =>
        isAddress(address) ? [address.toLowerCase()] : []
      )
    ),
  ]
    .sort()
    .slice(0, ENS_MAX_ADDRESSES_PER_QUERY);
  if (uniqueAddresses.length === 0) return {};

  const concurrency = clampInteger(
    options.concurrency ?? ENS_DEFAULT_CONCURRENCY,
    1,
    MAX_CONCURRENCY
  );
  const addressTimeoutMs = clampInteger(
    options.addressTimeoutMs ?? ENS_DEFAULT_ADDRESS_TIMEOUT_MS,
    1,
    MAX_ADDRESS_TIMEOUT_MS
  );
  const totalDeadlineMs = clampInteger(
    options.totalDeadlineMs ?? ENS_DEFAULT_TOTAL_DEADLINE_MS,
    1,
    MAX_TOTAL_DEADLINE_MS
  );
  const deadlineAt = Date.now() + totalDeadlineMs;
  const verifiedIdentities: VerifiedEnsIdentities = {};
  const uncachedAddresses: Address[] = [];

  for (const address of uniqueAddresses) {
    const checksummedAddress = getAddress(address);
    const cachedEntry = getCachedEntry(address);
    if (!cachedEntry) {
      uncachedAddresses.push(checksummedAddress);
      continue;
    }

    if (cachedEntry.value) {
      verifiedIdentities[address] = cachedEntry.value;
    }
  }

  if (uncachedAddresses.length === 0) {
    return verifiedIdentities;
  }

  let nextIndex = 0;
  let batchActive = true;

  const resolveNextAddress = async () => {
    while (batchActive && nextIndex < uncachedAddresses.length) {
      if (Date.now() >= deadlineAt) return;

      const address = uncachedAddresses[nextIndex];
      nextIndex += 1;
      const addressDeadlineAt = Math.min(
        deadlineAt,
        Date.now() + addressTimeoutMs
      );
      const resolution = await getOrStartEnsResolution(
        publicClient,
        address,
        addressDeadlineAt,
        () => batchActive
      );

      if (!batchActive || Date.now() >= deadlineAt) return;
      if (!resolution.timely) continue;

      const cacheKey = address.toLowerCase();
      if (resolution.value) {
        verifiedIdentities[cacheKey] = resolution.value;
      }
    }
  };

  const workers = Promise.all(
    Array.from({
      length: Math.min(concurrency, uncachedAddresses.length),
    }, resolveNextAddress)
  );
  let deadlineTimeout: ReturnType<typeof setTimeout> | undefined;
  const reachedDeadline = new Promise<void>((resolve) => {
    deadlineTimeout = setTimeout(
      resolve,
      Math.max(1, deadlineAt - Date.now())
    );
  });

  await Promise.race([workers, reachedDeadline]);
  batchActive = false;
  if (deadlineTimeout !== undefined) {
    clearTimeout(deadlineTimeout);
  }

  return { ...verifiedIdentities };
}

export function clearEnsIdentityCache(): void {
  ensIdentityCache.clear();
  ensInflightByClient = new WeakMap<
    PublicClient,
    Map<string, EnsInFlightEntry>
  >();
}

export function normalizeEnsDisplayName(name: string): string | null {
  if (
    name.length === 0 ||
    name.length > ENS_MAX_NAME_LENGTH * 2 ||
    Array.from(name).length > ENS_MAX_NAME_LENGTH ||
    hasUnsafeIdentityDisplayCharacters(name)
  ) {
    return null;
  }

  try {
    const normalizedName = normalizeEnsName(name);
    if (
      !normalizedName ||
      Array.from(normalizedName).length > ENS_MAX_NAME_LENGTH ||
      hasUnsafeIdentityDisplayCharacters(normalizedName)
    ) {
      return null;
    }

    return normalizedName;
  } catch {
    return null;
  }
}

function isMainnetPublicClient(
  publicClient: PublicClient | null
): publicClient is PublicClient {
  return publicClient?.chain?.id === mainnet.id;
}

function getOrStartEnsResolution(
  publicClient: PublicClient,
  address: Address,
  deadlineAt: number,
  isBatchActive: () => boolean
): Promise<EnsResolution> {
  let inFlightByAddress = ensInflightByClient.get(publicClient);
  if (!inFlightByAddress) {
    inFlightByAddress = new Map<string, EnsInFlightEntry>();
    ensInflightByClient.set(publicClient, inFlightByAddress);
  }

  const cacheKey = address.toLowerCase();
  const pendingEntry = inFlightByAddress.get(cacheKey);
  if (pendingEntry) return pendingEntry.promise;

  const entry: EnsInFlightEntry = {
    promise: Promise.resolve({ timely: false, value: null }),
  };
  entry.promise = resolveEnsIdentity(
    publicClient,
    address,
    deadlineAt,
    isBatchActive
  )
    .then((resolution) => {
      if (resolution.timely) {
        setCachedEntry(cacheKey, {
          expiresAt:
            Date.now() +
            (resolution.value
              ? POSITIVE_CACHE_TTL_MS
              : NEGATIVE_CACHE_TTL_MS),
          value: resolution.value,
        });
      }
      return resolution;
    })
    .finally(() => {
      if (inFlightByAddress?.get(cacheKey) === entry) {
        inFlightByAddress.delete(cacheKey);
      }
    });
  inFlightByAddress.set(cacheKey, entry);
  return entry.promise;
}

async function resolveEnsIdentity(
  publicClient: PublicClient,
  address: Address,
  deadlineAt: number,
  isBatchActive: () => boolean
): Promise<EnsResolution> {
  try {
    const reverseName = await publicClient.getEnsName({ address });
    if (!isTimelyResolution(isBatchActive, deadlineAt)) {
      return { timely: false, value: null };
    }
    if (!reverseName) return { timely: true, value: null };

    const normalizedName = normalizeEnsDisplayName(reverseName);
    if (!normalizedName) return { timely: true, value: null };

    const forwardAddress = await publicClient.getEnsAddress({
      name: normalizedName,
    });
    if (!isTimelyResolution(isBatchActive, deadlineAt)) {
      return { timely: false, value: null };
    }

    return {
      timely: true,
      value:
        forwardAddress?.toLowerCase() === address.toLowerCase()
          ? normalizedName
          : null,
    };
  } catch {
    return {
      timely: isTimelyResolution(isBatchActive, deadlineAt),
      value: null,
    };
  }
}

function isTimelyResolution(
  isBatchActive: () => boolean,
  deadlineAt: number
): boolean {
  return isBatchActive() && Date.now() < deadlineAt;
}

function getCachedEntry(cacheKey: string): EnsCacheEntry | null {
  const cacheEntry = ensIdentityCache.get(cacheKey);
  if (!cacheEntry) return null;

  if (cacheEntry.expiresAt <= Date.now()) {
    ensIdentityCache.delete(cacheKey);
    return null;
  }

  ensIdentityCache.delete(cacheKey);
  ensIdentityCache.set(cacheKey, cacheEntry);
  return cacheEntry;
}

function setCachedEntry(cacheKey: string, cacheEntry: EnsCacheEntry): void {
  ensIdentityCache.delete(cacheKey);
  ensIdentityCache.set(cacheKey, cacheEntry);

  while (ensIdentityCache.size > MAX_CACHE_ENTRIES) {
    const oldestCacheKey = ensIdentityCache.keys().next().value;
    if (typeof oldestCacheKey !== "string") break;
    ensIdentityCache.delete(oldestCacheKey);
  }
}

function clampInteger(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, Math.trunc(value)));
}
