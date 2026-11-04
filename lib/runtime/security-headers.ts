import { GOVERNANCE_APP_PREPROD_HOSTS, GOVERNANCE_APP_PROD_HOSTS } from "./governance-hosts";

type SecurityHeaderOptions = {
  nonce: string;
  isDevelopment: boolean;
  isProduction: boolean;
  allowUnsafeInlineScripts?: boolean;
  allowSafeFrameEmbedding?: boolean;
  additionalConnectSrc?: string[];
  addressLabelsFrameSource?: string | null;
};

/** Only the paired YBC host can own shared browser labels for a DAO host. */
export function resolveAddressLabelsFrameSource(hostname: string): string | null {
  if (hostname === GOVERNANCE_APP_PROD_HOSTS.dao) {
    return `https://${GOVERNANCE_APP_PROD_HOSTS.ybc}/api/address-labels`;
  }
  if (hostname === GOVERNANCE_APP_PREPROD_HOSTS.dao) {
    return `https://${GOVERNANCE_APP_PREPROD_HOSTS.ybc}/api/address-labels`;
  }
  return null;
}

function joinDirectives(directives: string[]) {
  return directives.join("; ");
}

function parseUrlOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "http:" &&
      url.protocol !== "https:" &&
      url.protocol !== "ws:" &&
      url.protocol !== "wss:"
    ) {
      return null;
    }
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

export function resolveAdditionalConnectSrc(
  env: Record<string, string | undefined> = process.env
) {
  const candidates: string[] = [];
  const rpcUrls = (env.NEXT_PUBLIC_RPC_URLS ?? "")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);
  candidates.push(...rpcUrls);

  if (env.NEXT_PUBLIC_GLOBAL_DATA_URL) {
    candidates.push(env.NEXT_PUBLIC_GLOBAL_DATA_URL);
  }
  if (env.NEXT_PUBLIC_TEAMS_DATA_URL) {
    candidates.push(env.NEXT_PUBLIC_TEAMS_DATA_URL);
  }
  if (env.NEXT_PUBLIC_YETH_GLOBAL_DATA_URL) {
    candidates.push(env.NEXT_PUBLIC_YETH_GLOBAL_DATA_URL);
  }
  if (env.NEXT_PUBLIC_YBC_DATA_URL) {
    candidates.push(env.NEXT_PUBLIC_YBC_DATA_URL);
  }
  if (env.NEXT_PUBLIC_DAO_VOTING_POWER_URL) {
    candidates.push(env.NEXT_PUBLIC_DAO_VOTING_POWER_URL);
  }

  const parsed = candidates
    .map(parseUrlOrigin)
    .filter((origin): origin is string => origin !== null);
  return Array.from(new Set(parsed));
}

export const PERMISSIONS_POLICY_HEADER = [
  "accelerometer=()",
  "autoplay=()",
  "camera=()",
  "display-capture=()",
  "fullscreen=(self)",
  "geolocation=()",
  "gyroscope=()",
  "magnetometer=()",
  "microphone=()",
  "payment=()",
  "usb=()",
].join(", ");

export const CROSS_ORIGIN_OPENER_POLICY_HEADER = "same-origin-allow-popups";
export const CROSS_ORIGIN_RESOURCE_POLICY_HEADER = "same-site";
export const ORIGIN_AGENT_CLUSTER_HEADER = "?1";
export const SAFE_APP_FRAME_ANCESTORS = [
  "https://app.safe.global",
  "https://*.safe.global",
  "https://gnosis-safe.io",
  "https://*.gnosis-safe.io",
] as const;

export function buildContentSecurityPolicy({
  nonce,
  isDevelopment,
  isProduction,
  allowUnsafeInlineScripts = false,
  allowSafeFrameEmbedding = false,
  additionalConnectSrc = [],
  addressLabelsFrameSource = null,
}: SecurityHeaderOptions): string {
  const allowedAddressLabelsFrameSource = [
    resolveAddressLabelsFrameSource(GOVERNANCE_APP_PROD_HOSTS.dao),
    resolveAddressLabelsFrameSource(GOVERNANCE_APP_PREPROD_HOSTS.dao),
  ].includes(addressLabelsFrameSource) ? addressLabelsFrameSource : null;
  const scriptSrcDirectives = [
    "'self'",
    // Next.js webpack dev runtime relies on eval for source maps/HMR.
    isDevelopment ? "'unsafe-eval'" : null,
    allowUnsafeInlineScripts ? "'unsafe-inline'" : `'nonce-${nonce}'`,
  ]
    .filter((directive): directive is string => directive !== null)
    .join(" ");
  const scriptSrc = `script-src ${scriptSrcDirectives}`;
  const frameAncestorsDirective = allowSafeFrameEmbedding
    ? `frame-ancestors ${SAFE_APP_FRAME_ANCESTORS.join(" ")}`
    : "frame-ancestors 'none'";

  const connectSrcDirective = [
    "'self'",
    "https:",
    "wss:",
    ...(isDevelopment
      ? [
          "http://localhost:*",
          "http://127.0.0.1:*",
          "ws://localhost:*",
          "ws://127.0.0.1:*",
        ]
      : []),
    ...additionalConnectSrc,
  ];
  const connectSrc = `connect-src ${Array.from(new Set(connectSrcDirective)).join(" ")}`;

  const directives = [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    connectSrc,
    `frame-src 'self' https://verify.walletconnect.org https://verify.walletconnect.com https://*.walletconnect.com${allowedAddressLabelsFrameSource ? ` ${allowedAddressLabelsFrameSource}` : ""}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    frameAncestorsDirective,
  ];

  if (isProduction) {
    directives.push("upgrade-insecure-requests");
  }

  return joinDirectives(directives);
}

export function buildPermissionsPolicy(): string {
  return PERMISSIONS_POLICY_HEADER;
}

export function buildSecurityHeaders(options: SecurityHeaderOptions) {
  const headers: Record<string, string> = {
    "Content-Security-Policy": buildContentSecurityPolicy(options),
    "Permissions-Policy": buildPermissionsPolicy(),
    "Cross-Origin-Opener-Policy": CROSS_ORIGIN_OPENER_POLICY_HEADER,
    "Cross-Origin-Resource-Policy": CROSS_ORIGIN_RESOURCE_POLICY_HEADER,
    "Origin-Agent-Cluster": ORIGIN_AGENT_CLUSTER_HEADER,
  };

  return headers;
}
