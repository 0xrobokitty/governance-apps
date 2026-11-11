import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TvlCard, MetricCard } from "@/app/pulse/LivePulsePage";
import { parsePulseFeed } from "@/lib/clients/pulse/feed";
import { tvlFixture } from "../../../fixtures/pulse-tvl";
vi.mock("@/app/pulse/TrendChart", () => ({ TrendChart: ({label}:{label:string}) => <div role="img" aria-label={label} /> }));
const feed = () => {const f=tvlFixture();return parsePulseFeed(f,f.generatedAt+60);};
describe("Pulse history cards", () => {
  it("shows the real TVL source, provisional quote, count and accounting annotation", async () => {
    render(<TvlCard feed={feed()} period={90} />);
    expect(screen.getByRole("heading", {name:"Vault TVL"})).toBeVisible();
    expect(screen.getByText("Estimated",{exact:true})).toBeVisible();
    expect(screen.getAllByText(/90\/90 days observed/)[0]).toBeVisible();
    expect(screen.getByTestId("pulse-tvl-annotation")).toHaveTextContent("16 Oct · TVL accounting changed");
    expect(screen.getAllByText(/Latest quote · provisional/)[0]).toBeVisible();
    fireEvent.click(screen.getByTestId("pulse-tvl-annotation"));
    expect(await screen.findByRole("dialog")).toHaveTextContent(feed().tvlHistory!.annotations[0].detail);
  });
  it("shows absence instead of silently substituting Kong TVL", () => {
    const f=feed(); delete f.tvlHistory;
    render(<TvlCard feed={f} period={90} />);
    expect(screen.getByText(/No verified TVL observations/)).toBeVisible();
    expect(screen.getAllByText("Unavailable",{exact:true})).toHaveLength(1);
  });
  it("keeps an available one-point metric current while exposing incomplete history", () => {
    render(<MetricCard feed={feed()} period={90} title="YFI" note="Test" href="https://yearn.fi" options={[{value:"stake",label:"Stake",ids:["yfi.staked"]}]} />);
    expect(screen.getByText("Current",{exact:true})).toBeVisible();
    expect(screen.getByText(/1\/90 days observed/)).toBeVisible();
    expect(screen.queryByText("Partial coverage")).not.toBeInTheDocument();
  });
});
