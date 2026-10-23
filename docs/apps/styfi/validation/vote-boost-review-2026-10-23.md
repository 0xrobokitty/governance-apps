# Vote Boost implementation review

Review branch: `codex/styfi-vote-boost-apr`.
Starting revision: `2fcc08e`.
Contract source revision: `001dda500be30e16d0837f8e7e05a75c8fe9710f` in the sibling `styfi` repository.

The contract, APR, and voting-power reviews were checked independently before integration.
The branch contains no production deployment.

## Initial implementation

| Before | After |
| --- | --- |
| The headline used the base feed APR | `StyfiPageClient.tsx` shows the actual stYFIx rate, including its recorded Vote Boost income |
| The reward card derived rates from feed values and balances | Typed domain clients calculate current reward streams at one verified mainnet block |
| Personal participation and YBC income were absent from APR | `AprBreakdown.tsx` separates base rewards, Vote Boost, delegated rewards, external positions, and YBC income |
| Mixed historical holdings could imply an unsupported token-specific rate | The card shows a portfolio rate when historical Vote Boost cannot be attributed to stYFI alone |
| YBC voting influence was omitted | `VotingPowerBreakdown.tsx` separates exact direct power from estimated collective and delegated influence |
| Mode comparison promised maximized APY | `messages.ts` explains vote-dependent APR and the requirement to vote on every counted proposal |
| Rate values had no dedicated interactive explanation | APR buttons support keyboard focus and a minimum 40px height; changing rates use tabular numerals |
| The staking form stretched to match the longer reward card | `StyfiCockpit.tsx` uses `items-start` so each card keeps its natural height |
| Local controls only seeded balances | `MockControls.tsx` provides full, partial, missed, and YBC participation scenarios using the active app identity |
| APR freshness and read failures could be obscured | The display preserves stale-price and unavailable states without blocking reward claims |
| The staking middleware binding was outdated | The client uses the current address and checks the canonical `blacklist` getter first |
| The local Next.js shim omitted generated route types | The shim now includes the exact pinned `Prefetch` and `EnsureStatic` unions |

## Initial implementation validation

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |
| `npm run test` | 198 files and 2,199 tests passed |
| `npm run test:e2e` and focused reruns | 65 distinct checks passed; one skipped |
| `npm run test:e2e:full` and focused reruns | 45 distinct checks passed; one existing DAO theme test failed |
| `npm run build` with production runtime and live data | Passed after the Next.js shim correction |
| Mainnet reader | Verified at block `26254898`, including one public YBC member |
| Visual review | Desktop and 390px mobile screenshots checked; no horizontal overflow in the mixed-position test |

The first smoke run had five failures. Two selectors were corrected; the three navigation timeouts cleared on rerun.
The full run had three failures. Two page-reload interruptions cleared on individual reruns.
These browser totals combine the full runs and focused reruns; they are not single-run all-green results.

The remaining test is `tests/e2e/full/dao-proposal-read.spec.ts:241`:
“contains proposed script and technical values at every review viewport”.
It times out at line 254 while waiting for the `Switch to Light Mode` button.
The same test fails at the same step on the unchanged starting revision `2fcc08e`.
That baseline used an isolated temporary source copy with the same installed dependencies and public local settings.
No DAO theme changes are included in this branch.

The build still emits framework warnings about the middleware convention and an Edge Runtime import.
Type checks remain enabled.

## Feedback revision

The follow-up starts from `efe955f` on the same review branch and worktree.

| Before | After |
| --- | --- |
| APR tooltip borders sat below padded buttons | Text decoration places the dotted underline beneath the glyphs; extra hit area does not affect layout |
| The rewards card showed several APR figures and permanent explanations | One total APR opens an additive calculation tooltip, using the veYFI pattern |
| Participation appeared as a proposal-count row | A compact vote-boost multiplier opens its formula, six-epoch count, and reward-timing explanation |
| YBC income and attribution notes occupied the main card | The calculation tooltip retains these details and counts each source once |
| Tooltip triggers relied on hover | Hover, keyboard focus, and tap open the details; Escape closes them |
| Reward-token content could crowd a narrow column | The token and APY badge wrap; the vote-boost line stays below the headline |
| Mode cards described returns without numbers | Onboarding and comparison cards show the stYFI range and full-participation stYFIx estimate |
| The stake form had no APR estimate | The selected mode shows the same estimate below the amount input |
| A historical APR ratio could imply the wrong multiplier | Live distributor scales determine the nominal multiplier; recorded streams still determine current APR |
| Voting power occupied a separate stYFI card | A compact DAO summary contains one amount and a tooltip breakdown |
| YBC influence lacked a percentage | The tooltip identifies the member's share of YBC weight; it does not claim a share of all DAO voting power |
| DAO review could use the staking mock wallet | DAO wallet and voting-weight fixtures drive the summary, with a YBC-member review control |
| Voting-power polling depended on the stYFI path | The mounted DAO component and document visibility control polling, including the subdomain root |

The scale-based estimate is not a prediction of next-epoch APR.
The statistics feed lacks the projected Vote Boost and account data required for that prediction, so no forecast is shown.
Voting contracts also lack a comparable global matured-weight total. A global governance percentage is therefore omitted.

The independent review checked stream attribution, component scales, delegated backing, epoch timing, and YBC denominators.
Current mainnet preview values are 20.23% actual stYFIx APR and an 8.08%–20.21% direct staking estimate.
The full-participation stYFIx estimate is 20.21%. The feed still marks its YFI price as stale.

### Feedback validation

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |
| `npm run test` | 199 files and 2,219 tests passed |
| `npm run test:e2e` and focused reruns | 67 distinct checks passed; one skipped |
| `npm run test:e2e:full` and focused reruns | 45 distinct checks passed; the existing DAO theme check failed |
| `npm run build` with production runtime and live data | Passed |
| Independent review | APR, multiplier, delegated backing, and DAO percentage semantics passed |
| Visual review | Desktop rewards, live mode comparison, and DAO summary checked; new mobile tooltip checks pass |

The first smoke run had 65 passes, one skip, and two failures.
The interrupted authoring check and the veYFI timeout both passed on the focused rerun.
These browser results combine the full run and reruns.
The full suite first had 37 passes and nine failures. Eight page-navigation interruptions passed on the focused rerun.
The remaining failure is the same `dao-proposal-read.spec.ts:241` theme check described in the initial validation section.
It still stops at line 254, waiting for `Switch to Light Mode`; that failure was reproduced on the unchanged starting revision.

## Local review

- Live data: <http://127.0.0.1:3108/styfi>
- Mock scenarios: <http://127.0.0.1:3107/styfi>
- DAO voting summary: <http://127.0.0.1:3107/dao>
- Open **Debug** in the mock preview, then select **All votes**, **Some votes**, **No votes**, or **YBC member**.
- Screenshots are saved locally in `outputs/styfi-vote-boost-review-2026-10-23/`.
- Feedback screenshots are in `outputs/styfi-feedback-review-2026-10-23/`.
- The DAO debug panel has a **YBC member** control for the combined influence estimate.

The previews are local processes and remain available while those processes run.
Production values use the public mainnet RPC and production statistics/YBC feeds.
The production statistics feed marked its YFI valuation as stale during verification; the UI retains that warning.

See [contract findings and calculation details](../vote-boost-apr.md) and the [pinned mainnet record](vote-boost-mainnet-2026-10-23.json).
