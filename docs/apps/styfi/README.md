# stYFI App Docs

Scope: `stYFI` and `stYFIx` experiences under `/styfi`.

- User stories: [`user-stories.md`](user-stories.md)
- UI specification: [`ui-spec.md`](ui-spec.md)
- Vote Boost and YBC reward calculations: [`vote-boost-apr.md`](vote-boost-apr.md)

Shared architecture and standards are documented in [`../../shared/README.md`](../../shared/README.md).

## React state compatibility

The default asset selection resolves once from the first account payload and preserves later user selections.
The shared clock supplies external veYFI lock status, including deterministic mock time.

See the [dependency migration notes](../../shared/testing.md#dependency-migration-2026-10-05) for compiler and linter requirements.
