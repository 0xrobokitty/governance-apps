# Wallet and total DAO voting power

The DAO front page shows a compact **Your voting power** control beside the proposal header actions. Its main value is the wallet's share of total DAO voting power. YBC estimates carry a visible qualifier. The control wraps onto a small row on narrow screens, so **Proposals** remains first.

Hover or keyboard focus shows the calculation: personal voting power divided by total DAO voting power. A click or tap opens the full breakdown in a modal. The modal includes the calculation, personal components, system components, snapshot time, and participation assumptions. It traps keyboard focus and returns focus to the control when it closes.

Ordinary wallets use exact `WeightMeasure.weight(account)`. YBC members also see an estimated share of the delegated stYFIx pool and YBC-held stake. The estimate assumes every current YBC member votes. Actual influence depends on which members vote on each proposal. The breakdown distinguishes the member's share of YBC weight from their share of total DAO voting power.

The staking aggregator tracks combined stYFI and liquid-locker history. These positions appear in one matured-weight row. Migrated, active veYFI appears separately. Holding stYFIx does not add direct voting power. All displayed weights precede proposal-specific late-vote decay.

## Exact system denominator

Neither raw staking supply nor proposal votes cast is a valid denominator. WeightAggregator applies deposits, transfers, withdrawals, rounding, and a four-epoch maturity ramp per account. Its raw supply does not equal the sum of matured weights.

The [snapshot builder](../../../scripts/build-dao-voting-power.mjs) indexes all holder candidates and reads their exact current weights at one canonical block. The total is:

`sum(WeightMeasure.weight(account), excluding stYFIx) + WeightMeasure.weight(stYFIx)`

The holder set includes all historical stYFI and liquid-locker depositor senders/receivers, migrated veYFI accounts, and YBC. Former holders remain candidates because current token balances alone cannot prove that their aggregator history is empty. The YBC account enters the total once. Members' estimated pool influence is not added to the denominator again.

The stYFIx address is excluded from the ordinary account sum. Its special WeightMeasure result supplies the epoch snapshot of delegated voting power. This replaces its underlying stYFI weight and avoids counting the same position twice.

## Snapshot validation and failures

The app loads an explicitly configured companion snapshot. It verifies deployment identity, full source coverage, unique accounts, account sums, system sums, and payload bounds. It then reads personal power and all YBC membership/pool weights at that snapshot's block. The connected wallet's onchain weight must match the index entry.

The chain's block hash and timestamp must match the snapshot. A snapshot must be no more than 300 seconds old and must belong to the current governance epoch. The rendered result also checks age and epoch every second, so a paused request cannot preserve an expired percentage.

Missing or stale system data leaves personal power visible with **Share unavailable** and no percentage. The breakdown identifies any YBC estimate. Missing YBC roster data leaves direct power and direct share visible. A failed personal read shows unavailable, not zero. Disconnected and wrong-network wallets have no control.

The YBC feed supplies candidate addresses only. Current membership and `num_members` establish roster completeness. Every member weight is read at the same block as personal power. All pool estimates use matured member weights, not raw YBC reward shares.

## Local review and production boundary

For a local app on port `3108`, set `NEXT_PUBLIC_DAO_VOTING_POWER_URL=http://127.0.0.1:3108/dao-voting-power.json`. The server proxy requires an absolute upstream URL. Run:

```sh
DAO_VOTING_POWER_RPC_URL=https://ethereum.reth.rs/rpc node scripts/build-dao-voting-power.mjs --watch
```

The builder writes ignored `public/dao-voting-power.json` and `outputs/dao-voting-power-index.json`. It refreshes every 60 seconds and reuses the validated index cursor. The initial history scan runs once; browsers never run it. An archive-capable mainnet RPC is required for the coverage check. The endpoint above worked during local verification; production should use its configured provider.

The first verified snapshot, block **26,255,657**, indexed **120 candidates** and **111 accounts with positive direct power**:

| Component | YFI voting weight |
| --- | ---: |
| Matured stYFI and liquid-locker weight | 1,312.362506740752357048 |
| Active migrated veYFI | 903.732994345677422602 |
| Delegated stYFIx snapshot | 431.027945257047456616 |
| Total | 2,647.123446343477236266 |

The Rust producer is implemented in `gov-apps-stats/src/voting_power.rs`, with a durable holder index and a local-only validation CLI. The [producer contract](voting-power-producer-handoff.md) and [coordinated release runbook](voting-power-release-2026-10-23.md) cover configuration and rollout. No producer deployment or remote publication is part of this change. The app's deployment validator requires a feed URL when DAO is enabled.

An independent [Rust-to-app mainnet check](validation/voting-power-rust-mainnet-2026-10-23.json) verified the emitted feed at block **26,256,202**. The actual parser and wallet reader accepted all 111 positive-weight accounts and the same 2,647.123446 YFI total. Every wallet contract read used that canonical block. The exact Rust output is retained as a consumer regression fixture.

An [integrated mainnet read](validation/voting-power-mainnet-2026-10-23.json) also verified a public YBC member at block 26,255,712: direct power was 287.931143 YFI, or 10.87% of the total; estimated combined influence was 626.477946 YFI, or 23.66%. Its 52.50% share of YBC member weight is a different denominator.

DAO mocks use their own wallet, network status, base weight, and clock. The **YBC member** debug control changes the deterministic influence estimate. Domain tests cover source enumeration, pool replacement, incomplete history, reorgs, malformed sums, expired snapshots, epoch boundaries, and personal shares. UI tests cover the header control, tooltip, modal keyboard behavior, touch access, and containment at 200% text size.
