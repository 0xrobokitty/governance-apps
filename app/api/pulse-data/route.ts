import { readBoundedJson, withFeedRequest } from "@/lib/feed-transport";
import { parsePulseWireFeed, PULSE_FEED_POLICY } from "@/lib/clients/pulse/feed";
import { isPulseLiveEnabled } from "@/lib/clients/pulse/config";
import { isProductionMode } from "@/lib/runtime/runtime-mode";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
export async function GET() {
  if (!isPulseLiveEnabled()) return new Response(null, { status: 404, headers });
  const source = process.env.PULSE_DATA_URL;
  if (!source) return Response.json({ error: "Pulse feed is not configured." }, { status: 503, headers });
  try {
    const url = new URL(source);
    const local = !isProductionMode() && url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    const remote = url.protocol === "https:" && url.hostname === "data.dao-ops.com" && !url.port && ["/prod/pulse.json", "/staging/pulse.json"].includes(url.pathname);
    if ((!local && !remote) || url.username || url.password || url.search || url.hash) throw new Error("Invalid feed origin.");
    return await withFeedRequest(source, PULSE_FEED_POLICY, async (r, context) => {
      if (!r.ok) { await r.body?.cancel(); throw new Error("Upstream unavailable."); }
      const feed = parsePulseWireFeed(await readBoundedJson(r, context, PULSE_FEED_POLICY));
      const body=JSON.stringify(feed);
      if(new TextEncoder().encode(body).byteLength>PULSE_FEED_POLICY.maximumPayloadBytes)throw new Error("Pulse response exceeds its limit.");
      return new Response(body,{headers:{...headers,"Content-Type":"application/json"}});
    });
  } catch {
    return Response.json({ error: "Pulse feed is unavailable or invalid." }, { status: 502, headers });
  }
}
