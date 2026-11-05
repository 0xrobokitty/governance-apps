import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RecoveryPpsChart } from "@/app/yeth/components/RecoveryPpsChart";
import type { RecoveryPpsChartData } from "@/lib/clients/yeth/recovery/chart";

afterEach(cleanup);
const now = 1793810447;
const first = { at: 1771891200, pps: 1, kind: "observed" as const };
const current = { at: now, pps: 1.07327, kind: "observed" as const };
const target = { at: now + 11927 * 86400, pps: 3.12883, kind: "projected" as const };
const data: RecoveryPpsChartData = {
  current, history: [first, current], projected: [target], targetPps: target.pps, estimatedAt: target.at,
  targetReached: false, maxPps: target.pps, startAt: first.at, endAt: target.at, points: [first, current, target],
};
describe("PPS inspection", () => {
  it("keeps the exact target visible and distinguishes projected from observed values", () => {
    render(<RecoveryPpsChart data={data} />);
    expect(screen.getByTestId("pps-target")).toHaveTextContent("3.128830");
    expect(screen.getByTestId("pps-inspection")).toHaveTextContent("Observed");
    expect(screen.getByTestId("pps-inspection")).toHaveTextContent("1.073270");
    const chart = screen.getByRole("slider", { name: "Inspect recovery PPS" });
    fireEvent.keyDown(chart, { key: "End" });
    expect(chart).toHaveAttribute("aria-valuetext", expect.stringContaining("At the current pace"));
    expect(screen.getByTestId("pps-inspection")).toHaveTextContent("3.128830");
    fireEvent.keyDown(chart, { key: "Home" });
    expect(screen.getByTestId("pps-inspection")).toHaveTextContent("24 Feb 2026");
    fireEvent.keyDown(chart, { key: "ArrowRight" });
    expect(screen.getByTestId("pps-inspection")).toHaveTextContent("1.073270");
  });
  it("retains the target when no defensible forecast is available", () => {
    render(<RecoveryPpsChart data={{...data, projected: [], points: data.history, endAt: now, estimatedAt: null}} />);
    expect(screen.queryByTestId("pps-projection-line")).not.toBeInTheDocument();
    expect(screen.getByTestId("pps-target-line")).toBeInTheDocument();
    expect(screen.getByText(/Projection unavailable/)).toBeVisible();
  });
});
