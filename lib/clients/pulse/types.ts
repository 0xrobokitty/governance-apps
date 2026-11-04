export type Period = 7 | 30 | 90 | 365;
export type Asset = "all" | "stable" | "eth" | "other";
export type Scenario = "mixed" | "growth" | "outflows" | "partial" | "unavailable";
export type GovernanceView = "stake" | "apr" | "votes" | "price";
export interface Product {
  id: string; name: string; chain: string; group: Exclude<Asset, "all">;
  asset: string; units: number; price: number; daily: number;
}
export interface Observation {
  day: number; date: string; product: string; openingUnits: number; closingUnits: number;
  openingPrice: number; price: number; deposits: number; withdrawals: number; earnings: number;
  depositAccounts: string[]; withdrawalAccounts: string[]; depositActions: number; withdrawalActions: number;
  fees: number; harvestPnl: number; reports: number; proceeds: number;
}
export interface Day {
  date: string; tvl: number; fixedTVL: number; tvlIndex: number; fixedIndex: number; net: number; fixedNet: number;
  netRate: number; cumulativeNet: number; cumulativeRate: number; deposits: number; withdrawals: number;
  depositors: number; withdrawers: number; depositorAverage: number; withdrawerAverage: number;
  fees: number; feeAverage: number; harvestPnl: number; reports: number; proceeds: number;
  destinations: Record<Exclude<Asset, "all">, { dollars: number; rate: number }>;
}
export interface GovernanceDay {
  date: string; direct: number; delegated: number; directRate: number; delegatedRate: number;
  total: number; rate: number; pending: number; apr: number; usd: number; eth: number;
  vote: { name: string; used: number; eligible: number; rate: number } | null;
}
export interface ProductTrend {
  id: string; name: string; chain: string; asset: string; net: number; rate: number;
  depositors: number; rankChange: number; series: number[];
}
export interface Pulse {
  ylockers: YLockers;
  period: Period; start: string; end: string; openingDate: string; partial: boolean;
  days: Day[]; governance: GovernanceDay[]; products: ProductTrend[];
  openingTVL: number; tvl: number; fixedTVL: number; tvlChange: number; fixedChange: number;
  net: number; fixedNet: number; flowRate: number; previousNet: number; earned: number; repricing: number;
  depositors: number; withdrawers: number; depositActions: number; withdrawalActions: number;
  depositAverage: number; withdrawAverage: number; depositTrend: number; withdrawTrend: number;
  fees: number; feeChange: number; harvestPnl: number; reports: number; proceeds: number;
  recentNet: number; priorRecentNet: number; stakeDelta: number; aprDelta: number;
  destinationGroups: { id: Exclude<Asset, "all">; label: string; net: number; rate: number }[];
  positiveProducts: number;
}

export type YLockerId = "ycrv" | "yyb";
export interface YLockerDay {
  date: string;
  peg: number | null;
  net: number | null;
  netRate: number | null;
  averageRate: number | null;
}
export interface YLockerHistory {
  id: YLockerId;
  coverageStart: string;
  openingBalance: number;
  days: YLockerDay[];
  net: number;
  netRate: number;
  lastReward: number;
  rewardChange: number;
  currentReward: number;
  rewards: (number | null)[];
  rewardAverages: (number | null)[];
}
export interface YLockers {
  dates: string[];
  rewardDates: string[];
  currentWeekStart: string;
  products: YLockerHistory[];
}
