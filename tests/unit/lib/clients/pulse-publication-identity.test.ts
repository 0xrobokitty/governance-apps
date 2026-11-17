import { afterEach, expect, it, vi } from "vitest";
import fixture from "@/tests/fixtures/pulse-live.json";
import { PulseFeedReader } from "@/lib/clients/pulse/feed";
afterEach(() => vi.unstubAllGlobals());
it("reuses identical publications and rejects same-time compact metadata changes", async () => {
  let payload = structuredClone(fixture);
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(payload))));
  const reader = new PulseFeedReader();
  const first = await reader.read();
  expect(await reader.read()).toBe(first);
  payload = structuredClone(fixture);
  // Tuple metadata is part of publication identity even when a chart omits it.
  payload.reviewedCapital.history[0][13] = Number(payload.reviewedCapital.history[0][13]) + 1;
  await expect(reader.read()).rejects.toThrow(/conflicts/);
  payload = structuredClone(fixture);
  expect(await reader.read()).toBe(first);
});
