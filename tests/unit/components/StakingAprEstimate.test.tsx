import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StakingAprEstimate } from "@/app/styfi/components/StakingAprEstimate";
import { createMockStyfiAprSnapshot } from "@/lib/clients/styfi/apr-mock";
import { unavailableStyfiAprSnapshot } from "@/lib/clients/styfi/apr";

describe("staking APR estimates", () => {
  it("shows the configured Vote Boost range for direct staking", () => {
    render(<StakingAprEstimate asset="stYFI" snapshot={createMockStyfiAprSnapshot()} />);

    expect(screen.getByText("8%–20%")).toBeVisible();
    expect(screen.getByText("1×–2.5× Vote Boost")).toBeVisible();
  });

  it("uses the delegated full-participation estimate instead of its realized stream rate", () => {
    const snapshot = createMockStyfiAprSnapshot();
    snapshot.styfixAprBps = 1800;
    snapshot.fullBoostStyfixEstimateAprBps = 2100;
    render(<StakingAprEstimate asset="stYFIx" snapshot={snapshot} compact />);

    expect(screen.getByText("21%")).toBeVisible();
    expect(screen.getByText("At full YBC participation")).toBeVisible();
    expect(screen.queryByText("18%")).not.toBeInTheDocument();
  });

  it("does not invent rates when valuation is unavailable", () => {
    render(<StakingAprEstimate asset="stYFI" snapshot={unavailableStyfiAprSnapshot()} />);

    expect(screen.getByText("Unavailable")).toBeVisible();
    expect(screen.queryByText(/Vote Boost/)).not.toBeInTheDocument();
  });

  it("keeps the older-price qualification beside estimates", () => {
    const snapshot = createMockStyfiAprSnapshot();
    snapshot.valuation.stale = true;
    render(<StakingAprEstimate asset="stYFIx" snapshot={snapshot} />);

    expect(screen.getByText("Uses an older YFI price.")).toBeVisible();
  });
});
