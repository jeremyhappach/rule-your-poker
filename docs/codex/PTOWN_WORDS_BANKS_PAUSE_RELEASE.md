# Ptown Words /2 release — 2026-10-27

Jeremy explicitly approved reviewed candidate
`d39328f2049557a95044390e09a8993adb0fd375` for production, fake-money only.
This supersedes the local publication hold in `PTOWN_WORDS_BANKS_PAUSE_LOCAL.md`.
The reviewed frontend is unchanged: sequential reveal, two +3m banks, canonical
host pause, guest request/cancellation, concealed paused tiles, flat board tiles
and tighter spacing. Intermittent Chrome vibration remains deferred until a new
published repro. No real-money policy or other game's behavior is changed.

## Hosted authority — PASS

Project `xvhmbuppghwmwpwrkzao`; installed migration
`20261027214928_ptown_words_v2_banks_pause_cancel_fake_only.sql`.
Exact preimages are in `dev/ptown-words/banks-release-preimage.json`.
Six existing Words functions change, two private functions and one Words-specific
host trigger are added. Shared pause, settlement, recovery, bot chooser,
configure and capability fingerprints remain unchanged. Existing /1 matches stay
frozen and playable; only new admissions freeze /2. The normal turn is still
180 seconds; each player has two explicit, additive 180-second banks per match.

Candidate rollback and installed rollback proofs pass through actual hosted
authority, real financial triggers and authenticated role checks. The first
candidate attempt exposed an ambiguous variable in the new proof harness; its
qualified-column correction passed before installation. No product fix was needed.
All synthetic users, games and financial rows rolled back. Global recovery
dispatch state was not touched; recovery calls target only synthetic dealers.

Reproduce with `node dev/ptown-words/prepare-banks-release.mjs`; generated SQL
is under `qualification.local/ptown-words/banks-release-{candidate,installed}.sql`.
Evidence: `dev/ptown-words/evidence/banks-release-hosted.json`.

- Core rules, ENABLE2K count, blanks, premiums, crosses, exchange and endings.
- 2/3/4-human winner/tie cases: exact winner chips, conserved canonical chips,
  balanced transfer batches, immutable result and final balance snapshots.
- Duplicate/conflicting/stale/late replay, invalid stake/membership, injected
  financial failure rollback, postgame continuation and Session Ended.
- Human/bot legal actions, private-view chooser, fake-only admission and real
  configure/start rejection, zero-client completion and exactly one payout.
- Exact +180000ms bank use, each slot once, UUID replay, stale competing command,
  unchanged rack/turn/scoring, wrong actor, expiry and legacy-version rejection.
- Request deduplication, ownership/target/revision/malformed cancellation guards,
  old cancellation replay preserving a new request, canonical host-only pause,
  host-first cancellation preserving pause, resume and host-transfer revisions.

Existing independent-connection race proofs remain applicable to the reviewed
candidate: duplicate/racing banks, host-first/cancel-first lock contention,
duplicate cancellation and terminal payout. See local qualification evidence.
The hosted complete rollback proofs run sequentially through actual installed
authority; no new persistent production test sessions are created.

Security advisor findings for Words are intentional: private RLS tables have no
client policies; public SECURITY DEFINER entry points retain explicit actor and
session authorization. New helper execution is revoked from all browser roles.
The advisor also reports an unrelated pre-existing policy/RLS warning on
`public.gameplay_transfer_pending_changes`; this release does not alter that table.

## Frontend and publication

Release resumed at Jeremy's explicit direction: the three stale Golf expectations
that held the first source run were corrected by `7b69fb733` on main `30c50e01f`.
Reconciliation preserves that main's published Quintzee work and the reviewed
Words frontend without duplicate test edits. Only the release-note overlap
required resolution; both game records were preserved. Runtime Words source and
the two approved SQL deltas are byte-for-byte unchanged from reviewed `d39328f`.

Combined application typecheck PASS; 241 harness tests PASS; production bundle
PASS. Full source run: 3058/3059 assertions, 439/440 files passed. The unchanged
TriTowers rules-panel case timed out at one second while still showing its lazy
loading state; all seven tests in that file pass on an isolated rerun. No code
or timeout was changed to obtain that result. The original three Golf checks
pass in the full run. All source assertions are thus covered by passing runs.
Logs: `qualification.local/ptown-words/banks-release-reconciled-{build,harness,bundle}.log`
and `banks-release-rules-rerun.log`. Installed function fingerprints were rechecked
and still match the qualified authority. Migration count remains exactly one;
no DDL was repeated during reconciliation.

The release checkpoint is tagged `ptown-words-v2-fake-money-20261027` before
publication. Final exact-SHA deployment, public phone/desktop load, release signal,
activation and fake-only admission evidence is retained in
`qualification.local/ptown-words/banks-publication/`. The `ptown-words-v2-live-20261027`
tag, created only after successful verification, identifies the verified source.

Previously reviewed browser evidence covers real Game
route/RPC/realtime, reconnect, phone/landscape/desktop, touch targets, sequential
human/bot reveal, request/cancel/host races and unchanged canonical terminal flow.

Admission and bots remain temporarily closed after migration. Reopen only after
the exact integrated source SHA is Vercel production READY, the public manifest
matches it, and the canonical `system_settings.release_publication` signal
matches. `prepare-banks-activation.mjs <sha>` checks the public manifest and emits
SQL that requires the same canonical publication signal and preserved authority
fingerprints. `verify-banks-publication.mjs <sha>` checks the exact public bundle
and fresh unauthenticated phone/desktop loads; it does not claim logged-in
gameplay smoke. Verify fake-only capability and recovery health afterward. Never deploy
the local clone's captured shared pause reference as a production migration.

Physical-device production smoke remains Jeremy's acceptance step: start a new
fake-money Words match, spend each +3m once, request/cancel pause, host pause/resume,
reload, inspect flat tile/value spacing and play through a canonical payout.
