import { dateAt, DAYS } from "./mock";
import type { Period, Scenario } from "./types";

export type LoanId = "all" | "resupply" | "other";
export type TreasuryScope = "reserves" | "total";
export interface FinanceDay {
  date: string;
  recoveryTarget: number; recoveryBacking: number; recoveryGap: number; recoveryFunded: number;
  recoveryFunding: number; holderPayouts: number; targetReleased: number;
  resupplyPrincipal: number; otherPrincipal: number;
  resupplyReturned: number; otherReturned: number; interestReceived: number;
  stable: number; eth: number; yfi: number; committed: number; locked: number;
  ethPrice: number; yfiPrice: number; receipts: number; spending: number;
}
export interface FinanceHistory { days: FinanceDay[]; period: Period }
export interface TreasuryView {
  dates: string[]; market: number[]; fixed: number[]; value: number; opening: number;
  change: number; fixedChange: number; receipts: number; spending: number;
  principalReturned: number; interest: number; repricing: number; netFlows: number;
}
const sum = (days: FinanceDay[], read: (day: FinanceDay) => number) => days.reduce((total, day) => total + read(day), 0);
const prices = (day: number) => ({
  ethPrice: 2200 + day * 0.8 + Math.sin(day / 25) * 120 + Math.max(0, day - 700) * 14,
  yfiPrice: 4200 + day * 1.7 + Math.sin(day / 18) * 300 + Math.max(0, day - 700) * 35,
});

// Fictional, reconciled histories. No contract terms, treasury balances, or repayment forecasts are inferred.
export function getFinance(period: Period, scenario: Scenario): FinanceHistory {
  const pace = scenario === "growth" ? 1.25 : scenario === "outflows" ? 0.7 : 1;
  let recoveryTarget = 3000, recoveryBacking = 780;
  let resupplyPrincipal = 1130000, otherPrincipal = 280000, stable = 5500000;
  const days: FinanceDay[] = [];
  for (let day = -1; day < DAYS; day++) {
    const resupplyReturned = day >= 0 && day % 30 === 14 ? Math.min(resupplyPrincipal, 11000) : 0;
    const otherReturned = day >= 0 && day % 45 === 7 ? Math.min(otherPrincipal, 6000) : 0;
    const interestReceived = resupplyReturned ? 900 : 0;
    const receipts = day >= 0 ? (2500 + Math.sin(day / 9) * 500) * pace : 0;
    const spending = day >= 0 ? (day % 14 === 6 ? 65000 : 0) + (day % 31 === 11 ? 35000 : 0) : 0;
    const recoveryFunding = day >= 0 ? (0.45 + Math.sin(day / 13) * 0.08) * pace : 0;
    // A below-target exit releases a target amount and pays only the backing attributable to it.
    const targetReleased = day >= 0 && day % 67 === 23 ? 12 : 0;
    const holderPayouts = targetReleased * recoveryBacking / recoveryTarget;
    recoveryTarget -= targetReleased;
    recoveryBacking += recoveryFunding - holderPayouts;
    resupplyPrincipal -= resupplyReturned;
    otherPrincipal -= otherReturned;
    stable += receipts + resupplyReturned + otherReturned + interestReceived - spending;
    days.push({
      date: dateAt(day), recoveryTarget, recoveryBacking,
      recoveryGap: recoveryTarget - recoveryBacking, recoveryFunded: recoveryBacking / recoveryTarget * 100,
      recoveryFunding, holderPayouts, targetReleased, resupplyPrincipal, otherPrincipal,
      resupplyReturned, otherReturned, interestReceived, stable, eth: 180, yfi: 900,
      committed: 400000, locked: 350000, ...prices(day), receipts, spending,
    });
  }
  return { days: days.slice(-(period + 1)), period };
}

export function getRecoveryView(history: FinanceHistory) {
  const days = history.days, movements = days.slice(1), last = days.at(-1)!;
  return {
    dates: days.map(day => day.date), gap: days.map(day => day.recoveryGap),
    target: days.map(day => day.recoveryTarget), backing: days.map(day => day.recoveryBacking),
    value: last.recoveryGap, funded: last.recoveryFunded,
    change: last.recoveryGap - days[0].recoveryGap,
    funding: sum(movements, day => day.recoveryFunding),
    paid: sum(movements, day => day.holderPayouts),
    targetReleased: sum(movements, day => day.targetReleased),
  };
}

export function getLoanView(history: FinanceHistory, id: LoanId) {
  const principal = (day: FinanceDay) => (id !== "other" ? day.resupplyPrincipal : 0) + (id !== "resupply" ? day.otherPrincipal : 0);
  const returned = (day: FinanceDay) => (id !== "other" ? day.resupplyReturned : 0) + (id !== "resupply" ? day.otherReturned : 0);
  return {
    dates: history.days.map(day => day.date), values: history.days.map(principal),
    value: principal(history.days.at(-1)!), returned: sum(history.days.slice(1), returned),
    interest: id === "other" ? 0 : sum(history.days.slice(1), day => day.interestReceived),
    dailyReturned: history.days.map((day, index) => index ? returned(day) : 0),
  };
}

export function getTreasuryView(history: FinanceHistory, scope: TreasuryScope, includeYfi: boolean): TreasuryView {
  const days = history.days, openingDay = days[0], movements = days.slice(1);
  const value = (day: FinanceDay, marks: Pick<FinanceDay, "ethPrice" | "yfiPrice">) =>
    day.stable + day.eth * marks.ethPrice + (scope === "total"
      ? day.committed + day.locked + day.resupplyPrincipal + day.otherPrincipal + (includeYfi ? day.yfi * marks.yfiPrice : 0) : 0);
  const market = days.map(day => value(day, day)), fixed = days.map(day => value(day, openingDay));
  const opening = market[0], closing = market.at(-1)!;
  const receipts = sum(movements, day => day.receipts), spending = sum(movements, day => day.spending);
  const principalReturned = sum(movements, day => day.resupplyReturned + day.otherReturned);
  const interest = sum(movements, day => day.interestReceived);
  const netFlows = receipts + interest - spending + (scope === "reserves" ? principalReturned : 0);
  return {
    dates: days.map(day => day.date), market, fixed, value: closing, opening,
    change: (closing / opening - 1) * 100, fixedChange: (fixed.at(-1)! / opening - 1) * 100,
    receipts, spending, principalReturned, interest, netFlows,
    repricing: closing - opening - netFlows,
  };
}
