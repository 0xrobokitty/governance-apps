import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LivePulsePage } from "@/app/pulse/LivePulsePage";
import { parsePulseFeed } from "@/lib/clients/pulse/feed";
import { globalCapitalFixture } from "../../../fixtures/pulse-global-capital";
import {marketFixture} from "../../../fixtures/pulse-market-history";
import fixture from "../../../fixtures/pulse-live.json";
const query=vi.hoisted(()=>({data:undefined as unknown,stale:false,isError:false,isPending:false,refetch:vi.fn()}));
vi.mock("@/lib/hooks/useLivePulse",()=>({useLivePulse:()=>query}));
vi.mock("@/app/pulse/TrendChart",()=>({TrendChart:({label}:{label:string})=><div role="img" aria-label={label}/>}));
describe("Pulse overview and method dialogs",()=>{
 it("keeps the agreed nine-card hierarchy and recovery outside the grid",async()=>{
  const f=globalCapitalFixture();query.data=parsePulseFeed(f,f.generatedAt+60);
  render(<LivePulsePage/>);
  const grid=screen.getByTestId("pulse-main-grid");
  expect(within(grid).getAllByTestId("pulse-live-card")).toHaveLength(9);
  expect(within(grid).getAllByRole("heading").map(h=>h.textContent)).toEqual(["Vault TVL","Net vault flows","Depositing & withdrawing accounts","yLockers","Flex","X audience","YFI governance","Treasury reserves","Product movers"]);
  expect(screen.getByTestId("pulse-recovery-section")).toBeVisible();
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  expect(screen.queryByText(/Integrations can move funds/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:"Details: Net vault flows"}));
  const dialog=await screen.findByRole("dialog");
  expect(dialog).toHaveTextContent("Both USD series use the same axis");
  fireEvent.keyDown(document,{key:"Escape"});
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab",{name:"Flow balance"}));
  expect(screen.getByRole("tabpanel",{name:"Flow balance"})).toHaveTextContent("60%");
 });
 it("keeps recovery available in wall view without adding a tenth grid card",async()=>{
  const feed=parsePulseFeed(fixture,fixture.generatedAt+60);feed.metrics.find(m=>m.id==="recovery.target_gap_weth")!.status="stale";query.data=feed;render(<LivePulsePage/>);
  fireEvent.click(screen.getByRole("button",{name:"Wall view"}));
  expect(screen.queryByTestId("pulse-recovery-section")).not.toBeInTheDocument();
  expect(screen.getAllByTestId("pulse-live-card")).toHaveLength(9);
  fireEvent.click(screen.getByRole("button",{name:"Recovery & loans"}));
  const dialog=await screen.findByRole("dialog",{name:"Recovery & loans"});
  expect(within(dialog).getByRole("tab",{name:"yETH shortfall"})).toBeVisible();
  expect(within(dialog).getByRole("tab",{name:"Resupply receivable"})).toBeVisible();
  expect(within(dialog).getByTestId("pulse-embedded-status")).toHaveTextContent("Stale");
  fireEvent.click(within(dialog).getByRole("tab",{name:"Resupply receivable"}));
  expect(within(dialog).getByRole("link",{name:/Open source dashboard/})).toHaveAttribute("href","https://treasury.yearn.fi");
  expect(screen.getAllByRole("dialog")).toHaveLength(1);
  expect(within(dialog).queryByRole("button",{name:/Details:/})).not.toBeInTheDocument();
 });
 it("explains a shorter capital publication window in a modal",async()=>{
  const f=parsePulseFeed(fixture,fixture.generatedAt+60),until=Math.floor(f.generatedAt/86400)*86400;
  f.reviewedCapital!.coverage.publishedHistory={days:90,from:until-90*86400,until,durableRetentionDays:740,basis:"Last90 closedUTC days."};query.data=f;
  render(<LivePulsePage/>);fireEvent.click(screen.getByRole("button",{name:"365D"}));
  expect(screen.getByTestId("pulse-capital-horizon")).toHaveTextContent("up to 90 closed days published");
  fireEvent.click(screen.getByRole("button",{name:"Coverage & methods"}));
  expect(await screen.findByRole("dialog")).toHaveTextContent("Earlier capital dates are outside");
 });
 it("renders source gap text literally inside the modal",async()=>{
  const f=parsePulseFeed(fixture,fixture.generatedAt+60);
  const literal="<script>source text</script>";f.reviewedCapital!.coverage.gaps=[literal];query.data=f;
  render(<LivePulsePage/>);
  expect(screen.queryByText(literal)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:"Coverage & methods"}));
  const dialog=await screen.findByRole("dialog");
  expect(within(dialog).getByText(literal)).toBeVisible();expect(dialog.querySelector("script")).toBeNull();
 });
 it("shows same-source YFI/ETH history and its quote timing without replacing legacy metric data",async()=>{
  const f=marketFixture();query.data=parsePulseFeed(f,f.generatedAt+60);render(<LivePulsePage/>);
  fireEvent.click(screen.getByRole("tab",{name:"YFI / ETH"}));
  expect(screen.getByRole("tabpanel",{name:"YFI / ETH"})).toHaveTextContent("0.7");
  fireEvent.click(screen.getByRole("button",{name:"Details: YFI governance"}));
  const dialog=await screen.findByRole("dialog");
  expect(dialog).toHaveTextContent("DeFiLlama reference prices");
  expect(dialog).toHaveTextContent("Latest quote times:");
 });

 it("retains Chainlink when reference history is empty and safely resolves a removed tab",async()=>{
  const f=marketFixture();query.data=parsePulseFeed(f,f.generatedAt+60);
  const {rerender}=render(<LivePulsePage/>);
  fireEvent.click(screen.getByRole("tab",{name:"YFI / ETH"}));
  f.marketHistory.history=[];f.marketHistory.status="unavailable";f.marketHistory.coverage.observedDays=0;
  f.marketHistory.coverage.missingDays=Array.from({length:365},(_,i)=>f.marketHistory.coverage.fromInclusive+i*86400);
  query.data=parsePulseFeed(f,f.generatedAt+60);rerender(<LivePulsePage/>);
  expect(screen.queryByRole("tab",{name:"YFI / ETH"})).not.toBeInTheDocument();
  expect(screen.getByRole("tab",{name:"Committed YFI"})).toHaveAttribute("aria-selected","true");
  fireEvent.click(screen.getByRole("tab",{name:"YFI / USD"}));
  expect(screen.getByRole("tabpanel",{name:"YFI / USD"})).toHaveTextContent("$2,012.97");
  expect(screen.getByText("YFI / USD · Chainlink")).toBeVisible();
  fireEvent.click(screen.getByRole("button",{name:"Details: YFI governance"}));
  const dialog=await screen.findByRole("dialog");
  expect(dialog).toHaveTextContent("Chainlink");
  expect(dialog).not.toHaveTextContent("DeFiLlama reference prices");
 });

});
