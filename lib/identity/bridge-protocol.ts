import { isAddress } from "viem";
import { GOVERNANCE_APP_PREPROD_HOSTS, GOVERNANCE_APP_PROD_HOSTS } from "@/lib/runtime/governance-hosts";
import { ADDRESS_ALIASES_MAX_ENTRIES, normalizeAddressAlias, type AddressAliases } from "./aliases";

export const ADDRESS_LABEL_BRIDGE_PATH = "/api/address-labels";
export const ADDRESS_LABEL_BRIDGE_KIND = "yearn.address-labels.v1";
export const ADDRESS_LABEL_BRIDGE_PAIRS = [
  { dao: `https://${GOVERNANCE_APP_PROD_HOSTS.dao}`, ybc: `https://${GOVERNANCE_APP_PROD_HOSTS.ybc}` },
  { dao: `https://${GOVERNANCE_APP_PREPROD_HOSTS.dao}`, ybc: `https://${GOVERNANCE_APP_PREPROD_HOSTS.ybc}` },
] as const;
export type AddressLabelOperation = { operation: "read" | "clear" } | { operation: "reset"; address: string } | { operation: "set"; address: string; alias: string };
export type AddressLabelBridgeResponse = {
  kind: typeof ADDRESS_LABEL_BRIDGE_KIND; id: string;
  status: "saved" | "invalid" | "storage-error";
  aliases: AddressAliases;
};

export function getAddressLabelBridgeOrigin(origin: string): string | null {
  return ADDRESS_LABEL_BRIDGE_PAIRS.find((pair) => pair.dao === origin)?.ybc ?? null;
}

export function parseAddressLabelBridgeResponse(value: unknown): AddressLabelBridgeResponse | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const response = value as Record<string, unknown>;
  if (response.kind !== ADDRESS_LABEL_BRIDGE_KIND || typeof response.id !== "string" || !/^(?:[a-f0-9-]{36}|changed)$/.test(response.id)) return null;
  if (response.status !== "saved" && response.status !== "invalid" && response.status !== "storage-error") return null;
  if (!response.aliases || typeof response.aliases !== "object" || Array.isArray(response.aliases)) return null;
  const entries = Object.entries(response.aliases);
  if (entries.length > ADDRESS_ALIASES_MAX_ENTRIES) return null;
  const aliases: AddressAliases = {};
  for (const [address, alias] of entries) {
    if (!isAddress(address) || typeof alias !== "string" || alias.length > 80 || normalizeAddressAlias(alias) !== alias) return null;
    aliases[address.toLowerCase()] = alias;
  }
  return { kind: ADDRESS_LABEL_BRIDGE_KIND, id: response.id, status: response.status, aliases };
}
