import { encodeFunctionData, parseAbi, toEventSelector } from "viem";
import {
  readBoundedJson,
  withFeedRequest,
} from "../../../../../lib/feed-transport";
import { parseRecoveryFeed } from "../../../../../lib/clients/yeth/recovery/feed-schema";
import { resolveAlertEnsNamesAtBlock } from "../../account-block-context";
import { YETH_CLAIM } from "../../contracts";
import type { RpcClient, RpcLog } from "../../rpc";
import { isRpcRangeTooLargeError } from "../../rpc";
import { buildYethRepaymentMetrics, type YethState } from "./accounting";
import { scanYethBlocks } from "./scanner";
import {
  AUCTION,
  WRAPPER,
  VAULT,
  WETH,
  YIELD,
  KICK,
  SWEPT,
  DISABLED,
  auctionLogs,
  canonicalLogs,
  readAuctionSnapshot,
  receiptLogs,
  transfer,
  offer,
  isWethAuctionEvent,
  type AuctionSnapshot,
} from "./auction-chain";
import {
  planYethMessages,
  type AuctionTrade,
  type YethBlockFacts,
  type YethMessagingState,
} from "./messaging-state";
import { WAD } from "./messages";

const SETTLED = toEventSelector("AuctionSettled(address)");
const balanceAbi = parseAbi([
  "function balanceOf(address) view returns(uint256)",
]);
const protocol = new Set([
  AUCTION,
  WRAPPER,
  VAULT,
  YIELD,
  YETH_CLAIM.toLowerCase(),
  "0x0000000000000000000000000000000000000000",
]);

/** Optional forecast enrichment uses the app's validated, bounded publication. */
export async function recoveryForecast(
  app: Pick<Fetcher, "fetch"> | undefined,
  snapshot: AuctionSnapshot,
  now: number,
): Promise<bigint | null> {
  if (!app) return null;
  const policy = {
    maximumPayloadBytes: 12 * 1024 * 1024,
    requestTimeoutMs: 10000,
    createPayloadTooLargeError: () => new Error("yeth_forecast_size"),
    createTimeoutError: () => new Error("yeth_forecast_timeout"),
    payloadTooLargeCancelReason: "size",
    timeoutCancelReason: "timeout",
    fetchOptions: {
      redirect: "manual" as const,
      headers: { Accept: "application/json" },
    },
  };
  try {
    const envelope = await withFeedRequest(
      "https://yeth.yearn.fi/api/yeth-recovery-data",
      policy,
      async (response, context) => {
        if (!response.ok) {
          await response.body?.cancel();
          throw new Error("yeth_forecast_response");
        }
        return readBoundedJson(response, context, policy);
      },
      (url, init) => app.fetch(url, init),
    );
    const { head } = parseRecoveryFeed(envelope, now);
    if (
      now - head.observedAt > head.quality.snapshotMaxAgeSeconds ||
      now < head.observedAt ||
      !head.accounting.complete ||
      head.quality.historyStatus !== "current" ||
      !head.indexedThrough ||
      now - head.indexedThrough.timestamp > head.quality.historyMaxAgeSeconds ||
      head.recoveryVault.sharesWei !== snapshot.supply ||
      head.yieldVault.assetsWei !== snapshot.yieldAssets
    )
      return null;
    const growth = head.forecast.dailyAssetsPerShareGrowthWad;
    return growth !== null && BigInt(growth) > 0n ? BigInt(growth) : null;
  } catch {
    console.warn(JSON.stringify({ event: "alert_yeth_forecast_unavailable" }));
    return null;
  }
}

/** Amounts come from canonical receipts. An AuctionSettled event alone is not a fill. */
export function tradesFromReceipt(
  logs: readonly RpcLog[],
  price: bigint,
): AuctionTrade["fills"] {
  const outputs = logs
    .filter((l) => l.address.toLowerCase() === WETH)
    .map(transfer)
    .filter(
      (t): t is NonNullable<typeof t> =>
        t !== null && t.from === AUCTION && t.value > 0n,
    );
  const swept = new Set<number>();
  for (const event of logs.filter((l) => isWethAuctionEvent(l, SWEPT))) {
    const payout = outputs
      .filter((t) => t.log.logIndex! < event.logIndex!)
      .at(-1);
    if (payout) swept.add(payout.log.logIndex!);
  }
  const weth = outputs.filter((t) => !swept.has(t.log.logIndex!));
  if (!weth.length) return [];
  const shares = logs
    .filter((l) => l.address.toLowerCase() === VAULT)
    .map(transfer)
    .filter(
      (t): t is NonNullable<typeof t> =>
        t !== null && t.to === WRAPPER && t.value > 0n,
    );
  if (
    price <= 0n ||
    !shares.length ||
    shares.reduce((n, t) => n + t.value, 0n) <
      weth.reduce((n, t) => n + (t.value * price) / WAD, 0n)
  )
    throw new Error("yeth_auction_fill_unproven");
  // A single matched pair proves payer, recipient and exact cost, including CoW settlement.
  if (weth.length === 1 && shares.length === 1)
    return [
      {
        receiver: weth[0]!.to,
        payer: shares[0]!.from,
        weth: weth[0]!.value,
        shares: shares[0]!.value,
      },
    ];
  // Direct takes emit output then payment. For ambiguous batches retain every
  // confirmed payout without assigning an unproved cost or payer to a recipient.
  const used = new Set<number>();
  return weth.map((payout, i) => {
    const next = weth[i + 1]?.log.logIndex ?? Infinity;
    const candidates = shares.filter(
      (t) =>
        !used.has(t.log.logIndex!) &&
        t.log.logIndex! > payout.log.logIndex! &&
        t.log.logIndex! < next &&
        t.value === (payout.value * price) / WAD,
    );
    const payment = candidates.length === 1 ? candidates[0]! : null;
    if (payment) used.add(payment.log.logIndex!);
    return {
      receiver: payout.to,
      payer: payment?.from ?? null,
      weth: payout.value,
      shares: payment?.value ?? null,
    };
  });
}

export async function scanMessagingRange(params: {
  rpc: RpcClient;
  fromBlock: number;
  toBlock: number;
  ledger: YethState;
  messaging: YethMessagingState;
  now: number;
  app?: Pick<Fetcher, "fetch">;
}) {
  let toBlock = params.toBlock;
  let logs: RpcLog[];
  let scan: Awaited<ReturnType<typeof scanYethBlocks>>;
  while (true) {
    try {
      logs = await auctionLogs(params.rpc, params.fromBlock, toBlock);
    } catch (error) {
      if (isRpcRangeTooLargeError(error) && toBlock > params.fromBlock) {
        toBlock =
          params.fromBlock + Math.floor((toBlock - params.fromBlock) / 2);
        continue;
      }
      throw error;
    }
    if (logs[0]?.blockNumber !== null && logs[0]?.blockNumber !== undefined)
      toBlock = Math.min(toBlock, logs[0].blockNumber);
    scan = await scanYethBlocks({
      rpc: params.rpc,
      fromBlock: params.fromBlock,
      toBlock,
      state: params.ledger,
      includeManualPayouts: true,
    });
    if (scan.failure) {
      if (
        scan.failure.code === "range_too_large" &&
        toBlock > params.fromBlock
      ) {
        toBlock =
          params.fromBlock + Math.floor((toBlock - params.fromBlock) / 2);
        continue;
      }
      throw new Error(`yeth_messaging_scan_${scan.failure.code}`);
    }
    const firstAction = scan.actions[0];
    if (firstAction && firstAction.blockNumber < toBlock) {
      toBlock = firstAction.blockNumber;
      continue;
    }
    break;
  }
  const block = await params.rpc.getBlockByNumber(toBlock);
  if (block.number !== toBlock || block.timestamp === null)
    throw new Error("yeth_messaging_block_invalid");
  const events = canonicalLogs(
    logs.filter((l) => l.blockNumber === toBlock),
    block,
  );
  const snapshot = await readAuctionSnapshot(params.rpc, block);
  const kicks = events.filter((l) => isWethAuctionEvent(l, KICK));
  if (kicks.length > 1) throw new Error("yeth_multiple_kicks_in_block");
  const kickLog = kicks[0];
  if (
    kickLog &&
    (kickLog.topics.length !== 2 ||
      kickLog.topics[1]?.slice(-40).toLowerCase() !== WETH.slice(2) ||
      !/^0x[0-9a-f]{64}$/i.test(kickLog.data))
  )
    throw new Error("yeth_kick_invalid");
  const kick = kickLog
    ? {
        tx: kickLog.transactionHash!,
        index: kickLog.logIndex!,
        initial: BigInt(kickLog.data),
      }
    : null;
  if (
    kick &&
    events.some(
      (l) =>
        l.logIndex! < kick.index &&
        l.address.toLowerCase() === WETH &&
        transfer(l)?.from === AUCTION &&
        !events.some(
          (e) =>
            e.transactionHash === l.transactionHash &&
            isWethAuctionEvent(e, SWEPT),
        ),
    )
  ) {
    throw new Error("yeth_take_and_restart_same_block");
  }
  const changingTerms = [
    "UpdatedStartingPrice(uint256)",
    "UpdatedMinimumPrice(uint256)",
    "UpdatedStepDuration(uint256)",
    "UpdatedStepDecayRate(uint256)",
  ].map(toEventSelector);
  if (
    kick &&
    events.some(
      (l) =>
        l.address.toLowerCase() === AUCTION &&
        l.logIndex! > kick.index &&
        changingTerms.includes(l.topics[0] as `0x${string}`),
    )
  )
    throw new Error("yeth_terms_changed_after_kick");
  if (kick && kick.initial <= 0n) throw new Error("yeth_kick_empty");
  const roundSnapshot = kick
    ? {
        ...snapshot,
        kickedAt: block.timestamp,
        initial: kick.initial.toString(),
        balance: kick.initial.toString(),
      }
    : params.messaging.round?.opening;
  const txs = [
    ...new Set(
      events
        .filter(
          (l) =>
            l.address.toLowerCase() === WETH && transfer(l)?.from === AUCTION,
        )
        .map((l) => l.transactionHash!),
    ),
  ];
  const trades: AuctionTrade[] = [];
  for (const tx of txs) {
    const receipt = receiptLogs(
      await params.rpc.getTransactionReceipt(tx),
      tx,
      block,
    );
    for (const event of events.filter((l) => l.transactionHash === tx)) {
      const proven = receipt.find((l) => l.logIndex === event.logIndex);
      if (
        !proven ||
        proven.address.toLowerCase() !== event.address.toLowerCase() ||
        proven.data !== event.data ||
        JSON.stringify(proven.topics) !== JSON.stringify(event.topics)
      )
        throw new Error("yeth_receipt_query_mismatch");
    }
    const price = roundSnapshot
      ? offer({ ...roundSnapshot, at: block.timestamp }, block.timestamp).price
      : 0n;
    const fills = tradesFromReceipt(receipt, price);
    if (!fills.length) continue;
    trades.push({
      tx,
      index: receipt[0]!.logIndex!,
      fills,
      final:
        receipt.some((l) => isWethAuctionEvent(l, SETTLED)) &&
        !receipt.some((l) => isWethAuctionEvent(l, SWEPT)),
    });
  }
  trades.sort((a, b) => a.index - b.index);
  // A CoW fill can empty inventory before a later settle() transaction.
  if (
    trades.length &&
    snapshot.balance === "0" &&
    !events.some(
      (l) => isWethAuctionEvent(l, SWEPT) || isWethAuctionEvent(l, DISABLED),
    )
  )
    trades[trades.length - 1]!.final = true;
  const stop = events.find(
    (l) => isWethAuctionEvent(l, DISABLED) || isWethAuctionEvent(l, SWEPT),
  );
  const funding = new Map<string, YethBlockFacts["funding"][number]>();
  for (const event of events.filter((l) => l.address.toLowerCase() === WETH)) {
    const t = transfer(event);
    if (
      !t ||
      t.value <= 0n ||
      protocol.has(t.from) ||
      (t.to !== AUCTION && t.to !== VAULT)
    )
      continue;
    // A payout into the vault is not new external funding.
    if (trades.some((tr) => tr.tx === event.transactionHash)) continue;
    const destination = t.to === VAULT ? "vault" : "auction";
    const key = `${event.transactionHash}:${destination}`;
    funding.set(key, {
      tx: event.transactionHash!,
      destination,
      amount: (funding.get(key)?.amount ?? 0n) + t.value,
    });
  }
  const withdrawals = scan.actions.filter(
    (a) => a.kind === "yeth_recovery_vault_withdraw",
  );
  const retired = withdrawals
    .filter((a) => a.owner?.toLowerCase() === WRAPPER)
    .reduce((n, a) => n + (a.amounts.yethSnapshotMoved ?? 0n), 0n);
  const actions = scan.actions
    .filter(
      (a) =>
        a.owner?.toLowerCase() !== WRAPPER && a.owner?.toLowerCase() !== VAULT,
    )
    .map((a) => ({ ...a }));
  const readBalance = async (account: string): Promise<bigint | null> => {
    try {
      const balance = await params.rpc.call(
        {
          to: VAULT,
          data: encodeFunctionData({
            abi: balanceAbi,
            functionName: "balanceOf",
            args: [account as `0x${string}`],
          }),
        },
        { blockHash: block.hash, requireCanonical: true },
      );
      return /^0x[0-9a-f]{64}$/i.test(balance) ? BigInt(balance) : null;
    } catch {
      return null;
    }
  };
  for (const action of actions.filter(
    (a) => a.yethWithdrawalType === "full" && a.user,
  )) {
    const balance = await readBalance(action.user!);
    if (balance === null) action.yethWithdrawalType = undefined;
    else if (balance > 0n) action.yethWithdrawalType = "partial";
  }
  // Only the last fill for a payer can close their position in this block.
  const seenPayers = new Set<string>();
  for (const trade of [...trades].reverse())
    for (const fill of [...trade.fills].reverse()) {
      if (!fill.payer || protocol.has(fill.payer) || seenPayers.has(fill.payer))
        continue;
      seenPayers.add(fill.payer);
      if ((await readBalance(fill.payer)) === 0n) fill.positionClosed = true;
    }
  const addresses = [
    ...new Set([
      ...actions.flatMap((a) =>
        [a.user, a.receiver].filter((v): v is string => !!v),
      ),
      ...trades.flatMap((t) =>
        t.fills.flatMap((f) =>
          f.payer ? [f.payer, f.receiver] : [f.receiver],
        ),
      ),
    ]),
  ];
  let names: Readonly<Record<string, string>> = {};
  if (addresses.length) {
    try {
      names = await resolveAlertEnsNamesAtBlock({
        addresses,
        block: { blockNumber: block.number, blockHash: block.hash },
        reader: {
          read: (r) =>
            params.rpc.call([...r], {
              blockHash: block.hash,
              requireCanonical: true,
            }),
        },
      });
    } catch {
      /* Optional labels never block a canonical payout. */
    }
  }
  const oldRound = params.messaging.round;
  const statusDue =
    oldRound &&
    !oldRound.closed &&
    Math.floor((snapshot.at - oldRound.opening.kickedAt) / 86400) >
      oldRound.dailySlot &&
    params.now - snapshot.at <= 300 &&
    !trades.length;
  const dailyGrowth = statusDue
    ? await recoveryForecast(params.app, snapshot, params.now)
    : null;
  const result = planYethMessages(
    params.messaging,
    snapshot,
    {
      trades,
      kick,
      stopped: stop
        ? {
            tx: stop.transactionHash!,
            reason:
              stop.topics[0] === DISABLED
                ? "Auctions disabled by governance"
                : "Auction funds withdrawn",
          }
        : null,
      funding: [...funding.values()],
      retired,
      holderClaims:
        scan.state.snapshotStayedEth -
        [...protocol].reduce(
          (sum, address) =>
            sum +
            (scan.state.trackedStayedCostBasisByAddress.get(address) ?? 0n),
          0n,
        ),
      actions,
      names,
      dailyGrowth,
      expectedCapitalOutflow:
        (scan.flow.yieldNetFlowEth < 0n ? -scan.flow.yieldNetFlowEth : 0n) +
        withdrawals.reduce((n, a) => n + (a.amounts.assets ?? 0n), 0n),
    },
    params.now,
  );
  return {
    ...result,
    terminalBlock: toBlock,
    terminalHash: block.hash,
    ledger: scan.state,
    metrics: buildYethRepaymentMetrics(
      scan.state,
      BigInt(snapshot.assets),
      BigInt(snapshot.yieldAssets),
    ),
  };
}
