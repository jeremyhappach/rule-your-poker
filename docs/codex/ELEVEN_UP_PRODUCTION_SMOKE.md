# 11 Up production smoke — 2026-10-17

Jeremy explicitly requested production deployment after approving the rules and
local playable. Release checkpoint: `eleven-up-production-smoke-2026-10-17`.
The approved rules remain `eleven-up/1`: no wild ball; no opening reshuffle;
full-rack passes advance without a placement penalty; the 2.5-second bell,
first-action clock, three-second all-clear fanfare and five-second results remain.

## Production boundary

Arcade offers 11 Up through `/arcade/eleven-up`, the existing authenticated API,
realtime revision table, immutable run/results/receipts, completion panel and
leaderboard. It mounts no multiplayer lifecycle or financial providers.
Abandon returns to the leaderboard with an unranked run.

Multiplayer appears under Other for active accounts in fake-money sessions with
2–7 human participants. Configuration freezes the existing match stake and seat
order. Bots and real money are rejected by authority. The canonical fullscreen
catalog, shell, chat/history, chip transfer provider and terminal hold are reused.
Continue waits for canonical financial presentation; Session Ended removes the
board and controls while retaining scores and shell navigation.

The new authenticated RPC adapter, `useElevenUp`, and the shared view retain exact
request UUID/payloads on uncertain responses. Equal gameplay revisions may add a
deferred canonical financial batch; conflicting gameplay is rejected. Future
stock never reaches the client. Display clocks never progress gameplay.

## Database and release evidence

- Production Supabase project: `xvhmbuppghwmwpwrkzao` (`ptown-poker-prod`).
- Migration: `20261017213901_eleven_up_production_smoke.sql`. The CLI-created
  local file was aligned with the migration version returned by server history.
- Production `arcade_start` and `arcade_commit` matched the qualified reference;
  migration guards abort on owner drift. Only 11 Up admission and completion
  branches are added to those existing owners.
- A production rollback proof passed both before and after installation:
  layout/redaction, full-rack pass, three-item clear/bonuses, stake rejection,
  setup/command replay, stale/outsider/late replay, winner/mixed tie/all tie,
  actual canonical chip movement and deferred balanced journal, final snapshots,
  replay-safe continuation/Session Ended, zero-client recovery and solo immutable
  results with no multiplayer or financial writes. Synthetic production fixtures
  were rolled back.
- Local concurrent-connection and failure-after-chip-movement proofs from the
  first milestone remain applicable to the unchanged SQL core.
- `arcade-recovery` version 6 differs from deployed version 5 only by the 11 Up
  dispatch. Its existing expiring-token authentication remains unchanged.
  Multiplayer recovery uses a bounded, private one-second cron invocation.
- Admission stays closed during installation; `supabase/eleven-up/activate.sql`
  registers only the new fullscreen catalog row and opens the two 11 Up gates
  after client publication.
- Security advisors report the expected private deny-all tables and intentionally
  authenticated security-definer RPCs for 11 Up. These use explicit membership,
  actor, identity and release checks; private helper execution remains revoked.

## Validation and owner smoke

The complete build passed TypeScript, 2,397 source tests and 241 harness tests.
Five additional production integration tests cover transport version isolation,
uncertain failures, financial identity/deltas, equal-revision financial arrival,
and canonical fullscreen routing. The final focused run passed 84 tests and the
final production bundle built. Existing Run21/TriTowers gameplay files are unchanged.

The production browser requires sign-in; no account credentials were used and
no synthetic score was committed to a production leaderboard. Jeremy's smoke
is still acceptance, especially physical-device audio and two-device continuity.

1. Refresh the app; open Arcade → 11 Up → Play. Verify the bell, first-action
   two-minute clock, full-rack Pass and groups including the draw ball.
2. Clear a board: hear the fanfare before the complete normal result presentation.
   Take Score, timeout, reload and abandon should preserve the server result.
3. Complete both rounds and return to the 11 Up leaderboard. Qualify at 80,000
   for one bonus round; no wild item should appear.
4. In a fake-money table with human players, choose Other → 11 Up. Check turn
   handoff, both devices' scores, chip settlement and Continue/run-back.
5. Check End Session: connected players keep terminal presentation, then see
   the shared Session Ended phase; reopening an ended session returns to lobby.

To contain new games, set the 11 Up admission gate and `eleven-up/1` Arcade
ruleset enabled flag to false. Leave existing match authority and recovery live.
