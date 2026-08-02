# Stable checkpoints — do not reopen without a new repro

## Platform

- Around 2026-07-03 all seven games were smoke-tested with general geometry/polish considered good.
- Canonical table/felt/shell continuity must not be replaced by per-game table swaps.
- Chat stability and lobby performance had accepted fixes.
- Horses, SCC, Yahtzee, Holm, and 3-5-7 had major sync cutovers validated; Cribbage and Gin functioned but retained legacy-ish areas.

## Cribbage

- Prior runtime smoke accepted Cribbage terminal and LAST HAND presentation,
  but the later source audit found settlement was still a client-owned
  multi-write sequence. The atomic database replacement is a current release
  candidate and is not a stable checkpoint until deployed disconnect/LAST HAND
  smoke passes.
- Table/HUD remains through celebration.
- His Heels reveal/announcement sequencing passed production smoke.
- Perpetual Heels harness is gated and visibly identified.
- Cribbage scoring announcement timing was reported stable.

## Holm

- `holm_settle_hand` owns known terminal branches.
- Chucky processing eligibility correction was accepted.
- Ordinary and terminal presentation holds were stabilized.
- Duplicate ordinary pot/confetti was fixed with a stable consumed key.
- Both-stay presentation passed smoke.
- Session Ended removes player/community/Chucky card rows.
- Add Bot waiting-seat and alias behavior passed the later bot-heavy smoke.
- Bot scheduler fixes require regression attention because multiple distinct lost-edge defects were found.

## Session Ended

Accepted design:

- transient table phase, not modal;
- connected live-flow clients only;
- reconnect/fresh mount of ended session goes to lobby;
- standard HUD/tabs remain;
- results on felt;
- Back to Lobby local-only;
- participant source is current roster plus latest valid snapshots.

Do not reintroduce a scrim/modal, automatic lobby redirect for connected flow, or gameplay artifacts behind Results.

## Validation

Published runtime smoke is acceptance. Typecheck alone is never a stable checkpoint.

## Owned Supabase preview

- The authenticated lobby and create-game/game-entry path passed preview smoke
  on 2026-08-02 after migration
  `20260802174956_restore_public_data_api_grants.sql` restored explicit Data API
  grants. Keep all 48 public tables behind RLS and preserve anonymous read-only
  access to `games`.
