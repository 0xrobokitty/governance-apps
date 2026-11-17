# Shared Pulse MVP work package

Base: the reviewed Pulse mock at 0f2054eb005fb838b8de580387c2558a577cd594.
Public upstream base: 4f24c849.
Task branch: agent/shared/pulse/mvp.

The work connects the approved nine-card layout to GovApps Stats.
The live route remains opt-in and separate from the mock preview.

## Acceptance criteria

- The API proxy accepts only reviewed feed origins and live schema data.
- A failed request never substitutes mock values.
- Capital comes only from reviewedCapital v3.
- Native asset and chain selections prevent cross-asset sums.
- Unresolved amounts, quarantines, and missing days remain visible.
- Charts preserve gaps and expose daily values.
- yCRV and yYB share one tabbed card.
- Governance, reserves, and recovery occupy the last row.
- The four ranges include 365D.
- Desktop, mobile, dark mode, and unavailable states remain usable.
- Wallet actions remain absent from Pulse.

## Integrator notes

Deploy the Stats producer first.
Use the local activation values in docs/apps/pulse/live-mvp.md.
The new frontend flag defaults to disabled.
The Stats feed contains compatible legacy sections that this consumer deliberately ignores.
Current treasury and recovery routes retain their existing behavior.

No new dependency, DNS entry, deployment, production credential, paid X request, or Plausible integration is part of this change.
