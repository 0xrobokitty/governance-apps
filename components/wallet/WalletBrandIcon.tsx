"use client";

import { useState } from "react";
import { IconWallet } from "@/components/icons/IconWallet";
import { cn } from "@/lib/cn";

type WalletBrandIconProps = {
  id?: string;
  name?: string;
  rdns?: string;
  icon?: string;
  className?: string;
};

const knownWallets: Readonly<Record<string, string>> = {
  "io.metamask": "metamask",
  metamask: "metamask",
  metamasksdk: "metamask",
  "io.rabby": "rabby",
  rabby: "rabby",
  "com.ambire.wallet": "ambire",
  ambire: "ambire",
  safe: "safe",
  walletconnect: "walletconnect",
};

/** Presentation only: provider identifiers and icons are self-reported, not authentication. */
export function getWalletIconSource({ id, rdns, icon }: WalletBrandIconProps): string | undefined {
  const identifier = (typeof rdns === "string" ? rdns : typeof id === "string" ? id : undefined)?.toLowerCase();
  const brand = identifier && Object.hasOwn(knownWallets, identifier) ? knownWallets[identifier] : undefined;
  if (brand) return "/wallets/" + brand + ".svg";
  // Unknown wallets may supply EIP-6963 data images. Never fetch an arbitrary URL.
  // SVG is safe here only because it remains an inert img, never document markup.
  if (typeof icon === "string" && icon.length <= 131_072 && /^data:image\/(?:png|jpeg|gif|webp|svg\+xml)(?:;charset=(?:utf-8|us-ascii))?(?:;base64)?,\S/i.test(icon)) {
    return icon;
  }
  return undefined;
}

/** Keep the connector's own name visible beside this decorative image. */
export function WalletBrandIcon(props: WalletBrandIconProps) {
  const source = getWalletIconSource(props);
  return <BrandImage key={source ?? "fallback"} source={source} className={props.className} />;
}

export function EthereumIcon({ className }: { className?: string }) {
  return <BrandImage source="/wallets/ethereum.svg" className={cn("rounded-full", className)} />;
}

function BrandImage({ source, className }: { source?: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span aria-hidden="true" className={cn("inline-flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg", className)}>
      {source && !failed ? (
        // Wallet images are local static assets or bounded data URLs; Next image optimization is unnecessary.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={source} alt="" width={32} height={32} className="size-full object-contain" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      ) : <IconWallet className="size-3/4 text-text-secondary" />}
    </span>
  );
}
