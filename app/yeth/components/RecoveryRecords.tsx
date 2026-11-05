import { formatEther } from "viem";
import { ContractLink } from "@/components/ui/ContractLink";
import { AddressLink, TransactionLink } from "@/components/ui/ExplorerLink";
import type { RecoverySnapshot } from "@/lib/clients/yeth/recovery/types";
import deployment from "@/lib/clients/yeth/deployment.json";
import { recoveryPolishCopy as copy, recoveryLiveCopy as text, recoveryProductionCopy as live } from "../messages";

export function RecoveryContracts() {
  const addresses = {
    claim: deployment.YETH_CLAIM,
    recovery: deployment.YETH_RECOVERY_VAULT,
    yield: deployment.YETH_YIELD_VAULT,
    wrapper: "0x26868F94684dEC5Ea6fF93ccc06aBde1015ce2CE",
    auction: "0x68383672a70Ae3B78e5E2a67D78cf1E379BE3801",
    weth: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  };
  return <section><h2 className="text-xl font-bold">{copy.contractsTitle}</h2>
    <dl className="mt-5 divide-y divide-border rounded-box border border-border px-5">
      {Object.entries(addresses).map(([key, address]) => <div key={key} className="flex flex-wrap items-center justify-between gap-3 py-4">
        <dt className="text-sm font-medium">{copy.contractNames[key as keyof typeof copy.contractNames]}</dt>
        <dd><ContractLink address={address} className="max-w-full flex-wrap [&>a]:min-h-10 [&>a:first-child]:items-center [&>a:last-of-type]:size-10 [&>a:last-of-type]:opacity-100 [&>button]:size-10 [&>button]:opacity-100" /></dd>
      </div>)}
    </dl>
  </section>;
}

export function RecoveryAuctionHistory({ snapshot }: { snapshot: RecoverySnapshot }) {
  return <section className="mt-7 border-t border-border pt-6">
    <h2 className="text-xl font-bold">{copy.historyTitle}</h2>

    <div className="mt-5 overflow-x-auto rounded-box border border-border">
      <table className="w-full min-w-[38rem] text-left text-sm">
        <caption className="sr-only">{copy.historyTitle}</caption>
        <thead className="bg-surface-secondary text-xs text-text-secondary"><tr>
          {[copy.round, copy.takenAt, copy.taker, copy.recovery, copy.received, copy.receipt].map(label => <th key={label} scope="col" className="px-4 py-3 font-medium">{label}</th>)}
        </tr></thead>
        <tbody>{snapshot.auctionHistory.length === 0 && <tr><td colSpan={6} className="p-4 text-text-secondary">{snapshot.live && !snapshot.live.auctionHistoryCurrent ? live.historyUnavailable : text.historyEmpty}</td></tr>}{snapshot.auctionHistory.map(fill => <tr key={fill.id} className="border-t border-border">
          <td className="px-4 py-2 font-number">#{fill.round}</td>
          <td className="px-4 py-2 text-xs text-text-secondary"><time dateTime={new Date(fill.at * 1000).toISOString()}>{new Date(fill.at * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}</time></td>
          <td className="px-4 py-2"><AddressLink address={fill.taker} variant="compact" /></td>
          <td className="px-4 py-2 font-number">{(fill.recovery * 100).toFixed(1)}%{fill.recoveryBasis === "reference" && <span className="mt-1 block text-[0.65rem] text-text-secondary">{live.reference}</span>}</td>
          <td className="px-4 py-2 font-number">{Number(formatEther(fill.weth)).toFixed(3)} WETH</td>
          <td className="px-4 py-2">{fill.transactionHash ? <TransactionLink hash={fill.transactionHash} variant="compact" /> : <span className="text-xs text-text-secondary">{copy.exampleReceipt}</span>}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </section>;
}


export function RecoveryFaq() {
  return <section><h2 className="mb-5 text-xl font-bold">{text.faqTitle}</h2>
    <div className="grid gap-7 md:grid-cols-2">{text.faq.map(item => <article key={item.question}>
      <h3 className="font-bold">{item.question}</h3><p className="mt-2 text-sm leading-relaxed text-text-secondary">{item.answer}</p>
      {"href" in item && <a href={item.href} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-10 items-center text-sm underline underline-offset-4">{item.link}</a>}
    </article>)}<article>
      <h3 className="font-bold">{live.auctionRateQuestion}</h3>
      <p className="mt-2 text-sm leading-relaxed text-text-secondary">{live.auctionRateAnswer}</p>
    </article><article><h3 className="font-bold">{live.referenceQuestion}</h3><p className="mt-2 text-sm leading-relaxed text-text-secondary">{live.referenceAnswer}</p></article></div>
  </section>;
}
