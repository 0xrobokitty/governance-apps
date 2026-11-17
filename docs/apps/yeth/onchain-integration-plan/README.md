# Legacy yETH Claim Integration

These references describe the claim page retained in `YethPageClient`.
The [implementation map](../implementation-status.md) explains route selection.
Use the [live recovery runbook](../recovery-live.md) for the recovery dashboard, auctions, and current fork acceptance.

- [Legacy global feed contract](yeth-global-data-schema-v1.md)
- [Legacy claim fork procedure](fork-runbook.md)
- [Original claim integration specification](planning-spec.md)

The earlier claim interface uses live claimable amounts, recovery shares, and the contract deadline.
Its original scope excluded historical accounting.
The live recovery dashboard has a separate Stats v3 publication and receipt verification path.

Completed [work packages and prompts](https://github.com/yearn/governance-apps/tree/d0332e0a9ebb99d69085ac8cbbd2a638994bbab7/docs/apps/yeth/onchain-integration-plan) remain in Git history.
Use them as implementation history, not as instructions to restart the integration.
