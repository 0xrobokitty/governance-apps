import { describe, expect, it } from "vitest";
import {
  initializeMessaging,
  planYethMessages,
} from "@/workers/alerts-bot/src/domains/yeth/messaging-state";
import { offer } from "@/workers/alerts-bot/src/domains/yeth/auction-chain";
import {
  holdingLine,
  percentage,
  recoveryBar,
} from "@/workers/alerts-bot/src/domains/yeth/messages";
import type { NormalizedAction } from "@/workers/alerts-bot/src/types";
import {
  alice,
  bob,
  facts,
  hash,
  snapshot,
  started,
  wad,
} from "./alerts-bot.yeth-messaging-fixtures";

const html = (result: ReturnType<typeof planYethMessages>) =>
  result.messages.map((m) => m.html).join("\n");
const open = () =>
  planYethMessages(
    initializeMessaging(snapshot({ kickedAt: 0, initial: "0" })),
    snapshot(),
    facts({ kick: { tx: hash(1), index: 1, initial: 10n * wad } }),
    started,
  );
const take = (tx = hash(2), amount = wad, final = false) => ({
  tx,
  index: 2,
  final,
  fills: [{ payer: alice, receiver: alice, weth: amount, shares: amount }],
});
const claim = (
  overrides: Partial<NormalizedAction> = {},
): NormalizedAction => ({
  kind: "yeth_claimed_exited",
  tokenSymbol: "yETH",
  user: alice,
  owner: alice,
  receiver: alice,
  blockNumber: 26_300_000,
  txHash: hash(2),
  logIndex: 2,
  source: { kind: "onchain", txHash: hash(2), logIndex: 2 },
  amounts: { yethUnderlyingAmount: wad, yethSnapshotAmount: 3n * wad },
  ...overrides,
});

describe("upgraded yETH channel messages", () => {
  it("combines simultaneous recovery and capital declines in one message", () => {
    const result = planYethMessages(
      initializeMessaging(snapshot()),
      snapshot({ pps: String(wad / 2n), yieldAssets: String(900n * wad) }),
      facts(),
      started,
    );
    expect(result.messages).toHaveLength(1);
    expect(html(result)).toContain("Earning capital decrease: 100.00 WETH");
    expect(html(result)).toContain("Cause under review");
  });

  it("keeps a maximum-size fill summary deliverable with long ENS names", () => {
    const fills = Array.from({ length: 20 }, () => ({
      payer: alice,
      receiver: bob,
      weth: wad,
      shares: wad,
    }));
    const result = planYethMessages(
      open().state,
      snapshot(),
      facts({
        trades: [{ tx: hash(2), index: 1, final: false, fills }],
        names: { [alice]: "&".repeat(255), [bob]: "a".repeat(255) },
      }),
      started,
    );
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]!.html.length).toBeLessThan(4000);
    expect(html(result)).toContain("20 takes");
    expect(result.state.round?.takes).toBe(20);
  });
  it("adopts an active round without replaying its opening or inventing earlier totals", () => {
    const state = initializeMessaging(snapshot());
    expect(
      planYethMessages(state, snapshot(), facts(), started).messages,
    ).toEqual([]);
    expect(state.round).toMatchObject({ complete: false, paid: "0", takes: 0 });
    const result = planYethMessages(
      state,
      snapshot({ balance: "0", kickedAt: 0 }),
      facts({ trades: [take(hash(2), wad, true)] }),
      started,
    );
    expect(html(result)).toContain(
      "Recorded since upgrade: 1.00 WETH · 1 takes",
    );
    expect(result.messages).toHaveLength(1);
  });

  it("opens at current recovery on the fixed 0–100 scale", () => {
    const result = open();
    expect(result.messages).toHaveLength(1);
    expect(html(result)).toContain("35.00%");
    expect(html(result)).toContain("↑ start 35.00%");
    expect(html(result)).toContain("10.00 WETH left");
    expect(html(result)).toContain("View auction");
    expect(html(result)).not.toContain("7 days");
  });

  it("sends one daily status, with no price-step spam", () => {
    const early = planYethMessages(
      open().state,
      snapshot({ at: started + 3600 }),
      facts(),
      started + 3600,
    );
    expect(early.messages).toHaveLength(0);
    const day = planYethMessages(
      early.state,
      snapshot({ at: started + 86400 }),
      facts({ dailyGrowth: 10n ** 14n }),
      started + 86400,
    );
    expect(day.messages).toHaveLength(1);
    expect(html(day)).toContain("day 2");
    expect(html(day)).toContain("of holding at the current pace");
    expect(
      planYethMessages(
        day.state,
        snapshot({ at: started + 86500 }),
        facts(),
        started + 86500,
      ).messages,
    ).toHaveLength(0);
  });

  it("every take posts, even dust; a take replaces the nearby daily status", () => {
    const trades = Array.from({ length: 12 }, (_, i) => take(hash(i + 2), 1n));
    const result = planYethMessages(
      open().state,
      snapshot({ at: started + 86400 }),
      facts({ trades }),
      started + 86400,
    );
    expect(result.messages).toHaveLength(12);
    expect(new Set(result.messages.map((m) => m.eventId)).size).toBe(12);
    expect(html(result)).toContain("&lt;0.0001 WETH");
    expect(html(result)).not.toContain("day 2");
    expect(result.state.round?.takes).toBe(12);
    expect(result.state.round?.paid).toBe("12");
  });

  it("combines the final take and outcome without a misleading full recovery bar", () => {
    const result = planYethMessages(
      open().state,
      snapshot({ balance: "0", kickedAt: 0 }),
      facts({ trades: [take(hash(2), 10n * wad, true)] }),
      started,
    );
    expect(result.messages).toHaveLength(1);
    expect(html(result)).toContain("auction · filled");
    expect(html(result)).toContain("Round total: 10.00 WETH");
    expect(html(result)).not.toContain("<pre>");
    expect(html(result)).not.toContain("View auction");
  });

  it("marks the final hour once, or folds it into a take", () => {
    const at = offer(snapshot()).end - 1800;
    const s = snapshot({ at });
    const result = planYethMessages(
      open().state,
      s,
      facts({ trades: [take()] }),
      at,
    );
    expect(result.messages).toHaveLength(1);
    expect(html(result)).toContain("take · final hour");
    expect(
      planYethMessages(result.state, { ...s, at: at + 60 }, facts(), at + 60)
        .messages,
    ).toHaveLength(0);
  });

  it("expires at the actual floor step, which can be earlier than seven days and below 100%", () => {
    const end = offer(snapshot()).end;
    expect(end - started).toBeLessThan(7 * 86400);
    const result = planYethMessages(
      open().state,
      snapshot({ at: end }),
      facts(),
      end,
    );
    expect(result.messages).toHaveLength(1);
    expect(html(result)).toContain("auction · ended");
    expect(html(result)).toContain("last available rate");
    expect(html(result)).not.toContain("100.00%");
    expect(html(result)).not.toContain("View auction");
  });

  it("does not mislabel an admin sweep as a fill; announces re-enabling once", () => {
    const s = snapshot({ balance: "0", enabled: false, kickedAt: 0 });
    const stopped = planYethMessages(
      open().state,
      s,
      facts({
        stopped: { tx: hash(3), reason: "Auctions disabled by governance" },
      }),
      started,
    );
    expect(html(stopped)).toContain("auction · stopped");
    expect(html(stopped)).not.toContain("filled");
    const enabled = planYethMessages(
      stopped.state,
      { ...s, enabled: true },
      facts(),
      started,
    );
    expect(html(enabled)).toContain("auctions enabled");
    expect(
      planYethMessages(enabled.state, { ...s, enabled: true }, facts(), started)
        .messages,
    ).toHaveLength(0);
  });

  it("does not infer claim retirement or a benefit from a take alone", () => {
    const result = planYethMessages(
      open().state,
      snapshot({ balance: String(9n * wad) }),
      facts({ trades: [take()] }),
      started,
    );
    expect(html(result)).not.toContain("Claims retired");
    expect(html(result)).not.toContain("pace for remaining");
    const retired = planYethMessages(
      result.state,
      snapshot({ at: started + 86400 }),
      facts({ retired: 3n * wad }),
      started + 86400,
    );
    expect(html(retired)).toContain("Claims retired: 3.00 ETH");
    expect(retired.state.retiredPending).toBe("0");
    expect(
      html(
        planYethMessages(
          retired.state,
          snapshot({ at: started + 172800 }),
          facts(),
          started + 172800,
        ),
      ),
    ).not.toContain("Claims retired");
  });

  it("keeps delayed takes but removes stale opportunity copy and skipped daily reminders", () => {
    const result = planYethMessages(
      open().state,
      snapshot(),
      facts({ trades: [take()] }),
      started + 86400,
    );
    expect(result.messages).toHaveLength(1);
    expect(html(result)).not.toContain("WETH left");
    expect(html(result)).not.toContain("View auction");
    expect(
      planYethMessages(
        open().state,
        snapshot({ at: started + 86400 }),
        facts(),
        started + 172800,
      ).messages,
    ).toHaveLength(0);
  });

  it("groups verified manual payouts in the same transaction and preserves all recipients", () => {
    const actions = Array.from({ length: 11 }, (_, i) =>
      claim({ yethManualPayout: true, logIndex: i }),
    );
    const result = planYethMessages(
      initializeMessaging(snapshot()),
      snapshot(),
      facts({ actions, names: { [alice]: "<alice&.eth" } }),
      started,
    );
    expect(result.messages).toHaveLength(2);
    expect(html(result).match(/Original claim settled/g) ?? []).toHaveLength(
      11,
    );
    expect(html(result)).toContain("Transaction total: 11.00 WETH · 11 claims");
    expect(html(result)).toContain("&lt;alice&amp;.eth");
    expect(result.messages.every((m) => m.html.length < 4000)).toBe(true);
    expect(result.state.paidSinceWeekly).toBe(String(11n * wad));
  });

  it("keeps recipient and holder distinct, and does not guess an unresolved withdrawal type", () => {
    const action = claim({
      kind: "yeth_recovery_vault_withdraw",
      receiver: bob,
      amounts: { assets: wad, yethSnapshotMoved: 3n * wad },
    });
    const result = planYethMessages(
      initializeMessaging(snapshot()),
      snapshot(),
      facts({ actions: [action] }),
      started,
    );
    expect(html(result)).toContain("withdrew");
    expect(html(result)).toContain("Received by");
    expect(html(result)).not.toContain("partial exit");
    expect(html(result)).not.toContain("position closed");
  });

  it("does not turn an attributed payout into a capital-loss notification", () => {
    const result = planYethMessages(
      initializeMessaging(snapshot()),
      snapshot({ yieldAssets: String(980n * wad) }),
      facts({ expectedCapitalOutflow: 20n * wad }),
      started,
    );
    expect(result.messages).toHaveLength(0);
    const loss = planYethMessages(
      result.state,
      snapshot({ yieldAssets: String(970n * wad) }),
      facts(),
      started,
    );
    expect(html(loss)).toContain("Unattributed decrease: 10.00 WETH");
    expect(html(loss)).not.toContain("strategy loss");
  });

  it("accumulates small rate declines and never repeats an already reached milestone", () => {
    const state = initializeMessaging(snapshot());
    const small = planYethMessages(
      state,
      snapshot({ pps: String(wad - 10n ** 15n) }),
      facts(),
      started,
    );
    expect(small.messages).toHaveLength(0);
    const loss = planYethMessages(
      small.state,
      snapshot({ pps: String(wad - 4n * 10n ** 15n) }),
      facts(),
      started,
    );
    expect(html(loss)).toContain("recovery decreased");
    const milestone = planYethMessages(
      state,
      snapshot({ pps: String(2n * wad) }),
      facts(),
      started,
    );
    expect(html(milestone)).toContain("reached 50%");
    const recross = planYethMessages(
      milestone.state,
      snapshot({ pps: String(2n * wad) }),
      facts(),
      started,
    );
    expect(recross.messages).toHaveLength(0);
  });

  it("uses the attainable contract target instead of requiring rounded reciprocal 100%", () => {
    const s = snapshot();
    const result = planYethMessages(
      initializeMessaging(s),
      { ...s, pps: s.targetPps },
      facts(),
      started,
    );
    expect(html(result)).toContain("reached its reference target");
    expect(html(result)).toContain("&gt;99.99%");
    expect(html(result)).not.toContain("100.00%");
  });

  it("merges weekly funding/payout totals into a due status or milestone", () => {
    const state = initializeMessaging(snapshot({ kickedAt: 0 }));
    state.weekly.at -= 7 * 86400;
    state.paidSinceWeekly = String(2n * wad);
    state.fundingSinceWeekly = String(3n * wad);
    const result = planYethMessages(
      state,
      snapshot({ kickedAt: 0, pps: String(2n * wad) }),
      facts(),
      started,
    );
    expect(result.messages).toHaveLength(1);
    expect(html(result)).toContain("Paid to holders: 2.00 WETH");
    expect(html(result)).toContain("Recovery funding: 3.00 WETH");
    expect(result.state.paidSinceWeekly).toBe("0");
  });

  it("never rounds an executable sub-target quote up to 100% or a full bar", () => {
    expect(percentage(wad - 1n)).toBe("&gt;99.99%");
    expect(recoveryBar(wad - 1n)).not.toContain("█".repeat(20));
    expect(recoveryBar(wad)).toContain("█".repeat(20));
    expect(holdingLine(2n * wad, wad, null)).toBe("");
    expect(holdingLine(2n * wad, wad, -1n)).toBe("");
  });
});
