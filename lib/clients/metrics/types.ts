export type MetricsPeriod = 1 | 7 | 30;
export type AssetGroup = "All assets" | "Stablecoins" | "ETH" | "Other";
export type MetricsScenario = "normal" | "outflows" | "partial" | "unavailable";
export type Ranking = "inflows" | "outflows" | "depositors";
export interface ProductDefinition {
  id: string; name: string; asset: string; group: Exclude<AssetGroup, "All assets">;
  chain: string; openingUnits: number; price: number; dailyUnits: number;
}
export interface LedgerDay {
  day: number; productId: string; price: number; deposits: number; withdrawals: number;
  depositAccounts: string[]; withdrawalAccounts: string[];
  depositActions: number; withdrawalActions: number;
}
export interface FlowPoint { label: string; deposits: number; withdrawals: number; net: number }
export interface ProductMetric {
  id: string; name: string; asset: string; chain: string; group: string;
  deposits: number; withdrawals: number; net: number; neutralRate: number;
  nativeNet: number; depositors: number; withdrawers: number; depositActions: number; withdrawalActions: number;
}
export interface AssetMetric { name: string; nativeNet: number; unit: string; net: number; neutralRate: number }
export interface MetricsSnapshot {
  market: { yfiUSD: number; yfiETH: number };
  period: MetricsPeriod; range: string; partial: boolean; products: ProductMetric[];
  deposits: number; withdrawals: number; net: number; neutralRate: number;
  depositors: number; withdrawers: number; depositActions: number; withdrawalActions: number;
  overlap: number; series: FlowPoint[]; assets: AssetMetric[];
  fees: { recorded: number; proceeds: number; inventory: number; harvests: number; rounds: number; fills: number };
  staking: { total: number; rate: number; votingRate: number; directShare: number; delegatedShare: number; direct: number; delegated: number; pending: number; supply: number; change: number; apr: number; votingUsed: number; votingEligible: number };
}
