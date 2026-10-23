import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { AprBreakdown, formatAprBps } from "@/app/styfi/components/AprBreakdown";
import type { StyfiAprSnapshot } from "@/lib/clients/styfi/apr-types";

const UNIT = 10n ** 18n;

function snapshot(): StyfiAprSnapshot {
  return {
    status: "available",
    blockNumber: 26_254_830n,
    timestamp: 1_792_752_527,
    currentEpoch: 18,
    rewardEpoch: 17,
    baseAprBps: 800,
    maxAprBps: 2000,
    styfixAprBps: 2000,
    delegatedParticipation: { votes: 6n, proposals: 6n },
    valuation: { yfiPriceCts: 200_000n, timestamp: 1_792_752_527, stale: false },
    account: {
      address: "0x0000000000000000000000000000000000000001",
      styfiActive: 25n * UNIT,
      styfixActive: 0n,
      externalActive: 0n,
      totalActive: 25n * UNIT,
      isYbcMember: false,
      yourStyfiAprBps: 1400,
      portfolioAprBps: 1400,
      baseAprBps: 800,
      delegatedAprBps: 0,
      voteBoostAprBps: 600,
      ybcAprBps: 0,
      externalAprBps: 0,
      annualRewards: 7000n * 10n ** 6n,
      participation: { votes: 3n, proposals: 6n },
    },
  };
}

describe("stYFI APR breakdown", () => {
  it("distinguishes the personal rate from base and delegated APR, with the reward delay", () => {
    render(<AprBreakdown snapshot={snapshot()} />);

    expect(screen.getByText("stYFI base APR").parentElement).toHaveTextContent("8%");
    expect(screen.getByText("stYFIx APR").parentElement).toHaveTextContent("20%");
    expect(screen.getByTestId("styfi-personal-apr")).toHaveTextContent("14%");
    expect(screen.getByTestId("styfi-participation")).toHaveTextContent("3 of 6 proposals");
    expect(screen.getByText(/Votes this epoch affect rewards from the next epoch/)).toBeVisible();
    expect(screen.getByText("Epoch 17 Vote Boost rewards are streaming in epoch 18.")).toBeVisible();
  });

  it("shows YBC income once among the additive portfolio contributions", () => {
    const data = snapshot();
    Object.assign(data.account!, {
      isYbcMember: true,
      ybcAprBps: 500,
      yourStyfiAprBps: 1900,
      portfolioAprBps: 1900,
    });
    render(<AprBreakdown snapshot={data} />);

    const contributions = within(screen.getByTestId("styfi-apr-contributions"));
    expect(contributions.getAllByText("YBC income")).toHaveLength(1);
    expect(contributions.getByText("YBC income").parentElement).toHaveTextContent("5%");
    expect(screen.getByText("Your total APR includes your share of YBC rewards.")).toBeVisible();
    expect(screen.getByTestId("styfi-personal-apr")).toHaveTextContent("19%");
  });

  it("does not attribute combined historical Vote Boost to stYFI when external positions exist", () => {
    const data = snapshot();
    Object.assign(data.account!, {
      externalActive: 25n * UNIT,
      totalActive: 50n * UNIT,
      yourStyfiAprBps: null,
      externalAprBps: 900,
    });
    render(<AprBreakdown snapshot={data} />);

    expect(screen.queryByText("Your stYFI position APR")).not.toBeInTheDocument();
    expect(screen.getByText("veYFI & liquid lockers")).toBeVisible();
    expect(screen.getByText(/Vote Boost combines your eligible positions/)).toBeVisible();
  });

  it("keeps unavailable APR distinct from a measured zero", () => {
    render(<AprBreakdown snapshot={null} />);

    expect(screen.getAllByText("Unavailable")).toHaveLength(3);
    expect(screen.getByRole("status")).toHaveTextContent("Current APR data is unavailable");
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
    expect(formatAprBps(0)).toBe("0%");
    expect(formatAprBps(Number.NaN)).toBe("Unavailable");
  });

  it("shows historical external income and the account-wide note after the external position closes", () => {
    const data = snapshot();
    Object.assign(data.account!, {
      externalActive: 0n,
      yourStyfiAprBps: null,
      externalAprBps: 300,
    });
    render(<AprBreakdown snapshot={data} />);

    expect(screen.queryByText("Your stYFI position APR")).not.toBeInTheDocument();
    expect(screen.getByText("veYFI & liquid lockers").parentElement).toHaveTextContent("3%");
    expect(screen.getByText(/including earlier holdings/)).toBeVisible();
    expect(screen.queryByText("Unavailable")).not.toBeInTheDocument();
  });

  it("warns about stale valuation and does not imply a participation percentage without proposals", () => {
    const data = snapshot();
    data.valuation.stale = true;
    data.account!.participation = { votes: 0n, proposals: 0n };
    render(<AprBreakdown snapshot={data} />);

    expect(screen.getByText("Estimates use an older YFI price.")).toBeVisible();
    expect(screen.getByText("No proposals in the current six-epoch window.")).toBeVisible();
  });

  it("does not show a personal Vote Boost or voting obligation for a delegated-only account", () => {
    const data = snapshot();
    Object.assign(data.account!, {
      styfiActive: 0n,
      styfixActive: 25n * UNIT,
      yourStyfiAprBps: null,
      baseAprBps: 0,
      delegatedAprBps: 2000,
      voteBoostAprBps: 0,
    });
    render(<AprBreakdown snapshot={data} />);

    expect(screen.queryByText("Your stYFI position APR")).not.toBeInTheDocument();
    expect(screen.queryByText("Your Vote Boost")).not.toBeInTheDocument();
    expect(screen.queryByTestId("styfi-participation")).not.toBeInTheDocument();
    expect(screen.getByText("stYFIx rewards")).toBeVisible();
  });
});
