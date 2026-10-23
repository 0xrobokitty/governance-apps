# Proposal title corrections

DAO ops can correct display titles in `public/dao-title-overrides.json`.
The deployed website serves that same file at `/dao-title-overrides.json`.
Git history records each correction. Changes take effect after deployment.

The correction changes the board title, detail heading, vote confirmation, and share title.
A small pencil identifies corrected titles on the board and detail page.
Hover, keyboard focus, or tap shows the original title and confirms that the published text is unchanged.
Published content, body text, content digest, and transaction data remain unchanged.

## Add a correction

1. Open the proposal and expand its technical details.
2. Copy its chain ID, Voting contract address, proposal ID, and content digest.
3. Add an entry to the `overrides` array.
4. Enter the corrected plain-text title.
5. Run `npm run test -- tests/unit/lib/clients/dao.title-overrides.test.ts`.
6. Submit the file change for review through the normal repository process.

This example shows the required structure. Its identity values are placeholders.

```json
{
  "version": 1,
  "overrides": [
    {
      "chainId": 1,
      "votingAddress": "0x1234567890abcdef1234567890abcdef12345678",
      "proposalId": "7",
      "contentDigest": "0xabababababababababababababababababababababababababababababababab",
      "title": "Fund the next DAO-ops term"
    }
  ]
}
```

Each entry must match the complete proposal identity and published content digest.
Proposal IDs use decimal strings without leading zeroes.
Titles have a maximum of 200 characters. Control characters and invisible formatting characters are invalid.
The schema rejects additional fields, duplicate identities, and unsupported versions.
If the configuration is invalid, the app uses the original titles.

There is no website editor or remote write endpoint for corrections.
An entry cannot replace Markdown, assets, discussion links, scripts, or other proposal fields.
Remove an entry and deploy again to restore the original display title.

## Indicator validation

The October 23, 2026 check passed 2,284 unit tests, type checking, lint, and the production Worker build.
The targeted DAO browser checks passed 18 tests with one expected rollout skip, after updating the header focus-order assertion.
The live board and detail page showed **Original title: Summary** for **Budget Request: vaultsNG**.

The first approved correction is [proposal #4](https://dao.yearn.fi/proposals/4), from “Summary” to “Budget Request: vaultsNG”.
Its chain, Voting contract, and content digest were verified against the published proposal on 23 October 2026.
The correction takes effect on deployment.
