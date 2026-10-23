# Shared address names

YBC and DAO use one implementation for editable names, generated nicknames,
verified ENS, and storage. Existing YBC names remain under the same browser
storage key. Changes synchronize between the app views and open browser tabs.

On production subdomains, DAO reads and edits the names stored on the YBC
origin through an isolated iframe. Beta uses its own origin pair. Path-based
apps use their shared origin directly. The apps do not synchronize names across
devices, browsers, environments, or unrelated hosts.

Names are display preferences. They never change the canonical Ethereum
address and never enter a transaction. See [DAO votes and address names](../dao/voters-and-address-names.md)
for the persistence boundary, security checks, and failure behavior.
