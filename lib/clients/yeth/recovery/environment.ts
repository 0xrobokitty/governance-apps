/** A local fork must never share mainnet chain identity or a public write transport. */
export function getRecoveryEnvironment() {
  const rpcUrl = process.env.NEXT_PUBLIC_YETH_FORK_RPC_URL?.trim();
  if (!rpcUrl) return { chainId: 1, fork: false, rpcUrl: undefined } as const;
  if (process.env.NODE_ENV === "production") {
    throw new Error("The yETH fork transport is disabled in production.");
  }
  const url = new URL(rpcUrl);
  if (!["http:", "https:"].includes(url.protocol) || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.username || url.password) {
    throw new Error("The yETH fork RPC must use a loopback HTTP address.");
  }
  if (process.env.NEXT_PUBLIC_E2E === "true") {
    throw new Error("The real yETH fork cannot use the mock transaction connector.");
  }
  return { chainId: 31337, fork: true, rpcUrl } as const;
}
