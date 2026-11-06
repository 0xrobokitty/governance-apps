# yETH Recovery & Auctions: message catalogue

Approved direction · implemented 6 November 2026 · **Forward-only upgrade; deployment pending.**

One existing channel, one bot. This catalogue covers the compact recovery messages and auction alerts.
After activation, it supersedes the yETH section of the [original catalogue](../../alerts-bot-message-catalogue.md).
Previously sent messages remain unchanged. See the [implementation and deployment guide](telegram-alerts.md).

Implementation notes:

- A1–A8 and R1–R7 run in the existing channel. They use confirmed chain data and the existing delivery receipts.
- R5 reports verified claim retirement. The optional pace benefit remains omitted until a reconciled per-settlement source exists.
- The holding comparison uses the app's verified recurring-income forecast when current data agrees with the chain snapshot.
- Q1 remains optional and is not enabled. Missing required chain evidence pauses the scan; missing optional enrichment does not prevent confirmed payouts.
- P1 is a manual new post and pin. Deployment does not post it or edit an existing message.
- The examples below are copy references. Actual rates, duration, account labels, and conditional rows come from verified data.

All accounts, rounds, trades, and message dates below are illustrative.
Examples show alternative states, not one continuous auction history.
`View auction`, `My recovery`, `Details`, and `Tx` represent link labels. No example transaction links are invented.

The proposed rhythm is **one daily auction status, every confirmed take, and one outcome**.
Each take also shows the remaining opportunity. It replaces a nearby scheduled status, never another take.
There is no daily cap that silently drops trades.

## 1. Message map

| ID | Event | Delivery |
| --- | --- | --- |
| P1 | Channel introduction | Post and pin once manually. Leave historical messages unchanged. |
| A1 | Auction opens | Every funded round. Include carried funds when relevant. |
| A2 | Daily auction status | Once each 24 hours after opening, while the round remains actionable. |
| A3 | Auction take | Every confirmed fill, including small and partial fills. |
| A4 | Final take fills the round | One combined take and outcome message. |
| A5 | Final hour | Once, only with an active offer and available WETH. |
| A6 | Round expires | Once. Distinguish partial participation from no takes. |
| A7 | Round stops early | Once, when confirmed. State the cause only when proven. |
| A8 | Auctions become available again | Once after a previously announced restriction ends. An actual opening uses A1 instead. |
| R1 | Recovery update | Weekly when figures change. Include it in an auction status when both are due. |
| R2 | Direct vault exit | Every confirmed holder withdrawal. Partial and full variants. |
| R3 | Recovery claim | Every verified payout or claim-and-stay. Includes historical and manual variants. |
| R4 | New recovery funding | Material funding, with destination. Combine auction funding with A1 when the round opens immediately. |
| R5 | Auction claims retired and holder benefit | Include in the next status or round outcome when verified. Otherwise one settlement summary after the round. |
| R6 | Material recovery decline | Once per distinct material change. Explain only proven causes. |
| R7 | Vault recovery milestone | First verified crossing of 50%, 75%, or the reference target. Replaces R1 when both are due. |
| Q1 | Active auction data unavailable | Optional: one notice after 30 minutes of unavailable quotes, then one restored status. |

**No separate price-step, five-point, low-liquidity, debt-paid-down, or Yield Vault capacity messages.**
Daily statuses and takes carry those relevant facts. A final take includes the round outcome.
Material funding and losses retain their own messages.

The upgrade uses the weekly R1 cadence. Q1 remains an optional follow-up.
The legacy daily metric cadence applies only to an existing pre-upgrade backlog.

## 2. Shared visual language

### Recovery bar

Use the DAO's 20-cell, monospace bar style. Keep the scale at 0–100% reference recovery.
The marker stays at the opening recovery rate for the whole round.
The filled cells show the current offer, not elapsed time or the fraction of WETH taken.

```text
Recovery (ref.): 50.00%
0%       50%     100%
███████│███░░░░░░░░░░
       ↑ start 34.3%
```

The opening bar already shows the recovered portion. It does not start at zero.
The space between the opening marker and the filled edge shows the improved offer.
Available WETH stays on a separate text line. There is no second liquidity bar.

Cells round to the nearest boundary. Keep the final cell empty below actual 100%.
Exact numbers determine milestones and expiry. The bar is approximate.
The numeric offer retains enough precision to avoid presenting 99.99…% as an executable 100% offer.

### Copy rules

- One heading, one main outcome, one bar at most, one link row.
- Show actual payouts in WETH. Show original claim principal in ETH.
- Label broadcast recovery rates `ref.`. Personal percentages belong in the connected app.
- If attribution is proven, name the holder on trade messages. Omit unknown actors.
- Show the remaining opportunity on takes. Omit repeated wallet balances and protocol choice percentages.
- Keep observation time in UTC, consistent with the existing channels.
- Keep mechanics and assumptions in P1 and the linked docs.
- Omit unavailable optional figures. A failed estimate must not hide a confirmed take.
- If the verified balance is zero, use `Position closed`. Treat rounding dust as a remaining balance.

`Full position exit` and `Auction filled` describe different outcomes.
Selling all of one holder's shares does not mean the round is filled.

## 3. Pinned introduction

### P1 · Channel introduction

```text
yETH Recovery & Auctions

Auction openings, daily rates, every take, and recovery updates.

Recovery % uses the protocol reference. Connect your wallet for your personal rate.
The bar shows the offer. WETH left shows availability.

Rates improve until the round ends. Other holders can take the WETH first.
Sold shares give up future recovery. Holding estimates assume the current income pace continues.

My recovery · How auctions work
```

## 4. Auction templates

### A1 · Auction opens

```text
🔔 Auction #12 · open

Recovery (ref.): 34.30%
0%       50%     100%
███████│░░░░░░░░░░░░░
       ↑ start 34.3%
30.00 WETH available · ends 12 Nov, 11:11 UTC

View auction · 5 Nov, 12:00 UTC
```

The start uses the actual opening quote. An empty kick produces no opening message.
For a carryover round, add one line: `Funding: 10.00 new + 20.00 carried WETH`.
Use `recycled` for proven recycled proceeds. Do not call all opening inventory new funding.

### A2 · Daily status

```text
📈 Auction #12 · day 2

Recovery (ref.): 40.00% · vault 34.30%
0%       50%     100%
███████│█░░░░░░░░░░░░
       ↑ start 34.3%
30.00 WETH left · ends 12 Nov, 11:11 UTC
≈2.8 years of holding at the current pace

View auction · 6 Nov, 12:00 UTC
```

The holding comparison is the only optional promotional line. It never becomes a promised saving.
An opening offer equal to vault value omits it.
A missing or nonpositive forecast omits it.

The status still posts when nobody takes: the improved offer is the news.
If a take or closing reminder provides a fresh status within the previous hour, skip that scheduled status.
Do not send a delayed catch-up status later that day.

### A3 · Take, with WETH remaining

```text
💸 Auction #12 · take

alice.eth received 4.00 WETH
Recovery (ref.): 50.00%
0%       50%     100%
███████│███░░░░░░░░░░
       ↑ start 34.3%
26.00 WETH left · ends 12 Nov, 11:11 UTC

View auction · Tx · 7 Nov, 22:15 UTC
```

Every confirmed fill appears. There is no size threshold.
If the same transaction contains several fills, one message lists each fill and their total.
Different transactions retain separate messages. Long batches retain an explicit count and a transaction link.

Variants:

- Full holder exit: `alice.eth received 4.00 WETH · position closed`.
- Unknown holder: `Taken: 4.00 WETH`. Keep the confirmed amount and rate.
- Proven settlement in the same transaction: add `Claims retired: 8.00 ETH`.
- Proven benefit in the same transaction: add `Recovery pace for remaining holders: +0.23% est.`.
- Without settlement proof, omit both benefit lines. The take remains deliverable.
- With several different fill rates, show each rate beside its fill. Do not average percentages or use one fill's rate for every participant.

An auction take alone transfers shares to the wrapper. It does not prove that those shares were retired.
The rate in this message describes the fill. The remaining amount describes the confirmed state at the observation block.

### A4 · Final take fills the round

```text
🏁 Auction #12 · filled

bob.eth received 26.00 WETH
Final take: 75.00% reference recovery
Round total: 30.00 WETH · 2 takes

Results · Tx · 10 Nov, 14:20 UTC
```

This replaces A3 and a separate completion notification for the final take.
There is no full bar: selling all WETH does not mean 100% recovery.
`2 takes` counts verified fills, not unique people or wallets.

### A5 · Final hour

```text
⏳ Auction #12 · final hour

Recovery (ref.): 99.38%
0%       50%     100%
███████│████████████░
       ↑ start 34.3%
12.00 WETH left · ends 12 Nov, 11:11 UTC

View auction · 12 Nov, 10:11 UTC
```

A take in the final hour uses `Auction #12 · take · final hour` and supplies this reminder.
An already delivered final-hour reminder does not suppress later takes.
The normal daily status covers the preceding day. There is no additional 24-hour reminder.

### A6 · Expired with WETH remaining

```text
⌛ Auction #12 · ended

18.00 WETH taken · 12.00 WETH unused
3 takes · last available rate 99.98% ref.

Results · 12 Nov, 11:12 UTC
```

No-take variant:

```text
⌛ Auction #12 · ended

No takes · 30.00 WETH unused
Last available rate: 99.98% ref.

Results · 12 Nov, 11:12 UTC
```

The final rate is historical, not an available offer.
An unused balance does not promise another round or a refund.

### A7 · Stopped early

```text
⏹ Auction #12 · stopped

Auctions disabled by governance
4.00 WETH taken · 26.00 WETH unused

Details · Tx · 8 Nov, 09:00 UTC
```

If the reason is confirmed, include it. Otherwise use `Offer no longer available`.
Zero available WETH alone does not prove that holders took it all.
A sweep, disable, expiry, and complete fill need distinct evidence.

### A8 · Available again, without a new round

```text
🟢 yETH auctions enabled

No active round yet

My recovery · Tx · 9 Nov, 09:00 UTC
```

If a public restriction notice preceded this change, send A8. If a round opens at the same time, use A1 alone.
Routine configuration and role changes stay in the app unless they change a holder's available action.

## 5. Recovery templates

### R1 · Recovery update

```text
📈 yETH recovery · weekly

Vault recovery (ref.): 34.30% → 34.50% · +0.20 pp
0%       50%     100%
███████░░░░░░░░░░░░░
Recovery funding: +5.00 WETH
Paid to holders: 12.00 WETH

My recovery · 12 Nov, 12:00 UTC
```

Omit zero or unverified flow rows. Use a neutral heading when the rate is unchanged.
When A2 is due, add the vault change to A2 instead of sending R1 separately.
The vault bar uses the same absolute scale without an auction opening marker.
`Paid to holders` excludes wrapper redemptions and internal transfers.

### R2 · Direct vault withdrawal

```text
💸 yETH vault exit

alice.eth received 3.43 WETH
Recovery: 34.30% · partial exit

My recovery · Tx · 8 Nov, 15:00 UTC
```

Full-exit variant: `Recovery: 34.30% · position closed`.
The rate is personal only when the represented principal is proven.
Otherwise use `Reference recovery: 34.30% · partial exit` or omit the rate when neither basis is available.
An unresolved full/partial classification omits that label.

Show the holder's actual withdrawal once. Do not publish the wrapper's withdrawal as another holder exit.
Separate auction and direct-redemption transactions remain separate confirmed payouts.

### R3 · Claim variants

Claimed and stayed:

```text
🟢 yETH recovery claimed

alice.eth kept 6.39 WETH in recovery
Original claim: 20.00 ETH · recovery 31.96%

My recovery · Tx · 1 May, 12:00 UTC
```

Claimed and exited:

```text
💸 yETH recovery claimed

alice.eth received 6.39 WETH
Original claim: 20.00 ETH · recovery 31.96%

My recovery · Tx · 1 May, 12:00 UTC
```

Manual settlement:

```text
💸 yETH manual claim paid

alice.eth received 6.39 WETH
Original claim settled: 20.00 ETH

Details · Tx · 8 Nov, 12:00 UTC
```

The ordinary claim window is closed. Historical templates do not imply that it reopened.
Manual settlement requires verified payment and entitlement clearance. A clearance alone is not a payout.
Several recipients in one transaction receive one compact message with separate amounts and a total.

### R4 · New funding

Funding received by the Recovery Vault:

```text
💚 yETH recovery funded

Donation: 5.00 WETH
Vault recovery (ref.): 34.30% → 34.50%

My recovery · Tx · 8 Nov, 12:00 UTC
```

Funding held for a future auction:

```text
💚 yETH auction funding

New funding: 10.00 WETH
Available for the next round

My recovery · Tx · 8 Nov, 12:00 UTC
```

Only label donations or yield when the source is proven.
If the money is not confirmed as available to the auction, omit the future-round claim.
The same funding must not create R4, A1, and a Yield Vault capacity message at the same time.
Routine yield goes into R1. A proposed immediate threshold is 1 WETH of new funding.
Smaller receipts accumulate for the summary.
Show a vault-rate change only after recognized vault accounting proves it. Funding can arrive before the rate changes.

### R5 · Claims retired and benefit to remaining holders

Preferred placement: add the two relevant lines to the next A2 or the round outcome.
If settlement completes later, use one summary for that round:

```text
♻️ Auction #12 · claims settled

Claims retired: 8.00 ETH · paid 4.00 WETH
Remaining holder claims: 1,992.00 ETH
Recovery pace for remaining holders: +0.23% est.

Details · Settlement · 8 Nov, 12:00 UTC
```

This example describes the separate 4 WETH fill in A3, not the 30 WETH outcome in A4.
The pace line requires a reconciled settlement and a supported calculation.
If the pace calculation is unavailable, keep the verified claim figures and omit the pace line.
Do not replace it with an invented benefit or an `unavailable` paragraph.

There is no new post for each wrapper transfer or redemption.
Interim retirements appear in the next status. A later summary reports only the newly retired amount and the round total when needed.
The same retirement contributes once to cumulative statistics.

### R6 · Material recovery decline

```text
📉 yETH recovery decreased

Vault recovery (ref.): 34.50% → 33.90% · −0.60 pp
Confirmed strategy loss: 14.70 WETH

Details · 8 Nov, 12:00 UTC
```

Without proven attribution, replace the cause with `Cause under review`.
A holder payout or capital transfer is not a strategy loss.
If a material change affects future earning capital without changing current vault recovery, use:

```text
📉 yETH earning capital decreased

Earning capital: −20.00 WETH
Confirmed treasury withdrawal

Details · Tx · 8 Nov, 12:00 UTC
```

The cause remains evidence-based. Routine claims and already reported payouts do not create this extra message.
Proposed materiality: a 0.10 pp vault-rate decline or a 0.5% reduction in distinct earning capital.
Compare against the last published baseline so smaller declines accumulate. Confirmed exit restrictions bypass these thresholds.

### R7 · Vault recovery milestone

```text
🎯 yETH vault reached 50% reference recovery

0%       50%     100%
██████████░░░░░░░░░░

My recovery · 12 Nov, 12:00 UTC
```

Use the same template at 75%.
At the contract target, use `yETH vault reached its reference target` and show the exact reference rate.
Do not claim that every holder recovered 100%. The contract target can differ slightly from exact 100% reference recovery.
Do not announce another milestone after a decline and recrossing of the same threshold.
Auction rates reaching these levels change A2's headline. They do not create an extra milestone post.

## 6. Optional data notice

### Q1 · Quotes unavailable during an active round

```text
⚠️ Auction #12 · quotes unavailable

The auction may still be running onchain.
Check the app before acting.

My recovery · 8 Nov, 12:00 UTC
```

Send once after 30 minutes without a trustworthy current quote. This is not an onchain pause notice.
On recovery, send one fresh A2 with the heading `Auction #12 · quotes restored`.
If the round ended, send its verified outcome instead.
Confirmed fills still post without optional live quote or benefit details.

## 7. Cadence and duplicate rules

| Situation | Result |
| --- | --- |
| Round opens, then nobody takes | Opening, one status per 24 hours, final-hour reminder, and expiry. |
| Two separate takes | Two take messages. Each carries the remaining WETH. |
| A transaction contains several fills | One message with each fill represented. No hidden size filter. |
| Final take empties the auction | A4 only, including that take and the round totals. |
| Take and daily status coincide | Take only. |
| Take and final-hour reminder coincide | Take with final-hour heading. |
| Daily status and final-hour reminder coincide | Final-hour reminder only. |
| Funding and opening are one operation | A1 with the funding breakdown. |
| Share retirement follows an earlier take | Add the proven retirement to the next status or settlement summary. Do not repeat the take. |
| Daily recovery metrics and an auction status coincide | One status with the material vault change. |
| Old events arrive after a delivery outage | Timestamp historical takes. Omit obsolete countdowns and executable invitations. Send at most one current status. |

A full no-take round has up to nine posts: opening, six daily statuses, final hour, and expiry.
Earlier expiry or a fill reduces that total. Busy rounds add the actual takes.
This is an explicit tradeoff: every take remains visible, so total traffic is not capped.

The common footer is compact. A historical quote must never acquire a new timestamp that makes it appear current.
Every scheduled post verifies whether a take, expiry, or restriction makes it obsolete.

## 8. What the numbers mean

These notes support review. They do not appear beneath every Telegram message.

### Opening rate and duration

The verified wrapper sets the opening lot price with `recoveryVault.previewWithdraw(available)`.
The opening offer therefore matches the vault withdrawal value, subject to integer rounding.
There is no separate planned phase where the auction first becomes competitive with the vault.
Later comparisons still use the current vault value, which can change after the kick.

The underlying auction has a seven-day maximum.
The observed settings reduce share cost by 4 basis points every 225 seconds.
The reference offer therefore improves in steps, not along a straight line.
The round ends earlier when inventory disappears, governance disables it, or the next step crosses the minimum price.

For an illustrative 34.30% opening rate, those settings produce approximately:

| Time since opening | Reference recovery |
| --- | ---: |
| Opening | 34.30% |
| 1 day | 40.00% |
| 2 days | 46.64% |
| 3 days | 54.38% |
| 4 days | 63.41% |
| 5 days | 73.94% |
| 6 days | 86.22% |
| Last valid step | 99.98% |

The example reaches its floor after about 6 days, 23 hours, and 11 minutes.
A step can skip exact 100%. A seven-day timeout can also occur before the floor for other opening rates or settings.
Every round needs its own actual end calculation. The bot must not promise a 100% take.

### Holder payout, claim retirement, and remaining-holder benefit

These are three different facts:

1. **Take:** the holder receives WETH and sends shares to the wrapper.
2. **Retirement:** the wrapper redeems shares. The accounting proves the corresponding claim principal was retired.
3. **Benefit:** fewer shares share future income, subject to what happens to the earning capital and redeemed funds.

A proportional redemption removes assets and shares together. It does not itself increase the remaining vault price per share.
The destination address alone does not prove that redeemed funds returned to recovery capital.

Use actual attributed principal for `Claims retired` and `Remaining holder claims`.
If only reference principal is known, label it `Reference claims retired` and omit an incompatible actual-claim total.
Never derive a personal claim from the reference rate when the holder's issuance history differs.

For a settled fill with 8 ETH of actual claim principal and a 4 WETH payout:

- Claim principal retired is 8 ETH.
- The payout is 4 WETH.
- The difference is not 4 WETH deposited into other holders' wallets or their vault.
- Any estimate for remaining holders must include the change in earning capital and outstanding shares.

The proposed pace calculation compares recurring income per share before and after the attributed settlement:

```text
pace before = expected recurring recovery income before / shares before
pace after  = expected recurring recovery income after  / shares after
pace change = pace after / pace before − 1
```

Hold unrelated changes constant when attributing the effect to this exit.
Use net recurring income and proven routing. Exclude donations, future auctions, and invented reinvestment.
Show negative or zero effects honestly when material. Never force a positive benefit label.

The R5 example assumes proportional principal per share, claims falling from 2,000 to 1,992 ETH, and unchanged yield per unit of capital.
It assumes distinct earning capital falls from 2,400 to 2,396 WETH after the 4 WETH payout.
This requires proof that redeemed assets remain in, or return to, the earning capital.
The resulting pace change is `(2396 / 2400) / (1992 / 2000) − 1`, or about **+0.23%**.
The current consumer schema does not supply a reconciled benefit for each fill. This line needs additional verified accounting before implementation.

### Holding comparison

Compare the WETH value of the same shares under the auction and direct redemption.
Estimate the time for recurring recovery income to close that gap.
Use the app's forecast basis, including current capital and share supply.
Do not annualize donation-inclusive historical performance for this line.

The illustrative 40% offer versus 34.30% vault reference takes about 2.8 years at the 5 November feed's estimated pace.
That number changes with the offer and forecast. It is not a reusable slogan.

## 9. Existing message coverage

| Existing message | Proposed destination |
| --- | --- |
| Y1: claimed and stayed | R3 stayed variant. |
| Y2: claimed and exited | R3 exited variant. |
| Y3: partial withdrawal | R2 partial variant. |
| Y4: full withdrawal | R2 full variant. |
| Y5: debt paid down | Claim figure in the causal message or R5. No duplicate post. |
| Y6: recovery progress | R1, R4, or R7, according to the cause. |
| Y7: recovery setback | R6 when material. Otherwise R1. |
| Y8: yield capacity increased | New funding in R4 or recurring progress in R1. |
| Y9: yield capacity decreased | Proven payout in R2/R3. Distinct material capital decline in R6. |
| Manual payout without an ordinary Claim event | R3 manual variant, with verified payment and clearance. |
| Wrapper redemption and internal recycling | R5 accounting. Never another holder payout or fresh donation. |

Unknown events remain reviewable processing exceptions. They are not silently reclassified into one of these templates.

## 10. Decisions for the next copy pass

1. Keep the 0–100% bar with an opening marker, or crop the scale to opening recovery–100%?
2. Keep the holding estimate on daily statuses, or reserve it for the app?
3. Show verified retirement and estimated pace together, or launch with retirement figures alone?
4. Keep weekly recovery updates outside auctions, and retain the optional data notice?

Every take and the unified channel are the working direction. These four choices remain open.

## Sources reviewed

- [Verified wrapper and underlying Auction source](https://eth.blockscout.com/api/v2/smart-contracts/0x26868F94684dEC5Ea6fF93ccc06aBde1015ce2CE), read 5 November 2026. Wrapper: `kick`, `redeem`, and constructor. Auction: `_price`, `_take`, `settle`, and setters.
- [Public recovery feed](https://data.dao-ops.com/prod/yeth-recovery.json), observation 5 November 2026, 16:38:47 UTC. Parameters and forecast are observations, not permanent configuration.
- [DAO vote bar](../../../workers/alerts-bot/src/domains/dao/vote-display.ts) and [rendered vote fixture](../../../tests/unit/workers/__snapshots__/alerts-bot.dao-vote-summary.test.ts.snap).
- [Live recovery accounting and transaction behavior](recovery-live.md).
- [Recovery data attribution requirements](recovery-data-request.md) and [current consumer schema](../../../lib/clients/yeth/recovery/feed-schema.ts).
- [Existing yETH alert accounting](telegram-alerts.md).
