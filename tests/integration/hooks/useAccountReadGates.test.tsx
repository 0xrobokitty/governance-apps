import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useStyfiApr } from "@/lib/hooks/useStyfiApr";
import { useStyfiVotingPower } from "@/lib/hooks/useStyfiVotingPower";
import { useStyfiStake } from "@/lib/hooks/useStyfi";

const mocks = vi.hoisted(() => ({
  styfiRead: vi.fn(), veyfiRead: vi.fn(), prepare: vi.fn(),
  apr: vi.fn(), voting: vi.fn(), mock: false,
}));
vi.mock("@/web3/wagmi", () => ({ wagmiConfig: {} }));
const address = "0x1111111111111111111111111111111111111111";
vi.mock("wagmi", () => ({ useAccount: () => ({ address, isConnected: true }) }));
vi.mock("@/state/identity", () => ({ useIdentity: () => ({ address, isConnected: true, isWrongNetwork: false, chainId: 1 }) }));
vi.mock("@/state/protocol", () => ({ useProtocol: () => ({
  usesMockBackend: mocks.mock, publicClient: {}, mainnetPublicClient: {}, globalData: null,
  styfi: { getAccountState: mocks.styfiRead, prepareStake: mocks.prepare },
  veyfi: { getAccountState: mocks.veyfiRead },
}) }));
vi.mock("@/lib/hooks/useYbcData", () => ({ useYbcData: () => ({ data: undefined }) }));
vi.mock("@/lib/clients/styfi/apr-onchain", () => ({ fetchStyfiAprSnapshot: () => mocks.apr() }));
vi.mock("@/lib/clients/styfi/voting-power", () => ({ readStyfiVotingPower: () => mocks.voting() }));
vi.mock("@/components/ui/Toast", () => ({ toast: { loading: vi.fn(), success: vi.fn(), error: vi.fn(), dismiss: vi.fn() } }));

function wrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}
beforeEach(() => { vi.resetAllMocks(); mocks.mock = false; mocks.apr.mockResolvedValue({}); mocks.voting.mockResolvedValue({}); });

describe("domain query and write lifecycle", () => {
  it("does not fetch legacy account state for live APR or voting power", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderHook(() => ({ apr: useStyfiApr(), voting: useStyfiVotingPower() }), { wrapper: wrapper(queryClient) });
    await waitFor(() => expect(mocks.apr).toHaveBeenCalledOnce());
    await waitFor(() => expect(mocks.voting).toHaveBeenCalledOnce());
    expect(mocks.styfiRead).not.toHaveBeenCalled();
    expect(mocks.veyfiRead).not.toHaveBeenCalled();
  });

  it("reports preparation failure through the transaction state", async () => {
    mocks.prepare.mockRejectedValue(new Error("simulation reverted"));
    const { result } = renderHook(useStyfiStake, { wrapper: wrapper(new QueryClient()) });
    await act(async () => { await result.current.write("stYFI", 1n); });
    expect(result.current.state).toMatchObject({ status: "error", errorType: "revert" });
  });

  it("starts independent refreshes together after a confirmed mock write", async () => {
    mocks.mock = true;
    mocks.prepare.mockResolvedValue(async () => "0x1234");
    const queryClient = new QueryClient();
    const releases: Array<() => void> = [];
    const invalidate = vi.spyOn(queryClient, "invalidateQueries").mockImplementation(() => new Promise<void>(resolve => releases.push(resolve)));
    const { result } = renderHook(useStyfiStake, { wrapper: wrapper(queryClient) });
    let pending!: Promise<void>;
    await act(async () => { pending = result.current.write("stYFI", 1n); });
    expect(invalidate).toHaveBeenCalledTimes(4);
    expect(result.current.state.status).toBe("success");
    await act(async () => { releases.forEach(resolve => resolve()); await pending; });
  });
});
