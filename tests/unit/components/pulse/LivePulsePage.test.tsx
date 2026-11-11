import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {TrendSeries} from "@/app/pulse/TrendChart";
import { LivePulsePage } from "@/app/pulse/LivePulsePage";
import { parsePulseFeed } from "@/lib/clients/pulse/feed";
import { globalCapitalFixture } from "../../../fixtures/pulse-global-capital";
import {marketFixture} from "../../../fixtures/pulse-market-history";
import fixture from "../../../fixtures/pulse-live.json";
const query=vi.hoisted(()=>({data:undefined as unknown,stale:false,isError:false,isPending:false,refetch:vi.fn()}));
vi.mock("@/lib/hooks/useLivePulse",()=>({useLivePulse:()=>query}));
vi.mock("@/app/pulse/TrendChart",()=>({TrendChart:({label,series,rightAxis}:{label:string;series:TrendSeries[];rightAxis?:{label:string}})=><div role="img" aria-label={label} data-series={JSON.stringify(series)} data-right-axis={rightAxis?.label}/>}));
describe("Pulse overview and method dialogs",()=>{
 it("keeps the agreed nine-card hierarchy and recovery outside the grid",async()=>{
  const f=globalCapitalFixture();query.data=parsePulseFeed(f,f.generatedAt+60);
  render(<LivePulsePage/>);
  const grid=screen.getByTestId("pulse-main-grid");
  expect(within(grid).getAllByTestId("pulse-live-card")).toHaveLength(9);
  expect(within(grid).getAllByRole("heading").map(h=>h.textContent)).toEqual(["Vault TVL","Net vault flows","Depositing & withdrawing accounts","yLockers","Flex","Product movers","X audience","YFI governance","Treasury reserves"]);
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
 it("keeps recovery as a tenth card below the wall grid with one source dialog",async()=>{
  const feed=parsePulseFeed(fixture,fixture.generatedAt+60);feed.metrics.find(m=>m.id==="recovery.cash_paid_weth")!.status="stale";query.data=feed;render(<LivePulsePage/>);
  fireEvent.click(screen.getByRole("button",{name:"Wall view"}));
  const section=screen.getByTestId("pulse-recovery-section");
  expect(section).toBeVisible();expect(screen.getAllByTestId("pulse-live-card")).toHaveLength(10);
  expect(within(screen.getByTestId("pulse-main-grid")).getAllByTestId("pulse-live-card")).toHaveLength(9);
  expect(screen.queryByRole("button",{name:"Recovery & loans"})).not.toBeInTheDocument();
  expect(within(section).getByText("Stale",{exact:true})).toBeVisible();
  fireEvent.click(within(section).getByRole("button",{name:"Details: Recovery & loans"}));
  const dialog=await screen.findByRole("dialog");
  expect(dialog).toHaveTextContent("Issued-share contract target gap");
  expect(dialog).toHaveTextContent("3.12883");expect(screen.getAllByRole("dialog")).toHaveLength(1);
  fireEvent.keyDown(document,{key:"Escape"});
  fireEvent.click(within(section).getByRole("tab",{name:"Resupply receivable"}));
  fireEvent.click(within(section).getByRole("button",{name:"Details: Recovery & loans"}));
  expect(within(await screen.findByRole("dialog")).getByRole("link",{name:/Open source dashboard/})).toHaveAttribute("href","https://treasury.yearn.fi");
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
  fireEvent.click(screen.getByRole("tab",{name:"YFI price"}));
  expect(screen.getByRole("tabpanel",{name:"YFI price"})).toHaveTextContent("0.7");
  fireEvent.click(screen.getByRole("button",{name:"Details: YFI governance"}));
  const dialog=await screen.findByRole("dialog");
  expect(dialog).toHaveTextContent("DeFiLlama reference prices");
  expect(dialog).toHaveTextContent("Latest quote times:");
  expect(dialog).toHaveTextContent("separate zero-based scales");
  expect(screen.getByRole("img",{name:"YFI governance: YFI price"})).toHaveAttribute("data-right-axis","ETH");
 });

 it("retains Chainlink when paired reference history becomes empty",async()=>{
  const f=marketFixture();query.data=parsePulseFeed(f,f.generatedAt+60);
  const {rerender}=render(<LivePulsePage/>);
  fireEvent.click(screen.getByRole("tab",{name:"YFI price"}));
  f.marketHistory.history=[];f.marketHistory.status="unavailable";f.marketHistory.coverage.observedDays=0;
  f.marketHistory.coverage.missingDays=Array.from({length:365},(_,i)=>f.marketHistory.coverage.fromInclusive+i*86400);
  query.data=parsePulseFeed(f,f.generatedAt+60);rerender(<LivePulsePage/>);
  expect(screen.queryByRole("tab",{name:"YFI / ETH"})).not.toBeInTheDocument();
  expect(screen.getByRole("tab",{name:"YFI price"})).toHaveAttribute("aria-selected","true");
  fireEvent.click(screen.getByRole("tab",{name:"YFI price"}));
  expect(screen.getByRole("tabpanel",{name:"YFI price"})).toHaveTextContent("$2,012.97");
  expect(screen.getByText("YFI / USD · Chainlink")).toBeVisible();
  fireEvent.click(screen.getByRole("button",{name:"Details: YFI governance"}));
  const dialog=await screen.findByRole("dialog");
  expect(dialog).toHaveTextContent("Chainlink");
  expect(dialog).not.toHaveTextContent("DeFiLlama reference prices");
 });

 it("uses remaining principal only as headline and overlays three separate WETH series",async()=>{
  const f=parsePulseFeed(fixture,fixture.generatedAt+60),old=f.metrics.find(m=>m.id==="recovery.target_gap_weth")!,point={...old.latest!,value:"1100"};
  f.metrics.push({...old,id:"yeth.remaining_principal_weth",label:"Remaining original principal",history:[point],latest:point});query.data=f;
  render(<LivePulsePage/>);
  const section=screen.getByTestId("pulse-recovery-section");
  expect(section.querySelector("strong")).toHaveTextContent("1,100");
  const image=within(section).getByRole("img",{name:"Recovery & loans: yETH recovery"});
  const series=JSON.parse(image.getAttribute("data-series")!);
  expect(series.map((s:{label:string})=>s.label)).toEqual(["Remaining principal","Principal settled","WETH paid"]);
  expect(series.every((s:{kind?:string;axis:string})=>s.kind!=="area"&&s.axis==="left")).toBe(true);
  expect(image).not.toHaveAttribute("data-right-axis");
  expect(within(section).queryByRole("tab",{name:"yETH shortfall"})).not.toBeInTheDocument();
  fireEvent.click(within(section).getByRole("button",{name:"Details: Recovery & loans"}));
  const dialog=await screen.findByRole("dialog");
  expect(dialog).toHaveTextContent("including unclaimed eligibility");
  expect(dialog).toHaveTextContent("1,597.97 WETH");
 });
 it("does not substitute the old contract target gap when remaining principal is missing",()=>{
  query.data=parsePulseFeed(fixture,fixture.generatedAt+60);render(<LivePulsePage/>);
  const section=screen.getByTestId("pulse-recovery-section");
  expect(section.querySelector("strong")).toHaveTextContent("—");
  const series=JSON.parse(within(section).getByRole("img",{name:"Recovery & loans: yETH recovery"}).getAttribute("data-series")!);
  expect(series[0].values.every((v:unknown)=>v===null)).toBe(true);
  expect(series[1].values.some((v:unknown)=>v!==null)).toBe(true);
 });

});
