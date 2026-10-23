import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { StakeTab } from "@/app/styfi/components/cards/stake/StakeTab";
import { renderWithProviders } from "@/tests/test-utils";

const {
  mockUseIdentity,
  mockUseStyfiAccount,
  mockUseStyfiStake,
  mockUseTokenApprove,
  mockUseTokenAllowance,
} = vi.hoisted(() => ({
  mockUseIdentity: vi.fn(),
  mockUseStyfiAccount: vi.fn(),
  mockUseStyfiStake: vi.fn(),
  mockUseTokenApprove: vi.fn(),
  mockUseTokenAllowance: vi.fn(),
}));

vi.mock("@/state/identity", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/state/identity")>();
  return {
    ...actual,
    useIdentity: () => mockUseIdentity(),
  };
});

vi.mock("@/lib/hooks/useStyfi", () => ({
  useStyfiAccount: () => mockUseStyfiAccount(),
  useStyfiStake: () => mockUseStyfiStake(),
  styfiKeys: {
    account: (address: string | undefined) => ["protocol", "styfi", address],
  },
}));

vi.mock("@/lib/hooks/useTokenApprove", () => ({
  useTokenApprove: () => mockUseTokenApprove(),
}));

vi.mock("@/lib/hooks/useTokenAllowance", () => ({
  useTokenAllowance: () => mockUseTokenAllowance(),
}));

const ONE = 10n ** 18n;

describe("stYFI StakeTab blacklist behavior", () => {
  beforeEach(() => {
    mockUseIdentity.mockReturnValue({
      canTransact: true,
      yfiBalance: 5n * ONE,
      blacklistStatus: "unknown",
      isLoading: false,
    });
    mockUseStyfiAccount.mockReturnValue({
      data: { address: "0x3333333333333333333333333333333333333333" },
      isLoading: false,
    });
    mockUseStyfiStake.mockReturnValue({
      write: vi.fn(),
      state: { status: "idle" },
    });
    mockUseTokenApprove.mockReturnValue({
      write: vi.fn(),
      isLoading: false,
    });
    mockUseTokenAllowance.mockReturnValue({
      data: 10n * ONE,
      refetch: vi.fn().mockResolvedValue({ data: 10n * ONE }),
    });
  });

  it("keeps staking enabled when blacklist status is unknown", () => {
    renderWithProviders(<StakeTab asset="stYFI" />);

    fireEvent.change(screen.getByPlaceholderText("0.00"), {
      target: { value: "1" },
    });

    expect(screen.getByRole("button", { name: /Stake YFI/i })).toBeEnabled();
    expect(screen.queryByText(/Blacklist status/i)).not.toBeInTheDocument();
  });
});
