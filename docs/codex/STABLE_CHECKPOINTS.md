# Stable checkpoints — do not reopen without a new repro

## Platform

- Around 2026-07-03 all seven games were smoke-tested with general geometry/polish considered good.
- Canonical table/felt/shell continuity must not be replaced by per-game table swaps.
- Chat stability and lobby performance had accepted fixes.
- Horses, SCC, Yahtzee, Holm, and 3-5-7 had major sync cutovers validated; Cribbage and Gin functioned but retained legacy-ish areas.

## Cribbage

- Atomic Cribbage settlement and connected-client terminal presentation are an
  accepted production checkpoint as of 2026-08-03. The disconnect/LAST HAND
  path settles immediately and exactly once in the database while a remaining
  connected client retains the table, cards, cut reveal, win presentation, and
  transient Session Ended flow. A genuinely fresh mount of an already-ended
  session still goes directly to the lobby.
- Preserve `public.cribbage_settle_game` as the replay-safe owner of result,
  payout, post-payout snapshots, terminal disposition, and real-money session
  ledger rows. Presentation may retry settlement and hold the mounted shell,
  but may not delay or own financial authority.
- Published follow-up smoke for commit
  `f9c7b1ebba91287049916e4caa09d281ace3df5a` passed the terminal card-
  continuity correction. Do not restore the stale-complete bootstrap guard for
  a `complete` Cribbage state with an authoritative winner.
- Table/HUD remains through celebration.
- His Heels reveal/announcement sequencing passed production smoke.
- Perpetual Heels harness is gated and visibly identified.
- Cribbage scoring announcement timing was reported stable.

## Yahtzee

- Atomic Yahtzee settlement and connected-client terminal presentation passed
  the published two-human terminal-disconnect smoke on 2026-08-03. Preserve
  `public.yahtzee_settle_game` as the replay-safe owner of result, fixed-stake
  payout, snapshots, terminal disposition, and real-money ledger output; the
  client may retry settlement and retain presentation, but may not own those
  writes.
- The winner chip did not bounce during the accepted smoke's celebration. This
  is a queued presentation-only defect; do not reopen the accepted settlement
  or terminal-hold behavior to correct it.

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
- Atomic Holm initial-hand startup passed fresh two-client production smoke on
  2026-08-05: one opening deal was shown and refresh retained the same
  authoritative hand. Preserve the database-owned H1/R1 identity and do not
  restore browser-side `max(hand_number) + 1` recovery.
- Holm deadline-epoch timer presentation passed production smoke on 2026-08-06
  at commit `d7149e0d4ab3a3409ee6fbbc3aa15cf7f1c810e2`: after the deal-settled gate,
  the first visible frame was full and the timer only descended. Preserve the
  atomic remaining/total/deadline snapshot and pre-paint transition reset.

## Sitting Out seat retention

- The shared Sitting Out seat-retention correction passed smoke on 2026-08-09
  at commit `52abf4628b651ed899c0b178207972b4edbfec84`. A player who sits out
  remains seated in the relative-seat projection, while next-game eligibility
  remains separate. The same shared path applies to real-money and fake-money
  sessions. Only explicit Stand Up or Leave releases a seat.

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
