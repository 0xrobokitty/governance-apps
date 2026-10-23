// Compatibility exports; shared implementation is used by DAO and YBC.
export {
  type AddressIdentitySource as YbcIdentitySource,
  type DisplayAddressIdentity as YbcDisplayIdentity,
  type AddressIdentityMap as YbcIdentityMap,
  type BuildAddressIdentityMapOptions as BuildYbcIdentityMapOptions,
  buildAddressIdentityMap as buildYbcIdentityMap,
  getAddressBaseIdentity as getYbcBaseIdentity,
  getAddressIdentity as getYbcIdentity,
} from "@/lib/identity/identity";
