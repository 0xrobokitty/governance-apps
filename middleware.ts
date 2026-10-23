import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  applyHostPrefix,
  resolveHeadProbePath,
  resolveHostPrefix,
} from "@/lib/runtime/host-routing";
import { resolveRequestHostname } from "@/lib/runtime/request-host";
import {
  buildSecurityHeaders,
  resolveAdditionalConnectSrc,
  resolveAddressLabelsFrameSource,
} from "@/lib/runtime/security-headers";
import { isIndexableGovernanceHostname } from "@/lib/runtime/discoverability";

// Regex to detect public files that should skip rewriting.
// This is safer than checking for dots, which might exist in valid URL slugs.
const PUBLIC_FILE =
  /\.(?:png|jpg|jpeg|gif|svg|ico|webp|css|js|map|txt|xml|webmanifest|woff|woff2|ttf|eot)$/i;

const IS_PRODUCTION = process.env.NODE_ENV === "production";
const IS_DEVELOPMENT = !IS_PRODUCTION;
const STRICT_CSP_PATHS = ["/treasury", "/dao", "/styfi", "/veyfi", "/yeth", "/ybc"];
const ADDITIONAL_CONNECT_SRC = resolveAdditionalConnectSrc();

function isStrictCspPath(pathname: string, hostPrefix: string | null) {
  if (hostPrefix) return true;
  return STRICT_CSP_PATHS.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isGovernanceAppRequest(pathname: string, hostPrefix: string | null) {
  if (hostPrefix) return true;
  return STRICT_CSP_PATHS.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function withSecurityHeaders(
  response: NextResponse,
  nonce: string,
  options: {
    allowUnsafeInlineScripts: boolean;
    allowSafeFrameEmbedding: boolean;
    allowIndexing: boolean;
    addressLabelsFrameSource: string | null;
  }
) {
  const securityHeaders = buildSecurityHeaders({
    nonce,
    isDevelopment: IS_DEVELOPMENT,
    isProduction: IS_PRODUCTION,
    allowUnsafeInlineScripts: options.allowUnsafeInlineScripts,
    allowSafeFrameEmbedding: options.allowSafeFrameEmbedding,
    additionalConnectSrc: ADDITIONAL_CONNECT_SRC,
    addressLabelsFrameSource: options.addressLabelsFrameSource,
  });

  for (const [key, value] of Object.entries(securityHeaders)) {
    response.headers.set(key, value);
  }

  if (options.allowSafeFrameEmbedding) {
    response.headers.delete("X-Frame-Options");
  } else {
    response.headers.set("X-Frame-Options", "DENY");
  }

  response.headers.set("x-nonce", nonce);
  if (!options.allowIndexing) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  return response;
}

export function middleware(request: NextRequest) {
  const url = request.nextUrl;
  const requestHostname = resolveRequestHostname(request.headers, url.hostname);
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  // This isolated document supplies its own nonce policy and exact parent
  // allowlist. Applying the app's frame-ancestors policy would block the bridge.
  if (url.pathname === "/api/address-labels") {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // 1. Determine the intended application based on the Host header
  const prefix = resolveHostPrefix(requestHostname);
  const shouldUseStrictCsp = isStrictCspPath(url.pathname, prefix);
  const allowSafeFrameEmbedding = isGovernanceAppRequest(url.pathname, prefix);
  const securityOptions = {
    allowUnsafeInlineScripts: !shouldUseStrictCsp,
    allowSafeFrameEmbedding,
    allowIndexing: isIndexableGovernanceHostname(requestHostname),
    addressLabelsFrameSource: resolveAddressLabelsFrameSource(requestHostname),
  };

  const isHeadRequest = request.method === "HEAD";

  // If the hostname isn't in our map (e.g. app.dao-ops.com or localhost),
  // pass through to the default root page (the Launcher).
  // 2. Safety Checks: Skip rewriting for internals and static assets
  const isSkippablePath =
    url.pathname.startsWith("/_next") ||
    url.pathname.startsWith("/api") ||
    url.pathname.startsWith("/fonts") ||
    url.pathname.startsWith("/.well-known") ||
    url.pathname === "/manifest.json" ||
    url.pathname === "/dao-title-overrides.json" ||
    PUBLIC_FILE.test(url.pathname);

  if (isHeadRequest && !isSkippablePath) {
    const headUrl = url.clone();
    const probePath = resolveHeadProbePath(headUrl.pathname, prefix);
    const probeTargetPath = applyHostPrefix(probePath, prefix);

    if (probeTargetPath === url.pathname) {
      return withSecurityHeaders(
        NextResponse.next({
          request: { headers: requestHeaders },
        }),
        nonce,
        securityOptions
      );
    }

    headUrl.pathname = probeTargetPath;
    return withSecurityHeaders(
      NextResponse.rewrite(headUrl, {
        request: { headers: requestHeaders },
      }),
      nonce,
      securityOptions
    );
  }

  if (!prefix) {
    return withSecurityHeaders(
      NextResponse.next({
        request: { headers: requestHeaders },
      }),
      nonce,
      securityOptions
    );
  }

  if (isSkippablePath) {
    return withSecurityHeaders(
      NextResponse.next({
        request: { headers: requestHeaders },
      }),
      nonce,
      securityOptions
    );
  }

  // 3. Double-Prefix Guard
  // If the user visits styfi.yearn.fi/styfi/dashboard, we don't want /styfi/styfi/dashboard.
  // We only apply the prefix if it's not already there.
  url.pathname = applyHostPrefix(url.pathname, prefix);

  return withSecurityHeaders(
    NextResponse.rewrite(url, {
      request: { headers: requestHeaders },
    }),
    nonce,
    securityOptions
  );
}

export const config = {
  // Match all paths except explicit Next.js internals to be efficient
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
