"use client";
import { createConfig, createStorage } from "wagmi";
import { injected } from "wagmi/connectors/injected";
import { safe } from "wagmi/connectors/safe";
import { walletConnect } from "./walletconnect-connector";
import { mainnet } from "wagmi/chains";
import { defineChain, http, fallback } from "viem";
import { E2E_MOCK_ADDRESS } from "@/lib/constants";
import { assertProductionRuntimeInvariants } from "@/lib/runtime/invariants";
import { createE2EMockConnector } from "./e2e-mock-connector";

assertProductionRuntimeInvariants("web3/wagmi");

const projectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID?.trim();
const rawRpcUrls = (process.env.NEXT_PUBLIC_RPC_URLS ?? "")
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean);
const isProd = process.env.NODE_ENV === "production";
if (isProd && rawRpcUrls.length === 0) {
  throw new Error(
    "NEXT_PUBLIC_RPC_URLS must include at least one non-empty RPC URL in production."
  );
}
const rpcUrls =
  rawRpcUrls.length > 0 ? rawRpcUrls : mainnet.rpcUrls.default.http;

if (!isProd && rawRpcUrls.length === 0) {
  console.warn(
    "NEXT_PUBLIC_RPC_URLS is not set. Falling back to default mainnet RPC."
  );
}
if (!isProd && rpcUrls.length === 0) {
  console.warn("No RPC URLs configured. Wallet RPC will be required for reads.");
}

// Define the fork chain overriding Mainnet (Chain ID 1)
const mainnetFork = defineChain({
  ...mainnet,
  id: 1,
  name: "Mainnet Fork",
  nativeCurrency: {
    decimals: 18,
    name: "Ether",
    symbol: "ETH",
  },
  rpcUrls: {
    default: { http: rpcUrls },
    public: { http: rpcUrls },
  },
  contracts: {
    multicall3: {
      address: "0xcA11bde05977b3631167028862bE2a173976CA11",
      blockCreated: 0,
    },
  },
  batch: {
    multicall: true,
  },
});

if (!projectId) {
  console.warn("NEXT_PUBLIC_WC_PROJECT_ID is not set.");
}

const isE2E = process.env.NEXT_PUBLIC_E2E === "true";
const httpTransport = (url: string) =>
  http(url, {
    retryCount: 1,
  });
const transports = {
  [mainnetFork.id]:
    rpcUrls.length > 1
      ? fallback(rpcUrls.map((url) => httpTransport(url)))
      : httpTransport(rpcUrls[0]),
};

export const wagmiConfig = isE2E
  ? createConfig({
      chains: [mainnetFork],
      transports,
      ssr: true,
      connectors: [
        createE2EMockConnector({
          accounts: [E2E_MOCK_ADDRESS],
          features: {
            defaultConnected: true,
            reconnect: true,
          },
        }),
      ],
    })
  : createConfig({
      chains: [mainnetFork],
      transports,
      ssr: true,
      storage: createStorage({
        key: "yearn-wallet-v3",
        storage: {
          getItem(key) {
            try { return window.localStorage.getItem(key); } catch { return null; }
          },
          setItem(key, value) {
            try { window.localStorage.setItem(key, value); } catch { /* Storage can be unavailable in private browsing. */ }
          },
          removeItem(key) {
            try { window.localStorage.removeItem(key); } catch { /* A disconnected wallet remains disconnected in memory. */ }
          },
        },
      }),
      multiInjectedProviderDiscovery: true,
      connectors: [
        injected(),
        safe({
          shimDisconnect: true,
          unstable_getInfoTimeout: 1000,
          allowedDomains: [
            /^https:\/\/(?:[a-z0-9-]+\.)*safe\.global$/,
            /^https:\/\/(?:[a-z0-9-]+\.)*gnosis-safe\.io$/,
          ],
        }),
        ...(projectId
          ? [walletConnect({ projectId, rpcMap: { [mainnetFork.id]: rpcUrls[0] } })]
          : []),
      ],
    });
