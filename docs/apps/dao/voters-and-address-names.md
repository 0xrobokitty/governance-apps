# Votes and address names

Proposal pages show the latest recorded vote for each address. Each row includes
the choice, UTC timestamp, transaction, effective YFI voting weight, and share of
recorded voting weight. Individual choices use Yea or Nay. YBC and stYFIx
collective votes can split; those rows show both percentages together. Search matches names
and full addresses; sorting supports recent votes, older votes, and voting power.

The [reviewed Voter](https://github.com/yearn/stYFI/blob/9395d5e6fffdfe21fda32af94d32fca1a4f7840b/contracts/governance/Voter.vy#L198-L207)
updates both collective accounts with the YBC fraction. Individual vote entry points accept only Yea or Nay.

The voter name occupies one line, with the address directly beneath it at every width.
The separate pencil control opens the name editor. Edit and address targets remain
at least 40 pixels high, with no overlapping click areas.
Long names are shortened visually; the full name remains in the edit control's
accessible label and tooltip. Desktop rows align the first name, choice, time,
and weight lines. The sort control reserves space for an inset chevron.
The header links directly to the voter table. The table appears before lifecycle
history. ENS names resolve as pages are viewed; ENS search covers those resolved
names. Full-address and generated or custom-name search covers all rows.

The client orders events by block, transaction index, and log index. A later vote
replaces the earlier vote from that address. This prevents collective updates
from counting the same weight twice. Missing vote fields remain unavailable.
The snapshot notice also applies to this table; it is not a live wallet read.

DAO and YBC use the same address identity modules and editor. A saved name takes
priority over verified mainnet ENS. ENS requires matching reverse and forward
resolution. Configured mainnet collective addresses then use “YBC vote” or
“stYFIx delegated vote” as default names. Mock mode uses its own fixture addresses.
These defaults do not classify other addresses or replace recorded vote fractions.
Otherwise, an address gets a deterministic nickname with a stable
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
Layout checks cover compact rows, aligned primary text, and separate name-edit and address targets.

Integration: include the matching middleware and parent frame-source policy
changes before release. No transaction contracts or proposal content change.
