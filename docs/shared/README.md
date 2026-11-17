# Shared Documentation

Shared documents define requirements that apply across applications.
Use the [app index](../apps/README.md) for domain behavior and operations.

## Architecture and product standards

- [Frontend architecture](frontend-architecture.md)
- [Design system](design-system.md), [copy and tone](copy-and-tone.md), and [design review](design-review-process.md)

## Implementation and validation

- [Delivery guide](codex-usage-guide.md): worktrees, ownership, independent review, and integration
- [Testing](testing.md): unit, component, browser, and fork checks
- [Runtime modes](runtime-modes.md), [mock selection](mock-toggles.md), and [debug contract](debug-runtime-contract.md)
- [Security policy](security-hardening.md)
- [Branch protection](master-branch-protection.md)
- [Worker runtime](cloudflare-worker-runtime.md), [size limits](cloudflare-worker-size.md), and [release checklist template](release-checklist-template.md)

## Data contracts and rollout planning

- [Global data schema](schemas/global-data-schema.md)
- [Teams/YBC producer contract](gov-apps-stats-teams-ybc-feed-brief.md)
- [Teams/YBC production plan](teams-ybc-production-plan.md)
- [RPC reliance roadmap](rpc-reliance-reduction-roadmap.md)

## Reusable task templates

Use the [delivery guide](codex-usage-guide.md) with these templates:

- [Orchestrator](prompt-templates/orchestrator-template.md) and [implementor](prompt-templates/implementor-template.md)
- [Reviewer](prompt-templates/reviewer-template.md) and [auditor](prompt-templates/auditor-template.md)
- [Fixer](prompt-templates/fixer-template.md) and [integrator](prompt-templates/integrator-template.md)

## History

The original [YIP-88 specification](normative-spec-yip88.md), [frontend requirements](frontend-frd.md), and [baseline review](polished-app-baseline-audit.md) retain design context.
They do not define requirements for new applications.

Completed implementation assignments and review records are available at the immutable source revision below.
Their pending statuses describe the original task, not the current release.

| Historical material | Source snapshot |
| --- | --- |
| Shared Teams/YBC packages | [Work packages](https://github.com/yearn/governance-apps/tree/d0332e0a9ebb99d69085ac8cbbd2a638994bbab7/docs/shared/work-packages) |
| Teams implementation assignments and prompts | [Integration directory](https://github.com/yearn/governance-apps/tree/d0332e0a9ebb99d69085ac8cbbd2a638994bbab7/docs/apps/teams/onchain-integration-plan) |
| YBC implementation assignments and prompts | [Integration directory](https://github.com/yearn/governance-apps/tree/d0332e0a9ebb99d69085ac8cbbd2a638994bbab7/docs/apps/ybc/onchain-integration-plan) |
| Legacy yETH claim integration assignments and prompts | [Integration directory](https://github.com/yearn/governance-apps/tree/d0332e0a9ebb99d69085ac8cbbd2a638994bbab7/docs/apps/yeth/onchain-integration-plan) |
| Completed February security checklist | [Checklist](https://github.com/yearn/governance-apps/blob/d0332e0a9ebb99d69085ac8cbbd2a638994bbab7/docs/shared/security-hardening-backlog.md) |
| October dependency migration record | [Original testing guide](https://github.com/yearn/governance-apps/blob/d0332e0a9ebb99d69085ac8cbbd2a638994bbab7/docs/shared/testing.md#dependency-migration-2026-10-05) |
| Retired architecture and task-list pointers | [Architecture pointer](https://github.com/yearn/governance-apps/blob/d0332e0a9ebb99d69085ac8cbbd2a638994bbab7/docs/shared/architecture-blueprint.md), [task-list pointer](https://github.com/yearn/governance-apps/blob/d0332e0a9ebb99d69085ac8cbbd2a638994bbab7/docs/shared/master-task-list.md) |
| DAO delivery packages and raw evidence | [Historical index](../apps/dao/delivery/historical-index.md) |

Retrieve a file without changing the worktree:

```sh
git show d0332e0a9ebb99d69085ac8cbbd2a638994bbab7:<repository-path>
```
