// Compatibility exports; shared implementation is used by DAO and YBC.
export {
  ADDRESS_ALIASES_STORAGE_KEY as YBC_MEMBER_ALIASES_STORAGE_KEY,
  ADDRESS_ALIASES_VERSION as YBC_MEMBER_ALIASES_VERSION,
  ADDRESS_ALIAS_MAX_LENGTH as YBC_MEMBER_ALIAS_MAX_LENGTH,
  ADDRESS_ALIASES_MAX_ENTRIES as YBC_MEMBER_ALIASES_MAX_ENTRIES,
  ADDRESS_ALIASES_MAX_STORAGE_LENGTH as YBC_MEMBER_ALIASES_MAX_STORAGE_LENGTH,
  type AddressAliases as YbcMemberAliases,
  normalizeAddressAlias as normalizeYbcMemberAlias,
  loadAddressAliases as loadYbcMemberAliases,
  saveAddressAliases as saveYbcMemberAliases,
  clearAddressAliases as clearYbcMemberAliases,
  getAddressPseudonym as getYbcMemberPseudonym,
  buildAddressGeneratedLabels as buildYbcGeneratedLabels,
} from "@/lib/identity/aliases";
