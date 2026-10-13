# stYFI UI Spec v3.2

**Status:** Final
**Applies to:** `styfi.yearn.fi` (and `/styfi` route)
**Last updated:** 2026-07-14

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
- `StyfiCockpit` receives `selectedAsset`, `onSelectAsset`, and `isNewUser`.

---

## 3. Page Structure

1. **Global Header** (standard Yearn header) with a stYFI-only **Voting & Proposals** link to the DAO app on desktop and mobile.
2. **Protocol Stats Bar** (Total Supply, Staked, APR). Show **"Epoch 1 APR"** when current epoch == 0 from the canonical clock. **Staked** should use `styfi.staked` (excludes cooldown balances; `styfi.unstaking` is the cooldown amount).
3. **Shared DAO Voting Notice** below the header when a decision vote is open.
4. **AccountSummary** (Hero for new users, positions list for returning users)
5. **Cockpit** (StakeManageCard + Rewards)
6. **Contracts Footer** (`<details>` disclosure with Etherscan links for YFI, stYFI, stYFIx, Reward Claimer, and reward token)

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
  - Badge: "Variable APY"
  - Description: "Standard staking. You retain voting rights. Governance participation required for max yield."
- **stYFIx card:**
  - Badge: "Maximized APY" + "Recommended" (brand blue)
  - Description: "Auto-delegated vault. Voting power is assigned to YBC to maximize rewards automatically."
- **Interaction:** Cards function as buttons to call `onSelectAsset`.

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
- **Unstake:** Refactored flow (below).

### 6.4 Rewards Card (Yield & Rewards)
- **Title:** "Yield & Rewards".
- **Layout:** Two stacked sections for clarity on small screens.
  - **Top (Context):**
    - **Current APR** (or **Next Epoch APR** when `epoch == 0`) with tooltip aligned to the label.
    - When `epoch == 0`, use `styfi.projected.aprBps` for the displayed value.
    - **Reward Token** label with tooltip: "Rewards are paid in {symbol}, which earns its own yield automatically."
    - Show reward token symbol (`yvUSDC-1`) as a subtle external link to the Yearn vault, plus an APY badge (success variant) when available.
    - Optional sublabel: "Auto-compounding vault".
  - **Bottom (Payout Zone):**
    - **Available to claim** label.
    - Large claimable amount (USD) with a smaller token value beneath (include symbol).
    - Primary CTA: **Claim Rewards**.
- **States:**
  - **Disconnected:** Centered empty state with icon + "Connect wallet to view rewards."
  - **Loading:** Two-tier skeleton (context section + payout section).
  - **Blacklisted:** Error banner above stats; CTA disabled.

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

- **APY Badges:** "Variable APY" vs "Maximized APY".
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
- **Active notice:** The shared notice appears below the header during an open DAO decision vote. stYFI no longer requests Snapshot proposals.
- **Closing time:** The notice shows the proposal count and the earliest closing time. It disappears at the deadline without a page reload.
- **Dismissal:** The browser remembers each dismissed deployment and voting period. A later period can show the notice again.
- **Unavailable data:** Loading, feed errors, stale observations, and invalid data do not produce an active notice.
- **Existing nudges:** The stYFI cross-app nudge operates independently of the shared voting notice.
- **Scope:** Proposal discovery and links only. Eligibility checks and voting remain in the DAO app.

The shared app footer groups staking, governance, and contributor destinations.
Its links preserve the current host environment and respect app release flags.
It also links to the public governance-apps GitHub repository.

In production, the footer and notice require `NEXT_PUBLIC_ENABLE_GOVERNANCE_DISCOVERY=true`.
The header correction does not depend on that discovery flag.
See [shared discovery delivery notes](../../shared/discovery-20261013.md) for rollout details.
