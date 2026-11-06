# yETH Recovery & Auctions bot

Implemented 6 November 2026. Deployment is pending.

This upgrade uses the existing yETH channel and bot. It changes future messages only.
It does not edit, delete, replace, or replay messages already sent.
The [message catalogue](alerts-message-catalogue-proposal.md) contains the copy and design decisions.

## Delivered behavior

| Event | New message behavior |
| --- | --- |
| Auction opening | Reference recovery bar, available WETH, actual deadline, app and transaction links. |
| Active auction | One status per day, measured from opening; one final-hour reminder. |
| Confirmed take | Every transaction posts, including small and partial takes. Multiple fills share a message. |
| Final take | One combined take and filled-round outcome. No misleading full recovery bar. |
| Expiry or stop | One outcome with recorded participation. Sweeps and disabled auctions are not fills. |
| Claim or direct exit | Compact payout, original principal or verified recovery, and full/partial exit when known. |
| Manual payouts | Verified recipients grouped by transaction. Large batches use bounded parts. |
| Funding | Immediate at 1 WETH or more; smaller amounts enter the weekly summary. Opening absorbs its auction funding alert. |
| Recovery update | Weekly when figures change. Merged with a due daily status or milestone. |
| Decline | At least 0.10 percentage points of reference recovery, or 0.5% of earning capital after known outflows. |
| Milestone | First crossing of 50%, 75%, and the vault's actual `TARGET_PPS`. |
| Wrapper settlement | Verified principal retired appears in a status or outcome, or one later settlement summary. |

A take replaces a nearby scheduled reminder, never another take. The five-message per-run limit remains a delivery limit, not a daily trade cap.
Pending takes resume on later cron runs. A transaction with more than eight fills shows its total, count, and transaction link after the first eight rows.
Manual payout batches retain all recipients across additional messages.

The 20-cell recovery bar uses a fixed 0–100% scale. Its marker records the opening rate.
It shows neither elapsed time nor the proportion of auction funds taken.
The final cell stays empty below exact 100% reference recovery.
Auction end time comes from the contract's stepped price curve and floor, with a seven-day maximum.
It can occur earlier and below an executable 100% offer.

All payments are WETH. Broadcast auction rates use the protocol reference; personal rates can differ.
Optional holding comparisons use the app's validated recurring-income forecast, only when current accounting agrees with the chain snapshot.
Missing forecast or ENS data omits that enrichment. It does not prevent a verified payout message.
Delayed takes still post, with their observation date and transaction link; stale opportunity copy and daily reminders are omitted.

The bot does not infer a holder benefit from a take alone. Shares first move into wrapper custody.
Only a verified wrapper redemption retires their tracked principal.
The remaining-holder claim total excludes protocol custody.
The optional estimated pace benefit is omitted until a reconciled per-settlement source is available.
The optional quote-outage notice Q1 is not enabled. Required RPC evidence failures preserve the cursor and appear in status/logs.
The channel introduction P1 remains a manual new post and pin; deployment does not modify an existing introduction.

## State and activation

Keep these existing identities:

| Resource | Identity |
| --- | --- |
| Worker | `governance-alerts-bot-v2` |
| Binding and class | `ALERT_STATE` / `AlertState` |
| yETH object name | `alerts:yeth:v1` |
| Stored state and receipts | `state:v1` and existing `sent:` keys |
| Telegram destination | Existing `YETH_TELEGRAM_CHAT_ID` |

`YETH_UPGRADED_MESSAGES_ENABLED=true` activates the upgrade on its first successful run.
The bot saves a cutover at the six-confirmation head before it sends anything.
The existing cursor and receipts remain in place. Any unfinished legacy backlog completes with its original rendering through that boundary.
New messages apply to later blocks. Do not reset storage or move the cursor to activate the change.

An auction already active at activation is adopted silently. Its later messages use `Recorded since upgrade` for totals.
They do not invent earlier participation or replay its opening. An inactive round produces no opening message.

Before delivery, the bot stores the pending range's terminal block and hash.
Retries reuse that range and check individual message receipts. Accounting commits only after the range's messages are delivered.
A changed pending block or cursor hash pauses processing for investigation.
The existing Telegram limitation remains: a send accepted immediately before a receipt-write failure can duplicate on retry.
No Telegram edit or delete API is used.

The upgrade adds no package dependency, secret, Durable Object migration, or website deployment.
It reuses `DAO_APP` for optional `/api/yeth-recovery-data` enrichment.
The old `YETH_DAILY_*` settings apply only before the cutover.

## Deploy in place

Use the reviewed checkout containing this change. If integrating through `agent/integration`, merge the bot changes there first and run these commands from that checkout.
The commands below use the current bot workspace and fish.

```fish
cd /Users/hydra/Developer/yearn/governance-apps.agent.bot
git status --short
git branch --show-current
git log -1 --oneline
npx wrangler whoami
npx wrangler deployments status --config wrangler.alerts.jsonc
```

Read the existing authenticated status before deploying. Prefer to deploy when yETH has `caughtUp: true` and no error.
Keep the same URL and credentials; do not create a new channel, bot, or state object.

```fish
read --prompt-str 'Existing alerts Worker URL, without a trailing slash: ' alerts_url
read --silent --prompt-str 'Existing ADMIN_TOKEN: ' alerts_admin_token
printf 'header = "Authorization: Bearer %s"\n' "$alerts_admin_token" \
  | curl --config - --fail --silent --show-error "$alerts_url/status" \
  | jq '.domains[] | select(.domain == "yeth")'
```

Check the release and configuration:

```fish
npm run typecheck
npm run lint
npm run test
rg '"name"|"ALERTS_.*_ENABLED"|"YETH_UPGRADED_MESSAGES_ENABLED"' wrangler.alerts.jsonc
npx wrangler deploy --dry-run --config wrangler.alerts.jsonc
```

The committed config enables all six domains and the yETH upgrade.
Preserve any intentional production overrides before deployment.
`--keep-vars` preserves additional remote variables; explicit values in the config still apply.
See the [Wrangler deploy reference](https://developers.cloudflare.com/workers/wrangler/commands/workers/#deploy).

Deploy the bot:

```fish
npx wrangler deploy --config wrangler.alerts.jsonc --keep-vars
```

Follow logs from a second terminal in the same checkout:

```fish
npx wrangler tail --config wrangler.alerts.jsonc --format pretty
```

After the next one-minute cron invocation, repeat the status read:

```fish
printf 'header = "Authorization: Bearer %s"\n' "$alerts_admin_token" \
  | curl --config - --fail --silent --show-error "$alerts_url/status" \
  | jq '.domains[] | select(.domain == "yeth")'
set -e alerts_admin_token
```

Verify `messagingVersion: 2`, a populated `messagingCutoverBlock`, an advancing cursor, and `lastErrorCode: null` once caught up.
`messagingPendingBlock` should clear after delivery. A temporary `message_cap_reached` means the next cron run continues the queue.
Check `alert_run_failed` and `alert_dispatch_failed` logs. An optional `alert_yeth_forecast_unavailable` warning does not block takes.
There may be no immediate Telegram message: activation itself is silent.

## Pause and recovery

To pause upgraded yETH processing while keeping its cursor and other configured domains:

```fish
npx wrangler deploy --config wrangler.alerts.jsonc --keep-vars \
  --var YETH_UPGRADED_MESSAGES_ENABLED:false
```

After activation, this flag pauses yETH instead of falling back to the legacy scanner.
Status reports `messaging_paused`. The normal deploy command resumes processing and drains pending confirmed events.
Alternatively, `--var ALERTS_YETH_ENABLED:false` disables the entire yETH stream.

Do not roll back to an older binary with yETH enabled. It would advance the shared cursor without scanning auctions.
If an older binary is required, deploy it with `ALERTS_YETH_ENABLED:false`, keep storage intact, and keep yETH disabled until the upgraded scanner is restored.
Do not reset receipts or replay into the public channel as a recovery step.

The scanner stops on malformed receipts, changed contract identities, or unsupported ambiguous round transitions.
For example, taking an old round and restarting it in the same block requires investigation rather than guessing a price attribution.
Inspect the safe `yeth_*` error code in status, fix the evidence handling, then resume at the retained cursor.

## Accounting regression retained

The legacy scanner still verifies manual recovery payouts by pairing a positive Yield Vault withdrawal with one `SetClaim(account, 0)`.
Both must occur in the same canonical transaction, for the same recipient with a prior positive entitlement.
A clearance alone, ambiguous withdrawals, and cross-transaction matches do not prove a payout.
Ordinary claim attribution remains separate.

The [12 October 2026 fixture](../../../tests/fixtures/yeth-manual-recovery-26176531.json) covers transaction
[`0x171e78…e6052`](https://etherscan.io/tx/0x171e78e5e0914fb3c8b24e43186199d6533646fad6cd0cb119cfc784ac9e6052).
Its three manual payouts total 11.362001246718367622 WETH and clear 35.549813526882056495 ETH of entitlements.
The Yield Vault asset decrease is fully explained by those payouts; it is not a strategy loss.
Legacy checkpoints retain their corrected same-checkpoint debt denominators and retry behavior.
The upgraded scanner exposes those verified manual pairs to the compact renderer only for new blocks after activation.
Previously sent messages, including the historical October message, remain unchanged.

## Review and integration notes

Tests cover silent activation, an active round at cutover, legacy backlog, receipt preservation, retries and message caps, canonical receipts, batched fills, wrapper retirement, manual payouts, cadence, expiry, milestones, escaping, and payout-versus-loss attribution.
Validation on 6 November: typecheck and deployment dry run passed; 2,982 tests passed and seven were skipped.
Lint passed with one existing unused-import warning in the unrelated DAO proposal action panel.
No frontend route or wallet flow changes; browser e2e is not required for this bot-only change.
Merge the new domain modules with the runtime/config changes and docs as one release. No separate producer release is required.
