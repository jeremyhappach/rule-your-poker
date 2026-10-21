# Race Poker timeout controls — local candidate, 2026-10-21

Later coordinated authorization and installed qualification are recorded below;
the local-only boundary in the original entry is historical.

Jeremy's smoke follow-up authorizes local implementation and commit only.
No push, production migration, deployment, admission change or real-money
activation is included. Production v1 was subsequently opened for fake-money
smoke by a separate flag-only authorization: last verified enabled/admission/
fake-qualified true, real-qualified false. Older closed-release documentation
is historical. No production records or flags changed in this correction.

## Contract

New admissions will freeze `race-poker/2`. Existing v1 matches and their help
retain zero-point incomplete-hand expiry. Scoring, decks, 48,000-point finish,
paired turns, 16-round cap, two-second result intervals and settlement stay intact.
Bot policy remains separately versioned as `race-poker-bot/1`.

- Manual humans retain the 30,000 ms hand deadline. Lock-time expiry rejects new
  selections; immutable accepted receipts still replay.
- Fake-money expiry retains the unfinished hand and exposed choices, sets
  canonical `players.auto_fold` and `players.sit_out_next_hand`, and schedules
  the existing strategic bot. It completes this hand and subsequent turns until
  disabled. No zero-point result is fabricated.
- Real-money manual-human expiry retains the hand, prepares a 30,000 ms window,
  and calls canonical pause. Authorized resume starts that remaining window.
  Voluntary earlier pause still preserves actual remaining time.
- Auto-play may be toggled in either turn, during results, or while paused.
  Unchecking calls `set_automatic_play`, stops future bot choices immediately,
  and clears next-hand sit-out. Already accepted cards stay. An expired active
  automatic hand receives 30,000 ms on reclaim; an unexpired hand keeps its
  deadline. A no-op disable by an already-manual human never extends time.
  Reclaim while paused does not resume the game.
- The frozen two-seat race continues through settlement. Canonical next-hand
  sit-out applies at the next dealer game, not at a paired-round boundary.
  Reclaim before completion keeps the human eligible. Without reclaim,
  canonical continuation seats them out and clears old automatic-play intent.
- Automatic humans and bots share legal choices, scoring and public information.
  Durable choices retain the 750 ms minimum interval. An expired human deadline
  cannot discard a hand while an automatic actor is completing it.
- Round/session/match locks, revisions and immutable request identities arbitrate
  controls against actions and recovery. Stale controls refresh and can be retried;
  they never undo an accepted card. Opponent dimming and robot icons are display
  only. Control-only revisions do not play a false card-selection sound.

The shared `set_automatic_play` and `set_game_paused` definitions are reused,
not replaced. A Race-filtered participation trigger publishes control changes.
Canonical consent, admission, scoring and settlement owners remain unchanged.

## Qualification

- `node dev/race-poker/v2-proof.mjs`: rollback-contained core and both-money
  financial/after-chip-write failure proofs; fake timeout and partial-hand
  retention; bot choice; redacted reconnect snapshot; immutable control retry;
  immediate reclaim; opponent-turn toggle; unauthorized rejection; no-op clock
  protection; legacy expiry; real pause/resume; zero-client settlement.
  Seeded continuation proves reclaimed humans remain eligible; unattended
  continuation proves sit-out and canonical flag clearing.
- `node dev/race-poker/v2-concurrency.mjs`: separate temporary loopback database,
  removed afterward. Both-money authenticated duplicate/stale/conflicting request,
  click/timeout, repeated-settlement and after-chip-write rollback checks pass.
  Control/recovery races also prove stale reclaim retry, canceled bot work,
  preserved cards and exactly one competing control commit.
- Focused client tests cover paused/expired/out-of-turn controls, uncertain retry,
  legacy help and rejection, catalog behavior and audio. TypeScript and Vite
  production build pass; existing bundle and Browserslist warnings remain.
- Fifty layout cases cover 320x568, 390x844, 430x932, 844x390 and 390x664,
  including disabled/dimmed opponent choices, long-name robot visibility,
  checkbox reclaim, pending, reconnect, rules and terminal states. Screenshots
  were inspected. The layout fixture mocks acknowledgement; this is not a new
  browser-to-database end-to-end run. Physical phone acceptance remains pending.

## Unexecuted release steps

Prepared migration: `20261021143000_race_poker_timeout_controls.sql`; its body
matches `supabase/race-poker/v2.sql`. It checks captured deployed function hashes.
Canonical-control fixture SQL is for isolated tests only; never deploy it.
No installed-authority proof or deployment is claimed for v2.

After separate release authorization: verify current authority fingerprints and
flags, close new Race admission during matching client/migration publication,
run installed-authority financial/permission rollback checks, then reopen only
qualified fake money. Verify new admissions use v2 and existing v1 games retain
their contract. Do not enable real money. If checks fail, leave new admission
closed and preserve admitted versions rather than downgrading their rules.

Owner smoke after publication: two-human timeout, reconnect and mid-hand reclaim;
robot and checkbox state; next-game participation with and without reclaim;
human/bot completion, balances, phone layouts and audio. Real-money pause remains
local qualification until separately authorized for production.

## Coordinated release — 2026-10-21

Jeremy assigned Race the first release slot after stopping the original 11 Up
task; the replacement 11 Up candidate is held for the second slot. All other
game work remains isolated. Origin/main `0d9469ecc24345175b3cb07052d16283a1c4f42c`
was merged into the tested Race candidate `5e5cc13c05f3e6a2d53731556c855779dd8f821c`
at `978ff8d68daa37d7c4a933cd8bb0fba7f16da0d5`. The only conflict was release-note
ordering; both entries and all Boxdrop code were preserved.

All nine pre-install fingerprints matched. Two existing v1 matches were finished;
their state hashes remained unchanged through both production proofs. The
pre-install rollback proof used the exact guarded migration, actual scheduler
health, core/financial proofs, after-chip failure injection and v2 control tests.
Both money modes passed and left zero users/profiles/players/final snapshots or
injection triggers. Existing canonical balances were unchanged.

New admission was temporarily closed, preserving enabled/fake-qualified true and
real-qualified false. Supabase installed `20261021183159`, named
`race_poker_timeout_controls_v2`, from the exact local migration source
`20261021143000_race_poker_timeout_controls.sql`. The installed rollback proof
passed the same gates. All nine installed function-body hashes match the local
candidate (normalizing line endings only); shared automatic-play/pause function
hashes remain unchanged. Private execution is denied to authenticated clients;
the public action grant and one participation trigger are present. The unchanged
one-second recovery job is active with successful runs after installation.

Reconciled client validation: 30 focused tests, TypeScript and production Vite
build pass. Independent-connection both-money financial/control races pass again.
The earlier 50-layout validation still applies: integration changed no Race UI.
`dev/race-poker/v2-production-proof.mjs` builds auditable candidate/installed
rollback payloads without connecting to production; control fixtures live in
`supabase/race-poker/v2-controls-proof.sql` and never persist synthetic records.

The matching client publication is the final release step, followed by restoring
only the pre-existing fake-money admission. The delivery report records the
verified production SHA and confirms that release operations are terminal before
handing the shared lane to 11 Up. Physical iPhone and two-human/human-bot repeat
smoke remain Jeremy's acceptance checks, not automated claims.
