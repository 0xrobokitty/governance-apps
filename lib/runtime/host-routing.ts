import {
  GOVERNANCE_HOST_TO_PREFIX,
  normalizeGovernanceHostname,
} from "@/lib/runtime/governance-hosts";

export function normalizeHostname(value: string): string | null {
  return normalizeGovernanceHostname(value);
}

export function resolveHostPrefix(hostname: string): string | null {
  const normalized = normalizeHostname(hostname);
  if (!normalized) return null;

  return GOVERNANCE_HOST_TO_PREFIX[normalized] ?? null;
}

export function applyHostPrefix(pathname: string, prefix: string | null): string {
  if (!prefix) return pathname;
  if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return pathname;
  return `${prefix}${pathname}`;
}

function resolvePathPrefix(pathname: string): string | null {
  if (pathname === "/treasury" || pathname.startsWith("/treasury/")) return "/treasury";
  if (pathname === "/dao" || pathname.startsWith("/dao/")) return "/dao";
  if (pathname === "/styfi" || pathname.startsWith("/styfi/")) return "/styfi";
  if (pathname === "/veyfi" || pathname.startsWith("/veyfi/")) return "/veyfi";
  if (pathname === "/teams" || pathname.startsWith("/teams/")) return "/teams";
  if (pathname === "/yeth" || pathname.startsWith("/yeth/")) return "/yeth";
  if (pathname === "/ybc" || pathname.startsWith("/ybc/")) return "/ybc";
  if (pathname === "/pulse" || pathname.startsWith("/pulse/")) return "/pulse";
  return null;
}

export function resolveHeadProbePath(pathname: string, hostPrefix: string | null): string {
  if (!pathname || pathname === "/") return "/";

  const pathPrefix = resolvePathPrefix(pathname);
  const appPrefix = hostPrefix ?? pathPrefix;
  if (!appPrefix) return "/";

  if (pathname === appPrefix || pathname === `${appPrefix}/`) {
    return pathname;
  }

  return appPrefix;
}
