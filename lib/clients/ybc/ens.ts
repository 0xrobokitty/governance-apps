// Compatibility exports; shared implementation is used by DAO and YBC.
export {
  type VerifiedEnsIdentities as YbcVerifiedEnsIdentities,
  type ResolveEnsOptions as ResolveYbcEnsOptions,
  ENS_MAX_ADDRESSES_PER_QUERY as YBC_ENS_MAX_ADDRESSES_PER_QUERY,
  ENS_DEFAULT_CONCURRENCY as YBC_ENS_DEFAULT_CONCURRENCY,
  ENS_DEFAULT_ADDRESS_TIMEOUT_MS as YBC_ENS_DEFAULT_ADDRESS_TIMEOUT_MS,
  ENS_DEFAULT_TOTAL_DEADLINE_MS as YBC_ENS_DEFAULT_TOTAL_DEADLINE_MS,
  ENS_MAX_NAME_LENGTH as YBC_ENS_MAX_NAME_LENGTH,
  resolveVerifiedMainnetEnsIdentities as resolveVerifiedMainnetEnsIdentities,
  clearEnsIdentityCache as clearYbcEnsIdentityCache,
  normalizeEnsDisplayName as normalizeYbcEnsDisplayName,
} from "@/lib/identity/ens";
