import { dateAt, DAYS } from "./mock";
import type { Period, Scenario, YLockerHistory, YLockerId, YLockers } from "./types";

// Fictional observations only. The later yYB coverage deliberately exercises gaps in 365D.
const PRODUCTS: { id: YLockerId; start: number; balance: number; reward: number }[] = [
  { id: "ycrv", start: 0, balance: 48000000, reward: 31000 },
  { id: "yyb", start: DAYS - 320, balance: 3200000, reward: 8800 },
];
const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;

export function getYLockers(period: Period, scenario: Scenario): YLockers {
  const start = DAYS - period;
  const dates = Array.from({ length: period }, (_, i) => dateAt(start + i));
  // These mock periods close on Thursdays. A live feed must retain each contract's native epoch boundaries.
  const closedWeeks = Array.from({ length: DAYS }, (_, day) => day)
    .filter(day => new Date(dateAt(day) + "T00:00:00Z").getUTCDay() === 4);
  const selectedWeeks = closedWeeks.filter(day => day >= start);
  const products: YLockerHistory[] = PRODUCTS.map((product, productIndex) => {
    let balance = product.balance;
    const history = Array.from({ length: DAYS }, (_, day) => {
      if (day < product.start) return null;
      const phase = day / (DAYS - 1);
      const recent = Math.max(0, (day - DAYS + 45) / 45);
      const pressure = scenario === "outflows" ? -0.00085 : scenario === "growth" ? 0.0009
        : productIndex === 0 ? 0.0001 - recent * 0.00065 : 0.00036;
      const net = product.balance * (pressure + 0.00065 * Math.sin(day * 1.7 + productIndex) + 0.00024 * Math.cos(day / 5));
      const openingBalance = balance;
      // Reinvestment changes the earning balance, but never the external-deposit series.
      balance += net + openingBalance * 0.0001;
      const peg = (productIndex === 0 ? 68 + phase * 10 : 89 + phase * 6)
        + 1.2 * Math.sin(day / 11 + productIndex) + 0.35 * Math.cos(day / 3)
        + recent * (scenario === "outflows" ? -5 : scenario === "growth" ? 2 : productIndex === 0 ? 1 : -1);
      return { net, peg, openingBalance };
    });
    const first = Math.max(start, product.start);
    const openingBalance = history[first]!.openingBalance;
    const days = history.slice(start).map((row, i) => ({
      date: dates[i], peg: row?.peg ?? null, net: row?.net ?? null,
      netRate: row ? row.net / openingBalance * 100 : null,
      averageRate: row && start + i - product.start >= 6 ? mean(history.slice(Math.max(product.start, start + i - 6), start + i + 1)
        .filter((value): value is NonNullable<typeof value> => value !== null).map(value => value.net)) / openingBalance * 100 : null,
    }));
    const weekly = closedWeeks.map(day => day - 7 < product.start ? null : product.reward
      * (0.78 + day / DAYS * 0.4 + 0.1 * Math.sin(day / 25 + productIndex))
      * (scenario === "outflows" ? 0.8 : scenario === "growth" ? 1.12 : 1));
    const completed = weekly.filter((value): value is number => value !== null);
    const lastReward = completed.at(-1)!;
    const net = days.reduce((total, day) => total + (day.net ?? 0), 0);
    return {
      id: product.id, coverageStart: dateAt(product.start), openingBalance, days, net, netRate: net / openingBalance * 100,
      lastReward, rewardChange: (lastReward / completed.at(-2)! - 1) * 100,
      // Separate sample funding observation. This is not a prorated weekly projection.
      currentReward: product.reward * (productIndex === 0 ? 0.72 : 0.56) * (scenario === "outflows" ? 0.8 : 1),
      rewards: selectedWeeks.map(day => weekly[closedWeeks.indexOf(day)]),
      rewardAverages: selectedWeeks.map(day => {
        const index = closedWeeks.indexOf(day);
        const values = weekly.slice(Math.max(0, index - 3), index + 1);
        return values.length === 4 && values.every((value): value is number => value !== null) ? mean(values) : null;
      }),
    };
  });
  return { dates, rewardDates: selectedWeeks.map(dateAt), currentWeekStart: dateAt(closedWeeks.at(-1)!), products };
}
