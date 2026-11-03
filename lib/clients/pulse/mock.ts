import type { GovernanceDay, Observation, Product, Scenario } from "./types";

export const END_DATE = "2026-11-02";
export const DAYS = 190;
export const PRODUCTS: Product[] = [
  { id: "usdc", name: "USDC", chain: "Ethereum", group: "stable", asset: "USDC", units: 18000000, price: 1, daily: 66000 },
  { id: "weth", name: "WETH", chain: "Ethereum", group: "eth", asset: "ETH", units: 7400, price: 2800, daily: 27 },
  { id: "yvusd", name: "yvUSD", chain: "Ethereum", group: "stable", asset: "USD", units: 13000000, price: 1, daily: 37000 },
  { id: "ybold", name: "yBOLD", chain: "Ethereum", group: "stable", asset: "BOLD", units: 7200000, price: 1, daily: 14000 },
  { id: "base", name: "USDC", chain: "Base", group: "stable", asset: "USDC", units: 5600000, price: 1, daily: 19000 },
  { id: "dai", name: "DAI", chain: "Ethereum", group: "stable", asset: "DAI", units: 3600000, price: 1, daily: 14000 },
  { id: "wbtc", name: "WBTC", chain: "Ethereum", group: "other", asset: "BTC", units: 81, price: 82000, daily: 0.18 },
  { id: "arb", name: "WETH", chain: "Arbitrum", group: "eth", asset: "ETH", units: 740, price: 2800, daily: 4 },
];

export function dateAt(day: number) {
  const date = new Date(END_DATE + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() - DAYS + 1 + day);
  return date.toISOString().slice(0, 10);
}
const noise = (day: number, seed: number) => ((day * 71 + seed * 37) % 101) / 100;
const late = (day: number) => Math.max(0, (day - 149) / 40);

function priceAt(product: Product, day: number) {
  if (product.group === "stable") return product.price * (1 + Math.sin(day / 8) * 0.0006);
  return product.price * (1 + 0.035 * Math.sin(day / 12) + late(day) * (product.group === "eth" ? 0.29 : 0.16));
}
function accounts(chain: string, day: number, product: number, count: number, offset: number) {
  return Array.from({ length: count }, (_, index) =>
    chain + ":0x" + ((day * 19 + product * 31 + index * 7 + offset) % 1453 + 1).toString(16).padStart(40, "0"));
}

// All observations are fictional. The ledger is internally reconciled, not an approximation of live Yearn data.
export function createLedger(scenario: Exclude<Scenario, "unavailable">): Observation[] {
  return PRODUCTS.flatMap((product, index) => {
    let units = product.units;
    return Array.from({ length: DAYS }, (_, day) => {
      const phase = late(day);
      const growing = scenario === "growth";
      const leaving = scenario === "outflows";
      const pressure = growing ? -0.35 : leaving ? 1.5 : product.group === "eth" ? 1.35 : index === 5 ? 1.1 : 0.15;
      const deposits = product.daily * (0.9 + noise(day, index) * 0.6) * (1 - phase * Math.max(pressure, 0) * 0.27);
      const withdrawals = product.daily * (0.48 + noise(day + 6, index + 3) * 0.6 + phase * pressure);
      const openingUnits = units;
      const earnings = openingUnits * (0.035 + index * 0.003) / 365;
      units += deposits - withdrawals + earnings;
      const price = priceAt(product, day);
      const depositCount = Math.max(2, Math.round((26 - index * 2) * deposits / product.daily));
      const withdrawalCount = Math.max(2, Math.round((15 - index) * withdrawals / product.daily));
      const reports = (day + index) % 3 === 0 ? 1 + index % 3 : 0;
      const harvestPnl = reports ? earnings * price * 3 * (0.82 + noise(day, index) * 0.4) : 0;
      return {
        day, date: dateAt(day), product: product.id, openingUnits, closingUnits: units,
        openingPrice: priceAt(product, day - 1), price, deposits, withdrawals, earnings,
        depositAccounts: accounts(product.chain, day, index, depositCount, 0),
        withdrawalAccounts: accounts(product.chain, day, index, withdrawalCount, 23),
        depositActions: depositCount + 3 + index, withdrawalActions: withdrawalCount + 2 + index,
        fees: Math.max(0, harvestPnl * (0.09 + index * 0.004)), harvestPnl, reports,
        proceeds: (day + index) % 5 === 0 ? earnings * price * 5 * 0.095 : 0,
      };
    });
  });
}
export function createGovernance(scenario: Scenario): GovernanceDay[] {
  return Array.from({ length: DAYS }, (_, day) => {
    const phase = late(day);
    const direct = 6460 + day * 2.1 + Math.sin(day / 10) * 35 - phase * (scenario === "outflows" ? 310 : 50);
    const delegated = 3060 + day * 6.2 + Math.sin(day / 9) * 42;
    const supply = 36666;
    const eligible = 9000 + day * 2;
    const voting = [107, 123, 140, 155, 169, 181, 187].includes(day);
    const used = eligible * (0.61 + day / 1450 + Math.sin(day / 14) * 0.07);
    const usd = 4200 + day * 4 + 180 * Math.sin(day / 13) + phase * 320;
    return {
      date: dateAt(day), direct, delegated, directRate: direct / supply * 100, delegatedRate: delegated / supply * 100,
      total: direct + delegated, rate: (direct + delegated) / supply * 100,
      pending: 120 + phase * 60 + 30 * Math.sin(day / 7),
      apr: 9.7 - day * 0.008 + Math.sin(day / 8) * 0.55 - phase * 0.6,
      usd, eth: usd / priceAt(PRODUCTS[1], day),
      vote: voting ? { name: "Example vote " + day, eligible, used, rate: used / eligible * 100 } : null,
    };
  });
}
