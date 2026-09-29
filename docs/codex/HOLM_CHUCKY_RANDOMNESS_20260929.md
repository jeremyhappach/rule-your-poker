# Holm Chucky entropy correction — 2026-09-29

Release checkpoint: `holm-chucky-csprng-20260929` (resolve the tag for the exact source SHA).
Applied Supabase migration: `20260929155908_holm_chucky_secure_randomness`.
Project: `xvhmbuppghwmwpwrkzao`. Production human gameplay smoke remains pending.

## Verified defect and scope

The production SQL helper `public.holm_deterministic_chucky_cards(uuid,jsonb,integer)`
sorted the available deck by
`md5(p_round_id::text || ':holm-chucky:' || suit || ':' || rank)`.
The round UUID and already dealt cards therefore determined the Chucky draw.
All 42 retained nonempty real-money Chucky hands examined since the September RNG
migration reproduced exactly, with no mismatches. This demonstrates predictable
generation; it does not establish deliberate winner selection or manufactured action.

The helper originated in the August atomic Holm terminal-resolution migration
(`20260804130000`, deployed copy `20260804204619`); the later
`20260804214534_fix_holm_chucky_suit_encoding.sql` retained the derivation.
September's `20260905030750_secure_game_randomness_and_four_card_crib.sql`
replaced `random()` draws with private cryptographic helpers but did not replace
this MD5 sort. Its regression source scan checked `random(`, so this path escaped it.

Exactly two deployed functions call the helper: `holm_submit_decision_core`
(the solo stayer) and `resolve_holm_showdown` (tied human winners versus Chucky).
Recovery and deadline entry points reach those same owners. No client calls it;
the generated client types only describe its existing signature. Existing SQL
proofs also call it. The ownership search found no copied outcome-generating hash
in other games or another Holm randomness path. Other located hashes identify
requests/projections or checksum data. Initial and successor Holm deals already
use `private.secure_shuffle_key()`.

## Correction and preserved behavior

Only this helper's shuffle key changes to `private.secure_shuffle_key()`, which
uses `extensions.gen_random_bytes(16)`; its volatility changes from STABLE to
VOLATILE. The legacy name/signature remains compatible, but the UUID argument is
unused. The entropy source receives no player, balance, wager, or session-history
input. Available-card exclusions and requested card count remain unchanged.

Both callers already lock the authoritative round and use committed Chucky cards
before drawing. The private-card projection permits a first commitment and rejects
replacement. The migration neither rewrites rows nor changes those owners.
The post-apply audit compared all 12 inspected deal, action, projection, frame,
recovery, and entropy-owner definitions to the pre-change definitions: all identical.
No game rules, scoring, payout, reconciliation, lifecycle, other-game RNG, or
production harness gates changed.

Deterministic fixtures remain in the explicit fake-money harness paths and the
transaction-local old-MD5 test oracle. They are not a production entropy fallback.

## Qualification

Run `bun supabase/tests/build-holm-chucky-proof.mjs [candidate-migration.sql]`
and execute the generated `artifacts/holm-chucky-rollback-proof.sql` on the
authorized database. The optional argument tests the candidate inside the rollback
transaction; omission tests the deployed definition. The assembler incorporates
the established full Holm settlement-boundary proof before the entropy tests.

The complete rollback transaction passed before application and again afterward.
Post-apply evidence:

| Check | Result |
| --- | --- |
| Synthetic real-money rounds through solo owner | 32; 32 distinct draws; 0 old-MD5 matches |
| Synthetic real-money rounds through tied-showdown owner | 32; 32 distinct draws; 0 old-MD5 matches |
| Same UUID, used deck, and count, repeated helper calls | 32; 32 distinct draws; 0 old-MD5 matches |
| Canonical frame reads | Both authenticated participants, twice each, all 64 rounds |
| Action replay, showdown replay, service-role recovery | Same cards and settlement state for all 64 rounds |
| Attempted committed-card replacement | Rejected for all 64 rounds |
| Existing settlement regression | Authorization/forgery denial, winner, tie, exact payouts, chip conservation, duplicate, replay, late replay, continuation, terminal/session-end, folded-card exclusion passed |
| Global forced-outcome harness | Ignored for real money; preserved for explicit fake money |
| Targeted fixed-card harness | Admin real-money arm rejected; stale fake request not consumed after real-money switch; valid fake request still works |
| Synthetic sessions remaining after rollback | 0 |

These are rollback-only synthetic rounds tagged real-money to exercise that path;
they are not customer games. The 32 same-ID helper draws are additional checks,
not additional settled rounds. Source inspection, not a finite random sample,
establishes removal of the UUID-based relationship. Chance equality with an old
four-card result is possible, so the proof detects repeated reproduction rather
than treating any possible chance match as proof of determinism.

The canonical frame checks model fresh reload/reconnect reads through the deployed
RPC with actual database roles. Browser/network interruption smoke remains Jeremy's
production acceptance check.

Local checks: 124 focused tests in 16 files; application TypeScript
(`tsc -p tsconfig.app.json --noEmit`); production Vite build. All passed.
`tsgo` was unavailable, so installed TypeScript was used without installing tools.
The build retained existing Browserslist, import/chunk warnings.

## Historical evidence and future fairness reporting

All 161 previously committed private Chucky records in the pre-work cohort retained
the same ordered ID/card fingerprint before and after migration:
`eac60373c30e253b5fd46e29c2d31bca`.
The post-apply historical rerun still reproduced all 42 retained September
real-money Chucky hands exactly with the preserved old algorithm. They remain
historical deterministic records and must not be described as cryptographic draws.

The correction boundary is **generation after the database migration**, not merely
round creation time or the later Vercel deployment. A previously created round
with no committed Chucky cards uses the new generator; already committed cards
stay unchanged. A future Fairness view must distinguish known legacy draws from
corrected draws and avoid attributing ambiguous boundary rows based only on their
round creation timestamp. No dashboard or Cribbage archive repair is included.

Production acceptance: play a new solo-stayer hand and a tied-showdown Chucky hand;
confirm both participants see identical cards, reload/reconnect preserves them,
and ordinary payout/continuation remains correct. Do not regenerate historical hands.
