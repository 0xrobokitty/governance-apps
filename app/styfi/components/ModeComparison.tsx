"use client";

import { Badge } from "@/components/ui/Badge";
import { LogoStyfi } from "@/components/icons/LogoStyfi";
import { LogoStyfix } from "@/components/icons/LogoStyfix";
import { cn } from "@/lib/cn";
import type { StyfiAsset } from "./types";
import type { ReactNode } from "react";
import { styfiCopy as copy } from "../messages";
import { useStyfiApr } from "@/lib/hooks/useStyfiApr";
import { StakingAprEstimate } from "./StakingAprEstimate";

type ModeComparisonProps = {
  selectedAsset?: StyfiAsset;
  onSelectAsset: (asset: StyfiAsset) => void;
  className?: string;
};

export function ModeComparison({
  selectedAsset,
  onSelectAsset,
  className,
}: ModeComparisonProps) {
  const { data: apr, isLoading } = useStyfiApr();
  return (
    <div className={cn("grid auto-rows-fr gap-4 md:grid-cols-2", className)}>
      <ModeCard
        asset="stYFI"
        selectedAsset={selectedAsset}
        onSelectAsset={onSelectAsset}
        title={copy.modeSelector.cards.styfi.title}
        description={copy.modeSelector.cards.styfi.description}
        estimate={<StakingAprEstimate asset="stYFI" snapshot={apr} isLoading={isLoading} />}
        badges={<Badge className="h-5 whitespace-nowrap px-1.5 py-0 text-[10px]">{copy.modeSelector.cards.styfi.badge}</Badge>}
      />
      <ModeCard
        asset="stYFIx"
        selectedAsset={selectedAsset}
        onSelectAsset={onSelectAsset}
        title={copy.modeSelector.cards.x.title}
        description={copy.modeSelector.cards.x.description}
        estimate={<StakingAprEstimate asset="stYFIx" snapshot={apr} isLoading={isLoading} valueClassName="text-yearn-blue" />}
        badges={
          <div className="flex items-center gap-1.5">
            <Badge variant="brand" className="h-5 whitespace-nowrap px-1.5 py-0 text-[10px]">{copy.modeSelector.cards.x.badge}</Badge>
            <Badge variant="brand" className="h-5 whitespace-nowrap px-1.5 py-0 text-[10px]">{copy.modeSelector.cards.x.recommended}</Badge>
          </div>
        }
      />
    </div>
  );
}

function ModeCard({
  asset,
  selectedAsset,
  onSelectAsset,
  title,
  description,
  badges,
  estimate,
}: {
  asset: StyfiAsset;
  selectedAsset?: StyfiAsset;
  onSelectAsset: (asset: StyfiAsset) => void;
  title: string;
  description: string;
  badges: ReactNode;
  estimate: ReactNode;
}) {
  const isActive = selectedAsset === asset;
  const isStyfi = asset === "stYFI";
  const Logo = isStyfi ? LogoStyfi : LogoStyfix;

  const activeClasses = isStyfi
    ? "border-sunset-600 ring-1 ring-sunset-600"
    : "border-yearn-blue ring-1 ring-yearn-blue";

  return (
    <button
      type="button"
      onClick={() => onSelectAsset(asset)}
      aria-pressed={isActive}
      className={cn(
        "grid h-full w-full grid-rows-[auto_1fr_auto] gap-4 rounded-box border bg-surface p-5 text-left transition-[border-color,box-shadow,transform] duration-150 ease-out",
        "hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2",
        isActive ? activeClasses : "border-neutral-200"
      )}
    >
      <div className="grid grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-3" data-testid={`mode-header-${asset.toLowerCase()}`}>
        <Logo className="h-10 w-10 shrink-0" aria-hidden />
        <div className="space-y-1">
          <p className="text-base font-bold leading-6 text-neutral-900">{title}</p>
          {badges}
        </div>
      </div>
      <p className="text-pretty text-sm text-neutral-600 leading-relaxed" data-testid={`mode-description-${asset.toLowerCase()}`}>
        {description}
      </p>
      <div className="w-full">{estimate}</div>
    </button>
  );
}
