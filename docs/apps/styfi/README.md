# stYFI App Docs

Scope: `stYFI` and `stYFIx` experiences under `/styfi`.

- User stories: [`user-stories.md`](user-stories.md)
- UI specification: [`ui-spec.md`](ui-spec.md)
- Vote Boost and YBC reward calculations: [`vote-boost-apr.md`](vote-boost-apr.md)

Shared architecture and standards are documented in [`../../shared/README.md`](../../shared/README.md).

## React state compatibility

The default asset selection resolves once from the first account payload and preserves later user selections.
The shared clock supplies external veYFI lock status, including deterministic mock time.

See the [compiler and linter requirements](../../shared/testing.md#dependency-migration-2026-10-05) for compiler and linter requirements.


## Global feed limits

The shared Stats reader permits at most 1 MiB and uses one 10-second request deadline.
The browser reads through `/api/global-data`. Direct server reads use the same limits.
A failed or invalid response never becomes valid global state.

## Safe submissions

The shared transaction writer retains unresolved Safe submissions across reloads.
The wallet status panel checks execution without sending another transaction.
See [Safe transaction tracking](../../shared/frontend-architecture.md#safe-transaction-tracking) for receipt checks and recovery limits.
