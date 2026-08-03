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
- Owned-preview deadline/progression smoke passed on 2026-08-03 at commit
  `a7a52d1d1f4541cfae1c71521e1a3fa77a69c220` in Holm game
  `25662485-03b6-434b-85f0-f96e983dfe7e`: the timer stayed hidden until the
  deal settled, expiry reached the atomically guarded resolver, the all-fold
  hand progressed, later auto-folds and rejoin worked, and the game completed.
  Preserve the event-driven resolver and no-polling boundary. The two observed
  timer animation/flicker defects are explicitly non-blocking backlog items,
  not failures of authoritative progression.

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

## Owned Supabase production

- The final backend cutover completed on 2026-08-03. Vercel production
  deployment `dpl_9DxrLEW3xwuZQCZv2USavnqr7uDC` reached `READY` and serves
  <https://holm357.com>.
- All 20 retained application datasets, all 11 password/metadata fingerprints,
  and the per-profile financial ledger matched the locked source immediately
  before the frontend switch.
- The emitted production bundle contains the owned project
  `xvhmbuppghwmwpwrkzao` and contains no Lovable-backed project reference.
  The target is unlocked; the retired source remains write-locked for rollback.
- The unauthenticated production route reached `/auth` with no console errors.
  Jeremy then reported ordinary production sign-in and lobby loading clean on
  2026-08-03.
- The combined production fake-money smoke then passed: create/play,
  authenticated voice-to-text, game completion, and Completed Sessions all
  worked against the owned backend.
- Production password recovery then passed on `holm357.com`: email delivery,
  production callback, password update, sign-out, and new-password sign-in all
  worked. The owned-Supabase production cutover is accepted complete; the
  retired source remains the locked rollback snapshot.
- Lovable runtime retirement completed on 2026-08-03: the old Lovable
  publication is offline, all three source Cloud jobs are inactive, and the
  write-locked rollback project remains preserved. The Vercel fallback
  `https://ptown-poker.vercel.app/auth` continued to return HTTP 200.

## Owned Supabase preview

- The authenticated lobby and create-game/game-entry path passed preview smoke
  on 2026-08-02 after migration
  `20260802174956_restore_public_data_api_grants.sql` restored explicit Data API
  grants. Keep all 48 public tables behind RLS and preserve anonymous read-only
  access to `games`.
- Authenticated voice transcription passed preview smoke on 2026-08-02 through
  the direct OpenAI `gpt-transcribe` path: spoken text returned to the unsent
  message draft. Preserve the user-JWT requirement and the no-persisted-audio or
  voice-diagnostics posture.
- `holm357.com` was attached to the existing Vercel Production environment on
  2026-08-03 with valid configuration and HTTPS HTTP 200. The owned Supabase
  Auth Site URL is `https://holm357.com`; preserve both its `/**` redirect entry
  and the protected owned-preview redirect entry through backend cutover.
