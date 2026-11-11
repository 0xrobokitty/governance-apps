import {afterEach,describe,it,expect,vi} from "vitest";
import {GET} from "@/app/api/pulse-data/route";
import {parsePulseFeed} from "@/lib/clients/pulse/feed";
import {packCapital} from "../../../fixtures/pulse-packed";
import {globalCapitalFixture} from "../../../fixtures/pulse-global-capital";
vi.mock("@/lib/clients/pulse/config",()=>({isPulseLiveEnabled:()=>true}));
vi.mock("@/lib/runtime/runtime-mode",()=>({isProductionMode:()=>false}));
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
describe("Pulse compact HTTP proxy",()=>{
 it("returns sanitized compact history that the browser can decode",async()=>{
  vi.stubEnv("PULSE_DATA_URL","http://127.0.0.1:3210/pulse.json");
  const f=packCapital(globalCapitalFixture());
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify(f))));
  const response=await GET();expect(response.status).toBe(200);
  const wire=await response.json() as ReturnType<typeof packCapital>;expect(wire.reviewedCapital.schema).toBe("pulse-kong-envio/v4");
  expect(Array.isArray(wire.reviewedCapital.history[0])).toBe(true);
  expect(parsePulseFeed(wire).globalCapital?.history).toHaveLength(1);
 });
 it("rejects malformed compact references instead of passing them to the browser",async()=>{
  vi.stubEnv("PULSE_DATA_URL","http://127.0.0.1:3210/pulse.json");
  const f=packCapital(globalCapitalFixture());f.reviewedCapital.history[0][14][6][0][0]=99999;
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify(f))));
  expect((await GET()).status).toBe(502);
 });
});
