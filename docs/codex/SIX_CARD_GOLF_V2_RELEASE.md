# Golf /2 approved release — October 22, 2026

Approved product candidate: `756a41da843e046e3c39b5dd3391188af0e182fa`.
Fresh remote and production base: `bd6418ed884e2c517d095e4cde3b2846fc66fffe`.
Product scope remains [the reviewed local candidate](SIX_CARD_GOLF_RULES_V2_LOCAL.md).
No further product changes are bundled with registration and qualification.

## Registered forward package

The existing installed Supabase CLI created
`supabase/migrations/20261022232721_six_card_golf_v2_stock_final_turns.sql`.
SHA-256: `e8197e625e57bed6705460ddf20884b8eef51835c746ebc431f3111e0f59ed80`.
The file contains the reviewed candidate plus guards against changed installed
definitions or a prior `/2` installation, and validates existing match partitions
without updating them. The hosted migration tool assigns its own applied-history
timestamp, recorded in the final release evidence; never repair unrelated old
history or apply the same named migration twice.

The new client accepts both versions. Publish and verify that client first,
then apply this one forward migration so new admissions select `/2`. Existing
offers and matches retain `/1`; no admission flag or financial owner changes.
If application has an uncertain result, inspect migration history and installed
hashes before taking any further action. Do not blindly retry.

## Qualification and preservation

- `dev/six-card-golf/evidence/v2-release-candidate.json` records 25 successful
  hosted rollback units and exact function/catalog fingerprints. These exercise
  legacy rules, new stock boundaries/RPC replay/pause, all 2–4-player human and
  mixed-bot matches in both money modes, every co-winner count, canonical chip
  deltas and journal, injected after-chip failure rollback, recovery, terminal
  continuation, immutable results and presentation timing.
- `dev/six-card-golf/v2-release-proof.mjs --installed` prepares the same matrix
  against installed authority. Rehearsals preserve all existing match rows and
  both release rows in the same repeatable-read snapshot and verify rollback.
  Hosted fixtures never seed scheduler health or disable production triggers.
- `dev/six-card-golf/concurrency.mjs --rules-v2` and `--rules-v2 --real` pass on
  isolated local database clones with independent authenticated connections:
  duplicate threshold draws, competing replacements, immutable final queue,
  successor/timeout races, final-action and settlement races, actual 91/109
  balances, zero-client continuation and old receipts after continuation.
- Full validation: 401 application files / 2,764 tests and 12 harness files /
  241 tests; TypeScript and production-configured build passed.
- Fresh production inspection confirms Golf enabled/admitted and Canasta
  enabled/admitted. Installed Canasta pacing and its play-money restriction
  remain untouched. Unpublished Canasta `c8059c2ff` is excluded from the Git
  ancestry and release scope. Existing security-advisor findings are outside
  this function-only Golf change; no policies, grants to clients or RLS changes
  are included.

Execution artifacts, validation/build logs and exact migration/deployment/CI
identities are retained under
`qualification.local/six-card-golf/review-20261022-v2/` and
`qualification.local/six-card-golf/v2-{candidate,installed}/`.
The final delivery must verify the remote SHA, Vercel READY and public manifest,
required CI/release signal, installed function fingerprints, and production
rendering/reconnect of the existing paused qualification match without changing
it. An already-ended match must reconnect to the lobby.

## Owner smoke

Check a new `/2` match: no no-reveal cap; triggering draw finishes normally,
then everyone takes one final turn, including the actor. Fully exposed ending
still gives only opponents a final turn. Check pencil writing, held totals,
white/back seat indicators and displaced opponent card sizing. Existing `/1`
matches keep their old rule. The blank-back report did not reproduce and remains
an unverified owner-smoke item, not a claimed fix.
