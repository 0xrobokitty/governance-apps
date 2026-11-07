import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { XAudience } from "@/app/pulse/LivePulsePage";
import { parsePulseFeed } from "@/lib/clients/pulse/feed";
import { xFixture } from "../../../fixtures/pulse-x";
vi.mock("@/app/pulse/TrendChart", () => ({ TrendChart: ({label}:{label:string}) => <div role="img" aria-label={label} /> }));
const feed = () => {const f=xFixture(); return parsePulseFeed(f,f.generatedAt+60);};
describe("X audience card", () => {
  it("keeps three metrics in one card and performance collapsed", () => {
    render(<XAudience feed={feed()} period={30} />);
    expect(screen.getAllByTestId("pulse-live-card")).toHaveLength(1);
    expect(screen.getAllByRole("tab")).toHaveLength(3);
    expect(screen.getByTestId("pulse-x-headline")).toHaveTextContent("1,900");
    expect(screen.getByTestId("pulse-x-details")).not.toHaveAttribute("open");
    fireEvent.click(screen.getByRole("tab",{name:"Link clicks"}));
    expect(screen.getByTestId("pulse-x-headline")).toHaveTextContent("19");
    fireEvent.click(screen.getByRole("tab",{name:"Followers"}));
    expect(screen.getByTestId("pulse-x-headline")).toHaveTextContent("90.02K");
    fireEvent.click(screen.getByText("Post performance & coverage"));
    expect(screen.getByText("Median impressions per post")).toBeVisible();
    expect(screen.getByText("Link clicks / 1,000 impressions")).toBeVisible();
    expect(screen.getByText(/collection limit was reached/)).toBeVisible();
    expect(screen.getByText(/Net follower change:/)).toHaveTextContent("+2");
  });
  it("shows a baseline as unavailable activity, while follower count remains real", () => {
    const f=feed(); f.x!.history=f.x!.history.slice(0,1); f.x!.observedAt=f.x!.history[0].observedAt;
    render(<XAudience feed={f} period={30} />);
    expect(screen.getByTestId("pulse-x-headline")).toHaveTextContent("—");
    expect(screen.getByText(/first observation establishes/)).toBeVisible();
    fireEvent.click(screen.getByRole("tab",{name:"Followers"}));
    expect(screen.getByTestId("pulse-x-headline")).toHaveTextContent("90K");
  });
  it.each(["x_credentials_missing","x_budget_limit","x_http_401"])("explains %s without substituting data", (reason) => {
    const f=feed(); f.x!.history=[]; f.x!.observedAt=null; f.x!.status="unavailable"; f.x!.reason=reason;
    render(<XAudience feed={f} period={30}/>);
    expect(screen.getByTestId("pulse-x-headline")).toHaveTextContent("—");
    expect(screen.getByRole("status")).toBeVisible();
  });
});
