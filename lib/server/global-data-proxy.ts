import { readBoundedJson, withFeedRequest, type FeedTransportPolicy } from "@/lib/feed-transport";
import { GlobalFeedTimeoutError } from "@/lib/clients/global-payload";

/** Preserve legacy cache/status contracts while bounding the complete upstream read. */
export function createGlobalDataProxy(
  environmentVariable: string,
  label: string,
  policy: FeedTransportPolicy
) {
  return async function GET() {
    const jsonError = (message: string, status: number, upstreamStatus?: number, cacheControl = "no-store") =>
      Response.json({ error: message, upstreamStatus }, {
        status, headers: { "Cache-Control": cacheControl },
      });
    const upstreamUrl = process.env[environmentVariable];
    if (!upstreamUrl) return jsonError(`${environmentVariable} is not configured`, 500);
    try {
      return await withFeedRequest(upstreamUrl, policy, async (upstream, context) => {
        const cacheControl = upstream.headers.get("cache-control") ?? "no-store";
        if (!upstream.ok) {
          void upstream.body?.cancel().catch(() => undefined);
          return jsonError(`${label} upstream request failed`, upstream.status, upstream.status, cacheControl);
        }
        const json = await readBoundedJson(upstream, context, policy);
        return Response.json(json, { headers: { "Cache-Control": cacheControl } });
      });
    } catch (error) {
      if (error instanceof GlobalFeedTimeoutError) {
        return jsonError(`${label} upstream request timed out`, 504);
      }
      return jsonError(`${label} upstream request failed`, 500);
    }
  };
}
