import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RewardsCard } from "@/app/styfi/components/cards/RewardsCard";
import { REWARD_TOKEN_CONFIG } from "@/lib/constants";
import type { StyfiAccountState } from "@/lib/clients/styfi/types";
import type { Address } from "viem";

const {
  mockUseStyfiAccount,
  mockUseStyfiClaimRewards,
  mockUseStyfiApr,
  mockUseRewardTokenInfo,
} = vi.hoisted(() => ({
  mockUseStyfiAccount: vi.fn(),
  mockUseStyfiClaimRewards: vi.fn(),
  mockUseStyfiApr: vi.fn(),
  mockUseRewardTokenInfo: vi.fn(),
}));

vi.mock("@/lib/hooks/useStyfi", () => ({
  useStyfiAccount: () => mockUseStyfiAccount(),
  useStyfiClaimRewards: () => mockUseStyfiClaimRewards(),
  useRewardTokenInfo: () => mockUseRewardTokenInfo(),
}));

vi.mock("@/lib/hooks/useStyfiApr", () => ({
  useStyfiApr: () => mockUseStyfiApr(),
}));

vi.mock("@/lib/hooks/useEpochClock", () => ({
  useEpochClock: () => ({
    epochInfo: {
      currentEpoch: 1,
      epochEnd: 1_710_000_000,
      nextEpochStart: 1_710_000_000,
    },
  }),
}));

const accountState: StyfiAccountState = {
  address: "0x000000000000000000000000000000000000dEaD" as Address,
  isBlacklisted: false,
  blacklistStatus: "clear",
  yfiBalance: 0n,
  styfiActive: 0n,
  styfiInCooldown: 0n,
  styfiUnlocked: 0n,
  styfiWithdrawable: 0n,
  styfiCooldown: null,
  styfiX: {
    sharesActive: 0n,
    sharesInCooldown: 0n,
    assetsActive: 0n,
    assetsInCooldown: 0n,
    assetsUnlocked: 0n,
    assetsWithdrawable: 0n,
    cooldown: null,
  },
  claimableGenericRewards: 0n,
  claimableBoostedRewards: 0n,
  accruingGenericRewards: 0n,
  accruingBoostedRewards: 0n,
  allowances: {
    yfiToStyfi: 0n,
    yfiToStyfiX: 0n,
  },
  epoch: {
    currentEpoch: 1,
    epochEnd: 1_710_000_000,
    nextEpochStart: 1_710_000_000,
  },
  rewardToken: REWARD_TOKEN_CONFIG,
};

describe("RewardsCard reward token link", () => {
  beforeEach(() => {
    mockUseStyfiAccount.mockReturnValue({
      data: accountState,
      isLoading: false,
    });
    mockUseStyfiClaimRewards.mockReturnValue({
      write: vi.fn(),
      state: { status: "idle" },
    });
    mockUseStyfiApr.mockReturnValue({ data: null, isLoading: false, isError: true });
    mockUseRewardTokenInfo.mockReturnValue({
      apy: "6.24%",
      convertBalanceToUsd: vi.fn(() => null),
    });
  });

  it("links the yvUSDC-1 symbol to the Yearn vault", () => {
    render(<RewardsCard />);

    const link = screen.getByRole("link", {
      name: "yvUSDC-1 Yearn vault",
    });

    expect(link).toHaveTextContent("yvUSDC-1");
    expect(link).toHaveAttribute("href", REWARD_TOKEN_CONFIG.vaultUrl);
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("keeps claims available when APR data is unavailable", () => {
    mockUseStyfiAccount.mockReturnValue({
      data: { ...accountState, claimableGenericRewards: 1_000_000n },
      isLoading: false,
    });
    render(<RewardsCard />);

    expect(screen.getByRole("button", { name: "Claim Rewards" })).toBeEnabled();
    expect(screen.getByTestId("styfi-total-apr")).toHaveTextContent("Unavailable");
    expect(screen.getByRole("status")).toHaveTextContent("Current APR data is unavailable");
  });
});
