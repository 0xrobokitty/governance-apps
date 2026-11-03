/** Keep provider error details (which can contain connection URIs) out of the UI. */
export function walletErrorMessage(error: unknown, action: "connect" | "switch" | "disconnect"): string {
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current && typeof current === "object"; depth += 1) {
    const value = current as { code?: unknown; name?: unknown; cause?: unknown };
    if (value.code === "WALLET_REQUEST_PENDING") {
      return "Request still pending. Reject it in your wallet or wait for expiry.";
    }
    if (value.code === 4001 || value.name === "UserRejectedRequestError") {
      return "Request declined.";
    }
    if (value.code === -32002) {
      return "Request already open. Continue in your wallet.";
    }
    if (value.code === 4902) {
      return "Add Ethereum Mainnet in your wallet.";
    }
    current = value.cause;
  }
  if (action === "switch") return "Select Ethereum Mainnet in your wallet.";
  if (action === "disconnect") return "Could not disconnect. Try again.";
  return "Could not connect. Try again.";
}

/** Browser capability hint only; this does not detect an installed wallet. */
export function isAppleMobileWalletBrowser(browser?: {
  userAgent?: string;
  platform?: string;
  maxTouchPoints?: number;
}): boolean {
  if (!browser || /\biPod\b/i.test(browser.userAgent ?? "")) return false;
  return /\b(iPhone|iPad)\b/i.test(browser.userAgent ?? "") ||
    browser.platform === "MacIntel" && (browser.maxTouchPoints ?? 0) > 1;
}

/** Source-verified wallet routes. Navigation happens only on an explicit link click. */
export function walletLaunchUrl(wallet: "metamask" | "rabby" | "oath", uri: string): string | undefined {
  if (uri.length > 4096 || !/^wc:[a-f0-9]{64}@2\?/i.test(uri)) return undefined;
  const prefixes = {
    metamask: "metamask://wc",
    rabby: "rabby://walletconnect",
    oath: "oathwallet://wc",
  };
  return `${prefixes[wallet]}?uri=${encodeURIComponent(uri)}`;
}
