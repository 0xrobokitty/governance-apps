import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AccountSummary } from "@/app/styfi/components/AccountSummary";
import type { ExternalPosition } from "@/app/styfi/external-positions";
import type { StyfiYbcMembership } from "@/lib/clients/styfi/apr-types";

vi.mock("@/lib/hooks/useStyfiApr", () => ({
  useStyfiApr: () => ({ data: null, isLoading: false }),
}));

const emptyBalances = {
  styfi: {
    active: 0n,
    unstaking: 0n,
    withdrawable: 0n,
    total: 0n,
  },
  styfix: {
    active: 0n,
    unstaking: 0n,
    withdrawable: 0n,
    total: 0n,
  },
} as const;

const activeBalances = {
  styfi: {
    active: 25n * 10n ** 18n,
    unstaking: 0n,
    withdrawable: 0n,
    total: 25n * 10n ** 18n,
  },
  styfix: {
    active: 0n,
    unstaking: 0n,
    withdrawable: 0n,
    total: 0n,
  },
} as const;

const externalPositions: ExternalPosition[] = [
  {
    id: "sdYFI",
    symbol: "sdYFI",
    subLabel: "StakeDAO",
    activeYfi: 40n * 10n ** 18n,
    unstakingYfi: 5n * 10n ** 18n,
    withdrawableYfi: 3n * 10n ** 18n,
    balanceYfi: 48n * 10n ** 18n,
    activeBalanceYfi: 40n * 10n ** 18n,
    boostMultiplier: 1.95,
    effectiveApr: 0.52,
    href: "/veyfi?focus=manage#llyfi-ledger",
  },
  {
    id: "veyfi",
    symbol: "veYFI",
    subLabel: "Migrated lock",
    activeYfi: 100n * 10n ** 18n,
    unstakingYfi: 0n,
    withdrawableYfi: 0n,
    balanceYfi: 100n * 10n ** 18n,
    activeBalanceYfi: 100n * 10n ** 18n,
    boostMultiplier: 1.5,
    effectiveApr: 0.75,
    unlockTime: 1_800_000_000,
    href: "/veyfi",
  },
];

function renderSummary(
  balances: {
    styfi: {
      active: bigint;
      unstaking: bigint;
      withdrawable: bigint;
      total: bigint;
    };
    styfix: {
      active: bigint;
      unstaking: bigint;
      withdrawable: bigint;
      total: bigint;
    };
  },
  external: ExternalPosition[],
  now = 1_799_999_999,
  ybcMembership?: StyfiYbcMembership,
) {
  return render(
    <AccountSummary
      now={now}
      selectedAsset="stYFIx"
      onSelectAsset={vi.fn()}
      balances={balances}
      externalPositions={external}
      ybcMembership={ybcMembership}
      isLoading={false}
      isConnected
      isWrongNetwork={false}
    />
  );
}

describe("AccountSummary", () => {
  it("marks a veYFI lock as unlocked at the supplied clock boundary", () => {
    renderSummary(emptyBalances, externalPositions, 1_800_000_000);

    expect(screen.getByText("Unlocked")).toBeInTheDocument();
    expect(screen.queryByText("Locked")).not.toBeInTheDocument();
  });

  it("renders ModeComparison only when balances are zero and no external positions exist", () => {
    renderSummary(emptyBalances, []);

    expect(screen.getByText("Compare stYFI and stYFIx")).toBeInTheDocument();
    expect(screen.getByText("Vote-dependent APR")).toBeInTheDocument();
    expect(screen.getByText("Delegated")).toBeInTheDocument();
    expect(screen.queryByTestId("styfi-position-row")).not.toBeInTheDocument();
    expect(screen.queryByTestId("external-position-row")).not.toBeInTheDocument();
  });

  it("renders external rows and ModeComparison in hybrid state", () => {
    renderSummary(emptyBalances, externalPositions);

    expect(screen.getByText("Your Governance Positions")).toBeInTheDocument();
    expect(screen.getAllByTestId("external-position-row")).toHaveLength(2);
    expect(screen.getByText("Migrated lock")).toBeInTheDocument();
    expect(screen.getByText("StakeDAO")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.getByText("Locked")).toBeInTheDocument();
    expect(screen.getByText("Choose How to Stake")).toBeInTheDocument();
    expect(screen.getByText("Vote-dependent APR")).toBeInTheDocument();
    expect(screen.getByText("Delegated")).toBeInTheDocument();
    expect(screen.queryByTestId("styfi-position-row")).not.toBeInTheDocument();
  });

  it("renders stYFI rows and external rows in active state", () => {
    renderSummary(activeBalances, externalPositions);

    expect(screen.getByText("Staked YFI")).toBeInTheDocument();
    expect(screen.getByText("Other Governance Positions")).toBeInTheDocument();
    expect(screen.getAllByText("Total Position")).toHaveLength(3);
    expect(screen.getAllByTestId("styfi-position-row")).toHaveLength(1);
    expect(screen.getAllByTestId("external-position-row")).toHaveLength(2);
    expect(
      screen.queryByText("Compare stYFI and stYFIx")
    ).not.toBeInTheDocument();
  });

  it("renders supYFI with compact unstaking metrics", () => {
    renderSummary(emptyBalances, [
      {
        id: "upYFI",
        symbol: "upYFI",
        subLabel: "1UP",
        activeYfi: 4_700_000n * 10n ** 18n,
        unstakingYfi: 1_200_000n * 10n ** 18n,
        withdrawableYfi: 300_000n * 10n ** 18n,
        balanceYfi: 67n * 10n ** 18n,
        activeBalanceYfi: 67n * 10n ** 18n,
        boostMultiplier: 1.9,
        effectiveApr: 0.61,
        href: "/veyfi?focus=manage#llyfi-ledger",
      },
    ]);

    expect(screen.getByText("supYFI")).toBeInTheDocument();
    expect(screen.getByText("4.7M")).toBeInTheDocument();
    expect(screen.getByText("1.2M")).toBeInTheDocument();
    expect(screen.getByText("300K")).toBeInTheDocument();
  });

  it("groups a single YBC backing metric with other positions and explains the calculation on focus", async () => {
    renderSummary(activeBalances, externalPositions, undefined, {
      eligibleStakeYfi: 25n * 10n ** 18n,
      totalEligibleStakeYfi: 500n * 10n ** 18n,
      rewardShareBps: 500n,
      totalRewardBackingYfi: 100n * 10n ** 18n,
      rewardBackingYfi: 5n * 10n ** 18n,
      annualRewardTokens: 10_000_000n,
      rewardsEnabled: true,
    });
    const row = within(screen.getByTestId("ybc-membership-row"));
    expect(screen.getAllByText("Other Governance Positions")).toHaveLength(1);
    expect(screen.queryByText("Collective rewards")).not.toBeInTheDocument();
    expect(row.getByText("Yearn Builders Collective")).toBeInTheDocument();
    expect(row.getByText("YBC", { exact: true })).toBeInTheDocument();
    expect(row.getByText("5 YFI")).toBeInTheDocument();
    expect(row.queryByText("5%", { exact: true })).not.toBeInTheDocument();
    expect(row.getByRole("link", { name: "View YBC membership" })).toHaveAttribute("href", "/ybc");
    expect(row.queryByText("Withdrawable")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("styfi-position-row")).toHaveLength(1);
    expect(screen.getAllByTestId("external-position-row")).toHaveLength(2);
    const trigger = row.getByRole("button", { name: "Estimated backing" });
    const tooltip = row.getByRole("tooltip");
    expect(tooltip).toHaveClass("invisible");
    fireEvent.click(trigger);
    expect(trigger).toHaveFocus();
    expect(tooltip).toHaveClass("visible");
    expect(tooltip).toHaveTextContent("5% × 100 YFI ≈ 5 YFI");
    expect(tooltip).toHaveTextContent("It is not an additional deposit or a withdrawable balance.");
    fireEvent.keyDown(trigger, { key: "Escape" });
    await waitFor(() => expect(tooltip).toHaveClass("invisible"));
  });

  it("explains disabled rewards while retaining a zero-stake membership", () => {
    renderSummary(emptyBalances, [], undefined, {
      eligibleStakeYfi: 0n, totalEligibleStakeYfi: 500n * 10n ** 18n,
      rewardShareBps: 0n, totalRewardBackingYfi: 100n * 10n ** 18n, rewardBackingYfi: 0n, annualRewardTokens: 0n, rewardsEnabled: false,
    });
    const row = within(screen.getByTestId("ybc-membership-row"));
    expect(row.getByText("0 YFI")).toBeInTheDocument();
    fireEvent.click(row.getByRole("button", { name: "Estimated backing" }));
    expect(row.getByRole("tooltip")).toHaveTextContent("New YBC rewards are disabled. Previously earned rewards remain claimable.");
  });
});
