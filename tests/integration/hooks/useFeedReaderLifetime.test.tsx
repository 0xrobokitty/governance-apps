import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import fixture from "@/tests/fixtures/pulse-live.json";
import { useLivePulse } from "@/lib/hooks/useLivePulse";

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}
afterEach(() => { vi.unstubAllGlobals(); });
it("rejects a Pulse rollback after remount and isolates separate query caches", async () => {
  const newer = { ...fixture, generatedAt: fixture.generatedAt + 1 };
  let payload = newer;
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(payload))));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const first = renderHook(useLivePulse, { wrapper: wrapper(client) });
  await waitFor(() => expect(first.result.current.data?.generatedAt).toBe(newer.generatedAt));
  first.unmount();
  payload = fixture;
  const second = renderHook(useLivePulse, { wrapper: wrapper(client) });
  await act(async () => { await second.result.current.refetch(); });
  await waitFor(() => expect(second.result.current.error?.message).toMatch(/regressed/));
  expect(second.result.current.data?.generatedAt).toBe(newer.generatedAt);
  second.unmount();
  const isolated = renderHook(useLivePulse, { wrapper: wrapper(new QueryClient()) });
  await waitFor(() => expect(isolated.result.current.data?.generatedAt).toBe(fixture.generatedAt));
});
