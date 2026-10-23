// Compatibility exports; shared implementation is used by DAO and YBC.
export {
  type AddressAliasMutation as YbcMemberAliasMutationResult,
  useAddressAliases as useYbcMemberAliases,
} from "@/lib/hooks/useAddressAliases";
