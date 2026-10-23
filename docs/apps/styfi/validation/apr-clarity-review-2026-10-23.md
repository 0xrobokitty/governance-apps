# APR clarity and governance power review

This follow-up addresses the October 23 review of the staking and DAO previews.
All changes remain on `codex/styfi-vote-boost-apr` in the current worktree.
No production deployment is included.

## Interface changes

| Before | After |
| --- | --- |
| stYFIx comparison repeated participation caveats. | The description says “Delegate your vote to YBC to earn maximum APR.” |
| The staking estimate appeared below the amount input, with a separated label and value. | An adjacent label and rate appear beside the mode controls, above both transaction tabs. |
| Each estimate repeated boost ranges, participation details, and an older-price warning. | Estimates show the rate or range. Calculation details stay in tooltips. |
| “Your total APR” did not identify the reward period. | “Current APR” describes the current reward stream. Its tooltip names the current and participation epochs. |
| “Your Vote Boost” labeled an additive percentage contribution. | “Vote Boost rewards” labels that APR contribution. The applied multiplier appears separately as `2.5×`. |
| The visible multiplier used current participation, while APR used last epoch's rewards. | The visible multiplier uses the completed reward epoch. Next-epoch participation appears separately inside the tooltip. |
| Repeated orange price warnings and an asterisk appeared during normal oracle operation. | The reader uses the latest oracle round and the correct heartbeat. A genuinely old quote has one timestamp detail in the APR tooltip. |
| Account Summary omitted YBC membership. | A collective-rewards row shows the member's reward share and proportional YFI backing. It does not add collective assets to personal capital. |
| DAO voting power appeared inside the proposal section with a small tooltip. | An independent expandable section appears above Proposals. |
| The DAO number had no system denominator. | A complete indexed snapshot supplies system voting power and the wallet's share at the same block. |

## Price diagnosis

The producer checks the oracle every 60 seconds. Its `price.rs` uses a three-hour freshness limit.
The configured YFI/USD oracle has a 24-hour heartbeat and a 1% deviation threshold.
An unchanged quote can therefore remain valid for more than three hours.

The public feed observation contained:

- Feed block: `26255613`; timestamp: `1792761971`.
- Price: `218333` USD cents; oracle update: `1792738259`.
- Quote age: `23712` seconds, about 6 hours 35 minutes.
- Producer status: `stale`; producer maximum age: `10800` seconds; oracle error: `null`.

A direct oracle read at block `26255635` returned `218333644000` with eight decimals.
It had the same update timestamp. The feed was reporting the latest oracle round.

The app now reads `latestRoundData`, `description`, and `decimals` at the APR snapshot block.
It validates the round and checks age against 86400 seconds.
If that read fails, it can use the feed quote. Only a verified YFI/USD source can override the producer's age-only warning.
Cached/error status and genuinely old quotes retain their freshness status.
Feed publication time is never presented as the price update time.

Sources: [Chainlink YFI/USD](https://data.chain.link/ethereum/mainnet/crypto-usd/yfi-usd),
[Chainlink feed directory](https://reference-data-directory.vercel.app/feeds-mainnet.json),
and [oracle update triggers](https://docs.chain.link/architecture-overview/architecture-decentralized-model).
The producer should also change its YFI-specific limit to match the verified heartbeat.
That separate service is not changed or deployed by this branch.

## Applied boost and YBC

The [live verification record](vote-boost-applied-mainnet-2026-10-23.json) checks block `26255652`.
Current epoch `18` uses the completed reward epoch `17` for Vote Boost.
The completed epoch has two counted proposals and two votes for the checked member.
Historical component scales recover an applied maximum of `2.5×`.

YBC membership allocates income according to existing eligible staking balances.
It does not expose a separate personal stake or withdrawal queue.
Personal cooldowns remain in the underlying staking positions.
The YBC row's collective backing represents income allocation, not an owned or withdrawable token balance.

## Verification

The [integrated voting-power check](../../dao/validation/voting-power-mainnet-2026-10-23.json) uses block `26255712`.
It validates the local indexed snapshot, production YBC roster, same-block personal reads, and canonical block hash.
The system total is `2647.123446343477236266` YFI voting units:

- Matured staking weight: `1312.362506740752357048`.
- Active migrated veYFI: `903.732994345677422602`.
- Delegated stYFIx pool: `431.027945257047456616`.

The checked public member has `287.931143` direct voting units, or `10.87%` of the total.
With all eligible YBC members participating, its estimated influence is `626.477946` units, or `23.66%`.
The YBC estimate allocates existing collective and delegated power; it does not increase the system total.

The initial index took 92.8 seconds. It found 121 addresses, excluded the delegated address from direct sums, and retained 111 positive direct accounts.
The local watcher reuses this index and refreshes every minute.
Production requires a published snapshot and `NEXT_PUBLIC_DAO_VOTING_POWER_URL`; no contract upgrade is required.
The [producer handoff](../../dao/voting-power.md) describes the source events, coverage checks, freshness, and rollout.

Independent reviews covered applied reward scales, YBC capital attribution, price validation, complete holder enumeration, and pool accounting.
Review corrections included timestamp type handling, block-time equality, expected WeightMeasure validation, and expiry during an epoch rollover.

Live local review:

- [stYFI with live data](http://127.0.0.1:3108/styfi).
- [DAO with live data and wallet connections](http://127.0.0.1:3108/dao).
- [Mock stYFI scenarios](http://127.0.0.1:3107/styfi).
- [Mock DAO scenarios](http://127.0.0.1:3107/dao).

The live wallet chooser was checked in the browser. It offers injected wallets and WalletConnect.
No wallet transaction was submitted during verification.

Regression checks:

- Type checking and lint pass.
- The complete unit suite passes: 202 files and 2,245 tests.
- The configured snapshot origin also passes all eight security-header tests.
- Smoke coverage passes across the initial run and a six-case rerun: 67 passed, one expected rollout skip.
- The three APR browser scenarios pass, including mobile tooltips and estimates above both transaction tabs.

The first browser run encountered unsolicited development reloads and lost mock state.
The failed smoke cases passed after restarting the preview and isolating the generated snapshot service outside the checkout.
The exact watcher that initiated those reloads was not proven.
The live review now reads the isolated loopback snapshot service on port 3109.

- Full browser coverage: 45 cases pass across the initial run and rerun. One existing theme-toggle case remains failing.
  `tests/e2e/full/dao-proposal-read.spec.ts:241` waits for “Switch to Light Mode.”
  The same failure was reproduced on unchanged base `2fcc08e` during the earlier validation.
  The nine other interrupted full-suite cases pass with one worker against the restarted preview.

The final production-mode build passes. The live preview was restarted from that build.
Its DAO page loads six production proposals, and the real wallet chooser opens successfully.
The read-only snapshot service runs outside the checkout to isolate it from development watchers.

## Review state

The implementation is present in the current worktree on `codex/styfi-vote-boost-apr`.
The configured 1Password signer completed the implementation commits after user approval:

- `fdd00cf`: current APR, oracle freshness, applied boost, and YBC collective rewards.
- `b361da2`: indexed DAO voting power, wallet share, expandable breakdown, and producer handoff.

No signing configuration was changed. No changes were pushed or deployed.
Screenshots are in `outputs/styfi-clarity-review-2026-10-23/` and are not included in source changes.
