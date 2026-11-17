import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { useYethRecovery } from "@/lib/hooks/useYethRecovery";
// Schema validation has its own full-envelope suite. This case exercises the
// reader's accepted-head guard and the hook's lifetime using minimal heads.
vi.mock("@/lib/clients/yeth/recovery/feed-schema", () => ({ parseRecoveryFeed: (value: unknown) => value }));
function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}
afterEach(() => vi.unstubAllGlobals());
it("retains the accepted recovery head when the wallet session remounts", async () => {
  let generatedAt = 200;
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ head: { generatedAt, observedAt: generatedAt, block: { number: "100", hash: "0xabc" } } }))));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const first = renderHook(() => useYethRecovery(), { wrapper: wrapper(client) });
  await waitFor(() => expect(first.result.current.data?.head.generatedAt).toBe(200));
  first.unmount();
  generatedAt = 100;
  const second = renderHook(() => useYethRecovery(), { wrapper: wrapper(client) });
  await act(async () => { await second.result.current.refetch(); });
  await waitFor(() => expect(second.result.current.error?.message).toMatch(/backwards/));
  expect(second.result.current.data?.head.generatedAt).toBe(200);
});
