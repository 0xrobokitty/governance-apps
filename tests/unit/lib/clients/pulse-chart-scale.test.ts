import {describe,it,expect} from "vitest";
import {chartScale} from "@/lib/clients/pulse/chart-scale";
describe("Pulse chart presentation scale",()=>{
 it("keeps stock values grounded at zero",()=>{expect(chartScale([1790000,1860000],true)).toEqual({min:0,max:2000000,ticks:[0,1000000,2000000]});});
 it("uses clean peg ticks that include parity",()=>{expect(chartScale([97.1,98.6,100]).ticks).toEqual([97,98,99,100]);});
 it("does not show fractional account ticks or a collapsed zero range",()=>{expect(chartScale([0,0],true,undefined,true)).toEqual({min:0,max:1,ticks:[0,1]});});
 it("keeps an explicit signed percentage domain",()=>{expect(chartScale([-2,4],true,[-100,100]).ticks).toEqual([-100,0,100]);});
});
