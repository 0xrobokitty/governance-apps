# yETH Release Checklist

Use this checklist for each release candidate.
The [live recovery runbook](recovery-live.md) contains the commands, contract configuration, and acceptance cases.
Record results against the candidate commit.

## Configuration and data

- Confirm the reviewed contracts, tokens, chain, and configured Stats source.
- Verify the production exposure flag and live-dashboard build configuration.
- Verify feed digests, reconciliation, historical data, and unavailable-data behavior.
- Confirm that production uses no mock client, local source override, or fork transport.
- Review public copy, source links, contract links, and transaction limitations.

## Validation

- Pass the required [repository checks](../../shared/testing.md).
- Run the applicable disposable-fork and browser acceptance cases from the live runbook.
- Verify injected-account, Safe, and delegated-account behavior within the release scope.
- Verify rejection, failed simulation, reverted execution, stale reads, and unresolved pending actions.
- Verify that changing accounts or chains invalidates the earlier transaction review.
- Verify restored pending actions and receipts without automatic resubmission.
- Record limitations and review findings with the evidence.

## Release and operations

- Obtain independent review and the required contract, security, governance, and operator approvals.
- Deploy the reviewed source ref to preprod and complete its acceptance checks.
- Promote the approved source through the production workflow.
- Verify `/yeth`, the dedicated host, the Safe manifest, and wallet connection.
- Confirm monitoring, rollback configuration, and incident ownership.
- Record the deployed commit and the operator’s acceptance result.

Do not infer approval or deployment from this checklist.
Use the runbook’s transaction and data limitations when deciding release scope.
