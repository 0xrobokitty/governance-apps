# Pulse X audience

Scope: consume the optional Stats 0.12 X section in the existing audience card.
Keep Impressions, Link clicks, and Followers in three tabs.
Keep typical post performance and coverage in collapsed details.
Do not add cards, product attribution, advertising splits, or browser credentials.

Acceptance:
- Old feeds without X remain valid.
- Invalid counters, history, intervals, and sample counts fail validation.
- Baselines and missing days never become zero activity.
- Range controls preserve gaps in all four windows.
- Disabled, unavailable, stale, and partial states remain explicit.
- Mobile layout, keyboard tabs, and data tables remain usable.

Integration: deploy the additive Stats producer first.
Pulse activation remains behind NEXT_PUBLIC_ENABLE_PULSE.
The deployment owner supplies X credentials only to Stats.
Live API authentication and billing remain unverified without credentials.
