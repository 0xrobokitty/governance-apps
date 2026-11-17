import {render,screen,fireEvent} from "@testing-library/react";
import {describe,it,expect,vi,afterEach} from "vitest";
import {TrendChart} from "@/app/pulse/TrendChart";
afterEach(()=>vi.unstubAllGlobals());
describe("Pulse stacked trend gaps",()=>{
  it("keeps missing intervals empty and exposes component rather than cumulative values",()=>{
    vi.stubGlobal("ResizeObserver",class { observe(){} disconnect(){} });
    const {container}=render(<TrendChart label="TVL" dates={["2026-11-01","2026-11-02","2026-11-03","2026-11-04","2026-11-05"]}
      series={[{label:"Chain",color:"blue",kind:"area",values:[5,6,null,8,9],floor:[2,2,null,3,3]}]} format={String}/>);
    const area=container.querySelector('[data-testid="pulse-area"]')!;
    expect(area.getAttribute("d")?.match(/M/g)).toHaveLength(2);
    expect(area.getAttribute("d")).not.toContain("NaN");
    fireEvent.keyDown(screen.getByRole("img"),{key:"ArrowRight"});
    expect(screen.getByText("6")).toBeVisible();
  });
  it("renders an isolated latest observation without connecting a missing interval",()=>{
    vi.stubGlobal("ResizeObserver",class { observe(){} disconnect(){} });
    const {container}=render(<TrendChart label="Treasury" dates={["2026-11-06","2026-11-07","2026-11-08","2026-11-09","2026-11-10"]}
      series={[{label:"Holdings",color:"blue",values:[1860000,1850000,null,null,1790000]}]} format={String}/>);
    const path=container.querySelector('path[fill="none"]')!;
    expect(path.getAttribute("d")?.match(/M/g)).toHaveLength(2);
    const point=screen.getByTestId("pulse-isolated-point");
    expect(point).toHaveAttribute("cx","390");
    expect(container.querySelectorAll('[data-testid="pulse-isolated-point"]')).toHaveLength(1);
    fireEvent.keyDown(screen.getByRole("img"),{key:"ArrowRight"});
    expect(screen.getByText("1790000")).toBeVisible();
  });
  it("labels zero when a flow chart spans negative and positive values",()=>{
    vi.stubGlobal("ResizeObserver",class { observe(){} disconnect(){} });
    const {container}=render(<TrendChart label="Flows" dates={["2026-11-01","2026-11-02"]}
      series={[{label:"Net",color:"blue",kind:"bar",values:[-100,40]}]} format={String} zero/>);
    expect([...container.querySelectorAll('text')].map(t=>t.textContent)).toContain("0");
  });
});
  it("connects sparse treasury observations only with a dashed gap and never invents hover data",()=>{
    vi.stubGlobal("ResizeObserver",class { observe(){} disconnect(){} });
    render(<TrendChart label="Treasury" dates={["2026-11-06","2026-11-07","2026-11-08","2026-11-09","2026-11-10"]}
      series={[{label:"Holdings",color:"blue",values:[1860000,1850000,null,null,1790000],connectGaps:true}]} format={String} zero/>);
    expect(screen.getByTestId("pulse-gap-connection")).toHaveAttribute("stroke-dasharray","3 4");
    fireEvent.keyDown(screen.getByRole("img"),{key:"ArrowRight"});
    fireEvent.keyDown(screen.getByRole("img"),{key:"ArrowLeft"});
    expect(screen.getByText("No observation")).toBeVisible();
  });

describe("Pulse currency axes",()=>{
 it("uses independent zero-based scales, aligned dates and currency-specific hover values",()=>{
  vi.stubGlobal("ResizeObserver",class {observe(){} disconnect(){}});
  const {container}=render(<TrendChart label="YFI price" dates={["2026-11-01","2026-11-02"]}
   series={[{label:"YFI / USD",color:"blue",values:[1000,2000]},{label:"YFI / ETH",color:"purple",values:[1,2],axis:"right"}]}
   format={v=>"$"+v} axisLabel="USD" rightAxis={{label:"ETH",format:v=>v+" ETH"}} zero/>);
  const left=container.querySelector('g[data-axis="left"] > path')!,right=container.querySelector('g[data-axis="right"] > path')!;
  expect(left.getAttribute("d")).toBe(right.getAttribute("d"));
  expect(screen.getByText("$0")).toBeVisible();expect(screen.getByText("0 ETH")).toBeVisible();
  expect(screen.getByText("USD")).toHaveAttribute("fill","blue");expect(screen.getByText("ETH")).toHaveAttribute("fill","purple");
  expect(screen.getByRole("img")).toHaveAccessibleName(/USD uses the left axis; ETH uses the right axis/);
  fireEvent.keyDown(screen.getByRole("img"),{key:"ArrowRight"});
  expect(screen.getAllByText("$2000").at(-1)).toBeVisible();expect(screen.getAllByText("2 ETH").at(-1)).toBeVisible();
  fireEvent.keyDown(screen.getByRole("img"),{key:"ArrowLeft"});
  expect(screen.getAllByText("$1000").at(-1)).toBeVisible();expect(screen.getAllByText("1 ETH").at(-1)).toBeVisible();
 });
 it("does not add an ETH scale to a USD-only fallback or fill a missing quote",()=>{
  vi.stubGlobal("ResizeObserver",class {observe(){} disconnect(){}});
  render(<TrendChart label="YFI price" dates={["2026-11-01","2026-11-02"]} series={[{label:"Chainlink USD",color:"blue",values:[2000,null]}]} format={v=>"$"+v} zero/>);
  expect(screen.queryByTestId("pulse-right-axis")).not.toBeInTheDocument();
  fireEvent.keyDown(screen.getByRole("img"),{key:"ArrowRight"});expect(screen.getByText("No observation")).toBeVisible();
 });
});
