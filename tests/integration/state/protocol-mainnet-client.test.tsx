import type { ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import type { PublicClient } from "viem";
import { afterEach, describe, expect, it, vi } from "vitest";

const { rpcClient, walletState } = vi.hoisted(() => ({
  rpcClient: { chain: { id: 1 } },
  walletState: {
    current: null as { chain: { id: number } } | null,
  },
}));

vi.mock("wagmi", async (importOriginal) => ({
  ...await importOriginal<typeof import("wagmi")>(),
  usePublicClient: () => rpcClient,
  useWalletClient: () => ({ data: walletState.current }),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/ybc",
  useSelectedLayoutSegments: () => ["ybc"],
}));

vi.mock("@/lib/hooks/useHostname", () => ({
  useHostname: () => "ybc.yearn.fi",
}));

vi.mock("@/lib/hooks/useGlobalData", () => ({
  useGlobalData: () => ({ data: null }),
}));

vi.mock("@/lib/hooks/useYethGlobalData", () => ({
  useYethGlobalData: () => ({ data: null }),
}));

vi.mock("@/components/TestBridgeListener", () => ({
  TestBridgeListener: () => null,
}));

describe("ProtocolProvider mainnet read client", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps a mainnet read client for disconnected and wrong-chain viewers", async () => {
    vi.stubEnv("NEXT_PUBLIC_USE_MOCKS", "false");
    vi.stubEnv("NEXT_PUBLIC_E2E", "false");
    const { ProtocolProvider, useProtocol } = await import(
      "@/state/protocol"
    );
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ProtocolProvider>{children}</ProtocolProvider>
    );
    const { result, rerender } = renderHook(() => useProtocol(), {
      wrapper,
    });

    expect(result.current.mainnetPublicClient).toBe(
      rpcClient as unknown as PublicClient
    );
    expect(result.current.publicClient).toBeNull();

    act(() => {
      walletState.current = { chain: { id: 10 } };
    });
    rerender();
    expect(result.current.mainnetPublicClient).toBe(
      rpcClient as unknown as PublicClient
    );
    expect(result.current.publicClient).toBeNull();

    act(() => {
      walletState.current = { chain: { id: 1 } };
    });
    rerender();
    expect(result.current.publicClient).toBe(
      rpcClient as unknown as PublicClient
    );
  });
});
