import {expect,test} from "@playwright/test";
import {parsePulseFeed} from "@/lib/clients/pulse/feed";
import {coveredDays} from "@/lib/clients/pulse/live";
test.skip(process.env.PULSE_LOCAL_INTEGRATION !== "true","Requires a locally collected live feed.");
test("Pulse renders the real local Stats response through its API proxy",async({page,request},testInfo)=>{
  const errors:string[]=[];
  page.on("pageerror",e=>errors.push(e.message));
  const response=await request.get("/api/pulse-data");
  expect(response.status()).toBe(200);
  const body=await response.body();
  expect(body.length).toBeLessThanOrEqual(8*1024*1024);
  const feed=JSON.parse(body.toString("utf8"));
  expect(feed.mode).toBe("live");
  expect(feed.metrics.filter((m:{latest:unknown})=>m.latest).length).toBeGreaterThanOrEqual(13);
  if(process.env.PULSE_HISTORY_INTEGRATION === "true"){
    const parsed = parsePulseFeed(feed);
    if(process.env.PULSE_GLOBAL_INTEGRATION==="true") {
      expect(parsed.globalCapital?.history.length).toBeGreaterThanOrEqual(90);
      const global=parsed.globalCapital!;
      expect([90,365]).toContain(global.coverage.publishedDays);
      const latest90=coveredDays(parsed,90);
      const recentDays=new Set(latest90.map(d=>d.day));
      expect(global.history.filter(d=>recentDays.has(d.day))).toHaveLength(90);
      if(global.coverage.publishedDays===365)expect(feed.reviewedCapital.schema).toBe("pulse-kong-envio/v4");
      expect(parsed.tvlHistory?.history.every(p=>p.chains?.length===7)).toBe(true);
      for(const id of ["yfi.styfi_direct","yfi.styfix","yfi.veyfi_migrated","yfi.liquid_lockers_backing","yfi.participating","yfi.participation_rate_bps"]) {
        expect(parsed.metrics.find(m=>m.id===id)?.history.length).toBeGreaterThanOrEqual(90);
      }
      expect(parsed.yLockers?.peg.history.length).toBeGreaterThanOrEqual(90);
    }
    expect(parsed.tvlHistory?.coverage.observedClosedDays).toBeGreaterThanOrEqual(90);
    const tvl=parsed.tvlHistory!;
    expect([90,365]).toContain(tvl.coverage.requestedClosedDays);
    if(tvl.coverage.missingDays.length===0)expect(tvl.coverage.observedClosedDays).toBe(tvl.coverage.requestedClosedDays);
    if(parsed.marketHistory){
      expect(parsed.marketHistory.coverage.expectedDays).toBe(365);
      expect(parsed.marketHistory.history.length).toBeGreaterThanOrEqual(90);
      if(parsed.marketHistory.coverage.missingDays.length===0)expect(parsed.marketHistory.history).toHaveLength(365);
    }
    if(parsed.flex){
      for(const id of ["flex.debt_usd","flex.deposits_usd","flex.value_usd"]){
        expect(parsed.flex.metrics.find(m=>m.id===id)?.history.length).toBeGreaterThanOrEqual(181);
      }
      for(const id of ["flex.borrower_accounts","flex.claimable_fees_usd"]){
        expect(parsed.flex.metrics.find(m=>m.id===id)?.history.length).toBeGreaterThanOrEqual(1);
      }
    }
    const days=coveredDays(parsed,90);
    expect(days).toHaveLength(90*6);
    const yesterday=Math.floor(parsed.generatedAt/86400)*86400-86400;
    for(const chainId of [1,10,137,8453,42161,747474]){
      expect(days.filter(d=>d.chainId===chainId)).toHaveLength(90);
      expect(days.some(d=>d.chainId===chainId&&d.day===yesterday)).toBe(true);
    }
  }
  await page.setViewportSize({width:1500,height:1100});
  await page.goto("/pulse");
  await expect(page.getByTestId("pulse-live-card")).toHaveCount(10,{timeout:60000});
  await page.getByRole("button",{name:"90D",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Product movers",exact:true})).toBeVisible();
  await expect(page.getByRole("tab",{name:"Activity",exact:true})).toHaveAttribute("aria-selected","true");
  await expect(page.getByRole("combobox")).toHaveCount(0);
  await page.screenshot({path:testInfo.outputPath("live-desktop.png"),fullPage:true});
  await page.setViewportSize({width:1920,height:1080});
  await page.getByRole("button",{name:"Wall view",exact:true}).click();
  const last=await page.getByTestId("pulse-main-grid").getByTestId("pulse-live-card").last().boundingBox();
  expect(last!.y+last!.height).toBeLessThanOrEqual(1080);
  await page.screenshot({path:testInfo.outputPath("live-wall.png")});
  await page.getByRole("button",{name:"Exit wall view",exact:true}).click();
  await page.getByRole("tab",{name:"Peg",exact:true}).click();
  await page.screenshot({path:testInfo.outputPath("live-peg.png"),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath("live-mobile.png"),fullPage:true});
  await page.setViewportSize({width:1500,height:1100});
  const themeToggle=page.getByRole("button",{name:/Switch to Dark Mode/});
  if(await themeToggle.count()) await themeToggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme","soft-dark");
  await page.screenshot({path:testInfo.outputPath("live-dark.png"),fullPage:true});
  await page.setViewportSize({width:750,height:550});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
