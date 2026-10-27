# Quintzee configurable round duration — local candidate

Owner requested four minutes, adjustable in lobby Game Defaults. This task
authorizes local implementation/qualification only. No hosted migration, saved
default, admission, push or deployment has been changed for this candidate.
Base is published UI `30c50e01f3e8544125f188e38d908a630cf245c2`; work is isolated
on `codex/quintzee-round-duration-local` from the Words release checkout.

## Ownership and behavior

`game_defaults.quintzee_round_seconds` starts at 240; normal admin-only saved
defaults accept whole seconds 60–600. The UI uses the existing collection save.
The existing hosted admin RLS policy remains unchanged. The SQL constraint and
private trigger independently validate the duration. Decision timer 10 seconds,
ready/Start allowance 30 seconds and roll animation 1500 ms are separate.

Multiplayer configuration resolves the saved duration through the existing
shared `quintzee_v3_rules(duration_ms)` constructor, after authorization and
setup replay checks. The resulting rules freeze in dealer-game configuration
and match state. Arcade freezes the same rules in its immutable run config.
No /1, /2 or /3 reducer, scoring, pause, settlement or historical config is edited.
Both themes read the admitted duration. The ×100–×300 time multiplier remains
proportional to remaining time divided by that frozen duration.

The existing Arcade immutable ruleset/leaderboard convention is retained:
each new duration has a separate board (`quintzee/3-duration-240`, etc.) with
core rules version `quintzee/3`. A return to 180 seconds reuses `quintzee/3`;
returning to another prior duration reuses that exact board. No result is deleted,
reset or rewritten, and previous boards remain selectable. Default changes
atomically switch new-admission board selection only if Arcade was already open.
Closed admission stays closed. A future incompatible active rules version fails
closed rather than being silently replaced. Real-money exclusion is unchanged.

## Local evidence

- Focused UI/model/polish: 26 tests pass. Includes saved duration independent of
  decision timer, both themes, draft preservation and invalid-save rejection.
- Application TypeScript passes; production bundle passes.
- `dev/quintzee/round-duration-proof.mjs`: transaction-contained local PostgreSQL
  proof passes new actual Arcade/MP admissions in both themes at 60/240/300/600s,
  existing 180s sessions and active-run resume, subsequent default edits, normalized
  multiplier, exact expiry, bounded bonus pause, historic board selection, 180s
  board reuse, invalid/null/fraction bounds, admin/non-admin saves, closed Arcade
  preservation, real-money rejection, and unchanged frozen/settlement functions.
- The disposable template omitted API grants/RLS. The proof reconstructs the
  hosted SELECT/UPDATE policy read from production inside its rollback only;
  this is test setup, not part of candidate installation. No triggers disabled.
- `dev/quintzee/round-duration-browser.mjs`: actual UI HTTP load, input fit,
  save/reopen at 320×568, 390×844, 844×390 using synthetic local Supabase data.
- Evidence JSON/screenshots: `dev/quintzee/evidence/round-duration/`.
- Local settings preview: `http://127.0.0.1:15319/dev/quintzee/round-duration-preview.html`.
  Select Dice → Quintzee. It is a synthetic settings preview, not hosted gameplay;
  loopback is accessible on the laptop only.

## Before any release

Owner publication approval is still required. Reconcile latest main and the
Words writer first. Candidate SQL is `supabase/quintzee/round-duration.candidate.sql`,
not an installed/registered migration. Generate the migration through the normal
CLI workflow only for a subsequently approved release. Recheck installed configure,
Arcade version/score-group authority, default policy and relevant shared-function
hashes; apply a guarded version of the candidate without replaying old migrations.

Complete integrated release gates, including duration/default-save concurrency,
actual immutable completion/result and leaderboard separation, canonical financial
rollback/settlement/replay/recovery regressions for the new frozen configs, and
fixture-scoped hosted qualification. Current proof is local; it does not claim
those full release gates or a hosted four-minute timer. Coordinate migration and
frontend publication; verify installed settings, both admission modes, real-money
rejection, exact SHA, CI, READY deployment, public manifest, publisher and persisted
signal before declaring live. Do not mix this with the earlier publisher403 recovery.
