import { withFeedRequest } from "@/lib/feed-transport";
import { findRecoveryReferences, parseRecoveryFeed, type RecoveryFeedEnvelope, type RecoveryReference } from "./feed-schema";

export const RECOVERY_FEED_URL = "https://data.dao-ops.com/prod/yeth-recovery.json";
const OBJECT_LIMIT = 2 * 1024 * 1024;
const GRAPH_LIMIT = 12 * 1024 * 1024;
export function recoverySourceUrl(value = RECOVERY_FEED_URL, production = true): URL {
  const url = new URL(value);
  const isDefault = url.href === RECOVERY_FEED_URL;
  const local = !production && url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && url.pathname.endsWith("/yeth-recovery.json");
  if ((!isDefault && !local) || url.username || url.password || url.search || url.hash) throw new Error("Recovery source is not allowlisted");
  return url;
}
/** Fixed-origin graph fetch. Hashes are over published bytes, before JSON decoding. */
export async function fetchRecoveryEnvelope(source: URL, fetcher: typeof fetch = fetch, now = Math.floor(Date.now() / 1000)): Promise<RecoveryFeedEnvelope> {
  const deadline = Date.now() + 20000;
  let totalBytes = 0;
  const read = async (url: URL, ref?: RecoveryReference): Promise<unknown> => {
    if (Date.now() >= deadline) throw new Error("Recovery feed timed out");
    return withFeedRequest(url.href, {
      maximumPayloadBytes: OBJECT_LIMIT, requestTimeoutMs: Math.max(1, deadline - Date.now()),
      createPayloadTooLargeError: () => new Error("Recovery payload exceeds limits"),
      createTimeoutError: () => new Error("Recovery feed timed out"),
      payloadTooLargeCancelReason: "Recovery size limit", timeoutCancelReason: "Recovery deadline",
      fetchOptions: { cache: "no-store", redirect: "manual", headers: { Accept: "application/json" } },
    }, async (response, context) => {
      if (!response.ok || !response.body) { await response.body?.cancel(); throw new Error("Recovery source unavailable"); }
      const declared = Number(response.headers.get("content-length"));
      if (declared > OBJECT_LIMIT) { await response.body.cancel(); throw new Error("Recovery payload exceeds limits"); }
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      const cancel = () => { void reader.cancel().catch(() => undefined); };
      context.signal.addEventListener("abort", cancel, { once: true });
      try {
        while (true) {
          if (context.signal.aborted) throw new Error("Recovery feed timed out");
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength; totalBytes += value.byteLength;
          if (bytes > OBJECT_LIMIT || totalBytes > GRAPH_LIMIT) { await reader.cancel(); throw new Error("Recovery payload exceeds limits"); }
          chunks.push(value);
        }
      } finally { context.signal.removeEventListener("abort", cancel); try { reader.releaseLock(); } catch { /* pending abort */ } }
      const raw = new Uint8Array(bytes);
      let offset = 0;
      for (const chunk of chunks) { raw.set(chunk, offset); offset += chunk.length; }
      if (ref) {
        const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", raw)), byte => byte.toString(16).padStart(2,"0")).join("");
        if (digest !== ref.sha256) throw new Error("Recovery document digest mismatch");
      }
      return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw)) as unknown;
    }, fetcher);
  };
  const head = await read(source);
  const documents: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  const pending = findRecoveryReferences(head);
  const visited = new Set<string>();
  while (pending.length) {
    const batch = pending.splice(0, 6).filter(ref => { if (visited.has(ref.url)) return false; visited.add(ref.url); return true; });
    if (visited.size > 64) throw new Error("Recovery graph exceeds limits");
    const loaded = await Promise.all(batch.map(async ref => ({ ref, value: await read(new URL(ref.url, source), ref) })));
    for (const { ref, value } of loaded) { documents[ref.url] = value; pending.push(...findRecoveryReferences(value)); }
  }
  const envelope = { head, documents };
  parseRecoveryFeed(envelope, now);
  return envelope;
}
