# veYFI UI Spec v1.1

**Status:** Implemented (Phase 6 Complete)
**Applies to:** `veyfi.yearn.fi` (and `/veyfi` route)
**Last updated:** 2026-02-11

---

## 1. Scope & Purpose

This document defines the **UI and interaction model** for `veyfi.yearn.fi`.
Unlike the single-asset dashboard of stYFI, this is a **Registry & Management Tool** for multiple assets:

- **Migration:** Moving legacy veYFI to the new system.
- **LLYFI Registry:** Managing multiple Liquid Locker tokens (sdYFI, upYFI, etc.).
- **Redemption:** Monitoring liquidity caps and exiting LLYFI positions.

---

## 2. Design Principles

1.  **Registry Pattern:** We do not assume a single "primary" balance. Users scan a list of supported tokens to find their positions.
2.  **Intelligence First:** Redemption is cap-constrained. We show "Global Availability" (Flight Board) _before_ the user tries to transact.
3.  **Hub & Spoke Rewards:** All yield is realized in the stYFI Dashboard. This page only directs users there; it does not duplicate claiming logic.
4.  **Explicit Exit logic:** "Buying" and "Selling" LLYFI is handled within the token's specific context, keeping cap/fee logic tightly coupled to the asset.

---

## 3. Information Architecture

**Route:** `/veyfi`

**Page Structure:**

1.  **Global Header** (Standard Yearn Header)
2.  **Protocol Stats Bar** (Ecosystem Health)
3.  **Migration Zone** (Top priority, conditionally visible)
4.  **LLYFI Ledger** (Main management table)
5.  **Redemption Intelligence** (Global liquidity context)
6.  **Rewards Navigation** (Footer/Link)

---

## 4. Layout Zones

### 4.1 Protocol Stats Bar

**Purpose:** Display ecosystem health metrics.
**Content:**

- **Migrated veYFI:** Total amount + % of legacy supply migrated.
- **Current Boost:** The current max multiplier (e.g., "1.52x") for legacy locks.
- **Total Staked:** % of LLYFI supply currently staked in the protocol.

### 4.2 Zone 1: Migration

**Component:** `MigrationCard`
**States:**

- **Action (Legacy Balance > 0):** "You have X legacy veYFI. Migrate now." (Primary CTA).
- **Info (Migrated):** "veYFI Boost Active". Visualizes the linear decay of the boost multiplier (2.0x -> 1.0x) over time.
  - User boost display should be derived from account lock data: `1 + max(0, boost_epochs - current_epoch) / 104`.
  - `boost_epochs` comes from `VotingEscrowRewardDistributor.locks(address)` and reflects the user-specific migrated boost schedule.

### 4.3 Zone 2: The LLYFI Ledger

**Component:** `LlyfiTokenTable`
**Structure:**

- **Header:** Asset | Locker Status | Staked Ratio | Effective APR | Staked Balance.
- During **epoch 0** (canonical clock), the APR column label switches to **Next Epoch APR** and uses projected APR inputs.
- **Rows:** Expandable (Accordion).
- **Expanded State (Cockpit):** Reveals the "Manage" interface for that specific token.
- **Data sources (pre-connect):**
  - Locker Status uses `global.veyfi.tokens[].redemption.capacity` (YFI locked).
- Effective APR uses `llyfi[].current.aprBps` (or `projected.aprBps` when `epoch == 0`).
- Base APR shown in tooltips/cards is back-calculated from the canonical effective APR using the applied boost multiplier and the LLYFI staked ratio; do not source it directly from `styfi.current.aprBps`, which can drift when stYFI stake changes intra-epoch.
- veYFI migrated-lock boost uses user-specific `boost_epochs` from account lock data with canonical `current_epoch`; do not substitute global max boost values.
- The APR tooltip shows base stYFI APR, boost multiplier, and the LLYFI staked ratio derived from `llyfi[].staked + llyfi[].unstaking` over capacity.

**The Cockpit (Tabs):**

1.  **Stake:**
    - Approve -> Stake flow.
2.  **Unstake:**
    - **Linear Streaming UI:** Reuses the "Pink" progress bar logic from stYFI.
    - **Header:** Labeled "Cooldown Status" to reflect state-based accounting (avoids confusion when bar resets after withdrawal).
    - Withdraw available liquid funds (read from `maxWithdraw` and normalized to Assets).
3.  **Trade:**
    - **Mode Selection:** Radio Button (Sell vs Buy).
    - **Buy (YFI -> LLYFI):**
      - **Constraint:** Limited by `Redemption.inventory` (Amount of LLYFI held by protocol).
      - **Contract:** `exchange()`.
    - **Sell (LLYFI -> YFI):**
      - **Action:** Labeled "Sell [Token]" (e.g. Sell sdYFI).
      - **Constraint:** Limited by `Redemption.capacity - Redemption.used` AND `Redemption.YFI_Balance`.
      - **Fee:** Shows exit fee (bps) and Net Receive amount.
      - **Contract:** `redeem()`.
4.  **Info:**
    - Read-only contract references for the selected locker.
    - Displays LLYFI token contract, locker depositor contract, and global redemption facility.
    - Address links use the shared `ContractLink` primitive (truncated code format + Etherscan link).

### 4.4 Zone 3: Redemption Intelligence & Rewards

**Component:** `InventoryCard` ("Flight Board")
**Purpose:** Inform the user about exit liquidity _before_ they dig into specific tokens.
**Content:**

- **Global Inventory:** Table of available YFI held by protocol.
- **Current Fee:** The current exit fee (e.g., "5.0%").
- **Asset breakdown:** Read-only list showing YFI available per token type.

**Component:** `VeyfiRewardsCard`
**Purpose:** Reinforce stYFI as the yield hub.
**Content:** "Rewards are aggregated in the stYFI ecosystem."
**Action:** "Go to stYFI Dashboard".

**Component:** `ContractsFooter`
**Purpose:** Keep global contract references discoverable without adding cockpit clutter.
**Content:** Legacy veYFI contract, reward distributor, and global redemption facility with Etherscan links.

---

## 5. Data Requirements

### 5.1 New Global Stats

The frontend requires a new `getGlobalStats()` method from the VeyfiClient to populate the top bar:

- `migratedYfi` (bigint)
- `lockedYfi` (bigint)
- `maxBoostMultiplier` (number/bigint, e.g. 15200 bps)
- `totalLlyfiStakedPercent` (number/bigint bps)

### 5.2 Token Data

- `LlyfiTokenState` must include `address` for approvals.
- APY data must include `base` vs `boost` breakdown if possible (or aggregated Net APY).

---

## 6. Copy & Tone

- **Migration:** Urgent but helpful. "Don't lose your boost."
- **Redemption:** Transparent. "Subject to dynamic exit fee."
- **Colors:**
  - **veYFI/LLYFI:** "Disco Salmon" (#CC3767).
  - **Warnings/Caps:** Amber/Red if caps are near full.

---

## 7. Cross-App Nudge

- **Goal:** Contextual guidance to `/styfi` only when an immediate stake action is available.
- **Trigger policy:** Show at most one nudge for high-intent action:
  - unstaked YFI in wallet
  - intentionally **does not** show claim/manage-only nudges to reduce banner fatigue
- **Connection gating:** Nudge evaluation requires an actual connected wallet (`wagmi` connected), not only mock fallback identity.
- **Data path:** veYFI uses a lightweight stYFI nudge read (`getNudgeState`) instead of full stYFI page-state hydration.
  - Includes only: YFI wallet balance + minimal stake-state signals.
  - Excludes: allowances, cockpit tab state, and full rewards card derivations.
- **Copy source:** All nudge copy is defined in shared message config (`app/_shared/messages.ts`), not hardcoded in hook logic.
- **Amount formatting:** token values use standard token formatting with 4 decimal precision.
- **Visual treatment:** Brand-tinted banner with row-collapse animation (no fixed mobile `min-height`) and top-right dismiss action.
- **Dismiss behavior:** `X` only; dismissal snoozes for 7 days per wallet and nudge ID.
- **CTA behavior:**
  - Label: "Visit stYFI website"
  - Opens in a new tab with external-link icon
  - Hostname-aware routing via governance link resolver:
    - `localhost` / `app.dao-ops.com` -> path-scoped `/styfi`
    - `*-beta.dao-ops.com` -> canonical `https://styfi-beta.dao-ops.com`
    - `*.yearn.fi` -> canonical `https://styfi.yearn.fi`
- **Deep-link behavior:** CTA routes include `source=nudge` + focus/action params.
- **Scroll reliability:** Deep-link scroll waits for DOM target readiness via `MutationObserver` instead of fixed timers.

## Shared app discovery

The shared footer groups links to staking, governance, and contributor apps.
Its heading is “Yearn DAO”. A single “veYFI & Liquid Lockers” link opens `/veyfi` to manage both types of position.
It includes the public governance-apps GitHub repository.
Links stay within the current local, preview, or production environment.
Destination links respect each app's release flag.

The shared voting notice appears immediately below the Migrated veYFI, Max Boost, and LLYFI Staked stats bar during an open DAO decision vote.
It shows the proposal count and the earliest closing time.
A dismissal applies to that deployment and voting period on the current browser origin.
A later voting period can show the notice again.
The notice stays hidden during loading, feed errors, stale data, and closed voting windows.

Both features require `NEXT_PUBLIC_ENABLE_GOVERNANCE_DISCOVERY=true` in production.
Development and preview enable them by default.
See [shared discovery delivery notes](../../shared/discovery-20261013.md) for validation and rollout details.
