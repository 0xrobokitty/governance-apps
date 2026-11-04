"use client";

import { useEffect, useState } from "react";
import {
  useAccountModal,
  useChainModal,
  useConnectModal,
} from "@/web3/wallet-ui";
import { useAccount } from "wagmi";
import { cn } from "@/lib/cn";
import { E2E_MOCK_ADDRESS } from "@/lib/constants";
import { formatAddress } from "@/lib/format";
import { MAINNET_CHAIN_ID } from "@/lib/tx/network";
import type { Address } from "viem";

export type E2EWalletPresentation = {
  address: Address;
  connected: boolean;
  correctChain: boolean;
};

export function WalletButton({
  e2ePresentation,
}: {
  e2ePresentation?: E2EWalletPresentation;
} = {}) {
  const { address, chainId, isConnected } = useAccount();
  const { openAccountModal } = useAccountModal();
  const { openConnectModal } = useConnectModal();
  const { openChainModal } = useChainModal();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(timer);
  }, []);

  const usesE2EFallback =
    process.env.NEXT_PUBLIC_E2E === "true" && address === undefined;
  const effectiveAddress =
    address ?? (usesE2EFallback ? E2E_MOCK_ADDRESS : undefined);
  const hasConnectedAccount = isConnected || usesE2EFallback;

  if (!mounted) {
    return <div className="h-9 w-24 animate-pulse rounded-full bg-surface-secondary" />;
  }

  if (process.env.NEXT_PUBLIC_E2E === "true" && e2ePresentation) {
    const label = getE2EWalletLabel(e2ePresentation);
    return (
      <div
        role="status"
        aria-label={`Read-only test wallet: ${label}`}
        data-testid="dao-wallet-presentation"
        className={cn(
          "inline-flex min-h-10 items-center rounded-lg px-3 py-1.5 text-sm font-medium",
          !e2ePresentation.connected
            ? "bg-surface-secondary text-text-secondary"
            : !e2ePresentation.correctChain
              ? "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-200"
              : "bg-surface-secondary text-text-secondary"
        )}
      >
        {label}
      </div>
    );
  }

  if (usesE2EFallback && effectiveAddress) {
    const label = formatAddress(effectiveAddress);
    return (
      <div
        role="status"
        aria-label={`Read-only test wallet: ${label}`}
        className="inline-flex min-h-10 items-center rounded-lg bg-surface-secondary px-3 py-1.5 text-sm font-medium text-text-secondary"
      >
        {label}
      </div>
    );
  }

  if (!hasConnectedAccount || !effectiveAddress) {
    return (
      <button
        onClick={() => openConnectModal?.()}
        className="relative hidden h-10 cursor-pointer items-center justify-center rounded-xl border border-transparent bg-text-primary px-3 text-xs font-normal text-surface transition-[opacity] hover:opacity-90 md:flex"
      >
        Connect wallet
      </button>
    );
  }

  const isWrongNetwork =
    !usesE2EFallback && !!chainId && chainId !== MAINNET_CHAIN_ID;

  if (isWrongNetwork) {
    return (
      <button
        onClick={() => (openChainModal ?? openConnectModal)?.()}
        className="flex h-10 items-center rounded-full bg-red-100 px-4 text-xs font-bold text-red-600 transition-colors hover:bg-red-200"
      >
        Wrong Network
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => openAccountModal?.()}
        className={cn(
          "inline-flex min-h-10 items-center gap-2 rounded-lg bg-surface-secondary px-3 py-1.5 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary",
        )}
      >
        <span>{formatAddress(effectiveAddress)}</span>
      </button>
    </div>
  );
}

export function getE2EWalletLabel(
  presentation: E2EWalletPresentation
): string {
  if (!presentation.connected) return "Wallet disconnected";
  if (!presentation.correctChain) return "Wrong network";
  return formatAddress(presentation.address);
}
