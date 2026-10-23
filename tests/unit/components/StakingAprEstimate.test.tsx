import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StakingAprEstimate } from "@/app/styfi/components/StakingAprEstimate";
import { createMockStyfiAprSnapshot } from "@/lib/clients/styfi/apr-mock";
import { unavailableStyfiAprSnapshot } from "@/lib/clients/styfi/apr";

describe("staking APR estimates", () => {
  it("shows the configured Vote Boost range for direct staking", () => {
    render(<StakingAprEstimate asset="stYFI" snapshot={createMockStyfiAprSnapshot()} />);

    expect(screen.getByText("8%–20%")).toBeVisible();
    expect(screen.getByText("Estimated APR")).toBeVisible();
    expect(screen.queryByText(/Vote Boost/)).not.toBeInTheDocument();
  });

  it("uses the delegated full-participation estimate instead of its realized stream rate", () => {
    const snapshot = createMockStyfiAprSnapshot();
    snapshot.styfixAprBps = 1800;
    snapshot.fullBoostStyfixEstimateAprBps = 2100;
    render(<StakingAprEstimate asset="stYFIx" snapshot={snapshot} compact />);

    expect(screen.getByText("21%")).toBeVisible();
    expect(screen.getByText("Estimated APR")).toBeVisible();
    expect(screen.queryByText(/full YBC participation/)).not.toBeInTheDocument();
    expect(screen.queryByText("18%")).not.toBeInTheDocument();
  });

  it("does not invent rates when valuation is unavailable", () => {
    render(<StakingAprEstimate asset="stYFI" snapshot={unavailableStyfiAprSnapshot()} />);

    expect(screen.getByText("Unavailable")).toBeVisible();
    expect(screen.queryByText(/Vote Boost/)).not.toBeInTheDocument();
  });

  it("keeps the estimate concise when valuation freshness is qualified in the reward tooltip", () => {
    const snapshot = createMockStyfiAprSnapshot();
    snapshot.valuation.stale = true;
    render(<StakingAprEstimate asset="stYFIx" snapshot={snapshot} />);

    expect(screen.getByText("20%")).toBeVisible();
    expect(screen.queryByText(/older YFI price/)).not.toBeInTheDocument();
  });
});
