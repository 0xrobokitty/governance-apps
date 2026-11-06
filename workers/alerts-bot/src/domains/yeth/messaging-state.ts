import { z } from "zod";
import type { RenderedAlertMessage } from "../../catalogue";
import type { RpcBlock } from "../../rpc";
import type { NormalizedAction } from "../../types";
import { offer, referenceRate, type AuctionSnapshot } from "./auction-chain";
import {
  accountLink,
  amount,
  date,
  escape,
  holdingLine,
  message,
  percentage,
  recoveryBar,
  WAD,
} from "./messages";

const uint = z
  .string()
  .regex(/^(0|[1-9]\d*)$/)
  .max(78);
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const snapshotSchema = z.object({
  block: integer,
  hash: z.string().regex(/^0x[0-9a-f]{64}$/),
  at: integer,
  enabled: z.boolean(),
  kickedAt: integer,
  initial: uint,
  balance: uint,
  startingPrice: uint,
  minimumPrice: uint,
  stepDuration: integer.positive(),
  stepDecayBps: integer.min(1).max(9999),
  length: integer.max(604800),
  pps: uint,
  targetPps: uint,
  assets: uint,
  supply: uint,
  yieldAssets: uint,
  recoveryRate: uint,
  destination: z.string().regex(/^0x[0-9a-f]{40}$/),
});
const roundSchema = z.object({
  id: z.string().max(180),
  opening: snapshotSchema,
  paid: uint,
  takes: integer,
  complete: z.boolean(),
  closed: z.boolean(),
  dailySlot: integer,
  lastStatusAt: integer,
  finalHour: z.boolean(),
});
export const messagingStateSchema = z.object({
  version: z.literal(1),
  cutoverBlock: integer,
  snapshot: snapshotSchema,
  round: roundSchema.nullable(),
  weekly: snapshotSchema,
  publishedRate: uint,
  publishedCapital: uint,
  milestones: z.array(z.number().int().min(1).max(100)).max(3),
  paidSinceWeekly: uint,
  fundingSinceWeekly: uint,
  retiredPending: uint,
  capitalOutflows: uint.default("0"),
  restrictionAnnounced: z.boolean(),
});
export type YethMessagingState = z.infer<typeof messagingStateSchema>;

export function initializeMessaging(
  snapshot: AuctionSnapshot,
): YethMessagingState {
  const rate = referenceRate(snapshot);
  return {
    version: 1,
    cutoverBlock: snapshot.block,
    snapshot,
    round:
      snapshot.kickedAt > 0 && offer(snapshot).active
        ? {
            id: `adopted:${snapshot.kickedAt}`,
            opening: snapshot,
            paid: "0",
            takes: 0,
            complete: false,
            closed: false,
            dailySlot: Math.floor((snapshot.at - snapshot.kickedAt) / 86400),
            lastStatusAt: snapshot.at,
            finalHour: false,
          }
        : null,
    weekly: snapshot,
    publishedRate: rate.toString(),
    publishedCapital: snapshot.yieldAssets,
    milestones: [50, 75, 100].filter((target) =>
      target === 100
        ? BigInt(snapshot.pps) >= BigInt(snapshot.targetPps)
        : rate >= (BigInt(target) * WAD) / 100n,
    ),
    paidSinceWeekly: "0",
    fundingSinceWeekly: "0",
    retiredPending: "0",
    capitalOutflows: "0",
    restrictionAnnounced: false,
  };
}

export interface AuctionTrade {
  tx: string;
  index: number;
  fills: readonly {
    receiver: string;
    payer: string | null;
    weth: bigint;
    shares: bigint | null;
    positionClosed?: boolean;
  }[];
  final: boolean;
}
export interface YethBlockFacts {
  trades: readonly AuctionTrade[];
  kick: { tx: string; index: number; initial: bigint } | null;
  stopped: { tx: string; reason: string } | null;
  funding: readonly {
    tx: string;
    destination: "auction" | "vault";
    amount: bigint;
  }[];
  retired: bigint;
  holderClaims: bigint;
  actions: readonly NormalizedAction[];
  names: Readonly<Record<string, string>>;
  /** Executed only for an eligible daily status. An unavailable estimate returns null. */
  dailyGrowth: bigint | null;
  expectedCapitalOutflow: bigint;
}

export function planYethMessages(
  previous: YethMessagingState,
  snapshot: AuctionSnapshot,
  facts: YethBlockFacts,
  now: number,
): {
  state: YethMessagingState;
  messages: RenderedAlertMessage[];
} {
  const state = structuredClone(previous);
  const block: RpcBlock = {
    number: snapshot.block,
    hash: snapshot.hash,
    timestamp: snapshot.at,
    parentHash: "",
  };
  const messages: RenderedAlertMessage[] = [];
  const live = now >= snapshot.at && now - snapshot.at <= 300;
  const rate = referenceRate(snapshot);
  state.snapshot = snapshot;
  state.retiredPending = (
    BigInt(state.retiredPending) + facts.retired
  ).toString();
  state.capitalOutflows = (
    BigInt(state.capitalOutflows) + facts.expectedCapitalOutflow
  ).toString();
  const add = (
    id: string,
    title: string,
    lines: string[],
    tx?: string,
    actionable = false,
  ) => {
    messages.push(message(id, block, title, lines, tx, live && actionable));
  };
  const retirementLines = () => {
    const retired = BigInt(state.retiredPending);
    if (retired <= 0n) return [];
    state.retiredPending = "0";
    return [
      `Claims retired: ${escape(amount(retired))} ETH`,
      `Remaining holder claims: ${escape(amount(facts.holderClaims))} ETH`,
    ];
  };
  const statusLines = (
    round: NonNullable<YethMessagingState["round"]>,
    includeEstimate = false,
  ) => {
    const current = {
      ...round.opening,
      balance: snapshot.balance,
      at: snapshot.at,
    };
    const quote = offer(current);
    return [
      `Recovery (ref.): <b>${percentage(quote.rate)}</b>${includeEstimate ? ` · vault ${percentage(rate)}` : ""}`,
      recoveryBar(
        quote.rate,
        offer(round.opening, round.opening.kickedAt).opening,
      ),
      `${escape(amount(quote.available))} WETH left · ends ${date(quote.end)}`,
      includeEstimate && quote.price > 0n
        ? holdingLine(
            (WAD * WAD) / quote.price,
            BigInt(snapshot.pps),
            facts.dailyGrowth,
          )
        : "",
      ...retirementLines(),
    ];
  };

  // The wrapper's withdrawal is settlement, not a second holder payout.
  const manualGroups = new Map<string, NormalizedAction[]>();
  for (const action of facts.actions) {
    const a = action.amounts;
    const who = action.user ? accountLink(action.user, facts.names) : "Holder";
    const paid = a.yethUnderlyingAmount ?? a.assets ?? 0n;
    if (action.yethManualPayout) {
      const group = manualGroups.get(action.txHash) ?? [];
      group.push(action);
      manualGroups.set(action.txHash, group);
      state.paidSinceWeekly = (BigInt(state.paidSinceWeekly) + paid).toString();
      continue;
    }
    if (action.kind === "yeth_recovery_vault_withdraw") {
      const principal = a.yethSnapshotMoved ?? 0n;
      const recovery = principal > 0n ? (paid * WAD) / principal : null;
      const scope =
        action.yethWithdrawalType === "full"
          ? "position closed"
          : action.yethWithdrawalType === "partial"
            ? "partial exit"
            : "";
      const recipient =
        action.receiver &&
        action.receiver.toLowerCase() !== action.user?.toLowerCase()
          ? accountLink(action.receiver, facts.names)
          : null;
      add(
        `withdraw:${action.txHash}:${action.logIndex}`,
        "💸 yETH vault exit",
        [
          `${who} ${recipient ? "withdrew" : "received"} <b>${escape(amount(paid))} WETH</b>`,
          recipient ? `Received by ${recipient}` : "",
          recovery === null
            ? scope
            : `Recovery: ${percentage(recovery)}${scope ? ` · ${scope}` : ""}`,
        ],
        action.txHash,
      );
    } else if (
      action.kind === "yeth_claimed_stayed" ||
      action.kind === "yeth_claimed_exited"
    ) {
      const stayed = action.kind === "yeth_claimed_stayed";
      const principal = a.yethSnapshotAmount ?? 0n;
      add(
        `claim:${action.txHash}:${action.logIndex}`,
        action.yethManualPayout
          ? "💸 yETH manual claim paid"
          : stayed
            ? "🟢 yETH recovery claimed"
            : "💸 yETH recovery claimed",
        [
          `${who} ${stayed ? "kept" : "received"} <b>${escape(amount(paid))} WETH</b>${stayed ? " in recovery" : ""}`,
          `Original claim${action.yethManualPayout ? " settled" : ""}: ${escape(amount(principal))} ETH${!action.yethManualPayout && principal > 0n ? ` · recovery ${percentage((paid * WAD) / principal)}` : ""}`,
        ],
        action.txHash,
      );
      if (stayed) continue;
    } else continue;
    state.paidSinceWeekly = (BigInt(state.paidSinceWeekly) + paid).toString();
  }
  for (const [tx, actions] of manualGroups) {
    // Bound each Telegram message without discarding recipients from a batch.
    for (let offset = 0; offset < actions.length; offset += 8) {
      const part = actions.slice(offset, offset + 8);
      const lines = part.flatMap((a) => [
        `${a.user ? accountLink(a.user, facts.names) : "Holder"} received <b>${escape(amount(a.amounts.yethUnderlyingAmount ?? 0n))} WETH</b>`,
        `Original claim settled: ${escape(amount(a.amounts.yethSnapshotAmount ?? 0n))} ETH`,
      ]);
      if (actions.length > 1)
        lines.push(
          `Transaction total: ${escape(amount(actions.reduce((n, a) => n + (a.amounts.yethUnderlyingAmount ?? 0n), 0n)))} WETH · ${actions.length} claims`,
        );
      add(`manual:${tx}:${offset}`, "💸 yETH manual claims paid", lines, tx);
    }
  }

  if (facts.kick) {
    if (state.round && !state.round.closed) {
      add(`end:${state.round.id}`, "⌛ yETH auction · ended", [
        "New round started",
        `${state.round.complete ? "Round total" : "Recorded since upgrade"}: ${escape(amount(BigInt(state.round.paid)))} WETH · ${state.round.takes} takes`,
      ]);
    }
    const opening = {
      ...snapshot,
      kickedAt: snapshot.at,
      initial: facts.kick.initial.toString(),
      balance: facts.kick.initial.toString(),
    };
    state.round = {
      id: `${facts.kick.tx}:${facts.kick.index}`,
      opening,
      paid: "0",
      takes: 0,
      complete: true,
      closed: false,
      dailySlot: 0,
      lastStatusAt: snapshot.at,
      finalHour: false,
    };
    // An opening already filled in the same block is represented by its take/outcome.
    if (!facts.trades.some((t) => t.final))
      add(
        `open:${state.round.id}`,
        "🔔 yETH auction · open",
        statusLines(state.round),
        facts.kick.tx,
        true,
      );
  }
  const round = state.round;
  for (const trade of facts.trades) {
    if (!round) throw new Error("yeth_trade_round_missing");
    const total = trade.fills.reduce((sum, f) => sum + f.weth, 0n);
    round.paid = (BigInt(round.paid) + total).toString();
    round.takes += trade.fills.length;
    state.paidSinceWeekly = (BigInt(state.paidSinceWeekly) + total).toString();
    const quote = offer({
      ...round.opening,
      at: snapshot.at,
      balance: snapshot.balance,
    });
    const finalHour =
      live && quote.end > snapshot.at && quote.end - snapshot.at <= 3600;
    const lines: string[] = [];
    for (const fill of trade.fills.slice(0, 8)) {
      const who = fill.payer
        ? accountLink(fill.payer, facts.names)
        : `Received by ${accountLink(fill.receiver, facts.names)}`;
      lines.push(
        `${who}${fill.payer ? (fill.payer === fill.receiver ? " received" : " exchanged shares for") : " ·"} <b>${escape(amount(fill.weth))} WETH</b>`,
      );
      if (fill.payer && fill.payer !== fill.receiver)
        lines.push(`Received by ${accountLink(fill.receiver, facts.names)}`);
      if (fill.shares !== null && fill.shares > 0n)
        lines.push(
          `Recovery (ref.): ${percentage((fill.weth * BigInt(snapshot.recoveryRate)) / fill.shares)}${fill.positionClosed ? " · position closed" : ""}`,
        );
    }
    if (trade.fills.length > 8)
      lines.push(`+${trade.fills.length - 8} more fills · see Tx`);
    if (trade.fills.length > 1)
      lines.push(
        `Transaction total: ${escape(amount(total))} WETH · ${trade.fills.length} takes`,
      );
    if (trade.final) {
      round.closed = true;
      lines.push(
        `${round.complete ? "Round total" : "Recorded since upgrade"}: ${escape(amount(BigInt(round.paid)))} WETH · ${round.takes} takes`,
        ...retirementLines(),
      );
    } else if (
      live &&
      quote.active &&
      snapshot.enabled &&
      snapshot.kickedAt > 0
    ) {
      if (
        trade.fills.length === 1 &&
        trade.fills[0]!.shares !== null &&
        trade.fills[0]!.shares! > 0n
      ) {
        lines.push(
          recoveryBar(
            (trade.fills[0]!.weth * BigInt(snapshot.recoveryRate)) /
              trade.fills[0]!.shares!,
            offer(round.opening, round.opening.kickedAt).opening,
          ),
        );
      }
      lines.push(
        `${escape(amount(quote.available))} WETH left · ends ${date(quote.end)}`,
        ...retirementLines(),
      );
    }
    add(
      `take:${trade.tx}`,
      trade.final
        ? "🏁 yETH auction · filled"
        : `💸 yETH auction · take${finalHour ? " · final hour" : ""}`,
      lines,
      trade.tx,
      !trade.final,
    );
    round.lastStatusAt = snapshot.at;
    if (finalHour) round.finalHour = true;
  }

  if (round && !round.closed) {
    const quote = offer({
      ...round.opening,
      at: snapshot.at,
      balance: snapshot.balance,
    });
    if (
      facts.stopped ||
      !snapshot.enabled ||
      snapshot.kickedAt === 0 ||
      BigInt(snapshot.balance) === 0n ||
      snapshot.at >= quote.end
    ) {
      const expired = !facts.stopped && snapshot.at >= quote.end;
      round.closed = true;
      add(
        `end:${round.id}`,
        expired ? "⌛ yETH auction · ended" : "⏹ yETH auction · stopped",
        [
          facts.stopped
            ? escape(facts.stopped.reason)
            : expired
              ? ""
              : "Offer no longer available",
          `${round.complete ? "" : "Since upgrade: "}${escape(amount(BigInt(round.paid)))} WETH taken · ${escape(amount(BigInt(snapshot.balance)))} WETH unused`,
          `${round.takes} recorded takes${expired ? ` · last available rate ${percentage(offer(round.opening, quote.end - 1).rate)} ref.` : ""}`,
          ...retirementLines(),
        ],
        facts.stopped?.tx,
      );
    } else if (live) {
      const dailySlot = Math.floor(
        (snapshot.at - round.opening.kickedAt) / 86400,
      );
      if (!round.finalHour && quote.end - snapshot.at <= 3600) {
        add(
          `hour:${round.id}`,
          "⏳ yETH auction · final hour",
          statusLines(round),
          undefined,
          true,
        );
        round.finalHour = true;
        round.lastStatusAt = snapshot.at;
      } else if (
        dailySlot > round.dailySlot &&
        snapshot.at - round.lastStatusAt >= 3600
      ) {
        add(
          `daily:${round.id}:${dailySlot}`,
          `📈 yETH auction · day ${dailySlot + 1}`,
          statusLines(round, true),
          undefined,
          true,
        );
        round.lastStatusAt = snapshot.at;
      }
      round.dailySlot = dailySlot;
    }
  }
  if (previous.snapshot.enabled && !snapshot.enabled) {
    if (!messages.some((m) => m.eventId.includes(":end:")))
      add(
        `disabled:${snapshot.block}`,
        "⏹ yETH auctions disabled",
        ["Auctions disabled by governance"],
        facts.stopped?.tx,
      );
    state.restrictionAnnounced = true;
  }
  if (
    state.restrictionAnnounced &&
    snapshot.enabled &&
    !facts.kick &&
    (!round || round.closed)
  ) {
    add(`enabled:${snapshot.block}`, "🟢 yETH auctions enabled", [
      "No active round yet",
    ]);
  }
  if (snapshot.enabled) state.restrictionAnnounced = false;
  for (const funding of facts.funding) {
    state.fundingSinceWeekly = (
      BigInt(state.fundingSinceWeekly) + funding.amount
    ).toString();
    if (
      funding.amount >= WAD &&
      !(funding.destination === "auction" && facts.kick)
    ) {
      add(
        `funding:${funding.tx}:${funding.destination}`,
        funding.destination === "vault"
          ? "💚 yETH recovery funded"
          : "💚 yETH auction funding",
        [
          `Funding received: <b>${escape(amount(funding.amount))} WETH</b>`,
          funding.destination === "vault"
            ? `Vault recovery (ref.): ${percentage(rate)}`
            : offer(snapshot).active
              ? "Auction balance increased"
              : "Available for the next round",
        ],
        funding.tx,
      );
    }
  }

  const loss = BigInt(state.publishedRate) - rate >= WAD / 1000n;
  // Capital withdrawals need flow attribution; never infer a loss from a lower TVL.
  if (loss) {
    add(`decline:${snapshot.block}`, "📉 yETH recovery decreased", [
      `Vault recovery (ref.): ${percentage(BigInt(state.publishedRate))} → ${percentage(rate)}`,
      "Cause under review",
    ]);
    state.publishedRate = rate.toString();
  }
  const capitalDecline =
    BigInt(state.publishedCapital) -
    BigInt(snapshot.yieldAssets) -
    BigInt(state.capitalOutflows);
  if (
    BigInt(state.publishedCapital) > 0n &&
    capitalDecline * 200n >= BigInt(state.publishedCapital)
  ) {
    const declineIndex = messages.findIndex(
      (m) => m.eventId === `yeth:upgrade:decline:${snapshot.block}`,
    );
    if (declineIndex >= 0) {
      const prior = messages[declineIndex]!;
      messages[declineIndex] = {
        ...prior,
        html: prior.html.replace(
          "Cause under review",
          `Earning capital decrease: ${escape(amount(capitalDecline))} WETH\nCause under review`,
        ),
      };
    } else
      add(`capital:${snapshot.block}`, "📉 yETH earning capital decreased", [
        `Unattributed decrease: ${escape(amount(capitalDecline))} WETH`,
        "Cause under review",
      ]);
    state.publishedCapital = snapshot.yieldAssets;
    state.capitalOutflows = "0";
  }
  const milestone = [50, 75, 100]
    .filter(
      (t) =>
        !state.milestones.includes(t) &&
        (t === 100
          ? BigInt(snapshot.pps) >= BigInt(snapshot.targetPps)
          : rate >= (BigInt(t) * WAD) / 100n),
    )
    .at(-1);
  if (milestone !== undefined) {
    state.milestones = [
      ...new Set([
        ...state.milestones,
        ...[50, 75, 100].filter((t) => t <= milestone),
      ]),
    ];
    add(
      `milestone:${milestone}`,
      milestone === 100
        ? "🎯 yETH vault reached its reference target"
        : `🎯 yETH vault reached ${milestone}% reference recovery`,
      [
        milestone === 100 ? `Vault recovery (ref.): ${percentage(rate)}` : "",
        recoveryBar(rate),
      ],
    );
    state.publishedRate = rate.toString();
  }
  if (snapshot.at - state.weekly.at >= 7 * 86400) {
    const before = referenceRate(state.weekly);
    const lines = [
      `Vault recovery (ref.): ${percentage(before)} → ${percentage(rate)}`,
      recoveryBar(rate),
      BigInt(state.fundingSinceWeekly) > 0n
        ? `Recovery funding: ${escape(amount(BigInt(state.fundingSinceWeekly)))} WETH`
        : "",
      BigInt(state.paidSinceWeekly) > 0n
        ? `Paid to holders: ${escape(amount(BigInt(state.paidSinceWeekly)))} WETH`
        : "",
    ];
    if (
      rate !== before ||
      BigInt(state.paidSinceWeekly) > 0n ||
      BigInt(state.fundingSinceWeekly) > 0n ||
      BigInt(state.retiredPending) > 0n
    ) {
      const status = messages.findIndex(
        (m) => m.eventId.includes(":daily:") || m.eventId.includes(":hour:"),
      );
      if (status >= 0) {
        const prior = messages[status]!;
        const extra = [
          `Vault this week: ${percentage(before)} → ${percentage(rate)}`,
          ...lines.slice(2),
          ...retirementLines(),
        ]
          .filter(Boolean)
          .join("\n");
        messages[status] = {
          ...prior,
          html: prior.html.replace("\n\n<a href=", `\n${extra}\n\n<a href=`),
        };
      } else if (milestone !== undefined || loss) {
        const index = messages.findIndex(
          (m) =>
            m.eventId.includes(":milestone:") ||
            m.eventId.includes(":decline:"),
        );
        const extra = [...lines.slice(2), ...retirementLines()]
          .filter(Boolean)
          .join("\n");
        if (index >= 0 && extra)
          messages[index] = {
            ...messages[index]!,
            html: messages[index]!.html.replace(
              "\n\n<a href=",
              `\n${extra}\n\n<a href=`,
            ),
          };
      } else
        add(
          `weekly:${state.weekly.at}`,
          rate > before
            ? "📈 yETH recovery · weekly"
            : "yETH recovery · weekly",
          [...lines, ...retirementLines()],
        );
    }
    state.weekly = snapshot;
    state.paidSinceWeekly = "0";
    state.fundingSinceWeekly = "0";
    state.publishedRate = rate.toString();
    state.publishedCapital = snapshot.yieldAssets;
    state.capitalOutflows = "0";
  }
  if (round?.closed && BigInt(state.retiredPending) > 0n)
    add(
      `retired:${snapshot.block}`,
      "♻️ yETH auction · claims settled",
      retirementLines(),
    );
  return { state, messages };
}
