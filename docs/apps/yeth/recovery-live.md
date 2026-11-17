# Live recovery dashboard and UAT

## Release status

The production and preprod deployment workflows build the live dashboard with `NEXT_PUBLIC_YETH_RECOVERY_LIVE=true`.
The existing `NEXT_PUBLIC_ENABLE_YETH` flag controls public exposure.
Set that flag to `true` in the selected GitHub environment to expose yETH.
No separate live-flag variable is required.
Worker runtime checks use the same exposure flag and verify the yETH page and Safe manifest.

Keep the existing WalletConnect project ID, public Ethereum RPC URLs, global Stats URL, and legacy yETH feed URL configured.
The new recovery endpoint uses the fixed `https://data.dao-ops.com/prod/yeth-recovery.json` source.
It requires no additional production secret or Kong configuration.
Do not set a fork RPC or local recovery source override in production.

Deploy preprod from the reviewed source ref, then deploy the merged master SHA through the production workflow.
Both workflows retain their manual dispatch, environment, and concurrency controls.
The production Worker configuration registers `app.dao-ops.com`.
Verify the existing Cloudflare route for `yeth.yearn.fi` points to that Worker before checking the dedicated host.

The design preview requires separate mock flags outside production.
Live feed errors never select mock data.
Production rejects the local fork transport.

The dashboard supports ordinary injected accounts and accounts with EIP-7702 delegation.
The native Safe Apps connector supports queued proposals and later execution.
Other wallet providers must return an Ethereum transaction hash for the standard transaction path.
Safe and delegated browser acceptance passed on a disposable Ethereum fork.
Deployment and mainnet acceptance require a separate release decision.

## Data sources

The browser requests `/api/yeth-recovery-data` on the application origin.
The server reads `https://data.dao-ops.com/prod/yeth-recovery.json`.
It follows bounded references on that origin and verifies SHA-256 digests over published bytes.
It rejects incompatible schemas, contract addresses, reconciliation errors, inconsistent blocks, and backward publications.

GovApps Stats 0.10.0 provides the v3 head and immutable history pages.
Kong allocations and APY are already part of that publication.
The dashboard does not query Kong separately.
The legacy `yeth.json` remains available for the earlier claim page.

Ethereum provides connected balances, allowance, withdrawal limits, and auction parameters.
These contract reads share one block.
A failed or stale chain read cannot authorize a transaction from the Stats feed.

| Display | Source and meaning |
| --- | --- |
| Public recovery path | Post-claim baseline and protocol reference recovery |
| Personal recovery | Fresh redemption value divided by principal represented by current shares |
| Historical PPS chart | Complete daily observations from collection genesis |
| Historical return | Measured PPS change, including donations and losses |
| Recovery dates | Recurring net income, adjusted for current earning capital and recovery share supply |
| Vault APY and allocations | Kong data embedded in Stats, with separate freshness checks |
| Funding split | Cumulative first allocations to recovery and auctions |
| Claims settled | Settled principal divided by original allocated principal, including verified manual settlements |
| Auction fills | Verified receipts, with personal or reference recovery labelled separately |

Holder counts require a current share supply reconciliation. Represented claims also require the issued principal reconciliation. Personal claims require a matching onchain share balance.
Settled claims require the current programme reconciliation and manual evidence.
The funding panel shows classified amounts and reports unclassified allocations with transaction evidence when available.
The percentage split requires complete funding classification.
Yearn revenue share contributes to auction funding. The vault income forecast uses the current capital and supply and a reconciled income window.
Measured prices remain available when the producer has verified the price observations.
The application also checks for transfers after the indexed block.
Without that proof, it shows executable WETH amounts and leaves personal percentages unavailable.
Unrelated WETH in the wallet never counts as recovered principal.

The reference target is a contract target, not a promise to repay every original claim fully.
Different claim dates can produce different principal per share.
A personal target beyond the contract cap has no estimated completion date.

Historical PPS return and projected recovery use different calculations.
Donations affect measured performance but do not become recurring forecast income.
Future auctions and donations are excluded from the forecast.
Recovery-held Yield Vault assets are not added again to total invested capital.
Auction kicks and recycled proceeds are not new external funding.

## Transaction behavior

The review records the account, chain, round, requested WETH, and maximum shares.
Each fresh review can reuse an existing allowance that covers the quoted cost and does not exceed the remaining shares.
The review shows the whole allowance as the maximum shares spent.
An allowance outside these bounds must be reset before a new exact approval.
Each transaction uses the shared `useTx` pipeline and strict contract simulation.
Failed simulation does not fall back to an unchecked write.

The auction spender is `0x68383672a70Ae3B78e5E2a67D78cf1E379BE3801`.
The wrapper is `0x26868F94684dEC5Ea6fF93ccc06aBde1015ce2CE`.
The application verifies their configured tokens and relationship before an exit.

The deployed `take` call has no minimum payout, expiry, or round binding.
An exact allowance limits shares spent, but does not guarantee the displayed rate.
The review states this limitation and requires acknowledgement.
A local adversarial test demonstrates the limitation after a round restart.

A complete exit can require an approval and two exit transactions.
One initial review covers the selected sequence, account, network, auction round, and original share limit.
The same dialog shows progress and opens each wallet request after the preceding receipt is verified.
The application confirms actual auction proceeds before it reads and redeems the bounded remainder.
The remainder cannot exceed the originally reviewed shares minus the shares actually sold.
New shares received during the sequence are not added to that limit.
Each transaction still requires its own wallet approval.
Cancelling a later request pauses the sequence; Continue does not repeat completed actions.
The transactions are not atomic.
A failed balance refresh preserves the receipt and blocks the next exit until fresh data arrives.
Changing the account or chain discards the earlier review and continuation scope.
Saved pending actions and receipts remain separate for each account and chain.

A Safe proposal ID identifies a proposed action, not an executed Ethereum transaction.
The page shows the pending proposal and blocks another recovery submission.
The browser stores the pending action before it submits the wallet request.
A reload restores that action without another proposal.

The status control asks the Safe provider for an execution transaction hash.
The application reads the receipt from its configured Ethereum RPC.
It validates recovery logs and amounts before it reports success.
A successful outer Safe transaction alone does not establish a successful recovery action.
A partial auction preserves its receipt and advances only the active, consented sequence after canonical execution.

After reload, the page verifies saved results from canonical receipts before it uses their financial amounts.
An unresolved outcome stays pending.
The page does not automatically resubmit it.

A proven cancellation or replacement can consume the original nonce without a verified payout.
The page reports that outcome without adding recovered value and permits a fresh review.
Unit tests cover these cancellation and replacement proofs.
Their real wallet and browser flows have not been rehearsed.

All payouts are WETH.
The page does not unwrap WETH into native ETH.

## Live read review

Use a fresh task environment with Node 24 and the pinned dependencies.
This configuration enables the live page without mock transactions:

```sh
NEXT_PUBLIC_RUNTIME_MODE=development \
NEXT_PUBLIC_USE_MOCKS=false \
NEXT_PUBLIC_E2E=false \
NEXT_PUBLIC_YETH_GLOBAL_DATA_URL=https://data.dao-ops.com/prod/yeth.json \
NEXT_PUBLIC_GLOBAL_DATA_URL=https://data.dao-ops.com/prod/stats.json \
NEXT_PUBLIC_YETH_RECOVERY_LIVE=true \
npx next dev --turbopack --hostname 127.0.0.1 --port 3000
```

Open `/yeth`.
Review the headline, PPS chart, funding, holders, auction history, contracts, and FAQ.
Without a connected wallet, no exit transaction is available.

The source override `YETH_RECOVERY_DATA_URL` accepts a loopback fixture only outside production.
Production accepts only the fixed Stats URL.
The local procedure uses Turbopack to reduce development memory use.
The task VM terminated earlier Webpack previews when they exhausted available memory.
Production validation still uses the repository Webpack build.
Fixtures must satisfy the same schemas and content digests as production.

## Local fork review

Use a disposable Ethereum fork for transaction acceptance.
Never use a funded mainnet wallet for these procedures.
The scripts require loopback RPC, chain ID 31337, and Anvil.

Install Anvil in the task environment.
Start the fork with an archive-capable Ethereum RPC:

```sh
YETH_FORK_SOURCE_RPC=https://YOUR_ARCHIVE_RPC \
YETH_FORK_BLOCK=26342095 \
node scripts/yeth-start-fork.mjs
```

Run the deployed-contract tests:

```sh
YETH_FORK_RPC_URL=http://127.0.0.1:18546 \
npx vitest run tests/fork/yeth-recovery.fork.test.ts
```

Create a browser scenario on a fresh fork:

```sh
node scripts/yeth-fork-scenario.mjs partial
```

The scenarios are `empty`, `partial`, and `full`.
The fixture gives the public Anvil account ten recovery shares.
It changes state only on the disposable fork.
The account is `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`.

Start the application with the fork transport:

```sh
NEXT_PUBLIC_RUNTIME_MODE=development \
NEXT_PUBLIC_USE_MOCKS=false \
NEXT_PUBLIC_E2E=false \
NEXT_PUBLIC_YETH_GLOBAL_DATA_URL=https://data.dao-ops.com/prod/yeth.json \
NEXT_PUBLIC_GLOBAL_DATA_URL=https://data.dao-ops.com/prod/stats.json \
NEXT_PUBLIC_YETH_RECOVERY_LIVE=true \
NEXT_PUBLIC_YETH_FORK_RPC_URL=http://127.0.0.1:18546 \
NEXT_PUBLIC_RPC_URLS=http://127.0.0.1:18546 \
npx next dev --turbopack --hostname 127.0.0.1 --port 3311
```

For automated browser acceptance, run the matching scenario:

```sh
node scripts/yeth-browser-uat.mjs partial
```

The harness injects a browser wallet that sends transactions only to the local Anvil node.
It records actual receipts and screenshots under `.local/yeth/browser`.
The `YETH_UAT_OUTPUT` variable selects another evidence directory.

For Safe or delegated acceptance, prepare a fresh partial-auction scenario first.
Keep the application and fork processes active.
Run these procedures separately:

```sh
YETH_UAT_URL=http://127.0.0.1:3311 \
YETH_FORK_RPC_URL=http://127.0.0.1:18546 \
node scripts/yeth-safe-browser-uat.mjs
```

The Safe harness simulates the trusted Safe Apps parent and uses the installed Safe provider.
It deploys a canonical Safe 1.4.1 proxy with two owners on Anvil.
One owner approves each proposal hash on chain.
The other owner submits `execTransaction`.
The harness delays the auction execution by ten minutes.

The procedure checks proposal identity, pending persistence, duplicate prevention, actual receipts, and the bounded exit sequence.
Use YETH_SAFE_FLOW=auto for automatic next proposals within the open review.
Use YETH_SAFE_FLOW=reload to verify that a reload requires Continue before the remaining redemption.
It does not exercise the hosted Safe service or off-chain signature collection.
Evidence goes to `.local/yeth/safe-browser-auto` or `.local/yeth/safe-browser-reload`.

```sh
YETH_UAT_URL=http://127.0.0.1:3311 \
YETH_FORK_RPC_URL=http://127.0.0.1:18546 \
node scripts/yeth-delegated-browser-uat.mjs partial
```

The delegated harness installs an EIP-7702 designation in the local account state.
It runs the normal injected-wallet browser procedure with that designation present.
The outgoing transactions execute against the actual recovery contracts on Anvil.
This procedure does not exercise authorization signing or a third-party delegation implementation.
Evidence goes to `.local/yeth/delegated-browser`.

Both additional harnesses restore their fork snapshot after the procedure.

On 2026-11-04, both browser procedures passed against a fork from block 26,342,958.
The Safe procedure completed three actual executions from a two-owner Safe.
Every proposal survived a page reload without a duplicate submission.
That earlier iteration required separate consent for the remaining redemption. The single-review sequence below supersedes that interaction.

The actual Safe execution exposed an event-layout difference.
Safe 1.4.1 indexes the execution hash.
The application now validates both indexed and legacy Safe execution events.
The existing pending proposal resolved after that correction without another submission.

The delegated procedure completed approval, partial auction, and redemption from the designated account.
It also passed rejection cases for approval and the remaining redemption.
The final share balance was zero.
The account retained its delegation throughout the procedure.

Successful evidence files include an explicit passed status.
Earlier failed harness attempts remain separate from the final receipts and screenshots.

The ordinary-account full and empty auction procedures also passed on 2026-11-04.
These runs used a fresh fork from block 26,343,068.
The full auction completed approval and purchase with one wei of share rounding dust.
The empty auction completed a direct redemption with zero remaining shares.
Both procedures restored their snapshots.
Their evidence is in `.local/yeth/eoafull-browser` and `.local/yeth/eoaredeem-browser`.
Each snapshot record includes the source fork block.

A final Safe acceptance pass also succeeded after the pending-status and cancellation changes.
It used the same fresh fork source block, 26,343,068.
The three actual execution receipts are in `.local/yeth/safe-browser-final/evidence.json`.

Use a disposable browser wallet with the Anvil account for manual review.
Check that the wallet uses local chain 31337.
Fork receipts must not link to mainnet Etherscan.

The fork creates transfers and auctions that production Stats has never indexed.
The limited local fixture supplies synthetic principal for the seeded Anvil account.
Other accounts still require matching accounting before personal percentages become available.
WETH amounts, approval caps, and receipts come from the fork.
A separate accounting rehearsal can run the producer against the same fork.

## Browser regression suites

Use an optimized mock build for the broad browser suites.
The Next development server produced intermittent router initialization failures before the test bridge mounted.
A longer assertion timeout does not resolve that failure.

For smoke and full tests, build with these public flags:

```sh
NEXT_PUBLIC_RUNTIME_MODE=development \
NEXT_PUBLIC_E2E=true NEXT_PUBLIC_USE_MOCKS=true \
NEXT_PUBLIC_RPC_URLS=http://127.0.0.1:8546 \
NODE_OPTIONS=--max-old-space-size=3072 npm run build

E2E_PORT=3312 \
E2E_WEB_SERVER_COMMAND='npx next start --hostname 127.0.0.1 --port 3312' \
NEXT_PUBLIC_E2E=true NEXT_PUBLIC_USE_MOCKS=true \
npx playwright test --project=smoke --project=full --workers=1
```

The wallet project requires another build with `NEXT_PUBLIC_E2E=false` and `NEXT_PUBLIC_USE_MOCKS=true`.
Set `NEXT_PUBLIC_YETH_RECOVERY_PREVIEW=true` in that build to include the recovery design preview.
Use the same flags when you run the tests.
A local dummy `NEXT_PUBLIC_WC_PROJECT_ID` keeps the WalletConnect option available for connector tests.
The live WalletConnect QR test remains a separate opt-in procedure.

Run the wallet project and the two recovery preview files against this optimized server:

```sh
npx playwright test --project=wallet --workers=1
npx playwright test tests/e2e/smoke/yeth-recovery.spec.ts \
  tests/e2e/full/yeth-recovery.spec.ts --project=smoke --project=full --workers=1
```

Keep fork transport flags unset for both builds.
These mock artifacts are test artifacts and must not be deployed.

The final 2026-11-04 acceptance run passed 71 smoke tests and 81 full tests.
Each baseline project skipped four gated cases.
The native wallet project passed 11 tests and skipped its opt-in live WalletConnect QR case.
All seven recovery preview cases passed in the separate preview configuration.

## Producer cadence before rollout

The initial production observation exceeded the advertised 300-second snapshot age between publication cycles.
The owner changed top-level `intervalSeconds` to `120` in the production configuration.
This setting controls the idle wait after each cycle.
It does not reset the checkpoint or require another backfill.
The separate `limits.cycleSeconds` field controls the cycle timeout.

At the earlier processing speed, the change reduces estimated peak age from about 438 seconds to 258 seconds.
A later observation covered 21 samples over 610 seconds.
It recorded four publications with intervals of 184, 181, and 184 seconds.
The largest sampled observation age was 250 seconds.
Every sample returned HTTP 200 with complete accounting and current history.
These measurements support the owner-reported configuration change.
They do not establish a maximum age under slow RPC responses or catch-up work.
Slow RPC responses or catch-up work can still exceed the freshness limit.
Other collectors share the unauthenticated GitHub allowance for the originating IP.

## Auction timing and production presentation

The Auction tab shows the contract schedule, current offer, and 50%, 75%, and 100% milestone times.
The calculation uses fresh contract parameters and exact discrete price steps.
It does not depend on indexed historical prices or extrapolate through invalid offers.
A minimum-price cutoff can end the round before 100%. That milestone says “Not reached this round”.
Known personal claim attribution determines personal auction recovery. Otherwise, the chart labels the protocol reference basis.
The auction rate applies to the shares sold there. A combined exit separately weights auction and vault proceeds.
Displayed percentages never round an incomplete recovery up to 100%.
Hover, touch, and keyboard inspection show the scheduled rate and exact UTC time.
Available liquidity can disappear before any scheduled milestone.

The main action names the auction and includes recovery when personal attribution is available.
One shared header wallet control manages connected accounts.
The page has no separate test-network badge. Local fork configuration remains restricted to development and chain 31337.
Confirmed exit receipts appear inside the recovery summary. A completed sequence shows its actual combined payout.
After reload, the summary labels the verified last action and shows only that action’s payout.
Switching away from the recovery network hides its cached completion.
Raw test hashes and repeated test notices stay out of the main page.
Normal wallet confirmation never asks for a transaction hash.
An uncertain response retains its pending record. Hash recovery is behind an explicit troubleshooting action.

## Local position fixture

The public Anvil account receives at most ten synthetic recovery shares for this UAT.
Its local principal equals actual remaining shares multiplied by the published full-recovery PPS target.
That basis decreases after actual exits and does not include unrelated wallet WETH.
The override requires the local fork environment, chain 31337, the exact fixture account, and a fresh chain observation.
It never supplies principal for a production wallet, another account, or an oversized balance.
Public history freshness uses wall time. Auction timing uses the fork clock plus elapsed time since the latest chain observation.
A failed chain refresh stays stale. The fixture does not alter production history, holder accounting, or programme totals.

Run destructive browser checks on a separate local fork while an owner review is active.
Preserve the owner's current fork state. Do not reset that chain to run automated scenarios.

## Acceptance cases

- No auction: review and redeem the current position.
- Full auction: approve the exact cap and take the offer.
- Partial auction: confirm “Exit fully” as the default.
- Partial auction only: retain the remaining shares.
- Full exit: give one initial consent; confirm sequential wallet requests within the same progress dialog.
- Reject approval or redemption: retain the correct balance and completed receipt.
- Change wallet or chain: discard the earlier review.
- Change auction round or exhaust liquidity: reject the stale quote.
- Fail the post-auction refresh: preserve the payout and block the next write.
- Queue a Safe proposal: show pending status without an Ethereum receipt link.
- Reload a pending Safe action: restore its scope without another proposal.
- Execute a Safe proposal: resolve its actual transaction hash and validate the recovery receipt.
- Complete a partial Safe auction: queue redemption only after canonical execution of the matching auction proposal.
- Reload a completed auction: require Continue before the bounded remaining redemption.
- Receive new shares mid-exit: preserve them outside the reviewed share limit.
- Normal wallet signing: show wallet confirmation, without a transaction-hash input.
- Use an EIP-7702 account: accept the normal injected-wallet path and validate its receipts.
- Stale accounting: hide personal percentages without inventing claim values.
- Corrupt feed pages: show unavailable data without mock fallback.
- Narrow viewport and keyboard navigation: keep controls and amounts usable.

Run repository checks after these cases.
Record the source commit, fork block, feed observation, screenshots, and test results.
Stop the preview and fork after the review.
Export source and evidence before shutting down the task VM.

## PPS chart

The PPS chart keeps zero and the full reference target on its vertical axis.
The current target comes from `recoveryVault.targetAssetsPerShareWad` in the verified publication.
The chart does not set the target to one WETH per recovery share.

Solid values are measured historical observations, plus the latest verified PPS observation.
A dashed line extends to the same reference target date shown in the headline.
It uses the recurring-income forecast, without compounding or assumed future donations and auctions.
The time axis remains linear, so a short history occupies little space beside a decades-long estimate.
Hover, tap, or use arrow keys to inspect precise values. Home and End select the first and last points.
Stale or incomplete accounting removes the projection but retains the full target scale.

## Wallet support and manual review

Wallet behavior determines the transaction path.
The application does not reject an account because it has deployed or delegated code.
A normal wallet must return an Ethereum transaction hash.
A native Safe Apps connection can return a proposal ID first.
The pending-action record preserves that distinction.

The page prevents duplicate submissions while execution remains unresolved.
The status control only reads the existing action.
It does not resubmit the proposal.
A wallet rejection before submission releases the pending action.
An unknown submission result remains unresolved until the application can establish its status.

A Safe proposal can execute after the displayed auction quote changes.
The deployed auction still has no minimum payout, expiry, or round binding.
The exact allowance limits shares spent but cannot preserve the earlier recovery rate.
The review requires acknowledgement of this limitation.

An ordinary hardware-wallet account uses the standard transaction path.
A hardware signer used through Safe follows the Safe proposal and execution process.

Use the existing fork scripts for manual review on either a development host or a laptop.
Keep both the application and Anvil RPC on loopback.
If the fork runs on another machine, forward both ports over SSH to your laptop's localhost.
The browser and its wallet must reach the same fork RPC on port 18546, with chain ID 31337.
Use a disposable browser-wallet profile and the public Anvil test account.
The fork only reads upstream state; scenario changes and submitted transactions stay local.

The production feed cannot describe a position created only on the fork.
Use live Stats for public history and fork receipts for transaction behavior.
The seeded test account uses the synthetic principal described in Local position fixture.
Other personal recovery percentages require matching Stats accounting.
A complete accounting rehearsal requires a producer or fixture that includes the fork events.
