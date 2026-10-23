# stYFI UI Spec v3.3

**Status:** Final
**Applies to:** `styfi.yearn.fi` (and `/styfi` route)
**Last updated:** 2026-10-23

---

## 1. Scope & Purpose

This document defines the **UI and interaction model** for `styfi.yearn.fi`.
It specifically addresses:

- **State-driven dashboard:** One flat surface that unifies education and utility.
- **Account Summary split:** New users see mode education; returning users see positions.
- **Always-visible cockpit:** Stake/Unstake is always available; no layout thrashing.
- **Clear cooldown semantics:** Explicit Unstaking, Withdrawable, and safety copy.

---

## 2. Core Architecture

### 2.1 State Management (Single Page Client)
- **Location:** `app/styfi/StyfiPageClient.tsx`
- **State:** `selectedAsset` (`"stYFI" | "stYFIx"`)
- **Default selection logic (on mount):**
  1. Fetch account state.
  2. If `stYFIx` balance > `stYFI` balance → select `stYFIx`.
  3. Else if `stYFI` balance > `stYFIx` balance → select `stYFI`.
  4. Else (both 0) → select `stYFIx` (default/recommended).
- **Derived:** `isNewUser = totalBalance === 0`.

### 2.2 Data Flow
- `StyfiPageClient` derives `selectedAsset` and `isNewUser`.
- `StyfiPageClient` also reads `VeyfiAccountState` and derives normalized `externalPositions` (veYFI + staked LLYFI totals in YFI units).
- `AccountSummary` receives balances + external positions and applies the Active/Hybrid/Newbie matrix.
- `StyfiCockpit` receives `selectedAsset` and `onSelectAsset`.
- `useStyfiApr` supplies the reward rates and portfolio contributions. Page components only format these values.

---

## 3. Page Structure

1. **Global Header** (standard Yearn header) with a stYFI-only **Voting & Proposals** link to the DAO app on desktop and mobile.
2. **Protocol Stats Bar** (Total Supply, Staked, stYFIx APR). The APR includes the delegated pool's recorded Vote Boost rewards. **Staked** uses `styfi.staked` and excludes cooldown balances.
3. **Shared DAO Voting Notice** below the header when a decision vote is open.
4. **AccountSummary** (Hero for new users, positions list for returning users)
5. **Cockpit** (StakeManageCard + Rewards)
6. **Contracts Footer** (`<details>` disclosure with Etherscan links for YFI, stYFI, stYFIx, Reward Claimer, and reward token)

Personal voting power appears on the DAO front page, beside the proposal board.

---

## 4. AccountSummary

### 4.1 Loading State
- If connected and account data is loading, show a compact skeleton row.
- Hero/portfolio matrix is only shown once balances are loaded.

### 4.2 State Matrix

#### A. Active (`stYFI/stYFIx > 0`)
1. Section: **Staked YFI**
2. Interactive local rows (`<PositionRow />`) for `stYFI` / `stYFIx`.
3. Optional section: **Other Governance Positions** when external positions exist.
4. Read-only external rows (`<ExternalPositionRow />`) link to `/veyfi` in a new tab.

#### B. Hybrid (`stYFI/stYFIx = 0` and external > 0)
1. Section: **Your Governance Positions**.
2. Read-only external rows (`<ExternalPositionRow />`).
3. Section: **Choose How to Stake**.
4. Inline `<ModeComparison />` cards remain available for onboarding into stYFI/x.

#### C. Newbie (`stYFI/stYFIx = 0` and external = 0)
1. Section: **Compare stYFI and stYFIx**.
2. Inline `<ModeComparison />` grid only.

### 4.3 Local Position Row (`<PositionRow />`)

- **Icon:** Asset logo.
- **Name:** `stYFI` or `stYFIx`.
- **Balance:** `{amount} Active`.
- **Status:** `{amount} Unstaking` (grey when 0).
- **Actionable:** `{amount} Withdrawable` (brand accent, no green).

### 4.4 External Position Row (`<ExternalPositionRow />`)

- Read-only row implemented as external `<a>` (`target="_blank"`, `rel="noopener noreferrer"`).
- Hostname-aware link resolution uses `resolveGovernanceAppHref("veyfi", hostname)` so local/preprod/prod route correctly.
- **Left column:** Placeholder token icon + token name + symbol.
- **Middle column:** Normalized YFI-equivalent amount (`balanceYfi`) with status (`Locked` or `Staked`).
- **Right column:** Boost display (`{multiplier}x Boost`) + link-out icon.
- External rows are visually distinct from interactive stYFI/x rows to indicate route-away behavior.

---

## 5. ModeComparison (Shared)

- **Layout:** Grid (2 columns desktop, stacked mobile).
- **stYFI card:**
  - Badge: "Vote-dependent APR"
  - Description: "Retain voting rights and earn Vote Boost through governance participation."
  - Estimated APR range: current base rate through the full configured Vote Boost rate.
  - The caption shows the configured multiplier range, currently `1×–2.5×`.
- **stYFIx card:**
  - Badge: "Delegated voting" + "Recommended" (brand blue)
  - Description: "YBC votes on behalf of stYFIx holders. Full Vote Boost requires participation in every counted proposal."
  - Estimated APR at full YBC participation, adjusted for the delegated pool's backing and active supply.
- **Interaction:** Cards function as buttons to call `onSelectAsset`.

The onboarding cards and compare modal use the same estimates.
The full-participation estimates are not next-epoch forecasts or guaranteed returns.
Unavailable valuation produces an unavailable value. An older YFI price retains a visible note.

---

## 6. StakeManageCard (Control Panel)

Always visible and owns all write interactions.

### 6.1 Header
- **Segmented toggle:** `[ stYFI | stYFIx ]` bound to `selectedAsset`.
- **Compare modes:** Text link opens a modal with `<ModeComparison />`.

### 6.2 Context Banner
- **stYFI:** "You are managing standard stYFI. You must vote manually."
- **stYFIx:** "You are managing stYFIx. Voting is delegated for passive yield."

### 6.3 Tabs
- **Variant:** Line tabs (text + underline) to differentiate action from scope.
- **Stake:** Approve → Stake flow. Input unit: YFI.
  The selected mode's estimated APR appears below the amount input, with the same range or rate as the comparison cards.
- **Unstake:** Refactored flow (below).

### 6.4 Rewards Card (Yield & Rewards)

The card shows one rate: **Your total APR** for an active portfolio, or **stYFIx APR** when no position is active.
The total includes base rewards, delegated rewards, external positions, Vote Boost, and YBC income.

Hover, keyboard focus, or a tap on the APR opens its calculation tooltip.
Each income source appears once, followed by the total. All contributions use the same active-capital denominator.
The tooltip explains historical reward attribution, stale valuation, and the completed reward epoch when applicable.
It retains external income that still streams after a position closes.

Eligible personal positions show a compact **Your vote boost: 2.5×** line below the APR.
Its tooltip shows counted votes, proposals, and the multiplier calculation over the rolling six-epoch window.
It explains that current participation affects rewards from the next epoch.
This multiplier applies to stYFI reward weight, not to the total portfolio APR.

Tooltip labels use dotted text underlines. Escape dismisses a focused tooltip.

The reward-token symbol links to its Yearn vault. Its APY badge stays separate from the staking APR.
The payout section retains the claimable USD value, token amount, and **Claim Rewards** button.

| State | Display |
| --- | --- |
| Disconnected | Current stYFIx APR and a wallet connection prompt |
| Loading | Skeleton for account data and a dash for pending rates |
| Unavailable APR | Explicit unavailable values; existing rewards remain claimable |
| Stale YFI price | An asterisk beside the APR and a valuation note in its tooltip |
| Blacklisted | Existing restriction banner and disabled claim action |

See [Vote Boost APR derivation](vote-boost-apr.md) for contract sources and calculation rules.

---

## 7. Unstake Tab (Refactored)

- **Terminology:** Use **Unstaking** (not Exiting).
- **Withdrawable visibility:** If `withdrawable > 0`, show a Withdraw section **above** the cooldown input.
- **Safety warning:**
  - **Condition:** `withdrawable > 0` while the "Start new cooldown" form is visible.
  - **Banner title:** "Re-locking liquid funds"
  - **Banner body:** "You have **{formattedLiquid} {symbol}** available to withdraw. Starting a new cooldown will re-lock these funds for the full duration."
  - **Behavior:** Warning is informational only; do not disable/block the "Start new cooldown" CTA.
- **Ghost button label:** "Start new cooldown".

---

## 8. Copy & Tone

- **Mode Badges:** "Vote-dependent APR" vs "Delegated voting".
- **Status Labels:** Active, Unstaking, Withdrawable.
- **Avoid green** for withdrawable values; use brand accents.

---

## 9. State Matrix

| User State | Condition | View |
| :--- | :--- | :--- |
| Active | `stYFI/stYFIx > 0` | Staked YFI rows, plus Other Governance Positions when external data exists |
| Hybrid | `stYFI/stYFIx = 0` and external positions > 0 | Your Governance Positions, then ModeComparison |
| Newbie | `stYFI/stYFIx = 0` and external positions = 0 | ModeComparison only |

---

## 10. Cross-App Nudge

- **Goal:** Contextual guidance to `/veyfi` without interrupting staking flows.
- **Trigger policy:** Show at most one nudge, and only for high-intent actions:
  - legacy veYFI migration available
  - unstaked liquid locker tokens in wallet
  - intentionally **does not** show passive/manage-only nudges to avoid fatigue
- **Connection gating:** Nudge evaluation requires an actual connected wallet (`wagmi` connected), not only mock fallback identity.
- **Data path:** stYFI uses a lightweight veYFI nudge read (`getNudgeState`) instead of full veYFI account hydration.
  - Includes only: legacy migration signal + per-token liquid locker balances.
  - Excludes: allowances, cooldown streams, redemption caps, and cockpit-level data.
- **Copy source:** All nudge copy is defined in shared message config (`app/_shared/messages.ts`), not hardcoded in hook logic.
- **Amount formatting:** token values use standard token formatting with 4 decimal precision; liquid locker copy lists per-token symbols and amounts.
- **Visual treatment:** Brand-tinted banner with row-collapse animation (`grid-template-rows`) and top-right dismiss action.
- **Dismiss behavior:** `X` only; dismissal snoozes for 7 days per wallet and nudge ID.
- **CTA behavior:**
  - Label: "Visit veYFI website"
  - Opens in a new tab with external-link icon
  - Hostname-aware routing via governance link resolver:
    - `localhost` / `app.dao-ops.com` -> path-scoped `/veyfi`
    - `*-beta.dao-ops.com` -> canonical `https://veyfi-beta.dao-ops.com`
    - `*.yearn.fi` -> canonical `https://veyfi.yearn.fi`
- **Deep-link behavior:** CTA routes include `source=nudge` + action/focus params.
- **Scroll reliability:** Target scrolling uses DOM-observer readiness checks (`MutationObserver`) rather than fixed timeout delays.

---

## 11. DAO Governance Discovery

- **Permanent access:** The stYFI header links to `Voting & Proposals` after `Resources` on desktop and below `Tools` on mobile.
- **Destination:** The link opens the DAO app in a new tab. It respects the current host environment and the DAO release flag.
- **Active notice:** The shared notice appears immediately below the Total Supply, Staked, and APR stats bar during an open DAO decision vote. stYFI no longer requests Snapshot proposals.
- **Closing time:** The notice shows the proposal count and the earliest closing time. It disappears at the deadline without a page reload.
- **Dismissal:** The browser remembers each dismissed deployment and voting period. A later period can show the notice again.
- **Unavailable data:** Loading, feed errors, stale observations, and invalid data do not produce an active notice.
- **Existing nudges:** The stYFI cross-app nudge operates independently of the shared voting notice.
- **Scope:** Proposal discovery and links only. Eligibility checks and voting remain in the DAO app.

The shared app footer groups staking, governance, and contributor destinations.
Its heading is “Yearn DAO”. A single “veYFI & Liquid Lockers” link opens `/veyfi` to manage both types of position.
Its links preserve the current host environment and respect app release flags.
It also links to the public governance-apps GitHub repository.

In production, the footer and notice require `NEXT_PUBLIC_ENABLE_GOVERNANCE_DISCOVERY=true`.
The header correction does not depend on that discovery flag.
See [shared discovery delivery notes](../../shared/discovery-20261013.md) for rollout details.
