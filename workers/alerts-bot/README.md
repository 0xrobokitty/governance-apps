# Governance alerts bot

One Cloudflare Worker scans confirmed Ethereum events and routes six alert
domains to separate Telegram chats. One Durable Object class is instantiated once
per domain:

| Domain | Object name | Contents |
| --- | --- | --- |
| stYFI | `alerts:styfi:v1` | stYFI and stYFIx |
| veYFI | `alerts:veyfi:v1` | legacy and migrated veYFI plus LLYFI |
| yETH | `alerts:yeth:v1` | recovery claims, withdrawals, and protocol updates |
| Teams | `alerts:teams:v2` | team lifecycle, accounting, funding, and bonuses |
| YBC | `alerts:ybc:v2` | on-chain proposals, membership, rewards, and collective power |
| DAO | `alerts:dao:v3` | proposals, votes, deadlines, moderation, execution, and governance configuration |

All six committed delivery flags are enabled. New installations must configure
their final chats before enabling delivery.

## Runtime model

- A one-minute cron invokes each enabled object independently.
- Each object owns one cursor, event receipts, Telegram backoff, and its chat.
- New objects begin at their domain's canonical start block. Replay and live
  alerts use the same scanner, exact-block context, renderer, and sender.
- User messages include the affected account's event-block position. They do
  not reconstruct balances from watched logs.
- Direct stYFI and LLYFI calls are attributed to the sender. Strict Safe
  `execTransaction` wrappers are attributed to the Safe only for zero-value
  calls to the expected protocol contract; other Safe wrappers fail closed.
  Other indirect LLYFI redemptions remain anonymous instead of guessing through
  router data. yETH claims use their indexed event account and vault companions
  without a transaction-envelope lookup.
- Telegram delivery is sequential, capped at five messages per domain run, and
  obeys Telegram's `retry_after` response.
- The only accepted duplicate window is Telegram accepting a message before
  the event receipt can be written.
- A cursor hash mismatch, malformed monitored event, unsupported action, or
  required context failure stops that domain at its saved cursor.

yETH claim and withdrawal messages are event-driven. Debt paydown is derived
from claim/accounting changes. Recovery and yield-capacity messages are
evaluated at one fixed 7,200-block checkpoint and sent only when their change
meets the configured threshold. There is no daily impact digest.
Canonical V3 report/fee mints and vault-owned profit-lock burns update the yETH
share ledger without creating user alerts. Deposits and withdrawals still
require their corresponding mint and burn events; standalone user burns fail
closed.

DAO reads the deployed Voting and pinned Voter contracts. It also locates
deadline blocks when no contract event occurs. Reminders precede voting and
execution deadlines by 24 hours and 1 hour. See the
[DAO catalogue and rollout](../../docs/apps/dao/telegram-alerts.md).
Each transaction and proposal has one vote message and receipt. Personal rows,
YBC/stYFIx collective changes, and a threshold bar share that message.
Canonical parent-state replay supplies transaction changes when totals reconcile.
Optional history failures fall back to labelled end-of-block totals.
Legacy per-log receipts suppress already reported rows during an interrupted upgrade.
The grouping change preserves the current DAO object and cursor.

DAO proposal titles come from the website's `/api/dao-data` route through the
`DAO_APP` service binding. The website owns `DAO_DATA_URL`; no duplicate feed
configuration is needed. The bot verifies content against the on-chain digest
and caches it for every proposal alert. Feed delays receive bounded retries.
The bot makes no direct IPFS requests.

DAO generation `v3` deliberately replays from block 25,883,944 after the website
service-request fix, with enriched titles and message icons. It preserves both old DAO objects and all other
streams. The authenticated status response includes each `objectName`.

There is deliberately no health monitor or Telegram warning subsystem. Failures
produce structured logs and appear in the authenticated status response.
Failure logs identify the safe runtime stage and controlled RPC or Telegram
error metadata without including provider payloads, credentials, destinations,
message bodies, or account context. DAO protocol alerts share this error model.

## Configuration

Required secrets when any domain is enabled:

- `RPC_URL` (archive-capable; YBC additionally requires Geth-compatible
  `debug_traceTransaction` call traces with logs for non-pinned final-day votes)
- `TELEGRAM_BOT_TOKEN`
- `STYFI_TELEGRAM_CHAT_ID`
- `VEYFI_TELEGRAM_CHAT_ID`
- `YETH_TELEGRAM_CHAT_ID`
- `TEAMS_TELEGRAM_CHAT_ID`
- `YBC_TELEGRAM_CHAT_ID`
- `DAO_TELEGRAM_CHAT_ID` when DAO is enabled
- `ADMIN_TOKEN` for `GET /status`

Control each domain independently
with `ALERTS_STYFI_ENABLED`, `ALERTS_VEYFI_ENABLED`, `ALERTS_YETH_ENABLED`,
`ALERTS_TEAMS_ENABLED`, `ALERTS_YBC_ENABLED`, and `ALERTS_DAO_ENABLED` after their final private
chats, secrets, and replay reviews are ready.
`DAO_ALERT_VOTES_ENABLED` defaults to `true`. Set it to `false` for lifecycle
and configuration messages without grouped Vote messages.

The paid Workers plan removes the old free-tier pressure to micro-budget every
subrequest. The remaining bounds protect providers and Telegram without adding
a general request governor: 10,000-block log ranges, at most six ranges per
domain run, RPC batches of 25, and five Telegram messages per domain run.
Transaction call traces are capped at 8 MiB and are requested only when a
final-day YBC vote used an aggregator whose vote-time weight cannot be
reconstructed from the pinned wrapper's packing rule.
Configuration parsing requires exactly six confirmations and rejects overrides
above any of those range or message limits.

See [the operational runbook](../../docs/alerts-bot.md) and
[the approved message catalogue](../../docs/alerts-bot-message-catalogue.md).
The [yETH Recovery & Auctions upgrade](../../docs/apps/yeth/telegram-alerts.md)
uses the existing channel and preserved state. `YETH_UPGRADED_MESSAGES_ENABLED`
activates it once; disabling this flag afterward pauses yETH without skipping auction events.
Teams and YBC have a separate
[acceptance specification](../../docs/alerts-bot-teams-ybc-spec.md) and
[review ledger](../../docs/alerts-bot-teams-ybc-review-resolution.md).
