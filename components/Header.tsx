"use client";

import Link from "next/link";
import { usePathname, useSelectedLayoutSegments } from "next/navigation";
import {
  WalletButton,
  type E2EWalletPresentation,
} from "@/components/WalletButton";
import { IconMenu } from "@/components/icons/IconMenu";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { useEpochClock } from "@/lib/hooks/useEpochClock";
import { Skeleton } from "@/components/ui/Skeleton";
import { useGlobalData } from "@/lib/hooks/useGlobalData";
import { useProtocol } from "@/state/protocol";
import { resolveHeaderAppKey, resolveHeaderPrimaryNav } from "@/lib/header-nav";
import { useRef, useState } from "react";
import { TypeMarkYearn } from "@/components/icons/TypeMarkYearn";
import { HeaderNavMenu } from "@/components/header/HeaderNavMenu";
import { MobileNavMenu } from "@/components/header/MobileNavMenu";
import { useHostname } from "@/lib/hooks/useHostname";
import { resolveGovernanceAppHref } from "@/lib/governance-links";
import { isDaoEnabled } from "@/lib/runtime/features";
import { styfiCopy } from "@/app/styfi/messages";
import { useDaoMockRuntime } from "@/lib/hooks/useDao";

export function Header() {
  const pathname = usePathname();
  const segments = useSelectedLayoutSegments();
  const segment = segments?.[0] ?? null;
  const hostname = useHostname();
  const clock = useEpochClock({ tickMs: 1000 });
  const preferMocks =
    process.env.NEXT_PUBLIC_USE_MOCKS === "true" ||
    process.env.NEXT_PUBLIC_E2E === "true";
  const appKey = resolveHeaderAppKey(pathname, segment, hostname);
  const shouldShowEpochPill = appKey === "styfi" || appKey === "veyfi";
  const { isLoading: isGlobalLoading } = useGlobalData(
    shouldShowEpochPill && !preferMocks
  );
  const { publicClient } = useProtocol();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const mobileMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const daoRuntime = useDaoMockRuntime(
    appKey === "dao" && process.env.NEXT_PUBLIC_E2E === "true"
  );
  const isDaoProposeRoute =
    appKey === "dao" &&
    (pathname === "/propose" || pathname?.startsWith("/dao/propose"));
  const daoIdentity = isDaoProposeRoute
    ? daoRuntime?.proposer
    : daoRuntime?.account;
  const e2eWalletPresentation: E2EWalletPresentation | undefined =
    process.env.NEXT_PUBLIC_E2E === "true" && appKey === "dao" && daoIdentity
      ? {
          address: daoIdentity.address,
          connected: daoIdentity.connected,
          correctChain: daoIdentity.correctChain,
        }
      : undefined;

  // Resolve current app name (stYFI, veYFI, etc)
  const primaryNav = hostname
    ? resolveHeaderPrimaryNav(pathname, segment, hostname)
    : { label: null, path: "/" };
  const showEpochPill =
    shouldShowEpochPill && (!!publicClient || !isGlobalLoading);
  const governanceLink =
    appKey === "styfi" && isDaoEnabled()
      ? {
          href: resolveGovernanceAppHref("dao", hostname),
          label: styfiCopy.governance.headerLabel,
        }
      : undefined;

  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b border-border bg-app/80 backdrop-blur-md">
        <div className="container mx-auto flex h-16 items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-4">
            <TypeMarkYearn
              className="h-8 w-auto text-yearn-blue dark:text-text-primary"
              color="currentColor"
            />
            {primaryNav.label ? (
              <Link
                href={primaryNav.path}
                className="hidden min-h-10 min-w-10 items-center rounded-lg text-text-primary transition-[color,scale] duration-150 ease-out hover:text-yearn-blue active:scale-[0.96] focus:outline-none focus-visible:ring-2 focus-visible:ring-text-primary focus-visible:ring-offset-2 focus-visible:ring-offset-app motion-reduce:transition-none motion-reduce:active:scale-100 md:inline-flex"
              >
                {primaryNav.label}
              </Link>
            ) : null}
            <div className="hidden h-6 w-px bg-border md:block" />
            <div className="hidden md:block">
              <HeaderNavMenu governanceLink={governanceLink} />
            </div>
          </div>

          <div className="flex items-center gap-2">
            {shouldShowEpochPill ? (
              <div className="hidden sm:block">
                {showEpochPill ? (
                  <EpochCountdownBadge epoch={clock.epochInfo} now={clock.now} />
                ) : (
                  <Skeleton className="h-7 w-36" />
                )}
              </div>
            ) : null}
            <div className="hidden items-center gap-2 md:flex">
              <ThemeToggle />
              <WalletButton e2ePresentation={e2eWalletPresentation} />
            </div>
            <button
              ref={mobileMenuTriggerRef}
              type="button"
              onClick={() => setIsMobileMenuOpen(true)}
              className="inline-flex size-10 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary motion-reduce:transition-none md:hidden"
              aria-label="Open navigation menu"
              aria-expanded={isMobileMenuOpen}
            >
              <IconMenu className="size-5" />
            </button>
          </div>
        </div>
      </header>
      <MobileNavMenu
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
        returnFocusRef={mobileMenuTriggerRef}
        e2eWalletPresentation={e2eWalletPresentation}
        governanceLink={governanceLink}
      />
    </>
  );
}

function EpochCountdownBadge({
  epoch,
  now,
}: {
  epoch: { currentEpoch: number; epochEnd: number };
  now: number;
}) {
  const rem = Math.max(0, epoch.epochEnd - now);

  const d = Math.floor(rem / 86400);
  const h = Math.floor((rem % 86400) / 3600);

  return (
    <div className="flex items-center gap-1 rounded-lg border border-border bg-surface-secondary px-3 py-1.5 text-xs font-medium">
      <span className="text-text-secondary">Epoch {epoch.currentEpoch}</span>
      <span className="text-text-tertiary">&#183;</span>
      <span>
        {d}d {h}h left
      </span>
    </div>
  );
}
