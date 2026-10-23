"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { UtcTime } from "@/components/ui/UtcTime";
import { Tooltip } from "@/components/ui/Tooltip";
import { AddressLink } from "@/components/ui/ExplorerLink";
import { IconLinkOut } from "@/components/icons/IconLinkOut";
import { deriveDaoVoteResults, type DaoVoteResultSegment } from "@/lib/clients/dao/vote-results";
import { DAO_MOCK_YBC_AGGREGATE_ADDRESS } from "@/lib/clients/dao/fixtures";
import type { DaoProposal } from "@/lib/clients/dao/types";
import { YBC_MAINNET_DEPLOYMENT } from "@/lib/clients/ybc/deployment";
import { resolveGovernanceAppHref } from "@/lib/governance-links";
import { isDaoMockRuntimeEnabled } from "@/lib/runtime/features";
import { cn } from "@/lib/cn";
import { daoCopy } from "../messages";

const SEGMENT_COLORS: Record<DaoVoteResultSegment["kind"], string> = {
  yea: "bg-yearn-blue dark:bg-blue-400",
  "ybc-yea": "bg-blue-800 dark:bg-blue-200",
  "ybc-nay": "bg-neutral-800 dark:bg-neutral-300",
  nay: "bg-neutral-500",
};
const YBC_PATTERN = "bg-[repeating-linear-gradient(135deg,transparent,transparent_3px,rgba(255,255,255,0.45)_3px,rgba(255,255,255,0.45)_5px)] dark:bg-[repeating-linear-gradient(135deg,transparent,transparent_3px,rgba(0,0,0,0.35)_3px,rgba(0,0,0,0.35)_5px)]";

export function ProposalVoteResults({ proposal, hostname }: { proposal: DaoProposal; hostname?: string }) {
  const [highlightYbc, setHighlightYbc] = useState(true);
  const descriptionId = useId();
  const address = proposal.ref.chainId === 1
    ? isDaoMockRuntimeEnabled() ? DAO_MOCK_YBC_AGGREGATE_ADDRESS : YBC_MAINNET_DEPLOYMENT.ybc
    : null;
  const results = deriveDaoVoteResults(proposal, address);
  const { vote, ybc } = results;
  const copy = daoCopy.ybcVote;
  if (!vote) return <p className="text-sm text-text-secondary">{daoCopy.voteResults.unavailable}</p>;
  const highlighted = highlightYbc && ybc.state === "voted";
  const segments = highlighted ? results.highlightedSegments : results.canonicalSegments;
  const visibleSegments = segments.filter((part) => part.units > 0);
  const segmentLabel = (part: DaoVoteResultSegment) => daoCopy.voteResults.segmentLabels[part.kind];

  return (
    <div className="min-w-0 space-y-3" data-testid="dao-vote-results">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3">
        <label className={cn("inline-flex min-h-10 items-center gap-2 rounded text-xs font-bold", ybc.state === "voted" ? "cursor-pointer" : "text-text-secondary")}>
          <input
            type="checkbox"
            checked={highlighted}
            disabled={ybc.state !== "voted"}
            onChange={(event) => setHighlightYbc(event.target.checked)}
            aria-describedby={descriptionId}
            className="size-4 shrink-0 accent-yearn-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary"
          />
          {copy.highlight}
        </label>
        <Link href={resolveGovernanceAppHref("ybc", hostname)} className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded text-xs font-bold text-yearn-blue transition-colors hover:text-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-text-primary dark:text-blue-300 dark:hover:text-blue-200">
          {copy.explore}<IconLinkOut className="size-3.5" aria-hidden />
        </Link>
      </div>
      <div aria-hidden="true" data-testid="dao-total-vote-bar" className="flex h-3 w-full rounded-full bg-neutral-200 dark:bg-neutral-800">
        {visibleSegments.map((part, index) => {
          // Position the popup from the segment's visual center, away from the
          // card edges. Only the painted ends are rounded; popups remain unclipped.
          const center = visibleSegments.slice(0, index).reduce((sum, segment) => sum + segment.widthPercent, 0) + part.widthPercent / 2;
          return (
            <span key={part.kind} data-vote-segment={part.kind} className="h-full" style={{ width: `${part.widthPercent}%` }}>
              <Tooltip className="h-full w-full align-top" align={center < 33 ? "start" : center > 67 ? "end" : "center"} content={
                <span className="block w-44 max-w-full text-pretty"><strong className="font-bold">{segmentLabel(part)}</strong><br />{daoCopy.voteResults.share(part.shareOfTotalPercent)}</span>
              }>
                <span className={cn("h-full w-full", SEGMENT_COLORS[part.kind], part.kind.startsWith("ybc-") && YBC_PATTERN, index === 0 && "rounded-l-full", index === visibleSegments.length - 1 && "rounded-r-full")} />
              </Tooltip>
            </span>
          );
        })}
      </div>
      <div className="space-y-2" data-testid="dao-canonical-vote-totals">
        <p className="font-number text-sm font-bold tabular-nums">{daoCopy.detail.voteBreakdown(vote.yeaPercent, vote.nayPercent)}</p>
        <p className="text-pretty font-number text-xs tabular-nums text-text-secondary">{daoCopy.detail.voteCaption(vote.thresholdPercent)}</p>
        <dl className="grid grid-cols-3 gap-2 pt-2">
          <VoteFact label={daoCopy.detail.yeaWeight} value={vote.yeaWeight} />
          <VoteFact label={daoCopy.detail.nayWeight} value={vote.nayWeight} />
          <VoteFact label={daoCopy.detail.totalWeight} value={vote.totalWeight} />
        </dl>
      </div>
      <div className="border-t border-border pt-3">
        <p id={descriptionId} className="text-xs text-text-secondary">
          {ybc.state === "voted" ? copy.included : ybc.state === "not-voted" ? copy.notVoted : copy.unavailable}
        </p>
        {highlighted && ybc.state === "voted" ? (
          <dl className="mt-2 grid grid-cols-2 gap-3" aria-label={copy.contribution}>
            <VoteFact label={copy.yea} value={ybc.formattedYeaWeight} marker="ybc-yea" />
            <VoteFact label={copy.nay} value={ybc.formattedNayWeight} marker="ybc-nay" />
          </dl>
        ) : null}
        <details className="mt-1 text-xs text-text-secondary">
          <summary className="min-h-10 cursor-pointer content-center rounded font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-text-primary">{copy.snapshot}</summary>
          <div className="space-y-2 pb-1">
            <dl aria-label={daoCopy.voteResults.shares} className="space-y-2">
              {segments.map((part) => (
                <div key={part.kind} className="flex flex-wrap justify-between gap-x-3 gap-y-1">
                  <dt>{segmentLabel(part)}</dt>
                  <dd className="font-number tabular-nums">{daoCopy.voteResults.share(part.shareOfTotalPercent)}</dd>
                </div>
              ))}
            </dl>
            <p className="text-pretty leading-5">{copy.description}</p>
            {ybc.state === "voted" && ybc.timestamp !== null ? <p>{copy.updated} <UtcTime timestamp={ybc.timestamp} /></p> : null}
            {ybc.address ? <AddressLink address={ybc.address} variant="compact" copyLabel={copy.copyAddress} /> : null}
          </div>
        </details>
      </div>
    </div>
  );
}

function VoteFact({ label, value, marker }: { label: string; value: string; marker?: "ybc-yea" | "ybc-nay" }) {
  return (
    <div className="min-w-0 space-y-1">
      <dt className="flex items-center gap-1.5 text-pretty text-[11px] font-bold text-text-secondary">
        {marker ? <span aria-hidden="true" className={cn("size-2.5 shrink-0 rounded-sm", SEGMENT_COLORS[marker], YBC_PATTERN)} /> : null}{label}
      </dt>
      <dd className="break-words font-number text-xs tabular-nums [overflow-wrap:anywhere]">{value}</dd>
    </div>
  );
}
