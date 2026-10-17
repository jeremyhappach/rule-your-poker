# Run21 shared sounds — 2026-10-17

Approved scope: reuse the owner-auditioned TriTowers 100 ms card swoosh and
three-second harmony fanfare in Arcade and multiplayer Run21. The cue generators
now live under `src/lib/audio`; TriTowers keeps forwarding exports and unchanged
sound/behavior. No separate synthesis implementation or audio context was added.

Confirmed `card_placed` events admit the swoosh. Passes, optimistic placements,
rejected actions, restored history and duplicate snapshots do not. One shared
hook baselines mount/recovery and cancels on interruption; audio never waits in
the command path. Fresh 104/105 banked positive results use the existing medal
overlay, then the existing complete five-second score presentation/count audio.
Mute, hidden/background cancellation and session audio receipts remain shared.
Queued multiplayer medal audio is retired on reconnect/background interruption.

## Frozen timing and compatibility

`run21/3` changes only the 104 medal allowance from 2800 to 3000 ms; 105 retains
3800 ms. Arcade persists the configured medal allowance before the five-second
score window. Multiplayer retains its existing local receipt presentation owner
and authoritative progression; its medal reads the same frozen configuration.
No settlement or participant progression owner changed. Legacy games preserve
their timing; a legacy 104 cannot fit the full cue and does not admit it.

The shared v2 rules/dealing, 106.8-second playing clock, qualification, multipliers
and awarded scores are unchanged. Explicit `arcade_score_group` mapping combines
v2/v3 leaderboards and personal bests while results retain their frozen version.
Earlier incompatible Arcade rules stay separate. Both recovery workers support
v2/v3 before new defaults are activated.

Migration `20261017192144_run21_shared_audio.sql` stages disabled admission. Publish
the compatible client, then use `supabase/run21/activate-shared-audio.sql`. To stop
new v3 admissions, restore the v2 default/enable flag; retain v3 support for games
already admitted. No historical rows are rewritten.

## Validation and acceptance

- Full typecheck, application suite (2369 tests at full-build checkpoint), 241
  harness tests and production build passed; focused final interruption/medal
  checks passed after the final audio cleanup.
- Shared tests prove identical cue exports, v2/v3 score equivalence, complete
  medal/count windows, legacy timing, recovery baselines and duplicate suppression.
- Edge native OfflineAudioContext rendering proves identical generated samples
  for both games and the expected duration/nonzero output. The offline test adapter
  supplies a running-context admission state; it does not prove phone audibility.
- Candidate and installed production rollback proofs validate immutable config
  equivalence, compatibility mapping and disabled staging. Disposable database
  proofs exercise real/fake money, winner/tie, authorization, replay/concurrency,
  terminal/Run Back, recovery and canonical settlement through existing owners.
- Arcade proof verifies all three 104 rounds at 3+5 seconds, immutable results,
  mixed-version ranking/PB and zero writes to 97 non-Arcade tables.

Jeremy's production smoke remains acceptance. Start new games in both modes;
check ordinary plays, pass/rejection silence, 104 and 105 fanfares, full normal
count-up afterward, mute, and refresh/background recovery without repeated cues.
