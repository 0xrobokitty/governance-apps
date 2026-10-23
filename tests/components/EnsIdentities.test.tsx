import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import type { PublicClient } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEnsIdentities } from "@/lib/hooks/useEnsIdentities";

const resolver = vi.hoisted(() => vi.fn());
vi.mock("@/lib/identity/ens", () => ({ ENS_MAX_ADDRESSES_PER_QUERY: 64, resolveVerifiedMainnetEnsIdentities: resolver }));
const address = "0x1111111111111111111111111111111111111111";
const first = { uid: "first", chain: { id: 1 } } as unknown as PublicClient;

describe("verified ENS lookup ownership", () => {
  beforeEach(() => resolver.mockReset());
  it("suppresses cached names when disabled or missing a mainnet client", async () => {
    resolver.mockResolvedValue({ [address]: "verified.eth" });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    const { result, rerender } = renderHook(({ client, enabled }: { client: PublicClient | null; enabled: boolean }) => useEnsIdentities(client, [address], enabled), { wrapper, initialProps: { client: first as PublicClient | null, enabled: true } });
    await waitFor(() => expect(result.current[address]).toBe("verified.eth"));
    rerender({ client: first, enabled: false });
    expect(result.current).toEqual({});
    rerender({ client: null, enabled: true });
    expect(result.current).toEqual({});
    rerender({ client: { ...first, chain: { id: 10 } } as unknown as PublicClient, enabled: true });
    expect(result.current).toEqual({});
    queryClient.clear();
  });

  it("does not serve a previous client's query result as the new client's result", async () => {
    resolver.mockResolvedValueOnce({ [address]: "old.eth" }).mockResolvedValue({});
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    const { result, rerender } = renderHook((client: PublicClient) => useEnsIdentities(client, [address]), { wrapper, initialProps: first });
    await waitFor(() => expect(result.current[address]).toBe("old.eth"));
    rerender({ ...first, uid: "second" });
    expect(result.current).toEqual({});
    await waitFor(() => expect(resolver).toHaveBeenCalledTimes(2));
    expect(result.current).toEqual({});
    queryClient.clear();
  });
});
