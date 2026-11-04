"use client";

import { WagmiProvider } from "wagmi";
import type { ReactNode } from "react";
import { QueryProviders } from "@/state/query-client";
import { wagmiConfig } from "./wagmi";
import { WalletUiProvider } from "./wallet-ui";

export function Web3Providers({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryProviders>
        <WalletUiProvider>{children}</WalletUiProvider>
      </QueryProviders>
    </WagmiProvider>
  );
}
