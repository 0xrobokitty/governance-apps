# `user-stories-styfi.md`

**User Stories — stYFI & stYFIx**
**Version:** 1.4
**Scope:** Part I of the Governance Apps (stYFI + stYFIx)

---

# 1. Purpose

These user stories define **what users must be able to do** in the `/styfi` section of the governance app.
They describe desired behaviour **from the user’s point of view**, without dictating implementation details.

These stories inform the FE Functional Requirements and the Architecture Blueprint.

---

# 2. Personas

We assume a technically literate DeFi user familiar with:

- Ethereum wallet connections
- Transaction signing
- Staking/cooldown mechanics
- ERC-4626 vault share semantics (but still requiring explicit UI clarity)

---

# 3. User Stories (stYFI)

---

## Story ST-00 — Default Selection (Mode Comparison)

**As a** user connecting their wallet
**I want** the app to automatically detect my existing position
**So that** I don't have to manually select between "stYFI" and "stYFIx" every time

### Acceptance Criteria

- **New User (0 Balance):** Show inline Mode Comparison cards; default to `stYFIx`.
- **Returning User (Has Balance):** Automatically select the mode where I have the highest balance and show the Account Summary list.
- **Hero Selection:** Choosing a mode scrolls the user to the cockpit actions.

---

## Story ST-01 — View My stYFI Account State

**As a** stYFI user
**I want** to see my staked position split by its status
**So that** I know how much is earning rewards versus how much is unstaking

### Acceptance Criteria

- Shows:

  - **Active:** Amount currently staked and earning rewards.
- **Unstaking:** Amount currently in cooldown (linear streaming).
- **Withdrawable:** Amount fully unlocked (finished streaming or liquid) ready to withdraw.
  - Claimable rewards.

- If blacklisted:
  - Blocking banner is shown.
  - All actions disabled.

---

## Story ST-02 — Stake YFI into stYFI

**As a** YFI holder
**I want** to stake YFI into stYFI
**So that** I can earn rewards and participate in the Yearn system

### Acceptance Criteria

- If allowance < input:

  - UI shows an **Approve** button

- After approval:

  - UI shows **Stake** button

- Displays current YFI wallet balance
- Transaction lifecycle surfaced via UI
- After successful stake:

  - Updated staked amount
  - Rewards refresh

- If blacklisted:

  - Action unavailable with explanation

---

## Story ST-03 — Understand stYFI Reward Accrual Windows

**As a** stYFI user
**I want** to clearly understand the difference between accruing and claimable rewards
**So that** I know what to expect after staking

### Acceptance Criteria

- UI distinguishes:

  - accruing rewards (within 7-epoch collection window)
  - claimable rewards (within payout window)

- Newly staked positions show **0 claimable** until eligible
- No speculative or projected reward values

---

## Story ST-04 — Claim stYFI Rewards

**As a** stYFI user
**I want** to claim my eligible rewards
**So that** I can withdraw stablecoin yield

### Acceptance Criteria

- Shows combined claimable rewards
- Button disabled if claimable amount is 0
- After success:

  - claimable resets
  - balances refresh

- If blacklisted:

  - Action disabled with explanation

---

## Story ST-04A — Understand Vote Boost and YBC Income

**As a** governance participant
**I want** separate base, Vote Boost, delegated, and YBC reward rates
**So that** I can understand the rewards from my positions and votes

### Acceptance Criteria

- The headline shows the actual stYFIx APR, including its recorded Vote Boost rewards.
- The reward card shows the stYFI base APR and the actual stYFIx APR separately.
- An active stYFI position shows its personal APR when historical rewards can be attributed to that position.
- Mixed or earlier external holdings use an account-wide Vote Boost contribution with an explanation.
- A YBC member sees YBC income included once in the total portfolio APR.
- Current reward rates use the completed reward epoch. The card identifies the epoch in which those rewards stream.
- Current voting participation covers the rolling six-epoch window. The card explains that new votes affect rewards from the next epoch.
- Missing reward or price data shows an unavailable state, not a zero APR.
- A separate full-participation estimate assumes a vote on every counted proposal. It does not guarantee future YBC participation.
- Reward-token APY remains separate from staking APR.

---

## Story ST-05 — Start/Reset Cooldown for stYFI

**As a** stYFI user
**I want** to start or add to a cooldown
**So that** I can eventually withdraw my YFI

### Acceptance Criteria

- Only visible when user has stYFI staked.
- **Progressive Disclosure:** Input is hidden behind a \"Start new cooldown\" button if a cooldown is already active.
- **Re-lock Warning (Non-blocking):** If I add to an existing cooldown while `Withdrawable > 0`:
  - I am explicitly warned in-context that the withdrawable amount will be re-locked for a full new cooldown.
  - The warning includes the exact withdrawable amount (`{formattedLiquid} {symbol}`).
  - The "Start new cooldown" button remains enabled.
- **Cooldown Reset Behavior:** Starting a new cooldown resets the timer for the full in-cooldown amount (existing stream + new amount). Liquid funds are **not** auto-claimed.
- Shows cooldown end timestamp.

---

## Story ST-06 — Monitor & Withdraw YFI (Linear Streaming)

**As a** stYFI user in cooldown
**I want** to see my funds unlocking over time and withdraw them as they become available
**So that** I don't have to wait for the full 14 days to access some liquidity

### Acceptance Criteria

- **Unified Tab:** Withdraw logic lives in the same tab as Cooldown logic ("Unstake").
- **Cooldown Status:** A "Cooldown Status" bar visualizes the ratio of Liquid vs. Streaming funds (Orange/Brand color).
- **Linear Access:** Withdraw button enabled as soon as `Liquid > 0` OR `Exited > 0`.
- **Clarity:** UI distinguishes between:
  - "Available to Withdraw" (Liquid + Exited)
  - "Streaming" (Still locked, with time remaining)
- After withdrawal success:
  - Liquid/Exited amount reduces/zeros
  - Wallet balance increases
  - Streaming portion continues unaffected

---

# 4. User Stories (stYFIx – ERC-4626 Vault)

---

## Story MX-01 — View My stYFIx Position

**As a** stYFIx user
**I want** to see the number of vault shares I hold and their underlying YFI value
**So that** I understand my position and how it changes over time

### Acceptance Criteria

- UI shows:

  - number of vault shares (exact)
  - underlying YFI equivalent (assets via `convertToAssets`)

- Clear tooltip explaining:

  - shares ≠ YFI
  - vault PPS increases over time

---

## Story MX-02 — Stake YFI into stYFIx

**As a** user choosing the maximized option
**I want** to deposit YFI into the stYFIx vault
**So that** I get “set-and-forget” auto-compounding

### Acceptance Criteria

- Approve → Stake two-step process identical to stYFI
- After successful stake:

  - user sees vault shares
  - underlying asset value displayed

- If blacklisted:

  - blocked

---

## Story MX-03 — Claim stYFIx Rewards

**As a** stYFIx user
**I want** to claim my rewards manually
**So that** I receive the yield my stake generated

### Acceptance Criteria

- **NOTE:** stYFIx does **not** auto-compound. Rewards are distributed to the RewardClaimer.
- UI clarifies that rewards must be claimed.
- Claiming works via the unified Rewards Panel (same as stYFI).

---

## Story MX-04 — Start Cooldown (if applicable)

**As a** stYFIx user
**I want** to begin withdrawal cooldown
**So that** I can redeem my assets later

### Acceptance Criteria

- Same linear streaming rules as stYFI cooldown
- Reflects timestamps from contract
- If blacklisted:

  - disabled

---

## Story MX-05 — Withdraw from stYFIx

**As a** stYFIx user
**I want** to redeem my shares for YFI as they unlock
**So that** I can exit my position

### Acceptance Criteria

- Enabled as soon as `Liquid Assets > 0`
- Withdraw returns YFI (converted via `convertToAssets`)
- After success:

  - wallet balance updates
  - share balance updates

- If blacklisted:

  - disabled

---

# 5. Cross-Cutting `/styfi` User Stories

---

## Story CC-01 — Handle Wallet & Network States

**As a** user
**I want** clear feedback when I’m disconnected or on the wrong network
**So that** I understand why I can’t interact

### Acceptance Criteria

- “Connect Wallet” call to action for disconnected state
- “Wrong Network” banner when chain ≠ Ethereum mainnet
- All actions disabled while on wrong network

---

## Story CC-02 — See Accurate Loading & Error States

**As a** user
**I want** predictable and clear loading / error handling
**So that** I trust the interface

### Acceptance Criteria

- Skeleton states for initial load
- Retry button for errors
- No partial / inconsistent states

---

## Story CC-03 — Unified Transaction Feedback

**As a** user
**I want** consistent transaction feedback
**So that** I know what is happening during a tx

### Acceptance Criteria

- Signing → Submitted → Mining → Success sequence
- Success toast with link to etherscan
- On error, clear message, not raw revert text

---

## Story CC-04 — Blacklist Handling

**As a** restricted user
**I want** to understand why I can’t perform actions
**So that** I’m not confused by disabled buttons

### Acceptance Criteria

- A clear warning banner
- All buttons disabled
- Reads still visible

---

# 6. Non-Goals (for `/styfi`, Part I)

These stories explicitly **not** part of this domain:

- veYFI migration
- LLYFI flows
- Redemption caps
- In-app governance voting (shared DAO proposal discovery and linking are in scope)
- Voting power decay visuals
- YBC membership management and elections
- Historical metrics / analytics
- Transfer UI

---

# 7. Versioning Notes

- This user-story set reflects the frontend behaviour required for BR#1.
- Changes to protocol or FE FRD MUST update this file.
- All stories map 1:1 to FRD sections.
- Cooldown handling uses a shared cross-domain primitive (CooldownState), consistent between stYFI, stYFIx, and LLYFI flows.

---

**End of `user-stories-styfi.md`**
