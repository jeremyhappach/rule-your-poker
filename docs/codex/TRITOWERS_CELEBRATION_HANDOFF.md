# TriTowers celebration handoff — 2026-10-17

Owner-approved correction: the approved three-second fanfare is additional to
the normal five-second result presentation. Both modes share the implementation.
New `tri-towers/4` games prepend `clearCelebrationMs: 3000` only to an authoritative
all-clear. The shared v2 board/scoring/dealing core is unchanged; the versioned
wrapper fixes the result deadline to completedAt + 3000 + 5000. Existing v1/v2/v3
games retain their frozen timing. Normal endings still hold five seconds.

## Presentation

- 0–3 s: unchanged approved fanfare and sword/shield celebration; pill stays home,
  timer stays at its completion value, and normal result summary waits.
- 3–4.2 s: normal result presentation begins and the pill moves to center.
- 4.2–7 s: unchanged 2.8-second score count-up/audio and timer drain finish together.
- 7–7.3 s: pill returns home; authoritative progression is eligible at 8 s.
- Remaining cards/tower badges stay mounted. All timelines seek the authoritative
  deadline; pause/recovery/background interruption retains existing no-replay guards.
- Confirmed 120 ms card travel starts a soft ~100 ms filtered-noise swoosh through
  the shared audio manager. No new context, input delay or command owner. Muted,
  reduced-motion, invalid, stock and recovery events do not produce a travel cue.
  Sound admission more than 25 ms late is refused; flight cleanup cancels sound.

The new multiplayer presentation endpoint retains snapshot/action authorization,
adds no gameplay authority, and gives old presentation clients a refresh message
for v4. Arcade's presentation capability advances to 4; only capable requests use
the existing transport shortcut. Legacy clients can still recover frozen v3 games.

## Compatibility and release

Explicit v2/v3/v4 leaderboard/PB mapping preserves one compatible leaderboard and
each immutable result's frozen version. Configuration equality excluding lifecycle
fields, exact streak/draw/clear/whole-seconds scoring, mixed-version PBs and ranks
are proven. No qualification, randomness, Ready/playing duration or financial
formula changes. Existing canonical settlement and Arcade result writers remain.

Migration installs disabled v4 admission. Publish compatible client first, then
run `supabase/tri-towers/activate-celebration.sql`. Rollback admission by disabling
the new flag/ruleset; keep compatible client/SQL for existing frozen v4 games.

## Validation

- Full typecheck, 2,362 application tests, 241 harness tests and production build.
- Focused shared board/audio/API checks: both-mode full timeline, legacy timing,
  pending/confirmed travel, rapid replacement, mute/interruption/replay and old clients.
- Candidate and installed deployed-database rollback proofs: exact 8/5-second
  boundaries, 2–7 participants, Arcade late worker recovery, auth/receipts, unchanged
  scoring, combined PB, winner/tie, actual canonical chip deltas and balanced ledger,
  immutable results/snapshots, continuation, terminal disposition and late replay.
- Isolated cloned-authority financial proof: four winner/tie cases, injected trigger
  failure rollback and competing workers settle exactly once. No synthetic production
  records persist. Proof SQL is in `dev/tri-towers/celebration*.sql`; supporting existing
  scene compatibility and Arcade shortcut proofs are reused unchanged.
- Browser fixture checks exercise both shells: dedicated celebration, halfway
  score/drain, simultaneous completion and pill return. Native browser audio render
  verifies the swoosh waveform; this is not physical iPhone audibility acceptance.

Jeremy's production smoke remains acceptance: start new games in both modes, clear
all towers and confirm three seconds of celebration followed by normal-paced counting;
check final/bonus rounds, rapid card swooshes, mute and reconnect without replay.
