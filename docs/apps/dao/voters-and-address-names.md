# Votes and address names

Proposal pages show the latest recorded vote for each individual address. Each row includes
the choice, UTC timestamp, transaction, effective YFI voting weight, and share of
recorded voting weight. Individual choices use Yea or Nay. Search matches names
and full addresses; sorting supports recent votes, older votes, and voting power.

The [reviewed Voter](https://github.com/yearn/stYFI/blob/9395d5e6fffdfe21fda32af94d32fca1a4f7840b/contracts/governance/Voter.vy#L198-L207)
updates both collective accounts with the YBC fraction. Individual vote entry points accept only Yea or Nay.

The table excludes the configured YBC and stYFIx aggregate addresses from the individual rows and voter count.
Individual YBC members remain in the list. One fixed bottom row shows the combined collective vote, labelled **YBC vote — Includes stYFIx**.
Search, sorting, and pagination do not affect this row. It shows the shared Yea/Nay percentages, combined weight, and latest timestamp.
Its share uses total proposal voting weight as the denominator. The **Explore YBC** link follows the current host environment.
The separate results chart still highlights the YBC account's contribution. The table footer explicitly includes stYFIx as well.

Aggregate addresses match the configured mainnet addresses, or separate fixture addresses in mock mode.
Other chains do not use this classification. Names, ENS, membership, and fractional choices never determine aggregate status.
Unexpected fractional data from another address remains visible without rounding it into a binary choice.
The client sums each aggregate account's latest weight and separately rounded Yea/Nay contributions.
It never adds an earlier replacement vote or counts a duplicate configured address twice.
Missing or invalid contributions show incomplete data, without a combined total. Mismatched fractions show inconsistent data, without a common split.
When neither aggregate has a vote, the footer shows **No YBC vote recorded**.

The voter name occupies one line, with the address directly beneath it at every width.
The name and address share the same left edge. Hovering or keyboard-focusing the name reveals its edit pencil.
Touch screens keep the pencil visible. Clicking the name opens the shared editor.
The compact name extends its hit area upward to 40 pixels, without overlapping the address or previous row's controls.
Long names are shortened visually; the full name remains in the edit control's
accessible label and tooltip. Desktop rows align the first name, choice, time,
and weight lines. The sort control reserves space for an inset chevron.
The header links directly to the Votes tab. Lifecycle history is in Details.
See [Proposal navigation](proposal-navigation.md) for tab behavior and section links.
ENS names resolve as pages are viewed; ENS search covers those resolved
names. Full-address and generated or custom-name search covers all rows.

The client orders events by block, transaction index, and log index. A later vote
replaces the earlier vote from that address. This prevents collective updates
from counting the same weight twice. Missing vote fields remain unavailable.
The snapshot notice also applies to this table; it is not a live wallet read.

DAO and YBC use the same address identity modules and editor. A saved name takes
priority over verified mainnet ENS. ENS requires matching reverse and forward
resolution. Otherwise, an address gets a deterministic nickname with a stable
suffix. The nickname does not change when another app displays a different set
of addresses. The Ethereum address remains visible and canonical.

ENS requests follow the visible page. A completed negative lookup removes that
page's previous ENS labels. Pending requests preserve other-page names for
search. Switching clients or entering mock mode clears the accumulated labels.

Names remain in the browser. The existing `yearn.ybc.member-aliases.v1` storage
key is retained. Path-based apps share local storage directly. The production DAO
host uses an isolated iframe on the production YBC host; the beta hosts use a
separate pair. This preserves names already saved in YBC. Devices, browsers,
environments, and unrelated shared hosts do not synchronize names.

The `/api/address-labels` adapter accepts only the paired DAO parent window and
origin. It supports bounded read, set, reset, and clear operations on the one
alias storage key. It does not accept URLs or storage keys from messages. The
parent checks the exact YBC origin, iframe window, response schema, and request
ID. A restrictive nonce policy permits no network requests from the adapter.
The standard Safe frame ancestors remain permitted, but message access still
requires the paired DAO parent. Browser storage restrictions can prevent access;
failed saves keep the editor open and show an error.

Validation covers replacement votes, malformed latest records, migration,
same-tab sharing, storage denial, unsafe names, exact origins, frame sources,
bounded messages, and cross-origin persistence in a browser.
Layout checks cover compact rows, aligned primary text, hover editing, and separate name-edit and address targets.
Summary checks cover combined weight, replacement events, exact addresses, incomplete data, and independence from list controls.

Integration: include the matching middleware and parent frame-source policy
changes before release. No transaction contracts or proposal content change.
