# DAO Historical Records

Use the [DAO overview](../README.md), [local development](../local-development.md), [publication operations](../pinata-publication.md), and [release checklist](../release-checklist.md) for current work.
The [September publication acceptance](../publication-acceptance-20260923.md) records the original operator acceptance.

Completed plans, package prompts, dated handoffs, logs, and screenshots are available at an immutable source revision.
Their pending statements describe their recorded dates.
Their validation results apply only to their recorded commits.

| Historical material | Source snapshot |
| --- | --- |
| Delivery sequence, milestones, dependencies, and status | [Delivery directory](https://github.com/yearn/governance-apps/tree/d0332e0a9ebb99d69085ac8cbbd2a638994bbab7/docs/apps/dao/delivery) |
| Earlier V2 consumer review procedure | [Superseded beta runbook](https://github.com/yearn/governance-apps/blob/d0332e0a9ebb99d69085ac8cbbd2a638994bbab7/docs/apps/dao/delivery/dao-beta-runbook.md) |
| Implementation assignments | [Work packages](https://github.com/yearn/governance-apps/tree/d0332e0a9ebb99d69085ac8cbbd2a638994bbab7/docs/apps/dao/delivery/work-packages) |
| App-specific agent prompts | [Prompts](https://github.com/yearn/governance-apps/tree/d0332e0a9ebb99d69085ac8cbbd2a638994bbab7/docs/apps/dao/delivery/prompts) |
| Screenshots, logs, checksums, feed samples, and review evidence | [Evidence directory](https://github.com/yearn/governance-apps/tree/d0332e0a9ebb99d69085ac8cbbd2a638994bbab7/docs/apps/dao/delivery/evidence) |
| October proposal layout and voting reviews | [Delivery directory](https://github.com/yearn/governance-apps/tree/d0332e0a9ebb99d69085ac8cbbd2a638994bbab7/docs/apps/dao/delivery) |
| Provider selection and accepted constraints | [Provider decision](../experiments/pinata-free/decision.md) |
| Earlier publication procedures | [Acceptance](../pinata-acceptance.md), [prepared session](../pinata-acceptance-session.md), [recovery](../pinata-recovery.md) |

Retrieve any archived file without changing the worktree:

```sh
git show d0332e0a9ebb99d69085ac8cbbd2a638994bbab7:docs/apps/dao/delivery/status.md
```

## Regression inputs and earlier cleanup

The three [DAO regression fixtures](../../../../tests/fixtures/dao-live-evidence/README.md) remain in the test tree.
Tests still use their original bytes.
They cover producer parsing, receipt-backed execution, and local deployment configuration.

The earlier September cleanup used source revision `6f78a0840feafdb26e8256e7212529156beb6c72`.
That revision also retains duplicate logs removed before this archive:

```sh
git show 6f78a0840feafdb26e8256e7212529156beb6c72:docs/apps/dao/delivery/evidence/m5-pinata/checks/typecheck-7.log
```

Historical checksum manifests describe their original artifact sets.
Run complete checksum checks against their recorded Git revision.
The current tree retains the contract references, schemas, examples, migrations, fork tooling, and operational procedures.
