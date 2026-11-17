# Governance Apps Documentation

Use the [app index](apps/README.md) for product behavior, data contracts, and release procedures.
Use the [shared index](shared/README.md) for architecture, testing, security, and contribution rules.

| Area | Entry point |
| --- | --- |
| Application behavior | [Eight app references](apps/README.md) |
| Architecture and shared components | [Frontend architecture](shared/frontend-architecture.md) |
| Implementation, review, and integration | [Delivery guide](shared/codex-usage-guide.md) |
| Local checks and browser acceptance | [Testing](shared/testing.md) |
| Environment selection and feature gates | [Runtime modes](shared/runtime-modes.md) |
| Deployment | [Worker runtime](shared/cloudflare-worker-runtime.md) |
| Alerts | [Alerts operations](alerts-bot.md) |

## Documentation maintenance

Update behavior documentation in the same change as its implementation.
Keep app behavior under `docs/apps/<domain>` and common requirements under `docs/shared`.
Link to the owner’s document instead of copying its requirements.

Production changes need current behavior, validation requirements, and a release procedure with rollback steps.
Record release evidence against its exact source revision.
A completed checklist does not establish that a later revision passed.

## Historical records

Completed task packages, prompts, screenshots, and logs remain available in Git history.
The [DAO historical index](apps/dao/delivery/historical-index.md) links to its archived delivery records.
The [shared index](shared/README.md#history) links to earlier cross-app and integration packages.
Current schemas, executable examples, regression fixtures, and operational procedures remain in the working tree.
