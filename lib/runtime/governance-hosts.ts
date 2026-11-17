export const GOVERNANCE_APP_PATHS = {
  treasury: "/treasury",
  dao: "/dao",
  styfi: "/styfi",
  veyfi: "/veyfi",
  teams: "/teams",
  yeth: "/yeth",
  ybc: "/ybc",
  pulse: "/pulse",
} as const;

export type GovernanceApp = keyof typeof GOVERNANCE_APP_PATHS;
export type GovernanceAppPath = (typeof GOVERNANCE_APP_PATHS)[GovernanceApp];

export const GOVERNANCE_APP_PROD_HOSTS: Record<GovernanceApp, string> = {
  treasury: "treasury.yearn.fi",
  dao: "dao.yearn.fi",
  styfi: "styfi.yearn.fi",
  veyfi: "veyfi.yearn.fi",
  teams: "teams.yearn.fi",
  yeth: "yeth.yearn.fi",
  ybc: "ybc.yearn.fi",
  pulse: "pulse.yearn.fi",
};

export const GOVERNANCE_APP_PREPROD_HOSTS: Record<GovernanceApp, string> = {
  treasury: "treasury-beta.dao-ops.com",
  dao: "dao-beta.dao-ops.com",
  styfi: "styfi-beta.dao-ops.com",
  veyfi: "veyfi-beta.dao-ops.com",
  teams: "teams-beta.dao-ops.com",
  yeth: "yeth-beta.dao-ops.com",
  ybc: "ybc-beta.dao-ops.com",
  pulse: "pulse-beta.dao-ops.com",
};

export const GOVERNANCE_SHARED_PATH_HOSTS = new Set(["app.dao-ops.com"]);
export const GOVERNANCE_LOCALHOST_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "[::1]",
]);

// Single source of truth for host -> app route prefix mapping used by middleware.
const HOST_TO_PREFIX_ENTRIES = (Object.keys(GOVERNANCE_APP_PATHS) as GovernanceApp[]).flatMap(
  (app) => [
    [GOVERNANCE_APP_PROD_HOSTS[app], GOVERNANCE_APP_PATHS[app]],
    [GOVERNANCE_APP_PREPROD_HOSTS[app], GOVERNANCE_APP_PATHS[app]],
  ]
);

export const GOVERNANCE_HOST_TO_PREFIX: Readonly<Record<string, GovernanceAppPath>> =
  Object.freeze(Object.fromEntries(HOST_TO_PREFIX_ENTRIES)) as Readonly<
    Record<string, GovernanceAppPath>
  >;

function stripPort(host: string): string | null {
  if (!host) return null;

  if (host.startsWith("[")) {
    const end = host.indexOf("]");
    if (end < 0) return null;
    const bracketHost = host.slice(0, end + 1);
    const remainder = host.slice(end + 1);
    if (!remainder) return bracketHost;
    return /^:\d{1,5}$/.test(remainder) ? bracketHost : null;
  }

  const lastColon = host.lastIndexOf(":");
  if (lastColon < 0) return host;

  const maybePort = host.slice(lastColon + 1);
  if (!/^\d{1,5}$/.test(maybePort)) return host;
  return host.slice(0, lastColon);
}

export function normalizeGovernanceHostname(
  value: string | null | undefined
): string | null {
  if (!value) return null;

  const firstHost = value
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .find(Boolean);
  if (!firstHost) return null;

  let candidate = firstHost;
  if (candidate.includes("://")) {
    try {
      candidate = new URL(candidate).host.toLowerCase();
    } catch {
      return null;
    }
  }

  candidate = candidate.split("/")[0] || "";
  if (!candidate) return null;

  const withoutPort = stripPort(candidate);
  if (!withoutPort) return null;

  const withoutTrailingDot = withoutPort.replace(/\.$/, "");
  return withoutTrailingDot || null;
}

export type GovernanceLinkSurface =
  | "path-scoped"
  | "prod-subdomain"
  | "preprod-subdomain";

export function resolveGovernanceLinkSurface(
  hostname: string | null | undefined
): GovernanceLinkSurface {
  const normalized = normalizeGovernanceHostname(hostname);
  if (!normalized) return "path-scoped";

  if (GOVERNANCE_SHARED_PATH_HOSTS.has(normalized)) return "path-scoped";
  if (GOVERNANCE_LOCALHOST_HOSTS.has(normalized)) return "path-scoped";
  if (normalized.endsWith(".yearn.fi")) return "prod-subdomain";
  if (normalized.endsWith("-beta.dao-ops.com")) return "preprod-subdomain";
  return "path-scoped";
}
