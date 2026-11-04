import { getAddress, isAddress, type Address } from "viem";

export type WalletSession = {
  topic: string;
  expiry: number;
  sessionConfig?: { disableDeepLink?: boolean };
  namespaces: Record<string, {
    accounts: string[];
    methods: string[];
    events: string[];
    chains?: string[];
  }>;
};

export function parseWalletChainId(value: unknown): number | undefined {
  if (typeof value === "number")
    return Number.isSafeInteger(value) && value > 0 ? value : undefined;
  if (typeof value !== "string") return undefined;
  const plain = value.startsWith("eip155:") ? value.slice(7) : value;
  if (!/^(?:[1-9][0-9]*|0x[0-9a-f]+)$/i.test(plain)) return undefined;
  const parsed = Number(plain);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

/** Only permissions scoped to this chain can authorize a request. */
export function getWalletSessionGrant(session: WalletSession | undefined, chainId: number) {
  const accounts = new Set<Address>();
  const methods = new Set<string>();
  const events = new Set<string>();
  if (!session || !Number.isFinite(session.expiry) || session.expiry * 1000 <= Date.now())
    return { accounts: [] as Address[], methods, events, valid: false };
  for (const [key, namespace] of Object.entries(session.namespaces)) {
    if (key !== "eip155" && key !== `eip155:${chainId}`) continue;
    if (namespace.chains && !namespace.chains.includes(`eip155:${chainId}`)) continue;
    const scoped: Address[] = [];
    for (const account of namespace.accounts ?? []) {
      const parts = account.split(":");
      if (parts.length !== 3 || parts[0] !== "eip155" ||
          parseWalletChainId(parts[1]) !== chainId || !isAddress(parts[2], { strict: false })) continue;
      scoped.push(getAddress(parts[2]));
    }
    if (!scoped.length) continue;
    scoped.forEach((account) => accounts.add(account));
    namespace.methods.forEach((method) => methods.add(method));
    namespace.events.forEach((event) => events.add(event));
  }
  return {
    accounts: [...accounts],
    methods,
    events,
    valid: accounts.size > 0 && methods.has("eth_sendTransaction") &&
      events.has("accountsChanged") && events.has("chainChanged"),
  };
}
