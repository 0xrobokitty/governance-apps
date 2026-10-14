# yETH Telegram alert accounting

The alerts bot tracks claim flows, Recovery Vault withdrawals, and daily changes in vault assets.
The [operations guide](../../alerts-bot.md#yeth-cadence) defines the checkpoint cadence and materiality threshold.

## Manual recovery payouts

Ordinary claims supply their underlying outflow through the Claim contract's `Claim` event.
Direct manual payouts can use a Yield Vault withdrawal and a claim clearance instead.
The scanner includes these payouts in `Net claim flow` when all these conditions hold:

- Both events occur in the same canonical transaction.
- The withdrawal comes from the configured Yield Vault.
- The recipient has a positive entitlement before the transaction.
- Exactly one Yield Vault withdrawal pays that recipient, with positive assets and shares.
- Exactly one entitlement event concerns that recipient, and it is `SetClaim(account, 0)`.

The event order can place the payout before or after the clearance.
The scanner counts the withdrawal once and keeps it separate from Recovery Vault user flows.
Ordinary claims retain their existing attribution.
The manual pair does not create an ordinary claim notification.
The clearance retains the existing `SetClaim` entitlement accounting.

A clearance alone does not prove a payout.
The scanner does not infer a match across transactions or between different claimant and recipient addresses.
Ambiguous and unmatched withdrawals remain outside attributed claim flow.
The residual category can therefore include unclassified movements. It does not establish a strategy loss by itself.

## Consistent checkpoint balances

Each coverage percentage uses the assets and debt from one checkpoint:

```text
previous coverage = previous checkpoint assets / previous checkpoint debt
current coverage  = current checkpoint assets / current checkpoint debt
residual change   = current assets - previous assets - net claim flow
```

Recovery Vault coverage uses the stayed debt from each checkpoint.
Its shortfall comparison uses the corresponding asset and stayed-debt balances.
Yield Vault coverage uses the outstanding debt from each checkpoint.
A payout can reduce Yield Vault assets while coverage improves because outstanding debt also decreases.

The stored `yethMetrics` tracks current debt between checkpoints for transaction alerts.
The separate `yethCheckpointMetrics` preserves the last complete checkpoint for daily comparisons.
Successful processing commits the new checkpoint metrics and resets daily flows together.
A failed send or message cap preserves the previous cursor, checkpoint metrics, and flows for retry.

## Regression: 12 October 2026

[Transaction `0x171e78…e6052`](https://etherscan.io/tx/0x171e78e5e0914fb3c8b24e43186199d6533646fad6cd0cb119cfc784ac9e6052)
executed at block 26,176,531, at 12:55:47 UTC.
It paid three direct manual claims and cleared their entitlements in the same transaction.

| Recipient | Payout, WETH |
| --- | ---: |
| `0xFC5453ACF7807455d6bC6406a06d6A6Bb26DFf55` | 9.271996944457152436 |
| `0x1BF44e3b0DfC84046a416c2Cd2040860EC593e53` | 1.741670251884345989 |
| `0x55Bc991b2edF3DDb4c520B222bE4F378418ff0fA` | 0.348334050376869197 |
| Total | 11.362001246718367622 |

Yield Vault assets decreased from 2,447.782236979836982529 ETH at block 26,170,897 to 2,436.420235733118614907 ETH at block 26,178,097.
The payouts account for the entire decrease, so the residual change is zero.
The corrected daily message includes `Net claim flow: -11.36 ETH` and omits the zero loss row.

The clearances removed 35.549813526882056495 ETH of outstanding entitlements.
Using the alert's rounded final debt of 2,736.68 ETH, coverage changes from approximately 88.30% to 89.03%.
The previous 89.44% baseline mixed the old assets with the reduced debt.

The [fixture](../../../tests/fixtures/yeth-manual-recovery-26176531.json) contains the verified event subset, checkpoint assets, and cleared entitlement amounts.
The tests use the alert's rounded remaining debt, rather than an independently reconstructed complete historical debt ledger.
All payout and asset amounts in the fixture are exact integer wei values.

## Integrator and rollout notes

The new checkpoint field is optional when the bot reads legacy stored state.
At an exact checkpoint, the bot can adopt the legacy metrics without a storage reset.
Between checkpoints, legacy state cannot reconstruct the previous debt balance.
The next checkpoint establishes a fresh baseline and suppresses that interval's daily metric alerts.
Later checkpoints use complete stored baselines normally.

Existing sent-message receipts remain valid. The change does not resend or edit historical messages.
A private replay from before the transaction is necessary to reproduce the corrected historical message.
The regression runs offline and does not send Telegram messages or call a live RPC.

Validation covers the historical payouts, false matches, ordinary-claim deduplication, genuine residual losses, and Recovery Vault coverage.
It also covers stored-state migration, multiple scan ranges, restarts, failed delivery, and retry without duplicate attribution.
The change adds no dependency or environment variable.

## In-place rollout commands

These commands upgrade the existing `governance-alerts-bot-v2` Worker from `agent/integration`.
The initial private-replay procedure in the operations guide does not apply to this patch.
Keep the existing Worker name, `alerts:yeth:v1` object name, storage, secrets, and sent-message receipts.
No storage reset, new Durable Object migration, or historical replay is required for the live upgrade.

Run these commands in fish:

```fish
cd /Users/hydra/Developer/yearn/governance-apps.agent.integration
git status --short
git branch --show-current
git log -1 --oneline
npx wrangler whoami
npx wrangler deployments status --config wrangler.alerts.jsonc
```

The branch must be `agent/integration`, and the working tree must be clean.
Review the configured domain flags before deployment:

```fish
rg '"name"|"ALERTS_.*_ENABLED"|"YETH_DAILY_' wrangler.alerts.jsonc
npx wrangler deploy --dry-run --config wrangler.alerts.jsonc
```

The committed configuration enables all six domains.
If production intentionally disables a domain, preserve that choice before deployment.
The `--keep-vars` option preserves additional remote variables, but explicit configuration values still apply.
The [Wrangler command reference](https://developers.cloudflare.com/workers/wrangler/commands/workers/#deploy) describes these options.

Deploy the patch:

```fish
npx wrangler deploy --config wrangler.alerts.jsonc --keep-vars
```

In a second terminal, follow the Worker logs:

```fish
cd /Users/hydra/Developer/yearn/governance-apps.agent.integration
npx wrangler tail --config wrangler.alerts.jsonc --format pretty
```

After the next one-minute cron invocation, read the authenticated status:

```fish
read --prompt-str 'Alerts Worker URL, without a trailing slash: ' alerts_url
read --silent --prompt-str 'Existing ADMIN_TOKEN: ' alerts_admin_token
printf 'header = "Authorization: Bearer %s"\n' "$alerts_admin_token" \
  | curl --config - --fail --silent --show-error "$alerts_url/status" \
  | jq '.domains[] | select(.domain == "yeth")'
set -e alerts_admin_token
```

Check that the cursor advances, `lastErrorCode` is null, and `caughtUp` becomes true.
Check the logs for `alert_run_failed` and `alert_dispatch_failed` events.
The first daily checkpoint can establish a baseline without a daily alert, as described above.
The upgrade does not correct the previously sent 12 October message.

If yETH reports a new failure, pause its processing while you investigate:

```fish
npx wrangler deploy --config wrangler.alerts.jsonc --keep-vars \
  --var ALERTS_YETH_ENABLED:false
```

This override preserves yETH storage and leaves other configured domains enabled.
After you resolve the failure, the normal deploy command restores the committed yETH enable flag.

The merged code passed typecheck, lint, and all 2,155 tests.
The dependency policy check, catalogue checks, and deployment dry run also passed.
