import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AprBreakdown, formatAprBps } from "@/app/styfi/components/AprBreakdown";
import userEvent from "@testing-library/user-event";
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
    maxVoteBoostMultiplier: 2.5,
    fullBoostEstimateAprBps: 2000,
    fullBoostStyfixEstimateAprBps: 2000,
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
      voteBoostMultiplier: 1.75,
    },
  };
}

describe("stYFI APR breakdown", () => {
  function tooltipFor(trigger: HTMLElement) {
    return document.getElementById(trigger.getAttribute("aria-describedby")!)!;
  }

  it("shows one total APR with the additive calculation in a hover tooltip", async () => {
    const user = userEvent.setup();
    render(<AprBreakdown snapshot={snapshot()} />);
    const trigger = screen.getByRole("button", { name: "Your total APR" });
    const tooltip = tooltipFor(trigger);
    expect(screen.getAllByTestId("styfi-total-apr")).toHaveLength(1);
    expect(screen.getByTestId("styfi-total-apr")).toHaveTextContent("14%");
    expect(screen.queryByTestId("styfi-personal-apr")).not.toBeInTheDocument();
    expect(tooltip).toHaveClass("invisible");
    await user.hover(trigger);
    expect(tooltip).toHaveClass("visible");
    expect(within(tooltip).getByText("stYFI base rewards").parentElement).toHaveTextContent("8%");
    expect(within(tooltip).getByText("Your Vote Boost").parentElement).toHaveTextContent("6%");
    expect(within(tooltip).getByText("Total APR").parentElement).toHaveTextContent("14%");
  });

  it("opens by keyboard focus or tap and dismisses with Escape", async () => {
    const user = userEvent.setup();
    render(<AprBreakdown snapshot={snapshot()} />);
    const trigger = screen.getByRole("button", { name: "Your total APR" });
    const tooltip = tooltipFor(trigger);
    await user.tab();
    expect(trigger).toHaveFocus();
    expect(tooltip).toHaveClass("visible");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(tooltip).toHaveClass("invisible"));
    fireEvent.click(trigger);
    expect(trigger).toHaveFocus();
    expect(tooltip).toHaveClass("visible");
  });

  it("shows a compact multiplier and explains its formula and timing on focus", async () => {
    const user = userEvent.setup();
    render(<AprBreakdown snapshot={snapshot()} />);
    const trigger = screen.getByRole("button", { name: "Your vote boost: 1.75×" });
    const tooltip = tooltipFor(trigger);
    expect(screen.getByTestId("styfi-vote-boost")).toHaveTextContent("1.75×");
    expect(tooltip).toHaveClass("invisible");
    await user.click(trigger);
    expect(tooltip).toHaveClass("visible");
    expect(within(tooltip).getByText("3 of 6 proposals")).toBeInTheDocument();
    expect(within(tooltip).getByText("1 + (2.5 − 1) × 3 / 6")).toBeInTheDocument();
    expect(within(tooltip).getByText(/rewards from the next epoch/)).toBeInTheDocument();
    expect(within(tooltip).getByText(/does not multiply your total portfolio APR/)).toBeInTheDocument();
    expect(screen.getByTestId("styfi-total-apr")).toHaveTextContent("14%");
  });

  it("includes YBC income once while displaying the domain total unchanged", () => {
    const data = snapshot();
    Object.assign(data.account!, { isYbcMember: true, ybcAprBps: 500, portfolioAprBps: 1900 });
    render(<AprBreakdown snapshot={data} />);
    const tooltip = tooltipFor(screen.getByRole("button", { name: "Your total APR" }));
    const contributions = within(within(tooltip).getByTestId("styfi-apr-contributions"));
    expect(contributions.getAllByText("YBC income")).toHaveLength(1);
    expect(contributions.getByText("YBC income").parentElement).toHaveTextContent("5%");
    expect(screen.getByTestId("styfi-total-apr")).toHaveTextContent("19%");
  });

  it("retains historical attribution and closed external income inside the tooltip", () => {
    const data = snapshot();
    Object.assign(data.account!, { externalActive: 0n, yourStyfiAprBps: null, externalAprBps: 300 });
    render(<AprBreakdown snapshot={data} />);
    const tooltip = tooltipFor(screen.getByRole("button", { name: "Your total APR" }));
    expect(within(tooltip).getByText("veYFI & liquid lockers").parentElement).toHaveTextContent("3%");
    expect(within(tooltip).getByText(/including earlier holdings/)).toBeInTheDocument();
    expect(screen.queryByTestId("styfi-personal-apr")).not.toBeInTheDocument();
  });

  it("distinguishes unavailable rates from measured zero", () => {
    render(<AprBreakdown snapshot={null} />);
    const tooltip = tooltipFor(screen.getByRole("button", { name: "stYFIx APR" }));
    expect(screen.getByTestId("styfi-total-apr")).toHaveTextContent("Unavailable");
    expect(within(tooltip).getByRole("status")).toHaveTextContent("Current APR data is unavailable");
    expect(formatAprBps(0)).toBe("0%");
    expect(formatAprBps(Number.NaN)).toBe("Unavailable");
  });

  it("marks stale valuation and explains a neutral boost with no proposals", () => {
    const data = snapshot();
    data.valuation.stale = true;
    data.account!.participation = { votes: 0n, proposals: 0n };
    data.account!.voteBoostMultiplier = 1;
    render(<AprBreakdown snapshot={data} />);
    expect(screen.getByTestId("styfi-total-apr")).toHaveTextContent("14%*");
    const aprTooltip = tooltipFor(screen.getByRole("button", { name: "Your total APR" }));
    expect(within(aprTooltip).getByText("Estimates use an older YFI price.")).toBeInTheDocument();
    const boostTooltip = tooltipFor(screen.getByRole("button", { name: "Your vote boost: 1×" }));
    expect(within(boostTooltip).getByText(/No proposals count/)).toBeInTheDocument();
    expect(within(boostTooltip).queryByText(/× 0 \/ 0/)).not.toBeInTheDocument();
  });

  it("does not imply a personal voting obligation for delegated-only holdings", () => {
    const data = snapshot();
    Object.assign(data.account!, {
      styfiActive: 0n, styfixActive: 25n * UNIT, yourStyfiAprBps: null,
      baseAprBps: 0, delegatedAprBps: 2000, voteBoostAprBps: 0, portfolioAprBps: 2000,
    });
    render(<AprBreakdown snapshot={data} />);
    expect(screen.queryByTestId("styfi-vote-boost")).not.toBeInTheDocument();
    expect(screen.getByTestId("styfi-total-apr")).toHaveTextContent("20%");
    const tooltip = tooltipFor(screen.getByRole("button", { name: "Your total APR" }));
    expect(within(tooltip).getByText("stYFIx rewards")).toBeInTheDocument();
  });
});
