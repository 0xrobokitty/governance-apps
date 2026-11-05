import { formatEther, type Hash } from "viem";
import { formatRecoveryPercent } from "@/lib/clients/yeth/recovery/format";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Tooltip } from "@/components/ui/Tooltip";
import { AddressLink, TransactionLink } from "@/components/ui/ExplorerLink";
import { holderDistribution, poolProgress, exitedClaims } from "@/lib/clients/yeth/recovery/journey";
import { recoveryChoices } from "@/lib/clients/yeth/recovery/decisions";
import type { RecoverySnapshot } from "@/lib/clients/yeth/recovery/types";
import { recoveryJourneyCopy as copy, recoveryDecisionCopy as words, recoveryPolishCopy as text, recoveryLiveCopy as live, recoveryProductionCopy as production, recoveryExitCopy as exitCopy } from "../messages";

const pct = formatRecoveryPercent;
const amount = (value: bigint, digits = 2) => value > 0n && Number(formatEther(value)) < .01 ? "<0.01" : Number(formatEther(value)).toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });
const dateParts = (at: number) => ({
  month: new Date(at * 1000).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }),
  year: new Date(at * 1000).getUTCFullYear(),
});

export function RecoveryHeadline({ snapshot: s, exitSummary }: {
  snapshot: RecoverySnapshot;
  exitSummary?: { title: string; receivedWeth: bigint; hash?: Hash };
}) {
  const choice = recoveryChoices(s);
  const headline = s.live && !s.connected ? s.live.publicReferenceRecovery : !choice.fresh ? null : s.connected ? choice.accountRecovery : choice.recovery;
  const exited = !!exitSummary && s.connected && s.shares <= 2n;
  const showExitValue = !!s.live && s.connected && choice.fresh && headline === null && choice.hasUsablePosition;
  return <section aria-labelledby="recovery-title" className="mb-6 rounded-box border border-border bg-surface p-5 md:p-7">
    <h1 id="recovery-title" className="text-2xl font-bold tracking-tight md:text-3xl">{text.title}</h1>
    <div className="mt-5 grid items-end gap-5 md:grid-cols-[1.2fr_1fr]">
      <div>
        <h2 className="text-sm text-text-secondary">{exited ? exitSummary.title : showExitValue ? production.exitValue : s.connected ? words.headline : words.publicHeadline}</h2>
        <p data-testid="recovery-headline" className={"mt-2 break-words font-number font-bold leading-none tracking-[-0.06em] " + (showExitValue || exited ? "text-[clamp(2rem,10vw,4rem)]" : "text-[clamp(2.25rem,18vw,5.5rem)]")}>{exited ? <>{amount(exitSummary.receivedWeth, 3)}<span className="ml-2 text-xl tracking-normal">WETH</span></> : showExitValue ? <>{amount(choice.directValue, 3)}<span className="ml-2 text-xl tracking-normal">WETH</span></> : headline === null ? "—" : pct(headline)}</p>
        {!s.live && s.walletWeth > 0n && <p className="mt-3 text-xs text-text-secondary">{words.includesPaid}</p>}
      </div>
      {!exited && <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))] gap-x-5 gap-y-4">
        {[{ label: s.live ? production.original : words.original, value: s.connected && s.originalClaimEth > 0n ? amount(s.originalClaimEth) + " ETH" : "—" },
          { label: s.live && s.live.maxRedeem !== null && s.live.maxRedeem < s.shares ? production.positionValue : words.available, value: s.connected && choice.fresh ? amount(choice.directValue, 3) + " WETH" : "—" },
          ...(!s.live && s.walletWeth > 0n ? [{ label: words.paid, value: amount(s.walletWeth, 3) + " WETH" }] : [])].map(item =>
          <div key={item.label} className="min-w-0"><dt className="text-xs text-text-secondary">{item.label}</dt><dd className="mt-2 break-words font-number text-lg font-bold">{item.value}</dd></div>)}
      </dl>}
    </div>
    {exitSummary && <div role="status" data-testid="recovery-exit-summary" className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm">
      <p>{exited ? exitCopy.receivedLabel : <><span className="font-medium">{exitSummary.title}</span>{" · "}{amount(exitSummary.receivedWeth, 3)} WETH {exitCopy.receivedSuffix}</>}</p>
      {exitSummary.hash && <TransactionLink hash={exitSummary.hash} />}
    </div>}
    {s.live && !s.live.feedFresh && <p className="mt-4 text-xs text-text-secondary">{production.staleFeed}</p>}
    <RecoveryProgress snapshot={s} />
  </section>;
}

export function RecoveryProgress({ snapshot }: { snapshot: RecoverySnapshot }) {
  if (snapshot.live && !snapshot.live.baselineKnown) return <p className="mt-6 text-sm text-text-secondary">{production.baselineUnavailable}</p>;
  const progress = poolProgress(snapshot);
  const start = dateParts(snapshot.recoveryStart.at);
  return <section aria-labelledby="progress-heading" className="mt-6 border-t border-border pt-5">
    <div className="mb-4 space-y-3">
      <h2 id="progress-heading" className="text-sm font-bold">{snapshot.live ? production.reference : copy.progressTitle}</h2>
      <p className="text-xs text-text-secondary">{text.baseline(pct(progress.baseline), start.month + " " + start.year)}</p>
    </div>
    <div className="relative" data-testid="recovery-timeline">
      <ProgressBar value={progress.currentPosition} variant="yeth" className="h-2 bg-surface-tertiary" role="progressbar" aria-label={copy.progressTitle} aria-valuemin={progress.baseline * 100} aria-valuemax={100} aria-valuenow={progress.current === null ? undefined : progress.current * 100} aria-valuetext={copy.progressLabel(pct(progress.baseline), progress.current === null ? "—" : pct(progress.current))} />
      {progress.current !== null && <span className="absolute -top-1 h-4 w-1 rounded-full bg-tokyo-600 ring-2 ring-surface" style={{ left: `calc(${progress.currentPosition}% - 2px)` }} aria-hidden="true" />}
      <div className="grid grid-cols-[repeat(100,minmax(0,1fr))] pt-5">
      {progress.milestones.map(item => {
        const date = item.estimatedAt === null ? null : dateParts(item.estimatedAt);
        const label = date ? date.month + " " + date.year : item.years === 0 ? words.reached : words.noEstimate;
        const help = item.years === null ? text.noDate : item.years === 0 ? text.reached(item.percent) : text.dateHelp(words.time(item.years));
        return <div key={item.percent} className={item.percent === 100 ? "text-right" : "text-center"} style={{ gridRow: 1, gridColumn: `${Math.round(Math.max(0, Math.min(76, item.position - 12))) + 1} / span 24` }}>
          <span aria-hidden="true" className="absolute top-0 h-5 w-px bg-text-secondary/45" style={{ left: `calc(${item.position}% - 1px)` }} />
          <Tooltip content={help} side="top" align={item.percent === 50 ? "start" : item.percent === 100 ? "end" : "center"} className="w-full [&>[role=tooltip]]:max-w-[170px]">
            <button type="button" data-testid={"milestone-" + item.percent} aria-label={text.milestone(item.percent, label)} onClick={e => e.currentTarget.focus()} className={"min-h-10 w-full break-words rounded text-inherit outline-none focus-visible:ring-2 focus-visible:ring-tokyo-600 " + (item.percent === 100 ? "text-right" : "text-center")}>
              <span className="block font-number text-sm font-bold">{item.percent}%</span>
              <span className="mt-1 block text-xs leading-snug text-text-secondary underline decoration-dotted underline-offset-4">
                {date ? <time dateTime={new Date(item.estimatedAt! * 1000).toISOString()}><span className="block sm:inline">{date.month} </span><span>{date.year}</span></time> : label}
              </span>
            </button>
          </Tooltip>
        </div>;
      })}
      </div>
    </div>
    <p data-testid="timeline-note" className="mt-6 text-xs text-text-secondary">{snapshot.live ? production.timelineNote : text.timelineNote}</p>
  </section>;
}

export function RecoveryHolders({ snapshot }: { snapshot: RecoverySnapshot }) {
  const data = holderDistribution(snapshot);
  const exited = exitedClaims(snapshot);
  if (!data) return <p className="text-sm text-text-secondary">{copy.holdersUnavailable}</p>;
  return <section className="space-y-6">
    <div><h2 className="text-xl font-bold">{copy.holdersTitle}</h2></div>
    <div className="grid grid-cols-2 gap-5 md:grid-cols-3">
      {[{ label: copy.holderAccounts, value: String(data.accounts) }, { label: copy.holderClaim, value: amount(data.representedClaim, 0) + " ETH" }, { label: snapshot.live ? production.programmeSettled : live.exited, value: exited ? pct(exited.fraction) : "—", note: exited ? (snapshot.live ? production.programmeSettledAmount : live.exitedAmount)(amount(exited.exited, 0), amount(exited.total, 0)) : undefined }].map(item => <div key={item.label}><p className="text-xs text-text-secondary">{item.label}</p><p className="mt-2 font-number text-2xl font-bold">{item.value}</p>{"note" in item && item.note && <p className="mt-2 text-xs text-text-secondary">{item.note}</p>}</div>)}
    </div>
    <div className="grid gap-8 md:grid-cols-2">
      <div className="rounded-box border border-border p-5">
        <h3 className="mb-5 text-sm font-bold">{copy.distributionTitle}</h3>
        {data.buckets.map((count, i) => <div key={i} className="mb-4">
          <div className="mb-2 flex justify-between gap-3 text-xs"><span>{copy.holderBuckets[i]}</span><span className="font-number">{copy.accounts(count)}</span></div>
          <ProgressBar value={count / data.accounts * 100} variant="yeth" className="bg-surface-tertiary" aria-hidden="true" />
        </div>)}
      </div>
      <div className="max-h-96 overflow-y-auto rounded-box border border-border">
        <table className="w-full table-fixed text-left text-xs">
          <caption className="p-4 text-left font-bold">{text.positionsTitle}</caption>
          <thead className="border-y border-border bg-surface-secondary"><tr><th className="w-3/5 p-3 font-medium">{copy.holderAccount}</th><th className="p-3 text-right font-medium">{copy.holderBalance}</th></tr></thead>
          <tbody>{data.positions.map(p => <tr key={p.id} className="border-b border-border last:border-0">
            <td className="p-3"><AddressLink address={p.address} variant="compact" className="max-w-full" />{p.id === "example-account" && snapshot.connected && <span className="block text-[0.65rem] text-text-secondary">{text.yourAccount}</span>}</td>
            <td className="p-3 text-right font-number">{amount(p.claim)} ETH</td>
          </tr>)}</tbody>
        </table>
      </div>
    </div>
  </section>;
}
