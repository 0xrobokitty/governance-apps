import { createAddressLabelBridgeScript } from "@/lib/identity/bridge-script";
import { ADDRESS_LABEL_BRIDGE_PAIRS } from "@/lib/identity/bridge-protocol";
import { resolveRequestHostname } from "@/lib/runtime/request-host";
import { SAFE_APP_FRAME_ANCESTORS } from "@/lib/runtime/security-headers";
import { isDaoEnabled, isYbcEnabled } from "@/lib/runtime/features";

export const dynamic = "force-dynamic";

export function GET(request: Request): Response {
  const hostname = resolveRequestHostname(request.headers, new URL(request.url).hostname);
  const pair = ADDRESS_LABEL_BRIDGE_PAIRS.find((candidate) => new URL(candidate.ybc).hostname === hostname);
  if (!pair || !isDaoEnabled() || !isYbcEnabled()) return new Response(null, { status: 404, headers: { "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'", "Cache-Control": "no-store" } });
  const nonce = crypto.randomUUID().replaceAll("-", "");
  const script = createAddressLabelBridgeScript(pair.dao, pair.ybc);
  return new Response(`<!doctype html><html><head><meta charset="utf-8"><title>Shared address names</title></head><body><script nonce="${nonce}">${script}</script></body></html>`, {
    headers: {
      "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store",
      "Content-Security-Policy": `default-src 'none'; script-src 'nonce-${nonce}'; frame-ancestors ${pair.dao} ${SAFE_APP_FRAME_ANCESTORS.join(" ")}; base-uri 'none'; form-action 'none'`,
      "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

