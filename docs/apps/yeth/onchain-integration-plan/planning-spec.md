# yETH Onchain Integration Planning Spec (v2 - simplified)

This document records the original integration design.
Use the [integration references](README.md) for current contracts, implementation context, and acceptance procedures.
The original assignment sequence remains in Git history.


Last updated: 2026-02-26  
Route: `/yeth`  
Target: Onchain MVP (mainnet fork test first, then production behind feature flag)

---

## 1. Objective

Integrate the yETH Recovery UI with the **already deployed** contracts:

- Claim contract (Vyper) — user claims via `claim(exit: bool)`
- Yield vault (ERC4626 / Yearn vault) — TVL display and claim source
- Recovery vault (tokenized strategy / ERC4626-like) — optional risk-exposed holding and later redemption

This MVP intentionally prioritizes **simplicity** and a **small onchain read surface**.

---

## 2. Scope

### In scope
- Onchain reads for:
  - account: claimable amount and Recovery Vault shares
- R2-backed global reads for disconnected-wallet rendering via dedicated yETH feed:
  - claim deadline
  - vault metrics
  - snapshot metadata (`generatedAt`, `blockNumber`)
- Onchain writes for:
  - claim & exit
  - claim & stay (deposit to Recovery Vault via Claim contract)
  - redeem Recovery Vault shares
- UI simplification:
  - remove `opensAt` and all "claim not open yet" states
  - remove ineligible + post-claim exited states from UI
  - show wallet-specific UI **only** for:
    - `claimable > 0`, or
    - `recoveryVaultShares > 0`
- Keep yETH deployment config **separate** from the main `lib/deployment.json`.
- Keep yETH global feed **separate** from the shared `global-data` file used by stYFI/veYFI.

### Explicit non-goals (defer / future)
- Snapshots hosted inside this repo
- Log/event indexing, historical reconstruction, exit receipts
- Distinguishing ineligible vs already-claimed-and-exited
- Showing "Original Snapshot" after claim (when `claimable` is zeroed)
- Advanced vault configuration introspection (fee extraction, strategy queue parsing, etc.)

---

## 3. Deployment Configuration

### 3.1 Separate yETH deployment file

Create a dedicated file:

- `lib/clients/yeth/deployment.json`

This file can be updated independently from the rest of the app deployment config.

Current content (provided):

```json
{
  "MULTICALL3": "0xcA11bde05977b3631167028862bE2a173976CA11",
  "YETH_CLAIM": "0x9564850c7090B13794e6d1164B0826C0aEFf3143",
  "YETH_YIELD_VAULT": "0xd7a540ba3626c0aa66e7DB4088971d0CD64695B6",
  "YETH_RECOVERY_VAULT": "0xE5387cd454Dcc542421c069C009D915Ab9EFaaFd",
  "YETH_CLAIM_DEPLOY_BLOCK": 24524690,
  "YETH_RECOVERY_VAULT_DEPLOY_BLOCK": 24522098
}
```

Notes:
- `MULTICALL3` is included for completeness but viem/wagmi already configures Multicall3 for mainnet fork.
- `*_DEPLOY_BLOCK` are not used in this MVP (no logs), but retained for future iteration.

### 3.2 Constants location

Avoid adding yETH constants to `lib/constants.ts` unless you want them app-wide.
For this MVP, it is acceptable for `OnchainYethClient` to import `./deployment.json`
directly from the yETH client folder.

### 3.3 Separate yETH global data feed (R2)

Create a dedicated yETH JSON feed (same storage location family as existing global data):

- env: `NEXT_PUBLIC_YETH_GLOBAL_DATA_URL`
- fetcher: server/runtime direct read from `NEXT_PUBLIC_YETH_GLOBAL_DATA_URL`; browser runtime reads the same payload through `/api/yeth-global-data`.
- schema: versioned yETH-only payload (see `docs/apps/yeth/onchain-integration-plan/yeth-global-data-schema-v1.md`)

Rationale:
- yETH is a separate app with separate release/ops cadence.
- schema evolution for yETH should not block or risk stYFI/veYFI payload validation.

For MVP, this feed contains only dynamic global values used by `/yeth`:
- `claim.closesAt`
- `yieldVault.tvlEth`
- `recoveryVault.pps`
- `recoveryVault.totalAssetsEth`
- `recoveryVault.totalShares`
- metadata (`generatedAt`, `blockNumber`, `chainId`, `version`)

Keep static content in app code for now:
- governance URLs (`approvedYipUrl`, `manualLateClaimUrl`)
- `yieldSources`
- `risks`
- contract addresses (from `lib/clients/yeth/deployment.json`)

---

## 4. Data Model Changes

### 4.1 Claim window simplification

Remove the concept of `opensAt`. The claim contract only exposes `deadline`.

Change:

- `YethClaimWindow` from `{ opensAt, closesAt }` → `{ closesAt }`

Define claim window phase:
- `open` if `now < closesAt`
- `closed` if `now >= closesAt`

### 4.2 Account state simplification

Replace eligibility/status modeling with a simple observable state.

A production-safe minimum is:

- `claimableRaw` (the base amount in the claim contract mapping)
- `claimableNowEth` (`claimableRaw * recoveryRate / 1e18`)
- `recoveryVaultShares` (ERC20 balance of Recovery Vault token)

Optional convenience:
- `hasClaimable = claimableNowEth > 0`
- `hasRecoveryShares = recoveryVaultShares > 0`

No attempt is made to infer:
- already claimed & exited
- ineligibility

### 4.3 Global model simplification

Drop unused global fields from yETH domain types/UI:
- `treasuryRecoveryVaultShares`
- `treasuryYieldShareBps`

---

## 5. UI Specification (MVP)

### 5.1 Page-level behavior

The page should render:

1) **Global header + retired banner** (always)
2) Wallet-specific content:
   - if disconnected → Connect card
   - if loading → Loading card
   - if `claimableNowEth > 0` → show Claim flow UI
   - else if `recoveryVaultShares > 0` → show Recovery position UI + Redeem action
   - else → **render no wallet-specific recovery UI** (do not show ineligible/exited states)
3) Trust footer (always when global state is available)

### 5.2 Claim flow behavior

- Claim UI is available only when `claimableNowEth > 0` and claim window is open (`now < deadline`).
- If claim window is closed, show the manual yETH claim request CTA.
  - URL: `https://github.com/yearn/yeth-manual-recovery-claims/issues/new?template=manual-yeth-claim.yml`.

### 5.3 Recovery position behavior

- Display:
  - current liquidation value = `recoveryVaultShares * pps / 1e18`
  - share balance
  - current PPS (optional)
- Remove "Original Snapshot" and "Recovered vs Original" (cannot be known without snapshots/logs).

---

## 6. Onchain Client Requirements

### 6.1 Reads

Minimal reads:

**From yETH R2/static JSON feed (`NEXT_PUBLIC_YETH_GLOBAL_DATA_URL`)**
- `claim.closesAt`
- `yieldVault.tvlEth`
- `recoveryVault.pps`
- `recoveryVault.totalAssetsEth`
- `recoveryVault.totalShares`
- metadata (`generatedAt`, `blockNumber`, `chainId`)

**From chain (account + tx-critical state)**

**Claim contract**
- `recovery_rate() -> uint256`
- `claimable(address) -> uint256`

**Recovery vault (ERC4626-like)**
- `balanceOf(address) -> uint256`
- `totalAssets() -> uint256` (optional)
- `totalSupply() -> uint256` (optional)
- `convertToAssets(1e18) -> uint256` (PPS)

**Yield vault (ERC4626-like)**
- no required account reads

Read-path requirements:
- `getGlobalState()` must succeed with wallet disconnected from the yETH R2/static JSON feed.
- If the yETH R2/static JSON feed is unavailable/invalid, return safe fallback global state and keep route alive.
- Optional: when chain read client is available, deadline may be live-overlaid for freshness.

### 6.2 Writes

Prepared transactions (wagmi actions):
- Claim & Exit: `Claim.claim(true)`
- Claim & Stay: `Claim.claim(false)`
- Redeem: `RecoveryVault.redeem(shares, receiver, owner)`

### 6.3 ABIs

Add minimal ABIs under `lib/abis/`:
- `YethClaimAbi`
- `Erc4626Abi` (can be reused for yield vault + recovery vault for the needed calls)

---

## 7. Protocol Wiring

Update `state/protocol.tsx`:
- add yETH global feed loading (`useYethGlobalData`) alongside existing shared global data.
- when `preferMocks === false`, use `new OnchainYethClient(publicClient, yethGlobalData ?? null)`.
- disconnected-wallet global path should not depend on wallet RPC.
- Set `yethUsesMockBackend: false` in onchain mode.

---

## 8. Mainnet Fork Test Strategy

Goal: run the UI against a forked mainnet RPC and validate:

- claimable account can claim/exit
- claimable account can claim/stay and then redeem

Because we do not ship a snapshot list, you will likely need to **seed** claimability in the fork by impersonating `Claim.management()` and calling `set_claimable(...)`.
Verify exact admin function names against deployed ABI (`set_claimable`,
`set_deadline`, etc.) before scripting.

The fork runbook is in `fork-runbook.md`.

---

## 9. Production Readiness Checklist (MVP)

- [x] `/yeth` renders global section without wallet connection
- [ ] yETH global feed (`NEXT_PUBLIC_YETH_GLOBAL_DATA_URL`) is configured in preprod/prod
- [x] `claimable > 0` wallet sees claim UI and can transact
- [x] `shares > 0` wallet sees recovery UI and can redeem
- [x] claim window closed disables claim and links to manual claim request
- [x] feature gating still respected (`NEXT_PUBLIC_ENABLE_YETH` in production)
- [ ] mainnet fork test passes (WP5)
