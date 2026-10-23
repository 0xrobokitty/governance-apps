import { AddressIdentity, type AddressIdentityProps } from "@/components/domain/AddressIdentity";
import { ybcCopy } from "../messages";

export function MemberIdentity(props: Omit<AddressIdentityProps, "copy">) {
  return <AddressIdentity {...props} copy={{ ...ybcCopy.members.alias, you: ybcCopy.members.states.you }} />;
}
