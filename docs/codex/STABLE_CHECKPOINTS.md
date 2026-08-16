# Stable checkpoints — do not reopen without a new repro

## Platform

- Around 2026-07-03 all seven games were smoke-tested with general geometry/polish considered good.
- Canonical table/felt/shell continuity must not be replaced by per-game table swaps.
- Chat stability and lobby performance had accepted fixes.
- Horses, SCC, Yahtzee, Holm, and 3-5-7 had major sync cutovers validated; Cribbage and Gin functioned but retained legacy-ish areas.
- The canonical chip-transfer ledger passed production smoke on 2026-08-09 at
  commit `79cfdcc75efd31c479f69cf7c72aa6a2398fba20`: it held a Holm
  solo-vs-Chucky pot payout until community and Chucky reveal presentation had
  completed, then transferred exactly once without a balance bounce. The
  missing destination-chip bounce is explicitly deferred presentation debt.
- The 3-5-7 normal final-leg payout ordering passed production smoke at commit
  `cd88b3d1d5965593236c68324743e3f32d6a5eee`: final leg, leg sweep, then pot
  flight, winner announcement, and confetti. Destination bounce remains
  deferred; unsolicited winner-card exposure is a separate queued consent bug
  (Backlog item 3H).
- The `+L` leg cue scope passed production smoke on 2026-08-10 at commit
  `0e6498d83c1e65faf3872a21dd344223dfc51c22`: it remains visible for real
  3-5-7 leg wins and cannot survive into Holm or another shared-table game.
- Opening ante presentation passed production smoke on 2026-08-11 at commit
  `0bc5718ba8087df4ce19217f111b423bceba7ecd`: card transport stays closed
  until the canonical ledger's aggregate ante-to-pot arrival boundary. Preserve
  that transport event as the presentation owner; do not restore a timer-based
  card-deal release.
- The stale published-build gate passed production smoke on 2026-08-16 at
  commit `02233d8913e7629f8847e29ad5931d95b1e1b18b`. A stale lobby may show
  the release modal when its Realtime signal arrives, but a new game route
  always performs its own no-cache public-manifest check before `Game` mounts.
  Preserve that fail-closed entry boundary and the rule that an already-admitted
  live table is not interrupted by a later publication.

## Cribbage

- Cribbage count rejoin passed production smoke on 2026-08-13 at commit
  `938d89437d888323ab63fc5be254d917f3d5101c`: a refresh, reconnect, or
  connection change during the visible count resumes at the durable monotonic
  cursor (or the database start-anchor fallback before the first cursor write)
  and remains in presentation through the authoritative release. Preserve the
  RPC-only cursor write; do not restore browser full-state replacements.
- Cribbage counting-announcement rejoin passed production smoke on 2026-08-13
  at commit `2914488bea66377bd3b5606ca27bebc538ba18c1`: a refresh or
  reconnect during a highlighted combo immediately presents that matching
  combo, never a stale final-pegging or inferred next-hand announcement.
  Preserve counting-cursor rail ownership and the no-authoritative-snapshot
  bootstrap silence.
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

- Holm dealer-game teardown card retirement passed production smoke on
  2026-08-16 at commit `8cd3cc884e88393a548c99edae8a75139a42c10b`:
  clearing `games.current_game_uuid` retires the old community, player, and
  Chucky card surfaces in the same render; no four-card remount occurs before
  next-game setup. Preserve the `currentRoundNotReadyForPresentation` ownership
  gate at the Holm card-surface root.
- The authoritative Rabbit Hunt all-fold reveal passed production smoke on
  2026-08-11 at commit `22d4aa8c258fbac461d3ce92966d4924b9955a62`:
  the both-player all-fold path showed the Rabbit Hunt marker and sequentially
  revealed community cards three and four while pussy-tax presentation began.
  Preserve the database settlement owner for the four-card reveal; do not
  restore the removed client-side all-fold reveal or gate presentation on
  mutable decision or solo-showdown latches. The deadline fallback must retain
  parity with normal settlement.
- Mobile solo-vs-Chucky showdown presentation passed smoke on 2026-08-10 at
  commit `abeeb3e06e46d9d1088467372ab808ac07fcf462`: the pot is legible in
  the canonical announcement rail while tabled cards remain unobstructed, the
  result keeps the pot context, and the established transfer still completes.
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
- Holm DG1H1 live-entry provenance passed fresh two-client production smoke on
  2026-08-15 at commit `372dd2cf7fb4ef7bce948d812c38048cad100ec4`:
  the opening deal transported normally, the first active player's timer
  appeared through the existing deal-settled gate, and play continued without
  a freeze. Preserve the pre-hand lifecycle provenance classification. Do not
  fabricate `DealRuntime` settlement/release state for a skipped historical
  entry or bypass canonical card transport.
- Holm DG1H1 Buck presentation and the persistent paused-session announcement
  passed production smoke on 2026-08-15 at commit
  `6f0951b8ea652633212dbec2a162c5fe86ced8fd` (tag
  `holm-dg1h1-buck-pause-2026-08-15`). Preserve the exact server-authored H1
  Buck identity and recipient-only hands-wave admission, plus the shell-owned
  pause ambient keyed by the authoritative host UUID. Do not move either into
  card transport, timer, settlement, or continuation ownership.
- Consecutive identical Holm showdowns passed production smoke on 2026-08-10
  at commit `4eaf5b0be8c20eac4f3e33d5d3699b85f98d1588`: every hand showed its
  canonical pot-to-winner then loser-to-pot stages. Preserve the
  `rounds.id`/hand plus transfer-cursor phase-plan identity; never use
  `games.current_round` as a Holm hand key.

## Sitting Out seat retention

- The shared Sitting Out seat-retention correction passed smoke on 2026-08-09
  at commit `52abf4628b651ed899c0b178207972b4edbfec84`. A player who sits out
  remains seated in the relative-seat projection, while next-game eligibility
  remains separate. Only explicit Stand Up or Leave releases a seat. This does
  not allow a post-game absence watcher to forfeit a seat.
- The fake-money post-game heartbeat extension passed production smoke on
  2026-08-09 at commit `d8f8cef3bc3cd01b615ab354163ef66be10c0f7b`. Only a
  result-bearing post-game Waiting table arms the three-miss / fifteen-second
  watch; an absent player becomes Sitting Out, and zero active humans reaches
  Session Ended without financial rows or balance changes.

## Session Ended

Accepted design:

- transient table phase, not modal;
- connected live-flow clients only;
- reconnect/fresh mount of ended session goes to lobby;
- standard HUD/tabs remain;
- results on felt;
- Back to Lobby local-only;
- participant source is current roster plus latest valid snapshots.
- Explicit zero-active post-game closure passed two-client production smoke on
  2026-08-15: after one player sat out and the other stood up, both clients
  entered Session Ended immediately and no setup dialog mounted. Preserve the
  atomic server disposition and keep heartbeat grace limited to ambiguous
  still-active humans.
- The Session Ended join-affordance gate passed production smoke on 2026-08-15
  at commit `8b5e8f4ecc4d42f3028a48f71492b34aec80112b`. Open-seat `+`
  controls remain suppressed in this terminal table phase, while a stood-up
  viewer retains the established absolute observer projection and ordinary
  Waiting-table observers retain valid join controls.

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
## 2026-08-12 — Cribbage final-discard recovery proof

- The rollback proof against preserved real-money `Aug 12 - Piper` confirmed
  one legal non-duplicated cut, pegging admission, and inert duplicate/late
  replay. Production recovery selected 5-diamonds and preserved all financial
  and historical state.
