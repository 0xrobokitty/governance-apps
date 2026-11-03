import { createGovernance, createLedger, dateAt, DAYS, PRODUCTS } from "./mock";
import type { Asset, Observation, Period, Pulse, Scenario } from "./types";

export const sum = <T,>(rows: T[], read: (row: T) => number) => rows.reduce((total, row) => total + read(row), 0);
const unique = (rows: Observation[], direction: "depositAccounts" | "withdrawalAccounts") => new Set(rows.flatMap(row => row[direction])).size;
export function change(value: number, previous: number) { return previous === 0 ? 0 : (value / previous - 1) * 100; }
export function average(values: number[]) { return values.length ? sum(values, value => value) / values.length : 0; }
export function rollingAverage(values: number[], index: number, width = 7) { return average(values.slice(Math.max(0, index - width + 1), index + 1)); }

export function reconcile(rows: Observation[]) {
  const opening = sum(rows, row => row.openingUnits * row.openingPrice);
  const closing = sum(rows, row => row.closingUnits * row.price);
  const flows = sum(rows, row => (row.deposits - row.withdrawals) * row.price);
  const earnings = sum(rows, row => row.earnings * row.price);
  const repricing = sum(rows, row => row.openingUnits * (row.price - row.openingPrice));
  return { opening, closing, flows, earnings, repricing };
}
export function priceNeutral(rows: Observation[], prices: Map<string, number>, opening: number) {
  const flow = sum(rows, row => (row.deposits - row.withdrawals) * (prices.get(row.product) ?? 0));
  return { flow, rate: opening > 0 ? flow / opening * 100 : 0 };
}

const ledgerCache = new Map<Scenario, Observation[]>();
export function getPulse(period: Period, asset: Asset, scenario: Scenario): Pulse | null {
  if (scenario === "unavailable") return null;
  if (!ledgerCache.has(scenario)) ledgerCache.set(scenario, createLedger(scenario));
  const full = ledgerCache.get(scenario)!;
  const definitions = PRODUCTS.filter(p => (asset === "all" || p.group === asset) && (scenario !== "partial" || p.chain !== "Base"));
  const ids = new Set(definitions.map(p => p.id));
  const capital = full.filter(row => ids.has(row.product));
  const start = DAYS - period;
  const selected = capital.filter(row => row.day >= start);
  const previous = capital.filter(row => row.day >= start - period && row.day < start);
  const first = capital.filter(row => row.day === start);
  const prices = new Map(first.map(row => [row.product, row.openingPrice]));
  const openingTVL = sum(first, row => row.openingUnits * row.openingPrice);
  const groupOpening = (group: Asset) => sum(first.filter(row => definitions.find(p => p.id === row.product)!.group === group), row => row.openingUnits * row.openingPrice);
  const allDates = Array.from({ length: DAYS }, (_, day) => {
    const rows = capital.filter(row => row.day === day);
    const feeRows = full.filter(row => row.day === day);
    const accounted = reconcile(rows);
    return {
      date: dateAt(day), rows, feeRows, accounted,
      depositors: unique(rows, "depositAccounts"), withdrawers: unique(rows, "withdrawalAccounts"),
      fees: sum(feeRows, row => row.fees),
    };
  });
  const depositCounts = allDates.map(day => day.depositors);
  const withdrawalCounts = allDates.map(day => day.withdrawers);
  const fees = allDates.map(day => day.fees);
  let cumulativeNet = 0, cumulativeFixed = 0;
  const groupCumulative = { stable: 0, eth: 0, other: 0 };
  const groupFixed = { stable: 0, eth: 0, other: 0 };
  const days = allDates.slice(start).map((entry, offset) => {
    const neutral = priceNeutral(entry.rows, prices, openingTVL);
    cumulativeNet += entry.accounted.flows;
    cumulativeFixed += neutral.flow;
    const destinations = Object.fromEntries((["stable", "eth", "other"] as const).map(group => {
      const groupRows = entry.rows.filter(row => definitions.find(p => p.id === row.product)!.group === group);
      groupCumulative[group] += sum(groupRows, row => (row.deposits - row.withdrawals) * row.price);
      groupFixed[group] += priceNeutral(groupRows, prices, groupOpening(group)).flow;
      return [group, { dollars: groupCumulative[group], rate: groupOpening(group) > 0 ? groupFixed[group] / groupOpening(group) * 100 : 0 }];
    })) as Pulse["days"][number]["destinations"];
    return {
      date: entry.date, tvl: entry.accounted.closing,
      tvlIndex: entry.accounted.closing / openingTVL * 100,
      fixedIndex: sum(entry.rows, row => row.closingUnits * prices.get(row.product)!) / openingTVL * 100,
      fixedTVL: sum(entry.rows, row => row.closingUnits * prices.get(row.product)!),
      net: entry.accounted.flows, fixedNet: neutral.flow, netRate: neutral.rate,
      cumulativeNet, cumulativeRate: cumulativeFixed / openingTVL * 100,
      deposits: sum(entry.rows, row => row.deposits * row.price),
      withdrawals: sum(entry.rows, row => row.withdrawals * row.price),
      depositors: entry.depositors, withdrawers: entry.withdrawers,
      depositorAverage: rollingAverage(depositCounts, start + offset),
      withdrawerAverage: rollingAverage(withdrawalCounts, start + offset),
      fees: entry.fees, feeAverage: rollingAverage(fees, start + offset),
      harvestPnl: sum(entry.feeRows, row => row.harvestPnl), reports: sum(entry.feeRows, row => row.reports),
      proceeds: sum(entry.feeRows, row => row.proceeds), destinations,
    };
  });
  const last = days.at(-1)!;
  const products = definitions.map(product => {
    const rows = selected.filter(row => row.product === product.id);
    const productOpening = first.find(row => row.product === product.id)!;
    const neutral = priceNeutral(rows, prices, productOpening.openingUnits * productOpening.openingPrice);
    let running = 0;
    return {
      id: product.id, name: product.name, chain: product.chain, asset: product.asset,
      net: sum(rows, row => (row.deposits - row.withdrawals) * row.price), rate: neutral.rate,
      depositors: unique(rows, "depositAccounts"), rankChange: 0,
      series: days.map(day => {
        const row = rows.find(row => row.date === day.date)!;
        running += (row.deposits - row.withdrawals) * row.price;
        return running;
      }),
    };
  }).sort((a, b) => b.net - a.net);
  const previousRanking = definitions.map(p => ({ id: p.id, net: sum(previous.filter(row => row.product === p.id), row => (row.deposits - row.withdrawals) * row.price) })).sort((a, b) => b.net - a.net);
  products.forEach((product, index) => { product.rankChange = previousRanking.findIndex(p => p.id === product.id) - index; });
  const governanceHistory = createGovernance(scenario);
  const governance = governanceHistory.slice(start);
  const previousFees = sum(allDates.slice(start - period, start), day => day.fees);
  const periodFees = sum(days, day => day.fees);
  const groups = { stable: "Stablecoins", eth: "ETH assets", other: "Other assets" };
  return {
    period, start: dateAt(start), end: dateAt(DAYS - 1), openingDate: dateAt(start - 1), partial: scenario === "partial",
    days, governance, products, openingTVL, tvl: last.tvl, fixedTVL: last.fixedTVL,
    tvlChange: change(last.tvl, openingTVL), fixedChange: change(last.fixedTVL, openingTVL),
    net: cumulativeNet, fixedNet: cumulativeFixed, flowRate: last.cumulativeRate,
    previousNet: sum(previous, row => (row.deposits - row.withdrawals) * row.price),
    earned: sum(allDates.slice(start), day => day.accounted.earnings),
    repricing: sum(allDates.slice(start), day => day.accounted.repricing),
    depositors: unique(selected, "depositAccounts"), withdrawers: unique(selected, "withdrawalAccounts"),
    depositActions: sum(selected, row => row.depositActions), withdrawalActions: sum(selected, row => row.withdrawalActions),
    depositAverage: average(days.map(day => day.depositors)), withdrawAverage: average(days.map(day => day.withdrawers)),
    depositTrend: change(average(depositCounts.slice(start)), average(depositCounts.slice(start - period, start))),
    withdrawTrend: change(average(withdrawalCounts.slice(start)), average(withdrawalCounts.slice(start - period, start))),
    fees: periodFees, feeChange: change(periodFees, previousFees),
    harvestPnl: sum(days, day => day.harvestPnl), reports: sum(days, day => day.reports), proceeds: sum(days, day => day.proceeds),
    recentNet: sum(days.slice(-7), day => day.fixedNet),
    priorRecentNet: sum(capital.filter(row => row.day >= DAYS - 14 && row.day < DAYS - 7), row => (row.deposits - row.withdrawals) * prices.get(row.product)!),
    stakeDelta: governance.at(-1)!.rate - governanceHistory[start - 1].rate,
    aprDelta: governance.at(-1)!.apr - governanceHistory[start - 1].apr,
    destinationGroups: (["stable", "eth", "other"] as const).filter(group => definitions.some(p => p.group === group)).map(id => ({
      id, label: groups[id], net: last.destinations[id].dollars, rate: last.destinations[id].rate,
    })),
    positiveProducts: products.filter(p => p.net > 0).length,
  };
}
