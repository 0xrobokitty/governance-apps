"use client";

import { useState } from "react";
import Image from "next/image";
import { formatUnits } from "viem";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tooltip } from "@/components/ui/Tooltip";
import { LogoStyfi } from "@/components/icons/LogoStyfi";
import { LogoStyfix } from "@/components/icons/LogoStyfix";
import { LogoYearnGlyph } from "@/components/icons/LogoYearnGlyph";
import { IconLinkOut } from "@/components/icons/IconLinkOut";
import { IconPlaceholderToken } from "@/components/icons/IconPlaceholderToken";
import { cn } from "@/lib/cn";
import { formatTokenAmount } from "@/lib/format";
import { resolveGovernanceAppHref } from "@/lib/governance-links";
import { getLlyfiDisplaySymbol } from "@/lib/clients/veyfi/display";
import { ModeComparison } from "./ModeComparison";
import type { StyfiAsset } from "./types";
import type { ExternalPosition } from "../external-positions";
import type { StyfiYbcMembership } from "@/lib/clients/styfi/apr-types";
import { styfiCopy } from "../messages";

const EXTERNAL_TOKEN_LOGOS: Record<string, string> = {
  veyfi: "/tokens/veyfi.png",
  sdyfi: "/tokens/sdyfi.svg",
  upyfi: "/tokens/supyfi.svg",
  supyfi: "/tokens/supyfi.svg",
  coveyfi: "/tokens/coveyfi.png",
};

function getExternalTokenLogo(symbol: string): string | null {
  return EXTERNAL_TOKEN_LOGOS[symbol.toLowerCase()] ?? null;
}

function formatUnlockDate(timestamp: number) {
  const date = new Date(timestamp * 1000);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatCompactTokenAmount(amount: bigint, decimals = 18): string {
  const asNumber = Number.parseFloat(formatUnits(amount, decimals));
  if (!Number.isFinite(asNumber)) return "0";
  return asNumber.toLocaleString("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  });
}

function formatExternalMetricAmount(position: ExternalPosition, amount: bigint) {
  if (getLlyfiDisplaySymbol(position.symbol) === "supYFI") {
    return formatCompactTokenAmount(amount);
  }
  return formatTokenAmount(amount);
}

export type AccountBalances = {
  styfi: {
    active: bigint;
    unstaking: bigint;
    withdrawable: bigint;
    total: bigint;
  };
  styfix: {
    active: bigint;
    unstaking: bigint;
    withdrawable: bigint;
    total: bigint;
  };
};

type AccountSummaryProps = {
  now: number;
  selectedAsset?: StyfiAsset;
  onSelectAsset: (asset: StyfiAsset) => void;
  balances?: AccountBalances | null;
  externalPositions: ExternalPosition[];
  ybcMembership?: StyfiYbcMembership | null;
  hostname?: string | null;
  isLoading: boolean;
  isConnected: boolean;
  isWrongNetwork: boolean;
  onConnect?: () => void;
  connectLabel?: string;
  connectBody?: string;
  wrongNetworkBody?: string;
};

export function AccountSummary({
  now,
  selectedAsset,
  onSelectAsset,
  balances,
  externalPositions,
  ybcMembership,
  hostname,
  isLoading,
  isConnected,
  isWrongNetwork,
  onConnect,
  connectLabel,
  connectBody,
  wrongNetworkBody,
}: AccountSummaryProps) {
  if (isLoading && isConnected && !isWrongNetwork) {
    return (
      <Card>
        <div className="space-y-4">
          <p className="text-sm font-bold uppercase tracking-wide text-neutral-500">
            Account Summary
          </p>
          <div className="space-y-3">
            <div className="flex items-center gap-4 rounded-lg border border-border bg-surface/50 p-4">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-32" />
              </div>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  const rows = [
    balances?.styfi &&
    (balances.styfi.total > 0n || balances.styfi.withdrawable > 0n)
      ? {
          asset: "stYFI" as const,
          ...balances.styfi,
        }
      : null,
    balances?.styfix &&
    (balances.styfix.total > 0n || balances.styfix.withdrawable > 0n)
      ? {
          asset: "stYFIx" as const,
          ...balances.styfix,
        }
      : null,
  ].filter(
    (row): row is {
      asset: StyfiAsset;
      active: bigint;
      unstaking: bigint;
      withdrawable: bigint;
      total: bigint;
    } => Boolean(row)
  );
  const hasInternalPositions = rows.length > 0;
  const hasExternalPositions = externalPositions.length > 0;
  const hasOtherPositions = hasExternalPositions || !!ybcMembership;
  const veyfiBaseHref = resolveGovernanceAppHref("veyfi", hostname);

  return (
    <Card>
      <div className="space-y-4">
        <p className="text-sm font-bold uppercase tracking-wide text-neutral-500">
          Account Summary
        </p>

        <div className="space-y-3">
          {!isConnected ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface/50 p-4">
              <p className="text-sm text-neutral-600">
                {connectBody ?? "Connect your wallet to view positions."}
              </p>
              {onConnect && (
                <Button size="sm" variant="primary" onClick={onConnect}>
                  {connectLabel ?? "Connect wallet"}
                </Button>
              )}
            </div>
          ) : isWrongNetwork ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
              <p className="text-sm text-amber-800">
                {wrongNetworkBody ??
                  "Wrong network. Switch your wallet to Ethereum Mainnet to manage positions."}
              </p>
            </div>
          ) : hasInternalPositions ? (
            <>
              <SummarySectionTitle title="Staked YFI" />
              {rows.map((row) => (
                <PositionRow
                  key={row.asset}
                  asset={row.asset}
                  active={row.active}
                  unstaking={row.unstaking}
                  withdrawable={row.withdrawable}
                  total={row.total}
                  onClick={() => onSelectAsset(row.asset)}
                />
              ))}
              {hasOtherPositions ? (
                <>
                  <SummarySectionTitle title={styfiCopy.accountSummary.ybc.section} />
                  {externalPositions.map((position) => (
                    <ExternalPositionRow
                      key={position.id}
                      position={position}
                      now={now}
                      href={resolveVeyfiHref(position.href, veyfiBaseHref)}
                    />
                  ))}
                  {ybcMembership && <YbcMembershipRow membership={ybcMembership} href={resolveGovernanceAppHref("ybc", hostname)} />}
                </>
              ) : null}
            </>
          ) : hasOtherPositions ? (
            <>
              <SummarySectionTitle title="Your Governance Positions" />
              {externalPositions.map((position) => (
                <ExternalPositionRow
                  key={position.id}
                  position={position}
                  now={now}
                  href={resolveVeyfiHref(position.href, veyfiBaseHref)}
                />
              ))}
              {ybcMembership && <YbcMembershipRow membership={ybcMembership} href={resolveGovernanceAppHref("ybc", hostname)} />}
              <SummarySectionTitle title="Choose How to Stake" />
              <ModeComparison
                selectedAsset={selectedAsset}
                onSelectAsset={onSelectAsset}
              />
            </>
          ) : (
            <>
              <SummarySectionTitle title="Compare stYFI and stYFIx" />
              <ModeComparison
                selectedAsset={selectedAsset}
                onSelectAsset={onSelectAsset}
              />
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

function YbcMembershipRow({ membership, href }: { membership: StyfiYbcMembership; href: string }) {
  const copy = styfiCopy.accountSummary.ybc;
  const share = membership.rewardShareBps === 0n && membership.eligibleStakeYfi > 0n ? "<0.01"
    : formatTokenAmount(membership.rewardShareBps, 2, 2);
  const backing = formatTokenAmount(membership.rewardBackingYfi);
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between" data-testid="ybc-membership-row">
      <a href={href} aria-label={copy.open} className="group inline-flex min-h-10 min-w-0 items-center gap-3 self-start rounded transition-colors hover:text-neutral-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 sm:self-auto">
        <span aria-hidden className="shrink-0"><LogoYearnGlyph className="size-8" backClassName="text-yearn-blue" frontClassName="text-white" /></span>
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-base font-bold text-neutral-900">
            {copy.title}<IconLinkOut className="size-3.5 shrink-0 text-neutral-400" aria-hidden />
          </span>
          <span className="block text-xs font-medium text-neutral-500">{copy.symbol}</span>
        </span>
      </a>
      <div className="flex shrink-0 justify-end text-right md:w-52 lg:w-56">
        <Tooltip side="top" align="end" content={
          <span className="block space-y-2">
            <span className="block font-semibold text-neutral-900">{copy.calculation}</span>
            <span className="block font-number tabular-nums text-neutral-900">{copy.formula(share, formatTokenAmount(membership.totalRewardBackingYfi), backing)}</span>
            <span className="block">{copy.explanation}</span>
            {!membership.rewardsEnabled && <span className="block">{copy.disabled}</span>}
          </span>
        }>
          <button type="button" aria-label={copy.backing} className="flex min-h-12 cursor-help flex-col items-end justify-center gap-0.5 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900" onClick={event => event.currentTarget.focus()} onKeyDown={event => { if (event.key === "Escape") event.currentTarget.blur(); }}>
            <span className="font-number text-xl font-bold tabular-nums text-neutral-900" data-testid="ybc-estimated-backing">{backing} YFI</span>
            <span className="text-[10px] font-bold uppercase tracking-wide text-neutral-500 underline decoration-dotted underline-offset-4">{copy.backing}</span>
          </button>
        </Tooltip>
      </div>
    </div>
  );
}

function SummarySectionTitle({ title }: { title: string }) {
  return (
    <p className="text-xs font-bold uppercase tracking-wide text-neutral-500">
      {title}
    </p>
  );
}

function resolveVeyfiHref(href: string, veyfiBaseHref: string): string {
  if (/^https?:\/\//i.test(href)) return href;
  if (!veyfiBaseHref.startsWith("http")) return href;
  return new URL(href, veyfiBaseHref).toString();
}

function PositionRow({
  asset,
  active,
  unstaking,
  withdrawable,
  total,
  onClick,
}: {
  asset: StyfiAsset;
  active: bigint;
  unstaking: bigint;
  withdrawable: bigint;
  total: bigint;
  onClick: () => void;
}) {
  const Logo = asset === "stYFI" ? LogoStyfi : LogoStyfix;
  const activeClass = active > 0n ? "text-neutral-900" : "text-neutral-300";
  const unstakingClass =
    unstaking > 0n ? "text-neutral-900" : "text-neutral-300";
  const withdrawableClass =
    withdrawable > 0n
      ? "text-sunset-600 bg-sunset-50/50 rounded-md px-2"
      : "text-neutral-300";
  const metricValueClass =
    "font-number inline-flex h-8 items-center justify-end text-lg font-bold leading-none";

  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="styfi-position-row"
      className="flex w-full flex-col gap-4 rounded-lg border border-border bg-surface p-4 text-left transition-colors hover:bg-surface-secondary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 md:flex-row md:items-center"
    >
      <div className="flex w-full shrink-0 items-center justify-between md:w-52 lg:w-56">
        <div className="flex items-center gap-3">
          <Logo className="h-8 w-8 shrink-0" aria-hidden />
          <p className="text-base font-bold text-neutral-900">{asset}</p>
        </div>
        <div className="flex flex-col items-end md:hidden">
          <span className="font-number font-bold text-lg text-neutral-900">
            {formatTokenAmount(total)} YFI
          </span>
        </div>
      </div>

      <div className="flex w-full justify-between md:flex-1 md:justify-end md:gap-8 lg:gap-12">
        <div className="flex w-24 flex-col items-start md:items-end">
          <span className={cn(metricValueClass, activeClass)}>
            {formatTokenAmount(active)}
          </span>
          <span className="mt-0.5 text-[10px] font-sans font-bold uppercase tracking-wide text-neutral-500">
            Active
          </span>
        </div>

        <div className="flex w-24 flex-col items-center md:items-end">
          <span className={cn(metricValueClass, unstakingClass)}>
            {formatTokenAmount(unstaking)}
          </span>
          <span className="mt-0.5 text-[10px] font-sans font-bold uppercase tracking-wide text-neutral-500">
            Unstaking
          </span>
        </div>

        <div className="flex w-24 flex-col items-end">
          <span
            className={cn(
              metricValueClass,
              "transition-colors",
              withdrawableClass
            )}
          >
            {formatTokenAmount(withdrawable)}
          </span>
          <span
            className={cn(
              "mt-0.5 text-[10px] font-sans font-bold uppercase tracking-wide",
              withdrawable > 0n ? "text-sunset-600" : "text-neutral-500"
            )}
          >
            Withdrawable
          </span>
        </div>
      </div>

      <div className="hidden shrink-0 flex-col items-end md:flex md:w-52 lg:w-56">
        <span className="font-number font-bold text-xl text-neutral-900">
          {formatTokenAmount(total)} YFI
        </span>
        <span className="mt-0.5 text-[10px] font-sans font-bold uppercase tracking-wide text-neutral-500">
          Total Position
        </span>
      </div>
    </button>
  );
}

function ExternalPositionRow({
  now,
  position,
  href,
}: {
  now: number;
  position: ExternalPosition;
  href: string;
}) {
  const displaySymbol = getLlyfiDisplaySymbol(position.symbol);
  const isVeYfi = position.symbol === "veYFI";
  const isVeYfiUnlocked =
    isVeYfi &&
    typeof position.unlockTime === "number" &&
    position.unlockTime <= now;
  const activeClass =
    position.activeYfi > 0n ? "text-neutral-900" : "text-neutral-300";
  const unstakingClass =
    position.unstakingYfi > 0n ? "text-neutral-900" : "text-neutral-300";
  const withdrawableClass =
    position.withdrawableYfi > 0n
      ? "text-disco-700 bg-disco-50/60 rounded-md px-2"
      : "text-neutral-300";
  const metricValueClass =
    "font-number inline-flex h-8 items-center justify-end text-lg font-bold leading-none";

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="external-position-row"
      className="group flex w-full flex-col gap-4 rounded-lg border border-border bg-surface p-4 text-left transition-colors hover:bg-surface-secondary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 md:flex-row md:items-center"
    >
      <div className="flex w-full shrink-0 items-center justify-between md:w-52 lg:w-56">
        <div className="flex items-center gap-3">
          <ExternalTokenIcon symbol={position.symbol} />
          <div>
            <p className="flex items-center gap-1.5 text-base font-bold text-neutral-900">
              {displaySymbol}
              <IconLinkOut className="size-3.5 text-neutral-400 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-visible:opacity-100" />
            </p>
            <p className="text-xs font-medium text-neutral-500">{position.subLabel}</p>
          </div>
        </div>

        <div className="flex flex-col items-end md:hidden">
          <span className="font-number font-bold text-lg text-neutral-900">
            {formatTokenAmount(position.balanceYfi)} YFI
          </span>
        </div>
      </div>

      <div className="flex w-full justify-between md:flex-1 md:justify-end md:gap-8 lg:gap-12">
        <div className="flex w-24 flex-col items-start md:items-end">
          {isVeYfi && position.unlockTime ? (
            <>
              <span className={cn(metricValueClass, "text-neutral-900")}>
                {formatUnlockDate(position.unlockTime)}
              </span>
              <span className="mt-0.5 text-[10px] font-sans font-bold uppercase tracking-wide text-neutral-500">
                Unlock Date
              </span>
            </>
          ) : (
            <>
              <span className={cn(metricValueClass, activeClass)}>
                {formatExternalMetricAmount(position, position.activeYfi)}
              </span>
              <span className="mt-0.5 text-[10px] font-sans font-bold uppercase tracking-wide text-neutral-500">
                Active
              </span>
            </>
          )}
        </div>

        <div className="flex w-24 flex-col items-center md:items-end">
          {isVeYfi ? (
            <>
              <span className={cn(metricValueClass, "text-neutral-900")}>
                {isVeYfiUnlocked ? "Unlocked" : "Locked"}
              </span>
              <span className="mt-0.5 text-[10px] font-sans font-bold uppercase tracking-wide text-neutral-500">
                Status
              </span>
            </>
          ) : (
            <>
              <span className={cn(metricValueClass, unstakingClass)}>
                {formatExternalMetricAmount(position, position.unstakingYfi)}
              </span>
              <span className="mt-0.5 text-[10px] font-sans font-bold uppercase tracking-wide text-neutral-500">
                Unstaking
              </span>
            </>
          )}
        </div>

        <div className="flex w-24 flex-col items-end">
          {isVeYfi ? (
            <>
              <span className={cn(metricValueClass, "text-neutral-900")}>
                {position.boostMultiplier.toFixed(2)}x
              </span>
              <span className="mt-0.5 text-[10px] font-sans font-bold uppercase tracking-wide text-neutral-500">
                Boost
              </span>
            </>
          ) : (
            <>
              <span
                className={cn(
                  metricValueClass,
                  "transition-colors",
                  withdrawableClass
                )}
              >
                {formatExternalMetricAmount(position, position.withdrawableYfi)}
              </span>
              <span
                className={cn(
                  "mt-0.5 text-[10px] font-sans font-bold uppercase tracking-wide",
                  position.withdrawableYfi > 0n
                    ? "text-disco-700"
                    : "text-neutral-500"
                )}
              >
                Withdrawable
              </span>
            </>
          )}
        </div>
      </div>

      <div className="hidden shrink-0 flex-col items-end md:flex md:w-52 lg:w-56">
        <span className="font-number font-bold text-xl text-neutral-900">
          {formatTokenAmount(position.balanceYfi)} YFI
        </span>
        <span className="mt-0.5 text-[10px] font-sans font-bold uppercase tracking-wide text-neutral-500">
          Total Position
        </span>
      </div>
    </a>
  );
}

function ExternalTokenIcon({ symbol }: { symbol: string }) {
  const [failed, setFailed] = useState(false);
  const src = getExternalTokenLogo(symbol);

  if (!src || failed) {
    return (
      <IconPlaceholderToken
        letters={symbol.slice(0, 2)}
        className="size-8"
      />
    );
  }

  return (
    <Image
      src={src}
      alt=""
      width={32}
      height={32}
      aria-hidden
      className="size-8 shrink-0 rounded-full object-cover"
      onError={() => setFailed(true)}
    />
  );
}
