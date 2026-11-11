import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { XAudience } from "@/app/pulse/LivePulsePage";
import { parsePulseFeed } from "@/lib/clients/pulse/feed";
import { xFixture } from "../../../fixtures/pulse-x";
vi.mock("@/app/pulse/TrendChart", () => ({ TrendChart: ({label}:{label:string}) => <div role="img" aria-label={label} /> }));
const feed = () => {const f=xFixture(); return parsePulseFeed(f,f.generatedAt+60);};
describe("X audience card", () => {
  it("keeps three metrics in one card and performance collapsed", async () => {
    render(<XAudience feed={feed()} period={30} />);
    expect(screen.getAllByTestId("pulse-live-card")).toHaveLength(1);
    expect(screen.getAllByRole("tab")).toHaveLength(3);
    expect(screen.getByTestId("pulse-x-headline")).toHaveTextContent("1,900");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab",{name:"Observed link clicks"}));
    expect(screen.getByTestId("pulse-x-headline")).toHaveTextContent("19");
    fireEvent.click(screen.getByRole("tab",{name:"Followers"}));
    expect(screen.getByTestId("pulse-x-headline")).toHaveTextContent("90.02K");
    fireEvent.click(screen.getByText("Details",{exact:true}));
    expect(await screen.findByRole("dialog")).toHaveTextContent("Median impressions per post");
    expect(screen.getByText("Sample clicks / 1,000 impressions")).toBeVisible();
    expect(screen.getByText(/collection limit was reached/)).toBeVisible();
    expect(screen.getByText(/Net follower change:/)).toHaveTextContent("+2");
  });
  it("shows a baseline as unavailable activity, while follower count remains real", () => {
    const f=feed(); f.x!.history=f.x!.history.slice(0,1); f.x!.observedAt=f.x!.history[0].observedAt;
    const {rerender}=render(<XAudience feed={f} period={30} />);
    expect(screen.getByRole("tab",{name:"Followers"})).toHaveAttribute("aria-selected","true");
    expect(screen.getByTestId("pulse-x-headline")).toHaveTextContent("90K");
    fireEvent.click(screen.getByRole("tab",{name:"Impressions"}));
    expect(screen.getByTestId("pulse-x-headline")).toHaveTextContent("—");
    expect(screen.getByText(/Baseline saved/)).toBeVisible();
    rerender(<XAudience feed={f} period={90} />);
    expect(screen.getByRole("tab",{name:"Impressions"})).toHaveAttribute("aria-selected","true");
  });
  it("shows the measured subset beside clicks without inventing a missing-counter denominator", () => {
    render(<XAudience feed={feed()} period={30} />);
    fireEvent.click(screen.getByRole("tab", { name: "Observed link clicks" }));
    const coverage = screen.getByTestId("pulse-x-click-coverage");
    expect(coverage).toBeVisible();
    expect(coverage).toHaveTextContent("8 posts contributed comparable click counts.");
    expect(coverage).not.toHaveTextContent("Missing click values");
    expect(coverage).not.toHaveTextContent("12");
    expect(screen.getByTestId("pulse-x-headline")).toHaveTextContent("19");
    expect(screen.getAllByText("7D observed average")[0]).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "Followers" }));
    expect(screen.queryByTestId("pulse-x-click-coverage")).not.toBeInTheDocument();
  });
  it("keeps unknown click activity distinct from a measured zero", () => {
    const f = feed();
    f.x!.history.at(-1)!.linkClicks = null;
    f.x!.history.at(-1)!.measuredLinkPosts = 0;
    const { rerender } = render(<XAudience feed={f} period={30} />);
    fireEvent.click(screen.getByRole("tab", { name: "Observed link clicks" }));
    expect(screen.getByTestId("pulse-x-headline")).toHaveTextContent("—");
    expect(screen.getByTestId("pulse-x-click-coverage")).toHaveTextContent("0 posts contributed");
    f.x!.history.at(-1)!.linkClicks = 0;
    f.x!.history.at(-1)!.measuredLinkPosts = 8;
    rerender(<XAudience feed={f} period={30} />);
    expect(screen.getByTestId("pulse-x-headline")).toHaveTextContent("0");
    expect(screen.getByTestId("pulse-x-click-coverage")).toHaveTextContent("8 posts contributed");
  });
  it("does not describe a first-day baseline as missing click counters", () => {
    const f = feed();
    f.x!.history = f.x!.history.slice(0, 1);
    f.x!.observedAt = f.x!.history[0].observedAt;
    render(<XAudience feed={f} period={30} />);
    fireEvent.click(screen.getByRole("tab", { name: "Observed link clicks" }));
    expect(screen.getByTestId("pulse-x-headline")).toHaveTextContent("—");
    expect(screen.getByTestId("pulse-x-click-coverage")).toHaveTextContent("Daily click coverage starts after two consecutive observations.");
    expect(screen.getByTestId("pulse-x-click-coverage")).not.toHaveTextContent("0 posts");
  });
  it("explains an empty selected window without claiming collection is disabled", () => {
    const f=feed(); f.x!.status="stale"; f.generatedAt += 40*86400;
    render(<XAudience feed={f} period={7} />);
    expect(screen.queryByText("X history starts after collection is enabled.")).not.toBeInTheDocument();
    expect(screen.getAllByText("No verified observations in this window.").length).toBeGreaterThan(0);
  });
  it("distinguishes stale observations from a failed request", async () => {
    const f=feed(); f.x!.status="stale"; f.x!.reason="x_observation_stale";
    render(<XAudience feed={f} period={30} />);
    expect(screen.getByRole("status")).toHaveTextContent("X observations are stale.");
    expect(screen.queryByText(/latest X collection failed/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("pulse-x-details"));
    await screen.findByRole("dialog");
    expect(screen.getByRole("link",{name:/Open @yearnfi/})).toHaveAttribute("href","https://x.com/yearnfi");
  });
  it.each(["x_credentials_missing","x_budget_limit","x_http_401"])("explains %s without substituting data", (reason) => {
    const f=feed(); f.x!.history=[]; f.x!.observedAt=null; f.x!.status="unavailable"; f.x!.reason=reason;
    render(<XAudience feed={f} period={30}/>);
    expect(screen.getByTestId("pulse-x-headline")).toHaveTextContent("—");
    expect(screen.getByRole("status")).toBeVisible();
  });
});
