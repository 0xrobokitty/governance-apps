# Coordinated voting-power and APR review

The reviewed changes span `governance-apps` and `gov-apps-stats` on matching `codex/styfi-vote-boost-apr` branches.
The application remains in the requested worktree. No production deployment, remote publication, or transaction occurred.

## Interface changes

| Before | After |
| --- | --- |
| Comparison cards had different header and APR positions. | Matching grid rows balance card heights. Both estimates place the label above the value, including longer decimal ranges. |
| The delegated card used wide, wrapping badges. | **Delegated** and **Recommended** fit on one row. |
| Both comparison estimates used the same color. | The stYFIx estimate uses Yearn blue. Existing staking and rewards estimates retain their treatment. |
| YBC had a separate collective-rewards section, two metrics, and a paragraph. | One row appears with other governance positions, using the registered blue Yearn glyph and the full collective name. |
| YBC backing required reading the supporting paragraph. | One right-aligned **Estimated backing** value opens a reward-share × collective-backing calculation. |
| The voting-power card pushed proposals down the page. | A compact share control sits beside the proposal actions and wraps into a short row on mobile. |
| The full breakdown stayed in an inline drawer. | Hover or focus shows personal power ÷ total power. Click or tap opens the personal and system breakdown. |
| The shared modal lacked full keyboard behavior. | Named dialog semantics, focus trapping, Escape, focus restoration, and prior scroll-state restoration are covered by tests. |

## Data and release changes

| Before | After |
| --- | --- |
| The producer had no complete matured voting-power denominator. | An independent, bounded task indexes all holder history and reads contract weights at one canonical block. |
| A local script supplied the companion feed for review. | The Rust producer writes the version-1 companion feed, with durable checkpoints, reorg recovery, and no partial publication. |
| Voting-power requests went directly to the configured upstream. | A rollout-gated same-origin API proxy enforces bounds and validation without upstream browser CORS requirements. |
| Deployment workflows did not carry the companion URL. | Both deployment workflows validate and pass an absolute HTTPS feed URL when DAO is enabled. |
| Valid Chainlink rounds became stale after three hours. | The producer uses the source's 24-hour heartbeat and rejects invalid or future-dated rounds while preserving fallback metadata. |
| The fast-changing companion object could inherit cache behavior. | Its upload carries signed `Cache-Control: no-store`; freshness is rechecked after canonical RPC validation. |

The coordinated release runbook records producer-first staging, production configuration, and rollback behavior.
No contract upgrade or data migration is required.

## Verification

| Check | Result |
| --- | --- |
| Frontend types and lint | Passed. |
| Frontend unit suite | All 2,262 tests passed across the full run, focused reruns, and the added Rust wire fixture test. |
| Browser smoke suite | 69 passed; one expected production-rollout skip. Two initial authoring failures passed on focused rerun. |
| Final comparison correction | Four estimate unit tests passed. Rewards and mobile APR flows passed. Both updated desktop and mobile alignment checks passed. |
| Full browser suite | 45 passed; one existing theme-control test failure, described below. |
| Contract schema, dependency policy, and local documentation links | Passed. |
| Cloudflare/OpenNext build | Passed, including the Next production build and TypeScript compilation. |
| Production Worker packaging dry run | Passed: 3,366.74 KiB compressed against the 9,216 KiB repository budget. No deployment occurred. |
| Rust formatting and strict Clippy | Passed. |
| Rust unit suite | 98 passed. |
| Rust release binaries and packaging | Passed for all three binaries. |
| Producer contract artifacts, evidence, and DAO replay | Passed: 12 artifacts, nine proposals, and 20 replay events. |
| Independent implementation review | Holder coverage, canonical reads, publication freshness, wire compatibility, and consumer behavior were reviewed. Findings were resolved before release preparation. |

The first frontend unit run could not open local test-server sockets in the sandbox.
The affected runtime tests passed with loopback access: three tests plus 23 database tests.
The later Rust fixture test adds one test to the 2,261-test baseline.
The final comparison assertions read both cards in one frame to exclude entrance-animation offsets.
Types, affected-file lint, the production Worker build, and its packaging check passed after the layout correction.

The full-suite failure is `tests/e2e/full/dao-proposal-read.spec.ts:241`.
It waits for the light-mode control after a preceding viewport changes the theme.
The same failure was reproduced on baseline commit `2fcc08e` before these changes.
This release does not claim a fully green full-suite result.

## Live producer and consumer check

The release binary generated a complete mainnet snapshot at block **26,256,202**.
The real application parser and indexed reader accepted it, including canonical hash, epoch, timestamp, and same-block personal reads.
The [recorded result](voting-power-rust-mainnet-2026-10-23.json) includes 120 candidates and 111 positive-weight accounts.

| Value | Result |
| --- | --- |
| Total system power | 2,647.123446343477236266 YFI-equivalent |
| Sample member direct share | 10.87% |
| Sample member estimated share including YBC | 23.66% |
| Snapshot age at consumer verification | 184 seconds, within the 300-second limit |

The YBC estimate allocates existing collective power; it does not add power to the denominator.
It assumes all current members vote and is not a fixed per-proposal vote weight.

The built local app returned HTTP 200 for `/styfi`, `/dao`, and `/api/dao-voting-power`.
The companion endpoint returned `Cache-Control: no-store`, 111 accounts, and a snapshot age of 142 seconds.
The Rust local generator refreshes the review feed once per minute without publisher credentials.
The live DAO preview opened the wallet chooser with Browser Wallet, MetaMask, Rabby, and WalletConnect.
No wallet signature or transaction was requested.

## Local review and integration

- Live built previews: `http://127.0.0.1:3108/styfi` and `http://127.0.0.1:3108/dao`.
- Deterministic mock previews: `http://127.0.0.1:3107/styfi` and `http://127.0.0.1:3107/dao`.
- Visual evidence is saved locally under `outputs/styfi-production-review-2026-10-23/` and is not part of the release source.
- Signed app commits include `138a7f4` for stYFI presentation and `4039fd2` for the compact DAO control.
- App commit `0a230a7` integrates the producer feed; `ea75396` completes the comparison alignment correction.
- Signed producer commits are `4807164` for oracle freshness and `53b6219` for the complete voting-power feed.

Follow the [coordinated runbook](../voting-power-release-2026-10-23.md): publish the producer feed first, then configure and release the app.
Enable the producer task and set the app's companion-feed URL in each environment.
No branch push, remote object publication, or production deployment occurred during this work.
