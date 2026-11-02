import type { LedgerDay, ProductDefinition } from "./types";

// Fictional, deterministic examples. No addresses, prices or balances are read from a live source.
export const MOCK_END_DATE = "2026-11-01";
export const PRODUCTS: ProductDefinition[] = [
  { id: "usdc", name: "USDC", asset: "USDC", group: "Stablecoins", chain: "Ethereum", openingUnits: 18400000, price: 1, dailyUnits: 245000 },
  { id: "weth", name: "WETH", asset: "ETH", group: "ETH", chain: "Ethereum", openingUnits: 7400, price: 3360, dailyUnits: 61 },
  { id: "yvusd", name: "yvUSD", asset: "USD", group: "Stablecoins", chain: "Ethereum", openingUnits: 12800000, price: 1, dailyUnits: 182000 },
  { id: "ybold", name: "yBOLD", asset: "BOLD", group: "Stablecoins", chain: "Ethereum", openingUnits: 7400000, price: 1, dailyUnits: 68000 },
  { id: "base-usdc", name: "USDC", asset: "USDC", group: "Stablecoins", chain: "Base", openingUnits: 5600000, price: 1, dailyUnits: 76000 },
  { id: "dai", name: "DAI", asset: "DAI", group: "Stablecoins", chain: "Ethereum", openingUnits: 3800000, price: 1, dailyUnits: 27000 },
  { id: "wbtc", name: "WBTC", asset: "BTC", group: "Other", chain: "Ethereum", openingUnits: 83, price: 92000, dailyUnits: 0.64 },
  { id: "arb-weth", name: "WETH", asset: "ETH", group: "ETH", chain: "Arbitrum", openingUnits: 720, price: 3360, dailyUnits: 7.8 },
];

function accounts(chain: string, day: number, product: number, count: number, offset: number): string[] {
  return Array.from({ length: count }, (_, i) => {
    const n = (day * 7 + product * 31 + i * 3 + offset) % 389 + 1;
    return chain + ":0x" + n.toString(16).padStart(40, "0");
  });
}

export function createMockLedger(): LedgerDay[] {
  return Array.from({ length: 60 }, (_, day) => PRODUCTS.map((p, i) => {
    const wave = 1 + 0.3 * Math.sin(day * 0.8 + i * 1.7);
    const deposits = p.dailyUnits * wave;
    const withdrawals = p.dailyUnits * (0.57 + 0.39 * Math.cos(day * 0.61 + i));
    const count = Math.max(3, Math.round(13 + 12 * wave - i * 2));
    const withdrawn = Math.max(2, Math.round(10 + 8 * Math.cos(day * 0.52 + i)));
    return {
      day, productId: p.id,
      price: p.price * (p.group === "Stablecoins" ? 1 : 1 + 0.09 * Math.sin(day / 12)),
      deposits, withdrawals,
      depositAccounts: accounts(p.chain, day, i, count, 0),
      withdrawalAccounts: accounts(p.chain, day, i, withdrawn, 19),
      depositActions: count + 4 + i,
      withdrawalActions: withdrawn + 2 + i,
    };
  })).flat();
}

export const MOCK_LEDGER = createMockLedger();
