import { MOCK_END_DATE, MOCK_LEDGER, PRODUCTS } from "./mock";
import type { AssetGroup, LedgerDay, MetricsPeriod, MetricsScenario, MetricsSnapshot, ProductDefinition, ProductMetric, Ranking } from "./types";

const sum = <T,>(rows: T[], read: (row: T) => number) => rows.reduce((total, row) => total + read(row), 0);
const unique = (rows: LedgerDay[], field: "depositAccounts" | "withdrawalAccounts") =>
  new Set(rows.flatMap(row => row[field]));

export function summarizeFlows(rows: LedgerDay[], definitions: ProductDefinition[], openingRows: LedgerDay[], priorRows: LedgerDay[]) {
  const depositAccounts = unique(rows, "depositAccounts");
  const withdrawalAccounts = unique(rows, "withdrawalAccounts");
  let openingCapital = 0;
  let neutralNet = 0;
  for (const product of definitions) {
    const price = openingRows.find(row => row.productId === product.id)?.price ?? product.price;
    const openingUnits = product.openingUnits + sum(priorRows.filter(row => row.productId === product.id), row => row.deposits - row.withdrawals);
    openingCapital += openingUnits * price;
    neutralNet += sum(rows.filter(row => row.productId === product.id), row => row.deposits - row.withdrawals) * price;
  }
  const deposits = sum(rows, row => row.deposits * row.price);
  const withdrawals = sum(rows, row => row.withdrawals * row.price);
  return {
    deposits, withdrawals, net: deposits - withdrawals,
    neutralRate: openingCapital > 0 ? neutralNet / openingCapital * 100 : 0,
    depositors: depositAccounts.size, withdrawers: withdrawalAccounts.size,
    overlap: [...depositAccounts].filter(account => withdrawalAccounts.has(account)).length,
    depositActions: sum(rows, row => row.depositActions),
    withdrawalActions: sum(rows, row => row.withdrawalActions),
  };
}

export function rankProducts(products: ProductMetric[], ranking: Ranking): ProductMetric[] {
  return [...products].sort((a, b) => ranking === "depositors"
    ? b.depositors - a.depositors || b.net - a.net
    : ranking === "outflows" ? a.net - b.net : b.net - a.net);
}

function dateLabel(day: number) {
  const date = new Date(MOCK_END_DATE + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() - 59 + day);
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

export function getMetricsMock(period: MetricsPeriod, asset: AssetGroup, scenario: MetricsScenario): MetricsSnapshot | null {
  if (scenario === "unavailable") return null;
  const start = 60 - period;
  const definitions = PRODUCTS.filter(p => (asset === "All assets" || p.group === asset) && (scenario !== "partial" || p.chain !== "Base"));
  const ids = new Set(definitions.map(p => p.id));
  const ledger = MOCK_LEDGER.filter(row => ids.has(row.productId)).map(row => scenario === "outflows" && row.day >= start
    ? { ...row, deposits: row.withdrawals, withdrawals: row.deposits,
      depositAccounts: row.withdrawalAccounts, withdrawalAccounts: row.depositAccounts,
      depositActions: row.withdrawalActions, withdrawalActions: row.depositActions }
    : row);
  const rows = ledger.filter(row => row.day >= start);
  const priorRows = ledger.filter(row => row.day < start);
  const openingRows = ledger.filter(row => row.day === start);
  const totals = summarizeFlows(rows, definitions, openingRows, priorRows);
  const products = definitions.map(product => {
    const productRows = rows.filter(row => row.productId === product.id);
    return {
      ...product, ...summarizeFlows(productRows, [product], openingRows, priorRows),
      nativeNet: sum(productRows, row => row.deposits - row.withdrawals),
    };
  });
  const series = period === 1
    ? [0.08, 0.13, 0.21, 0.26, 0.20, 0.12].map((weight, index) => ({
      label: String(index * 4).padStart(2, "0") + ":00",
      deposits: totals.deposits * weight, withdrawals: totals.withdrawals * weight,
      net: totals.net * weight,
    }))
    : Array.from({ length: period }, (_, offset) => {
      const dayRows = rows.filter(row => row.day === start + offset);
      const deposits = sum(dayRows, row => row.deposits * row.price);
      const withdrawals = sum(dayRows, row => row.withdrawals * row.price);
      return { label: dateLabel(start + offset), deposits, withdrawals, net: deposits - withdrawals };
    });
  const assets = (["Stablecoins", "ETH", "Other"] as const).filter(group => definitions.some(p => p.group === group)).map(group => {
    const groupProducts = definitions.filter(p => p.group === group);
    const groupIds = new Set(groupProducts.map(p => p.id));
    const groupRows = rows.filter(row => groupIds.has(row.productId));
    const groupTotals = summarizeFlows(groupRows, groupProducts, openingRows, priorRows);
    return { name: group, nativeNet: sum(groupRows, row => row.deposits - row.withdrawals),
      unit: group === "ETH" ? "ETH" : group === "Other" ? "BTC" : "USD-equivalent",
      net: groupTotals.net, neutralRate: groupTotals.neutralRate };
  });
  const direct = 6820, delegated = 4270, supply = 36666, votingUsed = 7340, votingEligible = 9820;
  const total = direct + delegated;
  return {
    ...totals, market: { yfiUSD: 5482, yfiETH: 5482 / MOCK_LEDGER.find(row => row.day === 59 && row.productId === "weth")!.price }, period, range: (period === 1 ? dateLabel(59) : dateLabel(start) + " – " + dateLabel(59)) + " 2026",
    partial: scenario === "partial", products, series, assets,
    fees: { recorded: period * 3460, proceeds: period * 2875, inventory: 28400, harvests: period * 18, rounds: period * 3, fills: period * 11 },
    staking: { direct, delegated, total, supply, rate: total / supply * 100, votingRate: votingUsed / votingEligible * 100,
      directShare: direct / total * 100, delegatedShare: delegated / total * 100, pending: 184, change: (scenario === "outflows" ? -1 : 1) * period * 18.6,
      apr: 8.42, votingUsed, votingEligible },
  };
}
