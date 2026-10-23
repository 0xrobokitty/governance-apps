import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { UtcTime } from "@/components/ui/UtcTime";
import { AddressLink } from "@/components/ui/ExplorerLink";
import { IconLinkOut } from "@/components/icons/IconLinkOut";
import { deriveDaoYbcVote } from "@/lib/clients/dao/participation";
import { DAO_MOCK_YBC_AGGREGATE_ADDRESS } from "@/lib/clients/dao/fixtures";
import type { DaoProposal } from "@/lib/clients/dao/types";
import { YBC_MAINNET_DEPLOYMENT } from "@/lib/clients/ybc/deployment";
import { resolveGovernanceAppHref } from "@/lib/governance-links";
import { isDaoMockRuntimeEnabled } from "@/lib/runtime/features";
import { daoCopy } from "../messages";

export function DaoYbcVoteCard({ proposal, hostname }: { proposal: DaoProposal; hostname?: string }) {
  const address = proposal.ref.chainId === 1
    ? isDaoMockRuntimeEnabled() ? DAO_MOCK_YBC_AGGREGATE_ADDRESS : YBC_MAINNET_DEPLOYMENT.ybc
    : null;
  const vote = deriveDaoYbcVote(proposal, address);
  const copy = daoCopy.ybcVote;
  return (
    <Card className="min-w-0 space-y-3" aria-label={copy.title}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-balance text-base font-bold">{copy.title}</h3>
        <Link href={resolveGovernanceAppHref("ybc", hostname)} className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded text-xs font-bold text-yearn-blue transition-colors hover:text-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-text-primary dark:text-blue-300 dark:hover:text-blue-200">
          {copy.explore}<IconLinkOut className="size-3.5" aria-hidden />
        </Link>
      </div>
      {vote.state === "voted" ? (
        <>
          <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-secondary" role="img" aria-label={copy.split(vote.yeaPercent, vote.nayPercent)}>
            <span className="h-full bg-yearn-blue dark:bg-blue-400" style={{ width: `${vote.yeaBps / 100}%` }} />
            <span className="h-full bg-rose-500 dark:bg-rose-400" style={{ width: `${vote.nayBps / 100}%` }} />
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm tabular-nums">
            <div className="min-w-0">
              <dt className="flex items-center gap-1.5 text-xs text-text-secondary"><span className="size-1.5 rounded-full bg-yearn-blue dark:bg-blue-400" aria-hidden />{copy.for}</dt>
              <dd className="mt-1 break-words font-number font-bold">{vote.yeaPercent}</dd>
              <dd className="break-words font-number text-xs text-text-secondary">{copy.weight(vote.formattedYeaWeight)}</dd>
            </div>
            <div className="min-w-0 text-right">
              <dt className="flex items-center justify-end gap-1.5 text-xs text-text-secondary"><span className="size-1.5 rounded-full bg-rose-500 dark:bg-rose-400" aria-hidden />{copy.against}</dt>
              <dd className="mt-1 break-words font-number font-bold">{vote.nayPercent}</dd>
              <dd className="break-words font-number text-xs text-text-secondary">{copy.weight(vote.formattedNayWeight)}</dd>
            </div>
          </dl>
        </>
      ) : <p className="text-sm text-text-secondary">{vote.state === "not-voted" ? copy.notVoted : copy.unavailable}</p>}
      <details className="border-t border-border pt-1 text-xs text-text-secondary">
        <summary className="min-h-10 cursor-pointer content-center rounded font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-text-primary">{copy.snapshot}</summary>
        <div className="space-y-2 pb-1">
          <p className="text-pretty leading-5">{copy.description}</p>
          {vote.state === "voted" && vote.timestamp !== null ? <p>{copy.updated} <UtcTime timestamp={vote.timestamp} /></p> : null}
          {vote.address ? <AddressLink address={vote.address} variant="compact" copyLabel={copy.copyAddress} /> : null}
        </div>
      </details>
    </Card>
  );
}
