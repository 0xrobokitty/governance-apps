import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { LlyfiTradeTab } from "@/app/veyfi/components/tabs/LlyfiTradeTab";
const state = vi.hoisted(() => ({ redeem: { status: "idle" }, mint: { status: "idle" } }));
vi.mock("@/state/identity", () => ({ useIdentity: () => ({ canTransact: true, blacklistStatus: "clear", yfiBalance: 10n ** 20n, address: "0x1111111111111111111111111111111111111111" }) }));
vi.mock("@/lib/hooks/useVeyfi", () => ({
  useVeyfiAccount: () => ({ data: { inventory: { availableYfi: 10n ** 20n } } }),
  useLlyfiRedeem: () => ({ write: vi.fn(), state: state.redeem }),
  useLlyfiMint: () => ({ write: vi.fn(), state: state.mint }),
  veyfiKeys: { account: () => ["veyfi", "account"] },
}));
vi.mock("@/lib/hooks/useTokenApprove", () => ({ useTokenApprove: () => ({ write: vi.fn(), isLoading: false }) }));
vi.mock("@/lib/hooks/useTokenAllowance", () => ({ useTokenAllowance: () => ({ data: 10n ** 20n, refetch: vi.fn() }) }));
const token = {
  symbol: "sdYFI", name: "StakeDAO", address: "0x1111111111111111111111111111111111111111", depositorAddress: "0x2222222222222222222222222222222222222222",
  walletBalance: 10n ** 20n, stakedBalance: 0n, cooldownBalance: 0n, withdrawable: 0n, cooldown: null,
  allowance: 0n, redemptionAllowance: 0n, lockedYfi: 0n, veyfiBoost: 1, totalSupply: 0n, stakedAssets: 0n,
  depositorTotalSupply: 0n, depositorCapacity: 0n, exchangeRate: 1n,
  redemption: { enabled: true, capacity: 10n ** 20n, used: 0n, inventory: 10n ** 20n, fee: 0n },
} as const;
it("clears a completed trade but retains the next trade through signing and rejection", () => {
  const client = new QueryClient();
  const page = () => <QueryClientProvider client={client}><LlyfiTradeTab token={token} /></QueryClientProvider>;
  const { rerender } = render(page());
  fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "1" } });
  state.redeem.status = "success";
  rerender(page());
  expect(screen.getByPlaceholderText("0.00")).toHaveValue("");
  fireEvent.click(screen.getByRole("radio", { name: "Buy sdYFI" }));
  fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "2" } });
  state.mint.status = "signing";
  rerender(page());
  expect(screen.getByPlaceholderText("0.00")).toHaveValue("2");
  state.mint.status = "error";
  rerender(page());
  expect(screen.getByPlaceholderText("0.00")).toHaveValue("2");
});
