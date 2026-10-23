"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AddressIdentity } from "@/components/domain/AddressIdentity";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { TransactionLink } from "@/components/ui/ExplorerLink";
import { UtcTime } from "@/components/ui/UtcTime";
import { IconChevron } from "@/components/icons/IconChevron";
import { IconLinkOut } from "@/components/icons/IconLinkOut";
import { deriveDaoVoterTable, type DaoCollectiveVote, type DaoVoterRow } from "@/lib/clients/dao/votes";
import { DAO_MOCK_YBC_AGGREGATE_ADDRESS, DAO_MOCK_STYFIX_AGGREGATE_ADDRESS } from "@/lib/clients/dao/fixtures";
import { YBC_MAINNET_DEPLOYMENT } from "@/lib/clients/ybc/deployment";
import deployment from "@/lib/deployment.json";
import { isDaoMockRuntimeEnabled } from "@/lib/runtime/features";
import { formatDaoBasisPoints } from "@/lib/clients/dao/read-display";
import type { DaoProposal } from "@/lib/clients/dao/types";
import { buildAddressIdentityMap, getAddressIdentity } from "@/lib/identity/identity";
import type { VerifiedEnsIdentities } from "@/lib/identity/ens";
import { useAddressAliases } from "@/lib/hooks/useAddressAliases";
import { useEnsIdentityLookup } from "@/lib/hooks/useEnsIdentities";
import { useProtocol } from "@/state/protocol";
import { mainnet } from "viem/chains";
import { cn } from "@/lib/cn";
import { resolveGovernanceAppHref } from "@/lib/governance-links";
import { daoCopy } from "../messages";

const PAGE_SIZE = 10;
const EMPTY_ENS: VerifiedEnsIdentities = {};
const controlClassName = "min-h-10 min-w-0 rounded-box border border-border bg-surface px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-text-primary";
const primaryLineClassName = "text-sm leading-5";
const rowClassName = "grid min-w-0 grid-cols-2 gap-x-4 gap-y-2 py-3 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,0.9fr)_minmax(0,1.4fr)_minmax(0,1fr)] xl:items-start";

/** Live ENS resolution stays outside the view so mock rendering needs no network. */
export function ConnectedProposalVoters({ proposal, isMock, hostname }: { proposal: DaoProposal; isMock: boolean; hostname?: string }) {
  const { mainnetPublicClient } = useProtocol();
  const [addresses, setAddresses] = useState<string[]>([]);
  const { identities: verifiedEns, settled } = useEnsIdentityLookup(mainnetPublicClient, addresses, !isMock);
  const batchKey = addresses.map((address) => address.toLowerCase()).sort().join(",");
  const enabled = !isMock && mainnetPublicClient?.chain?.id === mainnet.id;
  const [ensSnapshot, setEnsSnapshot] = useState({
    latest: verifiedEns, batchKey, enabled, settled, owner: mainnetPublicClient,
    resolved: enabled ? verifiedEns : EMPTY_ENS,
  });
  if (ensSnapshot.latest !== verifiedEns || ensSnapshot.batchKey !== batchKey ||
      ensSnapshot.enabled !== enabled || ensSnapshot.owner !== mainnetPublicClient || ensSnapshot.settled !== settled) {
    const resolved = enabled && ensSnapshot.enabled && ensSnapshot.owner === mainnetPublicClient
      ? { ...ensSnapshot.resolved } : {};
    // Preserve search results while loading; a settled empty result removes the previous batch's names.
    if (settled) {
      for (const address of addresses) delete resolved[address.toLowerCase()];
      if (enabled) Object.assign(resolved, verifiedEns);
    }
    setEnsSnapshot({ latest: verifiedEns, batchKey, enabled, settled, owner: mainnetPublicClient, resolved });
  }
  return <ProposalVoters proposal={proposal} isMock={isMock} hostname={hostname} verifiedEns={ensSnapshot.resolved} onVisibleAddressesChange={setAddresses} />;
}

export function ProposalVoters({ proposal, isMock = isDaoMockRuntimeEnabled(), hostname, verifiedEns = EMPTY_ENS, onVisibleAddressesChange }: {
  proposal: DaoProposal; isMock?: boolean; hostname?: string; verifiedEns?: VerifiedEnsIdentities; onVisibleAddressesChange?: (addresses: string[]) => void;
}) {
  const copy = daoCopy.voters;
  const { aliases, resetAlias, setAlias } = useAddressAliases();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest" | "power">("newest");
  const [page, setPage] = useState(0);
  const collectiveAddresses = useMemo(() => {
    if (proposal.ref.chainId !== mainnet.id) return null;
    return {
      ybc: isMock ? DAO_MOCK_YBC_AGGREGATE_ADDRESS : YBC_MAINNET_DEPLOYMENT.ybc,
      styfix: isMock ? DAO_MOCK_STYFIX_AGGREGATE_ADDRESS : deployment.STYFIX,
    };
  }, [proposal.ref.chainId, isMock]);
  const { individualRows: rows, collective } = useMemo(() => deriveDaoVoterTable(proposal, collectiveAddresses), [proposal, collectiveAddresses]);
  const identities = useMemo(() => buildAddressIdentityMap([], [], {
    aliases, verifiedEns, trustRecordEns: false,
    visibleAddresses: rows.map((row) => row.address),
  }), [aliases, verifiedEns, rows]);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const matches = rows.filter((row) => !query || row.address.toLowerCase().includes(query) ||
      getAddressIdentity(identities, row.address).label.toLowerCase().includes(query));
    if (sort === "oldest") matches.reverse();
    if (sort === "power") matches.sort((a, b) => {
      const left = a.weight ?? -1n, right = b.weight ?? -1n;
      return left === right ? 0 : left > right ? -1 : 1;
    });
    return matches;
  }, [rows, identities, search, sort]);
  const lastPage = Math.max(0, Math.ceil(filtered.length / PAGE_SIZE) - 1);
  const currentPage = Math.min(page, lastPage);
  const visibleRows = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const visibleAddressKey = visibleRows.map((row) => row.address).join(",");
  useEffect(() => {
    onVisibleAddressesChange?.(visibleAddressKey ? visibleAddressKey.split(",") : []);
  }, [onVisibleAddressesChange, visibleAddressKey]);

  return (
    <Card id="dao-proposal-votes" tabIndex={-1} className="min-w-0 scroll-mt-24 space-y-5" aria-label={copy.title}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-balance text-xl font-bold">
          {copy.title}<span className="rounded-full bg-surface-secondary px-2.5 py-0.5 text-sm tabular-nums text-text-secondary">{rows.length}</span>
        </h2>
        <p className="text-xs text-text-tertiary">{copy.latest}</p>
      </div>
      {rows.length > 0 ? (
        <div className="flex flex-wrap gap-3">
          <input type="search" value={search} aria-label={copy.search} placeholder={copy.search}
            className={cn(controlClassName, "w-full flex-1 sm:min-w-48")}
            onChange={(event) => { setSearch(event.target.value); setPage(0); }} />
          <div className="relative w-full sm:w-auto sm:min-w-44 sm:shrink-0">
            <select className={cn(controlClassName, "w-full appearance-none pr-10")} aria-label={copy.sort} value={sort}
              onChange={(event) => { setSort(event.target.value as typeof sort); setPage(0); }}>
              <option value="newest">{copy.newest}</option><option value="oldest">{copy.oldest}</option><option value="power">{copy.highestPower}</option>
            </select>
            <IconChevron className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-text-secondary" aria-hidden="true" />
          </div>
        </div>
      ) : null}
      <div role="table" aria-label={copy.table} className="min-w-0">
        <div role="row" className="hidden grid-cols-[minmax(0,1.5fr)_minmax(0,0.9fr)_minmax(0,1.4fr)_minmax(0,1fr)] gap-4 border-b border-border pb-3 text-xs font-bold text-text-tertiary xl:grid">
          {[copy.voter, copy.choice, copy.date, copy.power].map((label) => <span role="columnheader" key={label}>{label}</span>)}
        </div>
        <div role="rowgroup" aria-label={copy.individuals} className="divide-y divide-border">
          {visibleRows.map((row) => (
            <div role="row" key={row.address.toLowerCase()} className={rowClassName}>
              <div role="cell" className="col-span-2 min-w-0 text-sm xl:col-span-1">
                <AddressIdentity identity={getAddressIdentity(identities, row.address)} alias={aliases[row.address.toLowerCase()]}
                  onSetAlias={setAlias} onResetAlias={resetAlias} copy={copy.alias} layout="stacked" />
              </div>
              <div role="cell" className="min-w-0 text-sm">
                <p className="text-xs text-text-tertiary xl:hidden">{copy.choice}</p>
                <VoterChoice row={row} />
              </div>
              <div role="cell" className="min-w-0 text-xs tabular-nums text-text-secondary">
                <p className="text-text-tertiary xl:hidden">{copy.date}</p>
                <UtcTime timestamp={row.event.log.timestamp} fallback={copy.unknownDate} className={cn("block", primaryLineClassName)} />
                {row.event.log.transactionHash ? <TransactionLink hash={row.event.log.transactionHash} label={copy.transaction} /> : null}
              </div>
              <div role="cell" className="col-span-2 min-w-0 text-sm tabular-nums xl:col-span-1">
                <p className="text-xs text-text-tertiary xl:hidden">{copy.power}</p>
                <VoterWeight row={row} />
              </div>
            </div>
          ))}
        </div>
        {visibleRows.length === 0 ? <div role="row"><div role="cell" aria-colspan={4}><p className="py-4 text-sm text-text-secondary" role="status">{rows.length ? copy.noMatches : copy.empty}</p></div></div> : null}
        {collectiveAddresses ? <CollectiveVoteRow vote={collective} hostname={hostname} /> : null}
      </div>
      {lastPage > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <p className="text-xs tabular-nums text-text-secondary">{copy.page(currentPage + 1, lastPage + 1)}</p>
          <div className="flex gap-2"><Button size="sm" variant="secondary" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>{copy.previous}</Button><Button size="sm" variant="secondary" disabled={currentPage === lastPage} onClick={() => setPage(currentPage + 1)}>{copy.next}</Button></div>
        </div>
      ) : null}
    </Card>
  );
}

/** Pinned outside the individual rows: search, sorting and pagination never change this summary. */
function CollectiveVoteRow({ vote, hostname }: { vote: DaoCollectiveVote | null; hostname?: string }) {
  const copy = daoCopy.voters;
  return (
    <div role="rowgroup" aria-label={copy.collective.group} className="border-t border-border bg-surface-secondary/50">
      <div role="row" className={rowClassName}>
        <div role="cell" className="col-span-2 min-w-0 xl:col-span-1">
          <p className={cn(primaryLineClassName, "font-bold")}>{copy.collective.title}</p>
          <p className="text-xs leading-5 text-text-secondary">{copy.collective.includes}</p>
        </div>
        <div role="cell" className="min-w-0">
          {vote?.status === "complete" && vote.yeaBps !== null ? <VoterChoice row={{ choice: "split", yeaBps: vote.yeaBps }} /> :
            <p className={cn(primaryLineClassName, "text-text-secondary")}>{vote ? copy.collective[vote.status === "inconsistent" ? "inconsistent" : "incomplete"] : copy.collective.empty}</p>}
        </div>
        <div role="cell" className="min-w-0 text-text-secondary">
          {vote ? <UtcTime timestamp={vote.timestamp} fallback={copy.unknownDate} className={cn("block tabular-nums", primaryLineClassName)} /> : null}
          <Link href={resolveGovernanceAppHref("ybc", hostname)} className="inline-flex min-h-10 items-center gap-1.5 rounded text-xs font-bold text-yearn-blue hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 dark:text-blue-300">{copy.collective.explore}<IconLinkOut className="size-3.5" aria-hidden /></Link>
        </div>
        <div role="cell" className="col-span-2 min-w-0 tabular-nums xl:col-span-1">
          {vote ? <><p className="text-xs text-text-tertiary xl:hidden">{copy.power}</p><VoterWeight row={vote} /></> : null}
        </div>
      </div>
    </div>
  );
}

function VoterWeight({ row }: { row: Pick<DaoVoterRow, "formattedWeight" | "formattedShare" | "shareBps"> }) {
  const copy = daoCopy.voters;
  return <>
    <p className={cn(primaryLineClassName, "font-bold")}>{row.formattedWeight === null ? copy.unknownPower : `${row.formattedWeight} YFI`}</p>
    {row.formattedShare !== null ? <p className="text-xs text-text-secondary">{copy.share(row.formattedShare)}</p> : null}
    {row.shareBps !== null ? <div aria-hidden className="mt-1 h-1 overflow-hidden rounded-full bg-surface-secondary"><div className="h-full rounded-full bg-text-secondary/40" style={{ width: `${row.shareBps / 100}%` }} /></div> : null}
  </>;
}

function VoterChoice({ row }: { row: Pick<DaoVoterRow, "choice" | "yeaBps"> }) {
  const copy = daoCopy.voters;
  if (row.choice === "unknown") return <p className={cn(primaryLineClassName, "text-text-tertiary")}>{copy.unknownChoice}</p>;
  if (row.choice === "split") return <div className="flex flex-wrap gap-x-2 gap-y-0 tabular-nums"><p className={cn(primaryLineClassName, "font-bold text-green-800 dark:text-green-300")}>{formatDaoBasisPoints(row.yeaBps!)} {copy.yea}</p><p className={cn(primaryLineClassName, "font-bold text-red-700 dark:text-red-300")}>{formatDaoBasisPoints(10_000 - row.yeaBps!)} {copy.nay}</p></div>;
  return <p className={cn(primaryLineClassName, "flex items-start gap-1.5 font-bold", row.choice === "yea" ? "text-green-800 dark:text-green-300" : "text-red-700 dark:text-red-300")}><span aria-hidden>{row.choice === "yea" ? "✓" : "×"}</span><span>{copy[row.choice]}</span></p>;
}
